import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { getCurrentUser, getCurrentUserRoles } from "@/lib/lms/auth";
import { LmsAdminDataError, requireLmsAdminClient } from "@/lib/lms/adminData";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { isOneOf, readHttpUrl, readNullableDate, readText, recordingProviders } from "@/lib/lms/adminConstants";
import { recordLmsAudit } from "@/lib/lms/adminAudit";
import { currentSummaryRevision } from "@/lib/lms/sessionData";

export type FacilitatorSessionContext = { userId: string; facilitatorId: string; displayName: string; supabase: SupabaseClient };

export async function resolveFacilitatorSessionContext(): Promise<FacilitatorSessionContext> {
  const user = await getCurrentUser();
  if (!user) throw new LmsAdminDataError("Authentication required.", 401);
  const roles = await getCurrentUserRoles();
  if (!roles.includes("facilitator")) throw new LmsAdminDataError("Facilitator access required.", 403);
  const supabase = await createSupabaseServerClient();
  const result = await supabase.from("facilitators").select("id, display_name, facilitator_status").eq("profile_id", user.id).maybeSingle();
  if (result.error) console.error("Facilitator authorization database lookup failed", { stage: "profile", error: result.error });
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
  return (result.data ?? [])
    .filter((item) => item.facilitator_id === context.facilitatorId || offeringIds.has(item.cohort_course_id))
    .map((item) => ({ ...item, class_summaries: currentSummaryRevision(Array.isArray(item.class_summaries) ? item.class_summaries : []) }));
}

export async function requireFacilitatorSessionAccess(context: FacilitatorSessionContext, sessionId: string) {
  const session = await context.supabase.from("class_sessions").select("id, cohort_course_id, facilitator_id").eq("id", sessionId).maybeSingle();
  if (session.error) console.error("Facilitator authorization database lookup failed", { stage: "session", sessionId, error: session.error });
  if (session.error || !session.data) throw new LmsAdminDataError("Class session not found.", 404);
  if (session.data.facilitator_id === context.facilitatorId) return session.data;
  const assignment = await context.supabase.from("facilitator_course_assignments").select("id").eq("facilitator_id", context.facilitatorId).eq("cohort_course_id", session.data.cohort_course_id).limit(1).maybeSingle();
  if (assignment.error) console.error("Facilitator authorization database lookup failed", { stage: "assignment", sessionId, error: assignment.error });
  if (assignment.error || !assignment.data) throw new LmsAdminDataError("You are not assigned to this class session.", 403);
  return session.data;
}

export async function fetchFacilitatorSession(context: FacilitatorSessionContext, sessionId: string) {
  await requireFacilitatorSessionAccess(context, sessionId);
  const admin = requireLmsAdminClient();
  const [session, summaries, resources, recordings] = await Promise.all([
    context.supabase.from("class_sessions").select("*, cohort_courses(*, courses(id, code, title, description, course_purpose, learning_outcomes), cohorts(id, code, name)), facilitators(id, display_name, title)").eq("id", sessionId).single(),
    context.supabase.from("class_summaries").select("*").eq("class_session_id", sessionId).order("updated_at", { ascending: false }),
    admin.from("session_resources").select("*").eq("class_session_id", sessionId).order("sort_order").order("created_at"),
    context.supabase.from("class_recordings").select("id, class_session_id, title, description, provider, external_url, embed_url, external_recording_id, duration_seconds, recording_date, facilitator_notes, source_submitted_by, source_submitted_at, recording_status, access_level, available_from, available_until, quality_checked, quality_checked_at").eq("class_session_id", sessionId).order("created_at"),
  ]);
  for (const result of [session, summaries, resources, recordings]) if (result.error) throw new LmsAdminDataError("Assigned class session details could not be loaded.");
  const summaryRevisions = summaries.data ?? [];
  const summary = currentSummaryRevision(summaryRevisions);
  let reviewEvents: unknown[] = [];
  if (summaryRevisions.length) {
    const result = await context.supabase.from("class_summary_review_events").select("*").in("class_summary_id", summaryRevisions.map((item) => item.id)).order("created_at", { ascending: false });
    if (result.error) throw new LmsAdminDataError("Class-summary review history could not be loaded.");
    reviewEvents = result.data ?? [];
  }
  return { session: session.data, summary, publishedSummary: summaryRevisions.find((item) => item.summary_status === "published") ?? null, summaryRevisions, summaryReviewEvents: reviewEvents, resources: resources.data ?? [], recordings: recordings.data ?? [] };
}

export async function updateFacilitatorSessionLiveAccess(context: FacilitatorSessionContext, sessionId: string, body: Record<string, unknown>) {
  await requireFacilitatorSessionAccess(context, sessionId);
  const liveJoinUrl = readHttpUrl(body.live_join_url);
  if (liveJoinUrl === undefined) throw new LmsAdminDataError("The live class link must be a secure web URL.", 400);
  const liveAccessNote = readText(body.live_access_note, 1000);
  const admin = requireLmsAdminClient(); const now = new Date().toISOString();
  const saved = await admin.from("class_sessions").update({ live_join_url: liveJoinUrl, live_access_note: liveAccessNote, updated_by: context.userId, updated_at: now }).eq("id", sessionId).select("id, live_join_url, live_access_note, updated_at").single();
  if (saved.error) throw new LmsAdminDataError("Live class access could not be saved.");
  await recordLmsAudit(admin, { action: "facilitator_live_access_updated", entityType: "class_session", entityId: sessionId, actorUserId: context.userId, metadata: { link_configured: Boolean(liveJoinUrl), note_configured: Boolean(liveAccessNote) } });
  return saved.data;
}

function facilitatorRecordingValues(body: Record<string, unknown>) {
  const title = readText(body.title, 240);
  const provider = body.provider;
  const externalUrl = readHttpUrl(body.external_url);
  const embedUrl = readHttpUrl(body.embed_url);
  const recordingDate = readNullableDate(body.recording_date);
  const duration = body.duration_seconds === "" || body.duration_seconds === null || body.duration_seconds === undefined ? null : Number(body.duration_seconds);
  if (!title || !isOneOf(recordingProviders, provider) || externalUrl === undefined || embedUrl === undefined || recordingDate === undefined || (duration !== null && (!Number.isInteger(duration) || duration < 0))) throw new LmsAdminDataError("Valid recording source details are required.", 400);
  if (!externalUrl && !embedUrl) throw new LmsAdminDataError("Add a secure external or embed URL for administrator review.", 400);
  return {
    title,
    description: readText(body.description),
    provider,
    external_url: externalUrl,
    embed_url: embedUrl,
    external_recording_id: readText(body.external_recording_id, 500),
    duration_seconds: duration,
    recording_date: recordingDate,
    facilitator_notes: readText(body.facilitator_notes, 4000),
  };
}

export async function saveFacilitatorRecordingSource(context: FacilitatorSessionContext, sessionId: string, body: Record<string, unknown>, recordingId?: string) {
  await requireFacilitatorSessionAccess(context, sessionId);
  const admin = requireLmsAdminClient();
  const values = facilitatorRecordingValues(body);
  const now = new Date().toISOString();
  if (recordingId) {
    const current = await admin.from("class_recordings").select("id, class_session_id, recording_status, quality_checked, source_submitted_at").eq("id", recordingId).maybeSingle();
    if (current.error || !current.data || current.data.class_session_id !== sessionId) throw new LmsAdminDataError("Recording source not found.", 404);
    if (!["draft", "processing"].includes(String(current.data.recording_status)) || current.data.quality_checked) throw new LmsAdminDataError("Only an unreviewed recording source can be edited by faculty.", 409);
    const saved = await admin.from("class_recordings").update({ ...values, source_submitted_by: context.userId, source_submitted_at: current.data.source_submitted_at ?? now, updated_at: now }).eq("id", recordingId).select("*").single();
    if (saved.error) throw new LmsAdminDataError("Recording source could not be updated.");
    await recordLmsAudit(admin, { action: "class_recording_source_submitted", entityType: "class_recording", entityId: recordingId, actorUserId: context.userId, metadata: { class_session_id: sessionId, action: "updated", official_status_unchanged: true } });
    return saved.data;
  }
  const saved = await admin.from("class_recordings").insert({ class_session_id: sessionId, ...values, recording_status: "draft", access_level: "enrolled_students", retention_status: "active", quality_checked: false, quality_checked_at: null, source_submitted_by: context.userId, source_submitted_at: now, created_by: context.userId, updated_at: now }).select("*").single();
  if (saved.error) throw new LmsAdminDataError("Recording source could not be submitted.");
  await recordLmsAudit(admin, { action: "class_recording_source_submitted", entityType: "class_recording", entityId: saved.data.id, actorUserId: context.userId, metadata: { class_session_id: sessionId, action: "created", official_status: "draft" } });
  return saved.data;
}
