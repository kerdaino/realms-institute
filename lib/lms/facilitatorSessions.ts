import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { getCurrentUser, getCurrentUserRoles } from "@/lib/lms/auth";
import { LmsAdminDataError, requireLmsAdminClient } from "@/lib/lms/adminData";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export type FacilitatorSessionContext = { userId: string; facilitatorId: string; displayName: string; supabase: SupabaseClient };

export async function resolveFacilitatorSessionContext(): Promise<FacilitatorSessionContext> {
  const user = await getCurrentUser();
  if (!user) throw new LmsAdminDataError("Authentication required.", 401);
  const roles = await getCurrentUserRoles();
  if (!roles.includes("facilitator")) throw new LmsAdminDataError("Facilitator access required.", 403);
  const supabase = await createSupabaseServerClient();
  const result = await supabase.from("facilitators").select("id, display_name, facilitator_status").eq("profile_id", user.id).maybeSingle();
  if (result.error || !result.data || result.data.facilitator_status !== "active") throw new LmsAdminDataError("An active facilitator profile is not linked to this account.", 403);
  return { userId: user.id, facilitatorId: result.data.id, displayName: result.data.display_name, supabase };
}

async function assignedOfferingIds(context: FacilitatorSessionContext) {
  const result = await context.supabase.from("facilitator_course_assignments").select("cohort_course_id").eq("facilitator_id", context.facilitatorId);
  if (result.error) throw new LmsAdminDataError("Facilitator assignments could not be loaded.");
  return new Set((result.data ?? []).map((item) => item.cohort_course_id));
}

export async function fetchFacilitatorSessions(context: FacilitatorSessionContext) {
  const offeringIds = await assignedOfferingIds(context);
  const result = await context.supabase.from("class_sessions").select("id, cohort_course_id, title, description, session_number, session_type, delivery_mode, scheduled_start_at, scheduled_end_at, timezone, session_status, is_required, visibility_status, facilitator_id, cohort_courses(id, courses(id, code, title), cohorts(id, code, name)), class_summaries(id, summary_status, version_number), class_recordings(id, recording_status, quality_checked)").order("scheduled_start_at", { ascending: true, nullsFirst: false });
  if (result.error) throw new LmsAdminDataError("Assigned class sessions could not be loaded.");
  return (result.data ?? []).filter((item) => item.facilitator_id === context.facilitatorId || offeringIds.has(item.cohort_course_id));
}

export async function requireFacilitatorSessionAccess(context: FacilitatorSessionContext, sessionId: string) {
  const session = await context.supabase.from("class_sessions").select("id, cohort_course_id, facilitator_id").eq("id", sessionId).maybeSingle();
  if (session.error || !session.data) throw new LmsAdminDataError("Class session not found.", 404);
  if (session.data.facilitator_id === context.facilitatorId) return session.data;
  const assignment = await context.supabase.from("facilitator_course_assignments").select("id").eq("facilitator_id", context.facilitatorId).eq("cohort_course_id", session.data.cohort_course_id).limit(1).maybeSingle();
  if (assignment.error || !assignment.data) throw new LmsAdminDataError("You are not assigned to this class session.", 403);
  return session.data;
}

export async function fetchFacilitatorSession(context: FacilitatorSessionContext, sessionId: string) {
  await requireFacilitatorSessionAccess(context, sessionId);
  const admin = requireLmsAdminClient();
  const [session, summary, resources, recordings] = await Promise.all([
    context.supabase.from("class_sessions").select("*, cohort_courses(*, courses(id, code, title, description, course_purpose, learning_outcomes), cohorts(id, code, name)), facilitators(id, display_name, title)").eq("id", sessionId).single(),
    context.supabase.from("class_summaries").select("*").eq("class_session_id", sessionId).maybeSingle(),
    admin.from("session_resources").select("*").eq("class_session_id", sessionId).order("sort_order").order("created_at"),
    context.supabase.from("class_recordings").select("id, class_session_id, title, provider, duration_seconds, recording_status, access_level, available_from, available_until, quality_checked, quality_checked_at").eq("class_session_id", sessionId).order("created_at"),
  ]);
  for (const result of [session, summary, resources, recordings]) if (result.error) throw new LmsAdminDataError("Assigned class session details could not be loaded.");
  return { session: session.data, summary: summary.data, resources: resources.data ?? [], recordings: recordings.data ?? [] };
}
