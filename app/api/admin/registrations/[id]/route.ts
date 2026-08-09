import { NextResponse } from "next/server";

import { isAdminAuthenticated } from "@/lib/adminAuth";
import { adminRegistrationFields, type AdminRegistration } from "@/lib/adminRegistrations";
import { buildFoundationalScreeningReview } from "@/lib/foundationalScreeningAnswers.server";
import type { FoundationalScreeningAnswers } from "@/lib/foundationalScreeningQuestions";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";

function isScreeningAnswers(value: unknown): value is FoundationalScreeningAnswers {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const candidate = value as Record<string, unknown>;
  return Array.isArray(candidate.objective) && Array.isArray(candidate.shortAnswers);
}

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!(await isAdminAuthenticated())) return NextResponse.json({ message: "Unauthorized." }, { status: 401 });
  const supabase = getSupabaseAdmin();
  if (!supabase) return NextResponse.json({ message: "The registration service is temporarily unavailable." }, { status: 503 });
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) return NextResponse.json({ message: "Registration not found." }, { status: 404 });
  const fullResult = await supabase.from("registrations").select(adminRegistrationFields).eq("id", id).maybeSingle();
  const data = fullResult.data as AdminRegistration | null;
  const error = fullResult.error;
  if (error?.code === "42703") return NextResponse.json({ message: "Apply the application soft-delete migration before administering applications." }, { status: 503 });
  if (error) {
    console.error("Admin registration detail query failed", error);
    return NextResponse.json({ message: "Registration could not be loaded." }, { status: 500 });
  }
  if (!data) return NextResponse.json({ message: "Registration not found." }, { status: 404 });
  const [studentResult, candidateResult, supersedingResult] = await Promise.all([
    supabase.from("students").select("id, student_number, profile_id, student_status, onboarding_status").eq("registration_id", id).maybeSingle(),
    supabase.from("registrations").select("id, full_name, email, created_at, cohort_code, payment_status, scholarship_status, advanced_entry_status, application_status").eq("cohort_code", data.cohort_code).is("deleted_at", null).neq("id", id).limit(5000),
    data.superseded_by_application_id
      ? supabase.from("registrations").select("id, full_name, email, created_at").eq("id", data.superseded_by_application_id).maybeSingle()
      : Promise.resolve({ data: null, error: null }),
  ]);
  if (studentResult.error && studentResult.error.code !== "42P01" && studentResult.error.code !== "42703") console.error("Linked student query failed", { code: studentResult.error.code });
  if (candidateResult.error) console.error("Canonical application candidate query failed", { code: candidateResult.error.code });
  if (supersedingResult.error) console.error("Superseding application query failed", { code: supersedingResult.error.code });
  const { data: reviewEvents, error: reviewEventsError } = await supabase
    .from("registration_review_events")
    .select("id, registration_id, event_type, previous_state, new_state, note, actor, created_at")
    .eq("registration_id", id)
    .order("created_at", { ascending: false });
  if (reviewEventsError && reviewEventsError.code !== "42P01" && reviewEventsError.code !== "42703") console.error("Admin registration review history query failed", reviewEventsError);
  const screeningReview = isScreeningAnswers(data.screening_answers) ? buildFoundationalScreeningReview(data.screening_answers) : null;
  const normalizedEmail = data.email.trim().toLowerCase();
  const canonicalCandidates = (candidateResult.data ?? []).filter((candidate) => String(candidate.email).trim().toLowerCase() === normalizedEmail);
  return NextResponse.json({
    registration: data,
    screeningReview,
    reviewEvents: reviewEvents ?? [],
    studentProvisioning: studentResult.data ?? null,
    canonicalCandidates,
    supersedingApplication: supersedingResult.data ?? null,
  });
}
