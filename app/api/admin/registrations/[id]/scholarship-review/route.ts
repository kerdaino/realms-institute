import { NextResponse } from "next/server";

import { isAdminAuthenticated } from "@/lib/adminAuth";
import { adminRegistrationFields } from "@/lib/adminRegistrations";
import { adminReviewer, recordReviewDecision, type RegistrationReviewEventType } from "@/lib/adminReviewAudit";
import { sendCurrentScholarshipDecisionEmail } from "@/lib/registrationEmails";
import { scholarshipFinancialSummary } from "@/lib/scholarshipFinance";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";

const actions = ["approve_full", "approve_partial", "decline", "request_more_information"] as const;

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!(await isAdminAuthenticated())) return NextResponse.json({ message: "Unauthorized." }, { status: 401 });
  const supabase = getSupabaseAdmin();
  if (!supabase) return NextResponse.json({ message: "Supabase is not configured." }, { status: 503 });
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) return NextResponse.json({ message: "Registration not found." }, { status: 404 });
  const body = await request.json().catch(() => null);
  const payload = body && typeof body === "object" && !Array.isArray(body) ? body as Record<string, unknown> : {};
  const action = typeof payload.action === "string" ? payload.action : "";
  const reviewNote = typeof payload.reviewNote === "string" ? payload.reviewNote.trim().slice(0, 5000) : "";
  const applicantMessage = typeof payload.applicantMessage === "string" ? payload.applicantMessage.trim().slice(0, 3000) : "";
  if (!(actions as readonly string[]).includes(action)) return NextResponse.json({ message: "A valid scholarship review action is required." }, { status: 400 });

  const { data: current, error: currentError } = await supabase.from("registrations").select(adminRegistrationFields).eq("id", id).maybeSingle();
  if (currentError?.code === "42703") return NextResponse.json({ message: "Apply the latest supabase/schema.sql migration before using scholarship review." }, { status: 503 });
  if (currentError) return NextResponse.json({ message: "Registration could not be loaded." }, { status: 500 });
  if (!current) return NextResponse.json({ message: "Registration not found." }, { status: 404 });
  if (current.funding_route !== "scholarship_request") return NextResponse.json({ message: "Scholarship review is only available for scholarship requests." }, { status: 409 });

  const normalFee = Number(current.amount);
  const requestedPartialAmount = typeof payload.approvedAmount === "number" ? payload.approvedAmount : Number(payload.approvedAmount);
  if (action === "approve_partial" && (!Number.isFinite(requestedPartialAmount) || requestedPartialAmount <= 0 || requestedPartialAmount >= normalFee)) {
    return NextResponse.json({ message: "Partial scholarship support must be greater than zero and less than the normal registration fee." }, { status: 400 });
  }
  if (action === "request_more_information" && !applicantMessage) return NextResponse.json({ message: "Add the applicant-facing information request that will be included in the email." }, { status: 400 });

  const nextStatus = {
    approve_full: "approved_full",
    approve_partial: "approved_partial",
    decline: "declined",
    request_more_information: "more_information_required",
  }[action]!;
  const nextApprovedSupport = action === "approve_full" ? normalFee : action === "approve_partial" ? requestedPartialAmount : null;
  const arrangementChanged = current.scholarship_status !== nextStatus
    || Number(current.scholarship_approved_amount ?? -1) !== Number(nextApprovedSupport ?? -1);
  if (arrangementChanged && (current.payment_status === "success" || Number(current.amount_paid || 0) > 0)) {
    return NextResponse.json({
      message: "A payment has already been recorded for this application. Do not change the scholarship arrangement until the payment has been reviewed and reconciled manually.",
    }, { status: 409 });
  }
  const nextFinancials = scholarshipFinancialSummary({
    normalFee,
    scholarshipStatus: nextStatus,
    approvedScholarshipAmount: nextApprovedSupport,
    amountPaid: current.amount_paid,
    paymentStatus: current.payment_status,
  });
  if (!nextFinancials.valid) return NextResponse.json({ message: "The scholarship arrangement is not financially valid." }, { status: 400 });
  const pendingPaymentStateIsStale = Boolean(current.payment_reference)
    && Number(current.payment_expected_amount) !== Number(nextFinancials.amountDue);

  const now = new Date().toISOString();
  const updates: Record<string, unknown> = {
    scholarship_review_note: reviewNote || null,
    scholarship_applicant_message: action === "request_more_information" ? applicantMessage : null,
    scholarship_reviewed_at: now,
    scholarship_reviewed_by: adminReviewer,
    financial_requirement_status: nextFinancials.financialRequirementStatus,
    payment_expected_amount: nextFinancials.amountDue,
    scholarship_decision_email_sent: false,
    scholarship_decision_email_sent_at: null,
    scholarship_decision_email_type: null,
    scholarship_decision_email_error: null,
    scholarship_decision_email_last_attempted_at: null,
  };
  Object.assign(updates, { scholarship_status: nextStatus, scholarship_approved_amount: nextApprovedSupport });
  if (
    current.payment_status !== "success"
    && (arrangementChanged || pendingPaymentStateIsStale || action === "approve_full" || action === "request_more_information")
  ) {
    Object.assign(updates, {
      payment_reference: null,
      payment_status: "not_paid",
      payment_authorization_url: null,
      payment_initialized_at: null,
    });
  }

  const { data, error } = await supabase.from("registrations").update(updates).eq("id", id).eq("funding_route", "scholarship_request").select(adminRegistrationFields).maybeSingle();
  if (error) {
    console.error("Scholarship review update failed", error);
    return NextResponse.json({ message: "Scholarship review could not be saved." }, { status: 500 });
  }
  if (!data) return NextResponse.json({ message: "Registration not found." }, { status: 404 });
  const eventType: Record<string, RegistrationReviewEventType> = {
    approve_full: "scholarship_approved_full",
    approve_partial: "scholarship_approved_partial",
    decline: "scholarship_declined",
    request_more_information: "scholarship_more_information_required",
  };
  await recordReviewDecision(supabase, {
    registrationId: id,
    eventType: eventType[action],
    note: reviewNote || null,
    previousState: { scholarship_status: current.scholarship_status, scholarship_approved_amount: current.scholarship_approved_amount },
    newState: { scholarship_status: data.scholarship_status, scholarship_approved_amount: data.scholarship_approved_amount },
  });
  const emailStatus = await sendCurrentScholarshipDecisionEmail(id);
  const refreshed = await supabase.from("registrations").select(adminRegistrationFields).eq("id", id).maybeSingle();
  const message = emailStatus.sent
    ? "Scholarship decision saved and applicant notified. Admission status was not changed."
    : `Scholarship decision saved, but the applicant notification could not be delivered. ${emailStatus.reason} You can resend it below.`;
  return NextResponse.json({ registration: refreshed.data || data, emailStatus, message });
}
