import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { recordLmsAudit } from "@/lib/lms/adminAudit";
import {
  isOneOf,
  isUuid,
  recordingProviders,
  recordingStatuses,
  readHttpUrl,
  readNullableDate,
  readNullableTimestamp,
  readStringList,
  readText,
  resourceTypes,
  sessionAccessLevels,
  sessionDeliveryModes,
  sessionStatuses,
  sessionTypes,
  sessionVisibilityStatuses,
} from "@/lib/lms/adminConstants";
import { LmsAdminDataError } from "@/lib/lms/adminData";
import { initializeAwaitingMakeupsForSession } from "@/lib/lms/absenceService";
import { recordingEvidenceReadiness } from "@/lib/lms/recording";
import { assertRecordingActivationReady, initializeRecordedLearningForSession } from "@/lib/lms/recordingService";

export type SessionActor = { actorUserId?: string | null; actorLabel: "REALMS Admin" | "Facilitator"; auditClient?: SupabaseClient };

function invalid(message: string): never { throw new LmsAdminDataError(message, 400); }
function validWholeNumber(value: unknown, minimum = 0) { if (value === "" || value === null || value === undefined) return null; const number = Number(value); return Number.isInteger(number) && number >= minimum ? number : undefined; }

function normalizeSessionInput(body: Record<string, unknown>, requireOffering: boolean) {
  const cohortCourseId = typeof body.cohort_course_id === "string" ? body.cohort_course_id : null;
  const title = readText(body.title, 240);
  const description = readText(body.description);
  const sessionNumber = validWholeNumber(body.session_number, 1);
  const start = readNullableTimestamp(body.scheduled_start_at);
  const end = readNullableTimestamp(body.scheduled_end_at);
  const facilitatorId = body.facilitator_id === "" || body.facilitator_id === null || body.facilitator_id === undefined ? null : body.facilitator_id;
  const liveJoinUrl = readHttpUrl(body.live_join_url);
  if (requireOffering && (!cohortCourseId || !isUuid(cohortCourseId))) invalid("A valid cohort course is required.");
  if (!title) invalid("A session title is required.");
  if (sessionNumber === undefined) invalid("Session number must be a positive whole number.");
  if (!isOneOf(sessionTypes, body.session_type)) invalid("A valid session type is required.");
  if (!isOneOf(sessionDeliveryModes, body.delivery_mode)) invalid("A valid delivery mode is required.");
  if (!isOneOf(sessionStatuses, body.session_status)) invalid("A valid session status is required.");
  if (!isOneOf(sessionVisibilityStatuses, body.visibility_status)) invalid("A valid visibility setting is required.");
  if (start === undefined || end === undefined) invalid("Valid scheduled timestamps are required.");
  if (start && end && Date.parse(end) <= Date.parse(start)) invalid("Scheduled end must be after scheduled start.");
  if (facilitatorId !== null && (typeof facilitatorId !== "string" || !isUuid(facilitatorId))) invalid("A valid facilitator is required.");
  if (liveJoinUrl === undefined) invalid("The live class link must be a secure web URL.");
  if (typeof body.is_required !== "boolean") invalid("Required or optional status is required.");
  return {
    ...(requireOffering ? { cohort_course_id: cohortCourseId } : {}),
    title,
    description,
    session_number: sessionNumber,
    session_type: body.session_type,
    delivery_mode: body.delivery_mode,
    scheduled_start_at: start,
    scheduled_end_at: end,
    timezone: readText(body.timezone, 100) || "Africa/Lagos",
    facilitator_id: facilitatorId,
    live_join_url: liveJoinUrl,
    live_access_note: readText(body.live_access_note, 1000),
    physical_location: readText(body.physical_location, 500),
    session_status: body.session_status,
    is_required: body.is_required,
    visibility_status: body.visibility_status,
  };
}

export async function createClassSession(supabase: SupabaseClient, body: Record<string, unknown>, actor: SessionActor) {
  const values = normalizeSessionInput(body, true);
  const result = await supabase.from("class_sessions").insert({ ...values, created_by: actor.actorUserId ?? null, updated_by: actor.actorUserId ?? null }).select("*").single();
  if (result.error) {
    if (result.error.code === "23505") throw new LmsAdminDataError("That session number is already used for this cohort course.", 409);
    throw new LmsAdminDataError("Class session could not be created.");
  }
  await recordLmsAudit(supabase, { action: "class_session_created", entityType: "class_session", entityId: result.data.id, actorUserId: actor.actorUserId, metadata: { cohort_course_id: result.data.cohort_course_id, session_number: result.data.session_number, session_type: result.data.session_type, actor: actor.actorLabel } });
  return result.data;
}

export async function updateClassSession(supabase: SupabaseClient, id: string, body: Record<string, unknown>, actor: SessionActor) {
  const currentResult = await supabase.from("class_sessions").select("*").eq("id", id).maybeSingle();
  if (currentResult.error) throw new LmsAdminDataError("Class session could not be loaded.");
  if (!currentResult.data) throw new LmsAdminDataError("Class session not found.", 404);
  const values = normalizeSessionInput(body, false);
  const updates = { ...values, updated_by: actor.actorUserId ?? null, updated_at: new Date().toISOString() };
  const materialFields = ["scheduled_start_at", "scheduled_end_at", "delivery_mode", "physical_location"] as const;
  const previousSchedule = Object.fromEntries(materialFields.map((field) => [field, currentResult.data[field]]));
  const nextSchedule = Object.fromEntries(materialFields.map((field) => [field, updates[field]]));
  const scheduleChanged = JSON.stringify(previousSchedule) !== JSON.stringify(nextSchedule);
  const statusChanged = currentResult.data.session_status !== updates.session_status;
  const result = await supabase.from("class_sessions").update(updates).eq("id", id).select("*").single();
  if (result.error) {
    if (result.error.code === "23505") throw new LmsAdminDataError("That session number is already used for this cohort course.", 409);
    throw new LmsAdminDataError("Class session could not be updated.");
  }
  if (scheduleChanged) {
    const event = await supabase.from("session_change_events").insert({ class_session_id: id, change_type: "schedule_changed", previous_state: previousSchedule, new_state: nextSchedule, reason: readText(body.change_reason, 2000), changed_by: actor.actorUserId ?? null });
    if (event.error) console.error("Session change event insert failed after update", { code: event.error.code });
    await recordLmsAudit(supabase, { action: "class_session_rescheduled", entityType: "class_session", entityId: id, actorUserId: actor.actorUserId, metadata: { previous: previousSchedule, next: nextSchedule, reason_supplied: Boolean(readText(body.change_reason)), actor: actor.actorLabel } });
  }
  if (statusChanged) await recordLmsAudit(supabase, { action: "class_session_status_changed", entityType: "class_session", entityId: id, actorUserId: actor.actorUserId, metadata: { previous: currentResult.data.session_status, next: updates.session_status, actor: actor.actorLabel } });
  await recordLmsAudit(supabase, { action: "class_session_updated", entityType: "class_session", entityId: id, actorUserId: actor.actorUserId, metadata: { schedule_changed: scheduleChanged, status_changed: statusChanged, actor: actor.actorLabel } });
  return result.data;
}

const summaryFields = ["title", "learning_objectives", "key_teaching_points", "key_scriptures_references", "important_concepts", "practical_applications", "action_points", "recommended_resources", "additional_notes"] as const;
function normalizeSummary(body: Record<string, unknown>) {
  return { title: readText(body.title, 240), learning_objectives: readStringList(body.learning_objectives), key_teaching_points: readStringList(body.key_teaching_points), key_scriptures_references: readStringList(body.key_scriptures_references), important_concepts: readStringList(body.important_concepts), practical_applications: readStringList(body.practical_applications), action_points: readStringList(body.action_points), recommended_resources: readStringList(body.recommended_resources), additional_notes: readText(body.additional_notes) };
}
function summaryChanged(current: Record<string, unknown>, next: Record<string, unknown>) { return summaryFields.some((field) => JSON.stringify(current[field] ?? null) !== JSON.stringify(next[field] ?? null)); }

export async function saveClassSummary(supabase: SupabaseClient, sessionId: string, body: Record<string, unknown>, actor: SessionActor) {
  const values = normalizeSummary(body);
  const suppliedId = typeof body.summary_id === "string" && isUuid(body.summary_id) ? body.summary_id : null;
  const existing = suppliedId
    ? await supabase.from("class_summaries").select("*").eq("id", suppliedId).eq("class_session_id", sessionId).maybeSingle()
    : await supabase.from("class_summaries").select("*").eq("class_session_id", sessionId).in("summary_status", ["draft", "changes_requested"]).order("updated_at", { ascending: false }).limit(1).maybeSingle();
  if (existing.error) throw new LmsAdminDataError("Class summary could not be loaded.");
  if (existing.data && !summaryChanged(existing.data, values)) return { summary: existing.data, changed: false };
  const expectedVersion = existing.data ? Number(body.expected_version) : null;
  if (existing.data && (!Number.isInteger(expectedVersion) || expectedVersion !== Number(existing.data.lock_version))) throw new LmsAdminDataError("This summary changed after it was opened. Reload before saving.", 409);
  const result = await supabase.rpc("save_class_summary_revision", {
    p_class_session_id: sessionId,
    p_summary_id: existing.data?.id ?? null,
    p_expected_version: expectedVersion,
    p_content: values,
    p_change_note: readText(body.change_note, 2000),
    p_actor_identifier: actor.actorUserId ?? actor.actorLabel,
  });
  if (result.error || !result.data) {
    console.error("Class summary transactional save failed", { sessionId, summaryId: existing.data?.id ?? null, error: result.error });
    if (result.error?.code === "40001") throw new LmsAdminDataError("This summary changed after it was opened. Reload before saving.", 409);
    if (result.error?.code === "42501") throw new LmsAdminDataError("You are not authorised to edit this class-summary revision.", 403);
    throw new LmsAdminDataError(existing.data ? "Class summary revision could not be saved." : "Class summary draft could not be created.");
  }
  const summary = result.data as Record<string, unknown>;
  await recordLmsAudit(actor.auditClient ?? supabase, { action: existing.data ? "class_summary_updated" : "class_summary_created", entityType: "class_summary", entityId: String(summary.id), actorUserId: actor.actorUserId, metadata: { class_session_id: sessionId, previous_version: existing.data?.version_number ?? null, next_version: summary.version_number, actor: actor.actorLabel, transactional: true } });
  return { summary, changed: true };
}

export type ClassSummaryTransition = "submit" | "request_changes" | "approve" | "publish" | "archive" | "create_amendment";

export async function transitionClassSummary(supabase: SupabaseClient, summaryId: string, action: ClassSummaryTransition, body: Record<string, unknown>, actor: SessionActor) {
  const expectedVersion = Number(body.expected_version);
  if (!Number.isInteger(expectedVersion) || expectedVersion < 1) throw new LmsAdminDataError("Reload the current summary revision before continuing.", 409);
  const note = readText(body.note, 2000);
  const current = await supabase.from("class_summaries").select("class_session_id, summary_status, version_number, lock_version").eq("id", summaryId).maybeSingle();
  if (current.data && Number(current.data.lock_version) !== expectedVersion) throw new LmsAdminDataError("This summary changed after it was opened. Reload before continuing.", 409);
  if (current.error || !current.data) throw new LmsAdminDataError("Class summary not found.", 404);
  const result = await supabase.rpc("transition_class_summary", { p_summary_id: summaryId, p_action: action, p_expected_version: expectedVersion, p_note: note, p_actor_identifier: actor.actorUserId ?? actor.actorLabel });
  if (result.error || !result.data) {
    if (result.error?.code === "40001") throw new LmsAdminDataError("This summary changed after it was opened. Reload before continuing.", 409);
    if (result.error?.code === "42501") throw new LmsAdminDataError("You are not authorised to perform this class-summary transition.", 403);
    throw new LmsAdminDataError(result.error?.message || "Class summary transition could not be completed.", result.error?.code === "22023" ? 409 : 500);
  }
  const summary = result.data as Record<string, unknown>;
  const auditActions = { submit: "class_summary_submitted", request_changes: "class_summary_changes_requested", approve: "class_summary_approved", publish: "class_summary_published", archive: "class_summary_archived", create_amendment: "class_summary_amendment_created" } as const;
  await recordLmsAudit(actor.auditClient ?? supabase, { action: auditActions[action], entityType: "class_summary", entityId: String(summary.id), actorUserId: actor.actorUserId, metadata: { class_session_id: current.data.class_session_id, previous: current.data.summary_status, next: summary.summary_status, note_supplied: Boolean(note), actor: actor.actorLabel, transactional: true } });
  return summary;
}

export async function addSessionResource(supabase: SupabaseClient, sessionId: string, body: Record<string, unknown>, actor: SessionActor) {
  const title = readText(body.title, 240); const externalUrl = readHttpUrl(body.external_url); const sortOrder = validWholeNumber(body.sort_order, 0);
  if (!title || !isOneOf(resourceTypes, body.resource_type) || !isOneOf(sessionAccessLevels, body.access_level) || externalUrl === undefined || sortOrder === undefined) invalid("Valid resource details are required.");
  const result = await supabase.from("session_resources").insert({ class_session_id: sessionId, title, description: readText(body.description), resource_type: body.resource_type, external_url: externalUrl, access_level: body.access_level, sort_order: sortOrder ?? 0, is_active: true, created_by: actor.actorUserId ?? null }).select("*").single();
  if (result.error) throw new LmsAdminDataError("Session resource could not be added.");
  await recordLmsAudit(actor.auditClient ?? supabase, { action: "session_resource_added", entityType: "session_resource", entityId: result.data.id, actorUserId: actor.actorUserId, metadata: { class_session_id: sessionId, resource_type: result.data.resource_type, access_level: result.data.access_level, actor: actor.actorLabel } }); return result.data;
}

export async function updateSessionResource(supabase: SupabaseClient, resourceId: string, body: Record<string, unknown>, actor: SessionActor) {
  const current = await supabase.from("session_resources").select("*").eq("id", resourceId).maybeSingle(); if (current.error || !current.data) throw new LmsAdminDataError("Session resource not found.", 404);
  const title = readText(body.title, 240); const externalUrl = readHttpUrl(body.external_url); const sortOrder = validWholeNumber(body.sort_order, 0); if (!title || !isOneOf(resourceTypes, body.resource_type) || !isOneOf(sessionAccessLevels, body.access_level) || externalUrl === undefined || sortOrder === undefined || typeof body.is_active !== "boolean") invalid("Valid resource details are required.");
  const result = await supabase.from("session_resources").update({ title, description: readText(body.description), resource_type: body.resource_type, external_url: externalUrl, access_level: body.access_level, sort_order: sortOrder ?? 0, is_active: body.is_active, updated_at: new Date().toISOString() }).eq("id", resourceId).select("*").single(); if (result.error) throw new LmsAdminDataError("Session resource could not be updated.");
  const deactivated = current.data.is_active && !result.data.is_active; await recordLmsAudit(actor.auditClient ?? supabase, { action: deactivated ? "session_resource_deactivated" : "session_resource_updated", entityType: "session_resource", entityId: resourceId, actorUserId: actor.actorUserId, metadata: { class_session_id: current.data.class_session_id, resource_type: result.data.resource_type, access_level: result.data.access_level, actor: actor.actorLabel } }); return result.data;
}

export async function addClassRecording(supabase: SupabaseClient, sessionId: string, body: Record<string, unknown>, actor: SessionActor) {
  const values = normalizeRecording(body);
  if (recordingEvidenceReadiness({ ...values, class_session_id: sessionId }).ready) await assertRecordingActivationReady(supabase, sessionId, null);
  const result = await supabase.from("class_recordings").insert({ class_session_id: sessionId, ...values, created_by: actor.actorUserId ?? null }).select("*").single(); if (result.error) throw new LmsAdminDataError("Recording metadata could not be added."); await recordLmsAudit(supabase, { action: "class_recording_added", entityType: "class_recording", entityId: result.data.id, actorUserId: actor.actorUserId, metadata: { class_session_id: sessionId, provider: result.data.provider, recording_status: result.data.recording_status, access_level: result.data.access_level, actor: actor.actorLabel } }); await orchestrateEvidenceRecording(supabase, result.data, actor); return result.data;
}
function normalizeRecording(body: Record<string, unknown>) {
  const title = readText(body.title, 240); const externalUrl = readHttpUrl(body.external_url); const embedUrl = readHttpUrl(body.embed_url); const duration = validWholeNumber(body.duration_seconds, 0); const from = readNullableTimestamp(body.available_from); const until = readNullableTimestamp(body.available_until); const recordingDate = readNullableDate(body.recording_date);
  if (!title || !isOneOf(recordingProviders, body.provider) || !isOneOf(recordingStatuses, body.recording_status) || !isOneOf(sessionAccessLevels, body.access_level) || externalUrl === undefined || embedUrl === undefined || duration === undefined || from === undefined || until === undefined || recordingDate === undefined || typeof body.quality_checked !== "boolean") invalid("Valid recording metadata is required.");
  if (body.recording_status === "available" && !externalUrl && !embedUrl) invalid("An available recording requires a secure external or embed URL."); if (from && until && Date.parse(until) <= Date.parse(from)) invalid("Recording availability end must be after its start.");
  const values = { title, description: readText(body.description), provider: body.provider, external_url: externalUrl, embed_url: embedUrl, external_recording_id: readText(body.external_recording_id, 500), duration_seconds: duration, recording_date: recordingDate, admin_notes: readText(body.admin_notes, 4000), facilitator_notes: readText(body.facilitator_notes, 4000), recording_status: body.recording_status, access_level: body.access_level, retention_status: "active", available_from: from, available_until: until, quality_checked: body.quality_checked, quality_checked_at: body.quality_checked ? new Date().toISOString() : null, updated_at: new Date().toISOString() };
  if (body.quality_checked && !recordingEvidenceReadiness({ ...values, recording_status: "available" }).ready) invalid("Quality approval requires a valid enrolled-student source, provider metadata, and supported duration where automated tracking is used.");
  return values;
}
export async function updateClassRecording(supabase: SupabaseClient, sessionId: string, recordingId: string, body: Record<string, unknown>, actor: SessionActor) {
  const current = await supabase.from("class_recordings").select("*").eq("id", recordingId).eq("class_session_id", sessionId).maybeSingle(); if (current.error || !current.data) throw new LmsAdminDataError("Recording not found.", 404); const values = normalizeRecording(body); if (recordingEvidenceReadiness({ ...current.data, ...values, class_session_id: sessionId }).ready) await assertRecordingActivationReady(supabase, sessionId, recordingId); if (current.data.quality_checked && values.quality_checked) values.quality_checked_at = current.data.quality_checked_at; const result = await supabase.from("class_recordings").update(values).eq("id", recordingId).eq("class_session_id", sessionId).select("*").single(); if (result.error) throw new LmsAdminDataError("Recording metadata could not be updated."); await recordLmsAudit(supabase, { action: "class_recording_updated", entityType: "class_recording", entityId: recordingId, actorUserId: actor.actorUserId, metadata: { class_session_id: current.data.class_session_id, previous_status: current.data.recording_status, next_status: result.data.recording_status, access_level: result.data.access_level, actor: actor.actorLabel } }); if (!current.data.quality_checked && result.data.quality_checked) await recordLmsAudit(supabase, { action: "class_recording_quality_checked", entityType: "class_recording", entityId: recordingId, actorUserId: actor.actorUserId, metadata: { class_session_id: current.data.class_session_id, actor: actor.actorLabel } }); await orchestrateEvidenceRecording(supabase, result.data, actor); return result.data;
}

async function orchestrateEvidenceRecording(supabase: SupabaseClient, recording: Record<string, unknown>, actor: SessionActor) {
  if (!recordingEvidenceReadiness(recording).ready) return { recordedRoute: null, makeups: null };
  const sessionId = String(recording.class_session_id);
  const recordedRoute = await initializeRecordedLearningForSession(supabase, sessionId, actor);
  const makeups = await initializeAwaitingMakeupsForSession(supabase, sessionId, actor);
  return { recordedRoute, makeups };
}
