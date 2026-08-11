import { NextResponse } from "next/server";

import { isAdminAuthenticated } from "@/lib/adminAuth";
import { adminRegistrationListFields } from "@/lib/adminRegistrations";
import { isApplicationStatus } from "@/lib/applicationStatus";
import { conditionalAdmissionEligibility, conditionalAdmissionStatus, lapsedConditionalAdmissionStatus, paymentDeadlineFromOffer } from "@/lib/conditionalAdmission";
import { sendAdmissionCommunication, sendApplicationStatusEmail } from "@/lib/registrationEmails";
import { isFinancialRequirementSatisfied } from "@/lib/scholarshipFinance";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!(await isAdminAuthenticated())) return NextResponse.json({ message: "Unauthorized." }, { status: 401 });

  const supabase = getSupabaseAdmin();
  if (!supabase) return NextResponse.json({ message: "The registration service is temporarily unavailable." }, { status: 503 });

  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) return NextResponse.json({ message: "Registration not found." }, { status: 404 });

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ message: "Invalid request body." }, { status: 400 });
  }

  const payload = body && typeof body === "object" && !Array.isArray(body) ? body as Record<string, unknown> : {};
  const status = typeof payload.applicationStatus === "string" ? payload.applicationStatus.trim() : "";
  const hasAdminNote = Object.hasOwn(payload, "adminNote");
  const adminNote = typeof payload.adminNote === "string" ? payload.adminNote.trim().slice(0, 5000) : "";
  const shouldSendEmail = payload.sendEmail === true;

  if (!isApplicationStatus(status)) return NextResponse.json({ message: "A valid application status is required." }, { status: 400 });

  const currentResult = await supabase.from("registrations").select(adminRegistrationListFields).eq("id", id).is("deleted_at", null).maybeSingle();
  if (currentResult.error) return NextResponse.json({ message: "Application state could not be checked." }, { status: 500 });
  if (!currentResult.data) return NextResponse.json({ message: "Registration not found." }, { status: 404 });
  const current = currentResult.data;

  const decisionAt = new Date().toISOString();
  const update: Record<string, unknown> = {
    application_status: status,
    reviewed_at: decisionAt,
    reviewed_by: "REALMS Admin",
  };
  if (hasAdminNote) update.admin_note = adminNote || null;

  if (status === conditionalAdmissionStatus) {
    const eligibility = conditionalAdmissionEligibility(current);
    if (!eligibility.eligible) return NextResponse.json({ message: eligibility.reason }, { status: 409 });
    const preservedExtendedDeadline = current.application_status === lapsedConditionalAdmissionStatus
      && current.admission_payment_deadline
      && Date.parse(current.admission_payment_deadline) > Date.now()
      ? current.admission_payment_deadline
      : null;
    Object.assign(update, {
      admission_offer_at: decisionAt,
      admission_payment_deadline: preservedExtendedDeadline || paymentDeadlineFromOffer(decisionAt),
      admission_outstanding_amount: eligibility.outstandingAmount,
      admission_offer_lapsed_at: null,
    });
  }
  if (status === "admitted" && !isFinancialRequirementSatisfied(current)) {
    return NextResponse.json({ message: "The financial requirement is still outstanding. Issue Conditional Admission — Payment Outstanding instead." }, { status: 409 });
  }
  if (status === "admitted") update.admission_confirmed_at = decisionAt;
  if (status === lapsedConditionalAdmissionStatus) update.admission_offer_lapsed_at = decisionAt;

  const { data, error } = await supabase
    .from("registrations")
    .update(update)
    .eq("id", id)
    .is("deleted_at", null)
    .select(adminRegistrationListFields)
    .maybeSingle();

  if (error) {
    console.error("Admin registration status update failed", error);
    return NextResponse.json({ message: "Review status could not be saved." }, { status: 500 });
  }
  if (!data) return NextResponse.json({ message: "Registration not found." }, { status: 404 });

  const event = await supabase.from("registration_review_events").insert({
    registration_id: id,
    event_type: status === conditionalAdmissionStatus ? "conditional_admission_issued" : status === lapsedConditionalAdmissionStatus ? "conditional_admission_offer_lapsed" : "admission_status_changed",
    previous_state: { application_status: current.application_status, admission_payment_deadline: current.admission_payment_deadline },
    new_state: { application_status: status, admission_payment_deadline: data.admission_payment_deadline, admission_outstanding_amount: data.admission_outstanding_amount },
    note: adminNote || null,
    actor: "REALMS Admin",
    created_at: decisionAt,
  });
  if (event.error) console.error("Admission decision audit insert failed", { registrationId: id, code: event.error.code });

  const emailStatus = shouldSendEmail
    ? status === conditionalAdmissionStatus
      ? await sendAdmissionCommunication(id, "conditional_admission_offer")
      : status === lapsedConditionalAdmissionStatus
        ? await sendAdmissionCommunication(id, "admission_offer_lapsed")
        : await sendApplicationStatusEmail(data)
    : null;

  const { data: refreshed, error: refreshError } = await supabase
    .from("registrations")
    .select(adminRegistrationListFields)
    .eq("id", id)
    .is("deleted_at", null)
    .maybeSingle();

  if (refreshError) {
    console.error("Admin registration refresh after status update failed", refreshError);
  }

  return NextResponse.json({ registration: refreshed || data, emailStatus });
}
