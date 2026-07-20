import { NextResponse } from "next/server";

import { isAdminAuthenticated } from "@/lib/adminAuth";
import { adminRegistrationFields } from "@/lib/adminRegistrations";
import { adminReviewer, recordReviewDecision, type RegistrationReviewEventType } from "@/lib/adminReviewAudit";
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
  if (!(actions as readonly string[]).includes(action)) return NextResponse.json({ message: "A valid scholarship review action is required." }, { status: 400 });

  const { data: current, error: currentError } = await supabase.from("registrations").select(adminRegistrationFields).eq("id", id).maybeSingle();
  if (currentError?.code === "42703") return NextResponse.json({ message: "Apply the latest supabase/schema.sql migration before using scholarship review." }, { status: 503 });
  if (currentError) return NextResponse.json({ message: "Registration could not be loaded." }, { status: 500 });
  if (!current) return NextResponse.json({ message: "Registration not found." }, { status: 404 });
  if (current.funding_route !== "scholarship_request") return NextResponse.json({ message: "Scholarship review is only available for scholarship requests." }, { status: 409 });

  const normalFee = Number(current.amount);
  const requestedPartialAmount = typeof payload.approvedAmount === "number" ? payload.approvedAmount : Number(payload.approvedAmount);
  if (action === "approve_partial" && (!Number.isFinite(requestedPartialAmount) || requestedPartialAmount <= 0 || requestedPartialAmount >= normalFee)) {
    return NextResponse.json({ message: "A partial scholarship amount must be greater than zero and less than the full application fee." }, { status: 400 });
  }
  const now = new Date().toISOString();
  const updates: Record<string, unknown> = {
    scholarship_review_note: reviewNote || null,
    scholarship_reviewed_at: now,
    scholarship_reviewed_by: adminReviewer,
  };
  if (action === "approve_full") Object.assign(updates, { scholarship_status: "approved_full", scholarship_approved_amount: normalFee });
  if (action === "approve_partial") Object.assign(updates, { scholarship_status: "approved_partial", scholarship_approved_amount: requestedPartialAmount });
  if (action === "decline") Object.assign(updates, { scholarship_status: "declined", scholarship_approved_amount: null });
  if (action === "request_more_information") Object.assign(updates, { scholarship_status: "more_information_required", scholarship_approved_amount: null });

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
  return NextResponse.json({ registration: data, message: "Scholarship decision saved. Admission status was not changed." });
}
