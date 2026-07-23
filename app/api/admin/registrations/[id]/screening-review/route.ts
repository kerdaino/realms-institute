import { NextResponse } from "next/server";

import { isAdminAuthenticated } from "@/lib/adminAuth";
import { adminRegistrationFields } from "@/lib/adminRegistrations";
import { adminReviewer, recordReviewDecision, type RegistrationReviewEventType } from "@/lib/adminReviewAudit";
import { sendCurrentAdvancedEntryDecisionEmail } from "@/lib/registrationEmails";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";

const actions = ["approve_advanced", "require_foundational", "request_more_information"] as const;

function score(value: unknown) {
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) && parsed >= 0 && parsed <= 25 ? parsed : null;
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!(await isAdminAuthenticated())) return NextResponse.json({ message: "Unauthorized." }, { status: 401 });
  const supabase = getSupabaseAdmin();
  if (!supabase) return NextResponse.json({ message: "Supabase is not configured." }, { status: 503 });
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) return NextResponse.json({ message: "Registration not found." }, { status: 404 });
  const body = await request.json().catch(() => null);
  const payload = body && typeof body === "object" && !Array.isArray(body) ? body as Record<string, unknown> : {};
  const action = typeof payload.action === "string" ? payload.action : "";
  const shortAnswer1Score = score(payload.shortAnswer1Score);
  const shortAnswer2Score = score(payload.shortAnswer2Score);
  const reviewNote = typeof payload.reviewNote === "string" ? payload.reviewNote.trim().slice(0, 5000) : "";
  const applicantMessage = typeof payload.applicantMessage === "string" ? payload.applicantMessage.trim().slice(0, 3000) : "";
  if (!(actions as readonly string[]).includes(action)) return NextResponse.json({ message: "A valid screening review action is required." }, { status: 400 });
  if (shortAnswer1Score === null || shortAnswer2Score === null) return NextResponse.json({ message: "Each short answer score must be between 0 and 25." }, { status: 400 });
  if (action === "request_more_information" && !applicantMessage) return NextResponse.json({ message: "Add the applicant-facing information request that will be included in the email." }, { status: 400 });

  const { data: current, error: currentError } = await supabase.from("registrations").select(adminRegistrationFields).eq("id", id).maybeSingle();
  if (currentError?.code === "42703") return NextResponse.json({ message: "Apply the latest supabase/schema.sql migration before using screening review." }, { status: 503 });
  if (currentError) return NextResponse.json({ message: "Registration could not be loaded." }, { status: 500 });
  if (!current) return NextResponse.json({ message: "Registration not found." }, { status: 404 });
  if (current.applicant_type !== "prior_theological_education") return NextResponse.json({ message: "Screening review is only available for prior theological education applications." }, { status: 409 });
  const objectiveScore = Number(current.screening_objective_score);
  const objectiveMax = Number(current.screening_objective_max || 50);
  if (!Number.isFinite(objectiveScore) || objectiveMax !== 50) return NextResponse.json({ message: "The objective screening score is unavailable or invalid." }, { status: 409 });

  const shortAnswerScore = shortAnswer1Score + shortAnswer2Score;
  const totalScore = objectiveScore + shortAnswerScore;
  const percentage = (totalScore / 100) * 100;
  const now = new Date().toISOString();
  const updates: Record<string, unknown> = {
    screening_short_answer_1_score: shortAnswer1Score,
    screening_short_answer_2_score: shortAnswer2Score,
    screening_short_answer_score: shortAnswerScore,
    screening_total_score: totalScore,
    screening_percentage: percentage,
    screening_review_note: reviewNote || null,
    advanced_entry_applicant_message: action === "request_more_information" ? applicantMessage : null,
    screening_reviewed_at: now,
    screening_reviewed_by: adminReviewer,
  };
  if (action === "approve_advanced") Object.assign(updates, { screening_status: "advanced_approved", advanced_entry_status: "advanced_approved", assigned_discipleship_route: "advanced" });
  if (action === "require_foundational") Object.assign(updates, { screening_status: "foundation_required", advanced_entry_status: "foundation_required", assigned_discipleship_route: "foundational" });
  if (action === "request_more_information") Object.assign(updates, { screening_status: "more_information_required", advanced_entry_status: "more_information_required" });

  const { data, error } = await supabase.from("registrations").update(updates).eq("id", id).eq("applicant_type", "prior_theological_education").select(adminRegistrationFields).maybeSingle();
  if (error) {
    console.error("Screening review update failed", error);
    return NextResponse.json({ message: "Screening review could not be saved." }, { status: 500 });
  }
  if (!data) return NextResponse.json({ message: "Registration not found." }, { status: 404 });
  const eventType: Record<string, RegistrationReviewEventType> = {
    approve_advanced: "advanced_entry_approved",
    require_foundational: "foundation_required",
    request_more_information: "screening_more_information_required",
  };
  await recordReviewDecision(supabase, {
    registrationId: id,
    eventType: eventType[action],
    note: reviewNote || null,
    previousState: { screening_status: current.screening_status, advanced_entry_status: current.advanced_entry_status, assigned_discipleship_route: current.assigned_discipleship_route, screening_total_score: current.screening_total_score },
    newState: { screening_status: data.screening_status, advanced_entry_status: data.advanced_entry_status, assigned_discipleship_route: data.assigned_discipleship_route, screening_total_score: data.screening_total_score },
  });
  const emailStatus = await sendCurrentAdvancedEntryDecisionEmail(id);
  const refreshed = await supabase.from("registrations").select(adminRegistrationFields).eq("id", id).maybeSingle();
  const message = emailStatus.sent
    ? "Advanced-entry decision saved and applicant notified. Admission status was not changed."
    : `Advanced-entry decision saved, but the applicant notification could not be delivered. ${emailStatus.reason} You can resend it below.`;
  return NextResponse.json({ registration: refreshed.data || data, emailStatus, message });
}
