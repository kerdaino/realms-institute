import { NextResponse } from "next/server";

import { isAdminAuthenticated } from "@/lib/adminAuth";
import { adminRegistrationFields } from "@/lib/adminRegistrations";
import { adminReviewer, recordReviewDecision, type RegistrationReviewEventType } from "@/lib/adminReviewAudit";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";

const actions = ["verify_alumni", "unable_to_verify", "request_more_information"] as const;

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
  if (!(actions as readonly string[]).includes(action)) return NextResponse.json({ message: "A valid alumni review action is required." }, { status: 400 });

  const { data: current, error: currentError } = await supabase.from("registrations").select(adminRegistrationFields).eq("id", id).maybeSingle();
  if (currentError?.code === "42703") return NextResponse.json({ message: "Apply the latest supabase/schema.sql migration before using advanced-entry review." }, { status: 503 });
  if (currentError) return NextResponse.json({ message: "Registration could not be loaded." }, { status: 500 });
  if (!current) return NextResponse.json({ message: "Registration not found." }, { status: 404 });
  if (current.applicant_type !== "realms_alumnus") return NextResponse.json({ message: "Alumni verification is only available for REALMS alumni applications." }, { status: 409 });

  const now = new Date().toISOString();
  const updates: Record<string, unknown> = {
    alumni_review_note: reviewNote || null,
    alumni_reviewed_at: now,
    alumni_reviewed_by: adminReviewer,
  };
  if (action === "verify_alumni") Object.assign(updates, { alumni_verification_status: "verified", advanced_entry_status: "advanced_approved", assigned_discipleship_route: "advanced" });
  if (action === "unable_to_verify") Object.assign(updates, { alumni_verification_status: "not_verified" });
  if (action === "request_more_information") Object.assign(updates, { alumni_verification_status: "more_information_required", advanced_entry_status: "more_information_required" });

  const { data, error } = await supabase.from("registrations").update(updates).eq("id", id).eq("applicant_type", "realms_alumnus").select(adminRegistrationFields).maybeSingle();
  if (error) {
    console.error("Alumni review update failed", error);
    return NextResponse.json({ message: "Alumni review could not be saved." }, { status: 500 });
  }
  if (!data) return NextResponse.json({ message: "Registration not found." }, { status: 404 });
  const eventType: Record<string, RegistrationReviewEventType> = {
    verify_alumni: "alumni_verified",
    unable_to_verify: "alumni_not_verified",
    request_more_information: "alumni_more_information_required",
  };
  await recordReviewDecision(supabase, {
    registrationId: id,
    eventType: eventType[action],
    note: reviewNote || null,
    previousState: { alumni_verification_status: current.alumni_verification_status, advanced_entry_status: current.advanced_entry_status, assigned_discipleship_route: current.assigned_discipleship_route },
    newState: { alumni_verification_status: data.alumni_verification_status, advanced_entry_status: data.advanced_entry_status, assigned_discipleship_route: data.assigned_discipleship_route },
  });
  return NextResponse.json({ registration: data, message: "Alumni verification decision saved. Admission status was not changed." });
}
