import { NextResponse } from "next/server";

import { isAdminAuthenticated } from "@/lib/adminAuth";
import { adminRegistrationFields, adminRegistrationListFields, type AdminRegistration } from "@/lib/adminRegistrations";
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
  if (!supabase) return NextResponse.json({ message: "Supabase is not configured. Add NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY to view registrations." }, { status: 503 });
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) return NextResponse.json({ message: "Registration not found." }, { status: 404 });
  const fullResult = await supabase.from("registrations").select(adminRegistrationFields).eq("id", id).maybeSingle();
  let data = fullResult.data as AdminRegistration | null;
  let error = fullResult.error;
  if (error?.code === "42703") {
    const legacyResult = await supabase.from("registrations").select(adminRegistrationListFields).eq("id", id).maybeSingle();
    data = legacyResult.data as AdminRegistration | null;
    error = legacyResult.error;
  }
  if (error) {
    console.error("Admin registration detail query failed", error);
    return NextResponse.json({ message: "Registration could not be loaded." }, { status: 500 });
  }
  if (!data) return NextResponse.json({ message: "Registration not found." }, { status: 404 });
  const { data: reviewEvents, error: reviewEventsError } = await supabase
    .from("registration_review_events")
    .select("id, registration_id, event_type, previous_state, new_state, note, actor, created_at")
    .eq("registration_id", id)
    .order("created_at", { ascending: false });
  if (reviewEventsError && reviewEventsError.code !== "42P01" && reviewEventsError.code !== "42703") console.error("Admin registration review history query failed", reviewEventsError);
  const screeningReview = isScreeningAnswers(data.screening_answers) ? buildFoundationalScreeningReview(data.screening_answers) : null;
  return NextResponse.json({ registration: data, screeningReview, reviewEvents: reviewEvents ?? [] });
}
