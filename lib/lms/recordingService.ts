import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { recordLmsAudit } from "@/lib/lms/adminAudit";
import { LmsAdminDataError } from "@/lib/lms/adminData";
import { makeupStatusFromLearning } from "@/lib/lms/absence";
import { sendMakeupEmail } from "@/lib/lms/absenceEmail";
import { ensureSessionAttendanceRoster } from "@/lib/lms/attendanceService";
import { setLearningCompletionState } from "@/lib/lms/learningCompletionService";
import {
  creditedPlaybackSegment,
  evaluateRecordedRequirements,
  mergeWatchedSegments,
  providerTrackingMode,
  recordingRequirementTypes,
  resolveRecordingRequirementSnapshot,
  resolveEffectiveRecordingRequirements,
  type EffectiveRecordingRequirements,
  type RecordingPurposeCode,
  type RecordingRequirementType,
  uniqueWatchedSeconds,
  watchPercentage,
} from "@/lib/lms/recording";

type Actor = { actorUserId?: string | null; actorLabel: "REALMS Admin" | "Facilitator" | "Student" | "System" };
function object(value: unknown): Record<string, unknown> { return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {}; }
function relation(value: unknown) { return Array.isArray(value) ? object(value[0]) : object(value); }
function actorReference(actor: Actor) { return actor.actorUserId ?? actor.actorLabel; }
function invalid(message: string): never { throw new LmsAdminDataError(message, 400); }
function requiredText(value: unknown, message: string, maximum = 4000) { if (typeof value !== "string" || !value.trim()) invalid(message); return value.trim().slice(0, maximum); }
function boolean(value: unknown) { return value === true; }
function optionalNumber(value: unknown, minimum: number, maximum?: number) { if (value === null || value === undefined || value === "") return null; const number = Number(value); if (!Number.isFinite(number) || number < minimum || (maximum !== undefined && number > maximum)) invalid("A valid numeric requirement is required."); return number; }

function assignmentRequirements(assignment: Record<string, unknown>) {
  return resolveRecordingRequirementSnapshot(assignment.requirement_snapshot);
}

function purposeMethod(purpose: RecordingPurposeCode) {
  if (purpose === "RP") return "recorded_primary";
  if (purpose === "DR-E") return "recorded_exception";
  if (purpose === "MU-E") return "approved_makeup";
  if (purpose === "MU-U") return "unapproved_makeup";
  return null;
}

async function effectiveRequirements(supabase: SupabaseClient, input: { sessionId: string; cohortId: string; courseCategory: string; purpose: RecordingPurposeCode }): Promise<EffectiveRecordingRequirements> {
  const [policy, session] = await Promise.all([
    supabase.from("recording_completion_policies").select("*").eq("cohort_id", input.cohortId).eq("policy_status", "active").maybeSingle(),
    supabase.from("session_recording_requirements").select("*").eq("class_session_id", input.sessionId).eq("requirement_status", "active").maybeSingle(),
  ]);
  if (policy.error || session.error) throw new LmsAdminDataError("Recorded-learning requirements could not be loaded.");
  return resolveEffectiveRecordingRequirements({ policy: policy.data, sessionOverride: session.data, courseCategory: input.courseCategory, purpose: input.purpose });
}

async function createAssignmentParts(supabase: SupabaseClient, input: {
  courseEnrollmentId: string;
  sessionId: string;
  recording: Record<string, unknown>;
  purpose: RecordingPurposeCode;
  requirements: EffectiveRecordingRequirements;
  assignmentAvailableAt?: string;
  assignmentDueAt?: string | null;
}) {
  const recordingId = String(input.recording.id);
  const existing = await supabase.from("recording_learning_assignments").select("*").eq("course_enrollment_id", input.courseEnrollmentId).eq("class_recording_id", recordingId).eq("purpose_code", input.purpose).maybeSingle();
  if (existing.error) throw new LmsAdminDataError("Recorded-learning assignment could not be checked.");
  let assignment = existing.data;
  let created = false;
  if (!assignment) {
    const availableAt = input.assignmentAvailableAt ?? (typeof input.recording.available_from === "string" ? input.recording.available_from : new Date().toISOString());
    const dueAt = input.assignmentDueAt !== undefined ? input.assignmentDueAt : input.purpose === "REV" ? null : new Date(Date.parse(availableAt) + input.requirements.deadlineHours * 60 * 60 * 1000).toISOString();
    const inserted = await supabase.from("recording_learning_assignments").insert({ course_enrollment_id: input.courseEnrollmentId, class_session_id: input.sessionId, class_recording_id: recordingId, purpose_code: input.purpose, assignment_status: "assigned", available_at: availableAt, due_at: dueAt, requirement_snapshot: input.requirements }).select("*").single();
    if (inserted.error) {
      if (inserted.error.code === "PGRST204" || inserted.error.message?.includes("requirement_snapshot")) throw new LmsAdminDataError("Recorded-learning assignments are temporarily unavailable. Please contact a REALMS administrator.", 503);
      if (inserted.error.code !== "23505") throw new LmsAdminDataError("Recorded-learning assignment could not be created.");
      const raced = await supabase.from("recording_learning_assignments").select("*").eq("course_enrollment_id", input.courseEnrollmentId).eq("class_recording_id", recordingId).eq("purpose_code", input.purpose).single();
      if (raced.error) throw new LmsAdminDataError("Recorded-learning assignment could not be loaded after initialization.");
      assignment = raced.data;
    } else { assignment = inserted.data; created = true; }
  }
  const progress = await supabase.from("recording_progress").upsert({ recording_assignment_id: assignment.id, progress_status: "not_started", unique_watched_seconds: 0, watch_percentage: 0, watch_requirement_met: false, checkpoint_requirement_met: false, playback_session_count: 0, integrity_status: "clear" }, { onConflict: "recording_assignment_id", ignoreDuplicates: true });
  if (progress.error) throw new LmsAdminDataError("Recording progress could not be prepared.");
  const required: Record<RecordingRequirementType, boolean> = {
    watch: input.purpose !== "REV",
    checkpoints: input.requirements.requiresCheckpoints,
    quiz: input.requirements.requiresQuiz,
    practical: input.requirements.requiresPractical,
    reflection: input.requirements.requiresReflection,
    oral_verification: input.requirements.requiresOralVerification,
  };
  const statuses = recordingRequirementTypes.map((type) => ({ recording_assignment_id: assignment.id, requirement_type: type, is_required: required[type], requirement_status: required[type] ? "pending" : "not_required" }));
  const requirements = await supabase.from("recording_requirement_statuses").upsert(statuses, { onConflict: "recording_assignment_id,requirement_type", ignoreDuplicates: true });
  if (requirements.error) throw new LmsAdminDataError("Recorded-learning requirements could not be prepared.");
  const completion = await supabase.from("session_learning_completion").upsert({ course_enrollment_id: input.courseEnrollmentId, class_session_id: input.sessionId, completion_status: "not_started" }, { onConflict: "course_enrollment_id,class_session_id", ignoreDuplicates: true });
  if (completion.error) throw new LmsAdminDataError("Learning-completion status could not be prepared.");
  return { assignment, created };
}

export async function ensureMakeupRecordingAssignment(supabase: SupabaseClient, input: {
  courseEnrollmentId: string;
  sessionId: string;
  purpose: "MU-E" | "MU-U";
  dueAt?: string | null;
}) {
  const sessionResult = await supabase.from("class_sessions").select("id, cohort_course_id, cohort_courses(cohort_id, courses(course_category))").eq("id", input.sessionId).maybeSingle();
  if (sessionResult.error || !sessionResult.data) throw new LmsAdminDataError("Class session not found.", 404);
  const recordings = await supabase.from("class_recordings").select("*").eq("class_session_id", input.sessionId).eq("recording_status", "available").eq("access_level", "enrolled_students").order("available_from", { ascending: false, nullsFirst: false });
  if (recordings.error) throw new LmsAdminDataError("Available make-up materials could not be checked.");
  const now = new Date();
  const recording = (recordings.data ?? []).find((item) => (!item.available_from || Date.parse(item.available_from) <= now.valueOf()) && (!item.available_until || Date.parse(item.available_until) > now.valueOf()));
  if (!recording) return { state: "awaiting_materials" as const };
  const offering = relation(sessionResult.data.cohort_courses); const course = relation(offering.courses);
  const requirements = await effectiveRequirements(supabase, { sessionId: input.sessionId, cohortId: String(offering.cohort_id), courseCategory: String(course.course_category), purpose: input.purpose });
  const availableAt = now.toISOString();
  const result = await createAssignmentParts(supabase, { courseEnrollmentId: input.courseEnrollmentId, sessionId: input.sessionId, recording, purpose: input.purpose, requirements, assignmentAvailableAt: availableAt, assignmentDueAt: input.dueAt === undefined ? undefined : input.dueAt });
  const links = await supabase.from("session_recording_requirements").select("quiz_id, practical_assignment_id, reflection_assignment_id, requires_oral_verification").eq("class_session_id", input.sessionId).eq("requirement_status", "active").maybeSingle();
  if (links.error) throw new LmsAdminDataError("Linked make-up requirements could not be loaded.");
  return { state: "assigned" as const, assignment: result.assignment, created: result.created, recording, requirements, links: links.data };
}

export async function initializeRecordedLearningForSession(supabase: SupabaseClient, sessionId: string, actor: Actor) {
  await ensureSessionAttendanceRoster(supabase, sessionId, { actorLabel: actor.actorLabel === "Facilitator" ? "Facilitator" : "REALMS Admin", actorUserId: actor.actorUserId, auditClient: supabase });
  const session = await supabase.from("class_sessions").select("id, cohort_course_id, cohort_courses(cohort_id, courses(course_category))").eq("id", sessionId).maybeSingle();
  if (session.error || !session.data) throw new LmsAdminDataError("Class session not found.", 404);
  const offering = relation(session.data.cohort_courses); const course = relation(offering.courses);
  const recordings = await supabase.from("class_recordings").select("*").eq("class_session_id", sessionId).eq("recording_status", "available").eq("access_level", "enrolled_students");
  if (recordings.error) throw new LmsAdminDataError("Available class recordings could not be loaded.");
  if (!recordings.data?.length) throw new LmsAdminDataError("An available enrolled-student recording is required before recorded learning can be initialized.", 409);
  const enrollments = await supabase.from("course_enrollments").select("id, delivery_route").eq("cohort_course_id", session.data.cohort_course_id).in("enrollment_status", ["active", "enrolled"]).in("delivery_route", ["RP", "DR-E"]);
  if (enrollments.error) throw new LmsAdminDataError("Eligible recorded-route enrolments could not be loaded.");
  let created = 0;
  for (const enrollment of enrollments.data ?? []) {
    const purpose = enrollment.delivery_route as "RP" | "DR-E";
    const requirements = await effectiveRequirements(supabase, { sessionId, cohortId: String(offering.cohort_id), courseCategory: String(course.course_category), purpose });
    for (const recording of recordings.data) {
      const result = await createAssignmentParts(supabase, { courseEnrollmentId: enrollment.id, sessionId, recording, purpose, requirements });
      if (result.created) created += 1;
    }
  }
  await recordLmsAudit(supabase, { action: "recorded_learning_initialized", entityType: "class_session", entityId: sessionId, actorUserId: actor.actorUserId, metadata: { eligible_enrolments: enrollments.data?.length ?? 0, available_recordings: recordings.data.length, assignments_created: created } });
  return { created, eligible: enrollments.data?.length ?? 0, recordings: recordings.data.length };
}

export async function ensureRevisionAssignmentForRecording(supabase: SupabaseClient, profileId: string, recordingId: string) {
  const student = await supabase.from("students").select("id").eq("profile_id", profileId).maybeSingle();
  if (student.error || !student.data) throw new LmsAdminDataError("Student learning identity could not be resolved.", 403);
  const recording = await supabase.from("class_recordings").select("*, class_sessions(id, cohort_course_id, cohort_courses(cohort_id, courses(course_category)))").eq("id", recordingId).eq("recording_status", "available").maybeSingle();
  if (recording.error || !recording.data) throw new LmsAdminDataError("This recording is not currently available.", 403);
  const session = relation(recording.data.class_sessions);
  const enrollment = await supabase.from("course_enrollments").select("id, delivery_route, student_enrollments!inner(student_id)").eq("cohort_course_id", session.cohort_course_id).eq("student_enrollments.student_id", student.data.id).in("enrollment_status", ["active", "enrolled"]).maybeSingle();
  if (enrollment.error || !enrollment.data) throw new LmsAdminDataError("This recording is not in your enrolled learning route.", 403);
  const existingPrimary = await supabase.from("recording_learning_assignments").select("*").eq("course_enrollment_id", enrollment.data.id).eq("class_recording_id", recordingId).in("purpose_code", ["RP", "DR-E", "MU-E", "MU-U"]).maybeSingle();
  if (existingPrimary.error) throw new LmsAdminDataError("Recording assignment could not be checked.");
  if (existingPrimary.data) return existingPrimary.data;
  const offering = relation(session.cohort_courses); const course = relation(offering.courses);
  const requirements = await effectiveRequirements(supabase, { sessionId: String(session.id), cohortId: String(offering.cohort_id), courseCategory: String(course.course_category), purpose: "REV" });
  const result = await createAssignmentParts(supabase, { courseEnrollmentId: enrollment.data.id, sessionId: String(session.id), recording: recording.data, purpose: "REV", requirements: { ...requirements, requiresCheckpoints: false, requiresQuiz: false, requiresPractical: false, requiresReflection: false, requiresOralVerification: false } });
  return result.assignment;
}

export async function resolveStudentRecordingAssignment(supabase: SupabaseClient, profileId: string, assignmentId: string) {
  const student = await supabase.from("students").select("id").eq("profile_id", profileId).maybeSingle();
  if (student.error || !student.data) throw new LmsAdminDataError("Student access required.", 403);
  const assignment = await supabase.from("recording_learning_assignments").select("*, class_recordings(*), class_sessions(id, title, cohort_course_id, cohort_courses(cohort_id, courses(id, code, title, course_category))), course_enrollments(id, delivery_route, student_enrollments!inner(student_id))").eq("id", assignmentId).eq("course_enrollments.student_enrollments.student_id", student.data.id).maybeSingle();
  if (assignment.error || !assignment.data) throw new LmsAdminDataError("This recorded-learning assignment is not available in your account.", 403);
  return assignment.data;
}

function checkAvailability(recording: Record<string, unknown>, assignment: Record<string, unknown>) {
  const now = Date.now();
  const available = typeof assignment.available_at === "string" ? Date.parse(assignment.available_at) : typeof recording.available_from === "string" ? Date.parse(recording.available_from) : null;
  const until = typeof recording.available_until === "string" ? Date.parse(recording.available_until) : null;
  if (available && now < available) throw new LmsAdminDataError("This recording is not available yet.", 409);
  if (until && now > until) throw new LmsAdminDataError("This recording access window has expired. Your existing progress has been preserved.", 409);
}

export async function startRecordingPlayback(supabase: SupabaseClient, profileId: string, assignmentId: string, userAgentSummary: string | null) {
  const assignment = await resolveStudentRecordingAssignment(supabase, profileId, assignmentId);
  const recording = relation(assignment.class_recordings); checkAvailability(recording, assignment);
  const mode = providerTrackingMode(String(recording.provider ?? ""), typeof recording.embed_url === "string" ? recording.embed_url : null, typeof recording.duration_seconds === "number" ? recording.duration_seconds : null);
  const progress = await supabase.from("recording_progress").select("*").eq("recording_assignment_id", assignmentId).single();
  if (progress.error) throw new LmsAdminDataError("Recording progress has not been initialized.", 409);
  const now = new Date().toISOString();
  if (mode === "manual_review") {
    const updated = await supabase.from("recording_progress").update({ first_access_at: progress.data.first_access_at ?? now, last_access_at: now, progress_status: "under_review", updated_at: now }).eq("id", progress.data.id);
    if (updated.error) throw new LmsAdminDataError("Recording progress could not be started.");
    if (!progress.data.first_access_at) await recordLmsAudit(supabase, { action: "recording_started", entityType: "recording_learning_assignment", entityId: assignmentId, actorUserId: profileId, metadata: { provider: recording.provider, purpose: assignment.purpose_code, tracking_mode: mode } });
    if ((assignment.purpose_code === "MU-E" || assignment.purpose_code === "MU-U") && !progress.data.first_access_at) {
      const makeup = await supabase.from("makeup_requirements").select("id, makeup_status").eq("recording_learning_assignment_id", assignmentId).maybeSingle();
      if (!makeup.error && makeup.data && !["in_progress", "completed", "late_complete"].includes(makeup.data.makeup_status)) {
        const event = await supabase.from("makeup_requirement_events").insert({ makeup_requirement_id: makeup.data.id, event_type: "makeup_started", previous_state: { makeup_status: makeup.data.makeup_status }, new_state: { makeup_status: "in_progress" }, actor_type: "student", actor_identifier: profileId });
        if (!event.error) { await supabase.from("makeup_requirements").update({ makeup_status: "in_progress", updated_by: profileId, updated_at: now }).eq("id", makeup.data.id); await recordLmsAudit(supabase, { action: "makeup_started", entityType: "makeup_requirement", entityId: makeup.data.id, actorUserId: profileId, metadata: {} }); }
      }
    }
    return { trackingMode: mode, playbackSessionId: null, message: "Automated viewing progress is not available for this recording." };
  }
  const playback = await supabase.from("recording_playback_sessions").insert({ recording_assignment_id: assignmentId, player_provider: recording.provider, user_agent_summary: userAgentSummary?.slice(0, 300) ?? null, playback_status: "active", last_heartbeat_at: now }).select("*").single();
  if (playback.error) throw new LmsAdminDataError("Playback session could not be started.");
  const updated = await supabase.from("recording_progress").update({ first_access_at: progress.data.first_access_at ?? now, last_access_at: now, progress_status: "in_progress", playback_session_count: Number(progress.data.playback_session_count ?? 0) + 1, updated_at: now }).eq("id", progress.data.id);
  if (updated.error) throw new LmsAdminDataError("Recording progress could not be started.");
  await recordLmsAudit(supabase, { action: "recording_started", entityType: "recording_learning_assignment", entityId: assignmentId, actorUserId: profileId, metadata: { provider: recording.provider, purpose: assignment.purpose_code } });
  if (assignment.purpose_code === "MU-E" || assignment.purpose_code === "MU-U") {
    const makeup = await supabase.from("makeup_requirements").select("id, makeup_status").eq("recording_learning_assignment_id", assignmentId).maybeSingle();
    if (!makeup.error && makeup.data && !["in_progress", "completed", "late_complete"].includes(makeup.data.makeup_status)) {
      const event = await supabase.from("makeup_requirement_events").insert({ makeup_requirement_id: makeup.data.id, event_type: "makeup_started", previous_state: { makeup_status: makeup.data.makeup_status }, new_state: { makeup_status: "in_progress" }, actor_type: "student", actor_identifier: profileId });
      if (!event.error) { await supabase.from("makeup_requirements").update({ makeup_status: "in_progress", updated_by: profileId, updated_at: now }).eq("id", makeup.data.id); await recordLmsAudit(supabase, { action: "makeup_started", entityType: "makeup_requirement", entityId: makeup.data.id, actorUserId: profileId, metadata: {} }); }
    }
  }
  return { trackingMode: mode, playbackSessionId: playback.data.id, heartbeatSeconds: 20 };
}

function parseSuspicionCount(note: unknown) { const match = typeof note === "string" ? note.match(/suspicious_heartbeat_count:(\d+)/) : null; return match ? Number(match[1]) : 0; }

export async function recordPlaybackHeartbeat(supabase: SupabaseClient, profileId: string, assignmentId: string, body: Record<string, unknown>) {
  const assignment = await resolveStudentRecordingAssignment(supabase, profileId, assignmentId); const recording = relation(assignment.class_recordings); checkAvailability(recording, assignment);
  if (providerTrackingMode(String(recording.provider ?? ""), typeof recording.embed_url === "string" ? recording.embed_url : null, typeof recording.duration_seconds === "number" ? recording.duration_seconds : null) !== "automated") throw new LmsAdminDataError("Automated viewing progress is not available for this recording.", 409);
  const playbackId = requiredText(body.playback_session_id, "A valid playback session is required.", 100);
  const playback = await supabase.from("recording_playback_sessions").select("*").eq("id", playbackId).eq("recording_assignment_id", assignmentId).eq("playback_status", "active").maybeSingle();
  if (playback.error || !playback.data) throw new LmsAdminDataError("Playback session is no longer active.", 409);
  const previous = optionalNumber(body.previous_position_seconds, 0); const current = optionalNumber(body.current_position_seconds, 0); const rate = optionalNumber(body.playback_rate, 0.5, 2) ?? 1;
  if (previous === null || current === null) invalid("Valid playback positions are required.");
  const now = new Date(); const last = playback.data.last_heartbeat_at ? new Date(playback.data.last_heartbeat_at) : new Date(playback.data.started_at);
  const wall = Math.max(0, Math.min((now.valueOf() - last.valueOf()) / 1000, 120));
  const seekEvent = body.seek_event === true;
  const evidence = seekEvent ? { segment: null, suspicious: Math.abs(current - previous) > 15 } : creditedPlaybackSegment({ previousPosition: previous, currentPosition: current, observedWallSeconds: wall, playbackRate: rate });
  if (evidence.segment) {
    const inserted = await supabase.from("recording_watch_segments").insert({ playback_session_id: playbackId, segment_start_seconds: evidence.segment.start, segment_end_seconds: evidence.segment.end, observed_wall_seconds: wall, playback_rate: rate });
    if (inserted.error) throw new LmsAdminDataError("Playback evidence could not be recorded.");
  }
  await supabase.from("recording_playback_sessions").update({ last_heartbeat_at: now.toISOString() }).eq("id", playbackId);
  const sessions = await supabase.from("recording_playback_sessions").select("id").eq("recording_assignment_id", assignmentId);
  const sessionIds = (sessions.data ?? []).map((item) => item.id);
  const segments = sessionIds.length ? await supabase.from("recording_watch_segments").select("segment_start_seconds, segment_end_seconds").in("playback_session_id", sessionIds) : { data: [], error: null };
  if (sessions.error || segments.error) throw new LmsAdminDataError("Unique viewing progress could not be calculated.");
  const merged = mergeWatchedSegments((segments.data ?? []).map((segment) => ({ start: Number(segment.segment_start_seconds), end: Number(segment.segment_end_seconds) })));
  const unique = uniqueWatchedSeconds(merged); const percentage = watchPercentage(unique, Number(recording.duration_seconds));
  const progress = await supabase.from("recording_progress").select("*").eq("recording_assignment_id", assignmentId).single();
  if (progress.error) throw new LmsAdminDataError("Recording progress could not be loaded.");
  const requirementResolution = assignmentRequirements(assignment);
  const requirements = requirementResolution.requirements;
  const legacyRequirements = requirementResolution.status === "legacy";
  const watchMet = requirements ? percentage >= requirements.minWatchPercentage : Boolean(progress.data.watch_requirement_met);
  const suspicionCount = parseSuspicionCount(progress.data.integrity_note) + (evidence.suspicious ? 1 : 0);
  const flagged = suspicionCount >= 2;
  const update = await supabase.from("recording_progress").update({ unique_watched_seconds: unique, watch_percentage: percentage, watch_requirement_met: watchMet, completed_watch_at: watchMet ? progress.data.completed_watch_at ?? now.toISOString() : null, last_access_at: now.toISOString(), progress_status: legacyRequirements ? "under_review" : flagged ? "integrity_review" : watchMet ? "watch_complete" : "in_progress", integrity_status: flagged ? "review_required" : progress.data.integrity_status, integrity_note: suspicionCount ? `suspicious_heartbeat_count:${suspicionCount}` : progress.data.integrity_note, updated_at: now.toISOString() }).eq("id", progress.data.id);
  if (update.error) throw new LmsAdminDataError("Recording progress could not be updated.");
  if (!progress.data.watch_requirement_met && watchMet) await recordLmsAudit(supabase, { action: "recording_watch_requirement_met", entityType: "recording_learning_assignment", entityId: assignmentId, actorUserId: profileId, metadata: { watch_percentage: percentage, unique_watched_seconds: unique } });
  if (progress.data.integrity_status !== "review_required" && flagged) await recordLmsAudit(supabase, { action: "recording_integrity_flagged", entityType: "recording_learning_assignment", entityId: assignmentId, actorUserId: profileId, metadata: { public_reason: "Playback evidence requires review." } });
  const evaluation = await evaluateRecordedLearningAssignment(supabase, assignmentId, { actorLabel: "System", actorUserId: profileId });
  return { uniqueWatchedSeconds: unique, watchPercentage: percentage, watchRequirementMet: watchMet, progressStatus: evaluation.progressStatus, integrityStatus: flagged ? "review_required" : progress.data.integrity_status };
}

export async function endRecordingPlayback(supabase: SupabaseClient, profileId: string, assignmentId: string, playbackSessionId: string) {
  await resolveStudentRecordingAssignment(supabase, profileId, assignmentId);
  const result = await supabase.from("recording_playback_sessions").update({ ended_at: new Date().toISOString(), playback_status: "ended", last_heartbeat_at: new Date().toISOString() }).eq("id", playbackSessionId).eq("recording_assignment_id", assignmentId).eq("playback_status", "active").select("id");
  if (result.error || !result.data?.length) throw new LmsAdminDataError("Playback session could not be ended.", 409);
  return { ended: true };
}

function defaultRequirementEvidence(rows: Array<Record<string, unknown>>) {
  return Object.fromEntries(recordingRequirementTypes.map((type) => { const row = rows.find((item) => item.requirement_type === type); return [type, { required: Boolean(row?.is_required), status: String(row?.requirement_status ?? "pending") }]; })) as Record<RecordingRequirementType, { required: boolean; status: string }>;
}

async function checkpointEvidence(supabase: SupabaseClient, assignmentId: string, recordingId: string, requiredCount: number) {
  const checkpoints = await supabase.from("recording_checkpoints").select("id, is_required, recording_checkpoint_questions(id, question_type, is_active)").eq("class_recording_id", recordingId).eq("is_active", true).eq("is_required", true);
  if (checkpoints.error) throw new LmsAdminDataError("Recording checkpoints could not be evaluated.");
  const checkpointIds = (checkpoints.data ?? []).map((item) => item.id);
  const attempts = checkpointIds.length ? await supabase.from("recording_checkpoint_attempts").select("checkpoint_id, question_id, is_correct").eq("recording_assignment_id", assignmentId).in("checkpoint_id", checkpointIds) : { data: [], error: null };
  if (attempts.error) throw new LmsAdminDataError("Checkpoint attempts could not be evaluated.");
  let completed = 0;
  for (const checkpoint of checkpoints.data ?? []) {
    const questions = (checkpoint.recording_checkpoint_questions ?? []).filter((question: { is_active: boolean }) => question.is_active);
    if (questions.length && questions.every((question: { id: string }) => (attempts.data ?? []).some((attempt) => attempt.question_id === question.id && attempt.is_correct === true))) completed += 1;
  }
  return { configured: checkpoints.data?.length ?? 0, completed, met: (checkpoints.data?.length ?? 0) >= requiredCount && completed >= requiredCount };
}

export async function evaluateRecordedLearningAssignment(supabase: SupabaseClient, assignmentId: string, actor: Actor) {
  const assignmentResult = await supabase.from("recording_learning_assignments").select("*, class_recordings(id, provider, embed_url, duration_seconds), class_sessions(id, cohort_course_id, cohort_courses(cohort_id, courses(course_category))), course_enrollments(id, delivery_route)").eq("id", assignmentId).maybeSingle();
  if (assignmentResult.error || !assignmentResult.data) throw new LmsAdminDataError("Recorded-learning assignment not found.", 404);
  const assignment = assignmentResult.data; const purpose = assignment.purpose_code as RecordingPurposeCode; const recording = relation(assignment.class_recordings);
  const [progress, statusRows, completion] = await Promise.all([
    supabase.from("recording_progress").select("*").eq("recording_assignment_id", assignmentId).single(),
    supabase.from("recording_requirement_statuses").select("*").eq("recording_assignment_id", assignmentId),
    supabase.from("session_learning_completion").select("*").eq("course_enrollment_id", assignment.course_enrollment_id).eq("class_session_id", assignment.class_session_id).single(),
  ]);
  if (progress.error || statusRows.error || completion.error) throw new LmsAdminDataError("Recorded-learning evidence could not be evaluated.");
  const requirementResolution = assignmentRequirements(assignment);
  const requirements = requirementResolution.requirements;
  if (!requirements) {
    const alreadyComplete = assignment.assignment_status === "completed" && ["verified_complete", "late_complete"].includes(String(completion.data.completion_status));
    if (!alreadyComplete && progress.data.progress_status !== "under_review") {
      const review = await supabase.from("recording_progress").update({ progress_status: "under_review", updated_at: new Date().toISOString() }).eq("id", progress.data.id);
      if (review.error) throw new LmsAdminDataError("Historical recorded-learning progress could not be marked for review.");
    }
    return {
      learningStatus: alreadyComplete ? completion.data.completion_status : "under_review",
      progressStatus: alreadyComplete ? progress.data.progress_status : "under_review",
      complete: alreadyComplete,
      requirements: null,
      checkpoints: null,
      watchPercentage: Number(progress.data.watch_percentage),
      legacyRequirementSnapshot: true,
      warning: "This historical assignment has no trustworthy requirement snapshot and requires manual review.",
    };
  }
  const checkpoints = await checkpointEvidence(supabase, assignmentId, String(recording.id), requirements.requiredCheckpointCount);
  const rows = (statusRows.data ?? []).map(object); const evidence = defaultRequirementEvidence(rows);
  const watchRow = rows.find((row) => row.requirement_type === "watch");
  const checkpointRow = rows.find((row) => row.requirement_type === "checkpoints");
  const watchVerifiedExternally = watchRow?.requirement_status === "satisfied" && watchRow.evidence_source === "external_manual_verification";
  const checkpointsVerifiedExternally = checkpointRow?.requirement_status === "satisfied" && checkpointRow.evidence_source === "external_manual_verification";
  const watchMet = Boolean(progress.data.watch_requirement_met || watchVerifiedExternally);
  const checkpointsMet = Boolean(checkpoints.met || checkpointsVerifiedExternally);
  if (watchMet) evidence.watch.status = "satisfied";
  if (checkpointsMet) evidence.checkpoints.status = "satisfied";
  const evidenceWrites: Array<PromiseLike<unknown>> = [];
  if (!watchVerifiedExternally) evidenceWrites.push(supabase.from("recording_requirement_statuses").update({ requirement_status: watchMet ? "satisfied" : "pending", completed_at: watchMet ? progress.data.completed_watch_at : null, evidence_source: "server_watch_segments", updated_at: new Date().toISOString() }).eq("recording_assignment_id", assignmentId).eq("requirement_type", "watch"));
  if (!checkpointsVerifiedExternally) evidenceWrites.push(supabase.from("recording_requirement_statuses").update({ requirement_status: checkpointsMet ? "satisfied" : "pending", completed_at: checkpointsMet ? new Date().toISOString() : null, evidence_source: "checkpoint_attempts", updated_at: new Date().toISOString() }).eq("recording_assignment_id", assignmentId).eq("requirement_type", "checkpoints"));
  await Promise.all(evidenceWrites);
  let evaluation: ReturnType<typeof evaluateRecordedRequirements> = evaluateRecordedRequirements({ purpose, progressIntegrityStatus: progress.data.integrity_status, watchRequirementMet: watchMet, checkpointRequirementMet: checkpointsMet, configuredRequiredCheckpoints: checkpoints.configured, requiredCheckpointCount: requirements.requiredCheckpointCount, requirements: evidence, dueAt: assignment.due_at, allowLateCompletion: requirements.allowLateCompletion });
  const manualProviderAwaitingEvidence = Boolean(progress.data.first_access_at && !watchMet && providerTrackingMode(String(recording.provider ?? ""), typeof recording.embed_url === "string" ? recording.embed_url : null, typeof recording.duration_seconds === "number" ? recording.duration_seconds : null) === "manual_review");
  if (manualProviderAwaitingEvidence && progress.data.integrity_status === "clear") evaluation = { learningStatus: purpose === "REV" ? "in_progress" : "under_review", progressStatus: "under_review", complete: false };
  await supabase.from("recording_progress").update({ progress_status: evaluation.progressStatus, watch_requirement_met: watchMet, checkpoint_requirement_met: checkpointsMet, updated_at: new Date().toISOString() }).eq("id", progress.data.id);
  if (purpose !== "REV") {
    const wasComplete = ["verified_complete", "late_complete"].includes(String(completion.data.completion_status)) && assignment.assignment_status === "completed";
    await setLearningCompletionState(supabase, { learningCompletionId: completion.data.id, status: evaluation.learningStatus, method: purposeMethod(purpose), reason: "Recorded-learning requirements evaluated from trusted evidence.", actor });
    if (evaluation.complete && (purpose === "RP" || purpose === "DR-E")) {
      const attendance = await supabase.from("session_attendance").select("id, attendance_status, attendance_route_used, absence_weight").eq("course_enrollment_id", assignment.course_enrollment_id).eq("class_session_id", assignment.class_session_id).single();
      if (attendance.error) throw new LmsAdminDataError("The official attendance record could not be updated.");
      const attendanceNeedsUpdate = attendance.data.attendance_status !== "verified_recorded_attendance" || attendance.data.attendance_route_used !== purpose || Number(attendance.data.absence_weight) !== 0;
      if (attendanceNeedsUpdate) {
        const saved = await supabase.from("session_attendance").update({ attendance_status: "verified_recorded_attendance", attendance_route_used: purpose, absence_weight: 0, finalized_at: new Date().toISOString(), finalized_by: actorReference(actor), updated_at: new Date().toISOString() }).eq("id", attendance.data.id);
        if (saved.error) throw new LmsAdminDataError("Verified recorded attendance could not be saved.");
      }
      if (!wasComplete) await supabase.from("recording_learning_assignments").update({ assignment_status: "completed", completed_at: new Date().toISOString(), verified_at: new Date().toISOString(), verified_by: actorReference(actor), updated_at: new Date().toISOString() }).eq("id", assignmentId);
      if (!wasComplete || attendanceNeedsUpdate) await recordLmsAudit(supabase, { action: evaluation.learningStatus === "late_complete" ? "recorded_learning_late_completed" : "recorded_learning_verified", entityType: "recording_learning_assignment", entityId: assignmentId, actorUserId: actor.actorUserId, metadata: { purpose, attendance_id: attendance.data.id, learning_status: evaluation.learningStatus } });
    } else if (purpose === "MU-E" || purpose === "MU-U") {
      const makeupResult = await supabase.from("makeup_requirements").select("*").eq("recording_learning_assignment_id", assignmentId).maybeSingle();
      if (makeupResult.error || !makeupResult.data) throw new LmsAdminDataError("The linked make-up requirement could not be loaded.", 409);
      const derivedStatus = makeupStatusFromLearning(evaluation.learningStatus, evaluation.complete, assignment.due_at);
      const nextStatus = derivedStatus === "under_review" && requirements.requiresOralVerification && evidence.oral_verification.status !== "satisfied" ? "awaiting_oral_verification" : derivedStatus;
      const now = new Date().toISOString();
      const previousStatus = String(makeupResult.data.makeup_status);
      const completionOutcome = evaluation.complete ? (purpose === "MU-E" ? "approved_makeup_complete" : "unapproved_makeup_complete") : makeupResult.data.completion_outcome;
      const makeupUpdate = {
        makeup_status: nextStatus,
        completed_at: evaluation.complete ? makeupResult.data.completed_at ?? now : makeupResult.data.completed_at,
        verified_at: evaluation.complete ? now : makeupResult.data.verified_at,
        verified_by: evaluation.complete ? actorReference(actor) : makeupResult.data.verified_by,
        completion_outcome: completionOutcome,
        updated_by: actorReference(actor),
        updated_at: now,
      };
      if (previousStatus !== nextStatus || (evaluation.complete && !makeupResult.data.completed_at)) {
        const eventType = evaluation.complete ? (purpose === "MU-U" ? "makeup_late_completed" : "makeup_verified") : nextStatus === "in_progress" ? "makeup_started" : nextStatus === "under_review" ? "makeup_submitted" : "makeup_status_updated";
        const event = await supabase.from("makeup_requirement_events").insert({ makeup_requirement_id: makeupResult.data.id, event_type: eventType, previous_state: { makeup_status: previousStatus }, new_state: { makeup_status: nextStatus, completion_outcome: completionOutcome }, actor_type: actor.actorLabel.toLowerCase().replaceAll(" ", "_"), actor_identifier: actorReference(actor) });
        if (event.error) throw new LmsAdminDataError("Make-up history could not be preserved.");
        const savedMakeup = await supabase.from("makeup_requirements").update(makeupUpdate).eq("id", makeupResult.data.id);
        if (savedMakeup.error) throw new LmsAdminDataError("Make-up progress could not be synchronized.");
        if (eventType === "makeup_submitted") await recordLmsAudit(supabase, { action: "makeup_submitted", entityType: "makeup_requirement", entityId: makeupResult.data.id, actorUserId: actor.actorUserId, metadata: { purpose } });
      }
      const completionLink = await supabase.from("session_learning_completion").update({ makeup_requirement_id: makeupResult.data.id, required_action: evaluation.complete ? null : nextStatus, due_at: assignment.due_at, updated_at: now }).eq("id", completion.data.id);
      if (completionLink.error) throw new LmsAdminDataError("Make-up learning linkage could not be synchronized.");
      if (evaluation.complete && !wasComplete) {
        const assignmentSaved = await supabase.from("recording_learning_assignments").update({ assignment_status: "completed", completed_at: now, verified_at: now, verified_by: actorReference(actor), updated_at: now }).eq("id", assignmentId);
        if (assignmentSaved.error) throw new LmsAdminDataError("Completed make-up assignment could not be saved.");
        await recordLmsAudit(supabase, { action: purpose === "MU-U" ? "makeup_late_completed" : "makeup_verified", entityType: "makeup_requirement", entityId: makeupResult.data.id, actorUserId: actor.actorUserId, metadata: { purpose, learning_status: evaluation.learningStatus, attendance_unchanged: true } });
        await sendMakeupEmail(supabase, makeupResult.data.id, "makeup_completed");
      }
    } else if (evaluation.learningStatus === "incomplete" && completion.data.completion_status !== "incomplete") {
      await recordLmsAudit(supabase, { action: "recorded_learning_marked_incomplete", entityType: "recording_learning_assignment", entityId: assignmentId, actorUserId: actor.actorUserId, metadata: { due_at: assignment.due_at } });
    }
  }
  return { ...evaluation, requirements, checkpoints, watchPercentage: Number(progress.data.watch_percentage), warning: evaluation.warning ?? null };
}

function answersEqual(expected: unknown, submitted: unknown) { return JSON.stringify(expected) === JSON.stringify(submitted); }

export async function submitRecordingCheckpointAnswer(supabase: SupabaseClient, profileId: string, assignmentId: string, checkpointId: string, body: Record<string, unknown>) {
  const assignment = await resolveStudentRecordingAssignment(supabase, profileId, assignmentId); const recording = relation(assignment.class_recordings);
  const questionId = requiredText(body.question_id, "A checkpoint question is required.", 100);
  if (typeof body.answer !== "string" && typeof body.answer !== "boolean" && typeof body.answer !== "number") invalid("A valid checkpoint answer is required.");
  if (typeof body.answer === "string" && (!body.answer.trim() || body.answer.length > 5000)) invalid("A valid checkpoint answer is required.");
  const checkpoint = await supabase.from("recording_checkpoints").select("id, class_recording_id, position_seconds, position_percentage, is_active, recording_checkpoint_questions(id, question_type, prompt, options, is_active)").eq("id", checkpointId).eq("class_recording_id", recording.id).eq("is_active", true).maybeSingle();
  if (checkpoint.error || !checkpoint.data) throw new LmsAdminDataError("Checkpoint not found.", 404);
  const progress = await supabase.from("recording_progress").select("watch_percentage").eq("recording_assignment_id", assignmentId).single();
  if (progress.error) throw new LmsAdminDataError("Verified viewing progress could not be loaded.");
  if (checkpoint.data.position_percentage !== null && Number(progress.data.watch_percentage) + 0.01 < Number(checkpoint.data.position_percentage)) throw new LmsAdminDataError("Continue the recording before completing this checkpoint.", 409);
  if (checkpoint.data.position_seconds !== null) {
    const sessions = await supabase.from("recording_playback_sessions").select("id").eq("recording_assignment_id", assignmentId); if (sessions.error) throw new LmsAdminDataError("Playback evidence could not be checked.");
    const ids = (sessions.data ?? []).map((item) => item.id); const segments = ids.length ? await supabase.from("recording_watch_segments").select("segment_start_seconds, segment_end_seconds").in("playback_session_id", ids) : { data: [], error: null };
    if (segments.error) throw new LmsAdminDataError("Playback evidence could not be checked.");
    const position = Number(checkpoint.data.position_seconds); const reached = (segments.data ?? []).some((segment) => Number(segment.segment_start_seconds) <= position && Number(segment.segment_end_seconds) >= position);
    if (!reached) throw new LmsAdminDataError("Continue the recording before completing this checkpoint.", 409);
  }
  const questions = (checkpoint.data.recording_checkpoint_questions ?? []) as Array<{ id: string; is_active: boolean; question_type: string }>;
  const question = questions.find((item) => item.id === questionId && item.is_active);
  if (!question) throw new LmsAdminDataError("Checkpoint question not found.", 404);
  const latest = await supabase.from("recording_checkpoint_attempts").select("answered_at, attempt_number").eq("recording_assignment_id", assignmentId).eq("question_id", questionId).order("answered_at", { ascending: false }).limit(1).maybeSingle();
  if (latest.error) throw new LmsAdminDataError("Checkpoint attempt history could not be loaded.");
  const rapid = Boolean(latest.data?.answered_at && Date.now() - Date.parse(latest.data.answered_at) < 2000);
  const answerKey = question.question_type === "short_answer" ? { data: null, error: null } : await supabase.from("recording_checkpoint_answer_keys").select("correct_answer").eq("question_id", questionId).maybeSingle();
  if (answerKey.error) throw new LmsAdminDataError("Checkpoint answer could not be evaluated.");
  const isCorrect = question.question_type === "short_answer" ? null : answersEqual(answerKey.data?.correct_answer, body.answer);
  const inserted = await supabase.from("recording_checkpoint_attempts").insert({ recording_assignment_id: assignmentId, checkpoint_id: checkpointId, question_id: questionId, submitted_answer: body.answer ?? null, is_correct: isCorrect, attempt_number: Number(latest.data?.attempt_number ?? 0) + 1 }).select("id, is_correct, attempt_number, answered_at").single();
  if (inserted.error) throw new LmsAdminDataError("Checkpoint response could not be saved.");
  if (rapid) {
    await supabase.from("recording_progress").update({ integrity_status: "review_required", progress_status: "integrity_review", integrity_note: "rapid_checkpoint_submissions", updated_at: new Date().toISOString() }).eq("recording_assignment_id", assignmentId);
    await recordLmsAudit(supabase, { action: "recording_integrity_flagged", entityType: "recording_learning_assignment", entityId: assignmentId, actorUserId: profileId, metadata: { public_reason: "Checkpoint activity requires review." } });
  }
  const evaluation = await evaluateRecordedLearningAssignment(supabase, assignmentId, { actorLabel: "System", actorUserId: profileId });
  if (evaluation.checkpoints?.met) await recordLmsAudit(supabase, { action: "recording_checkpoint_completed", entityType: "recording_learning_assignment", entityId: assignmentId, actorUserId: profileId, metadata: { checkpoint_id: checkpointId } });
  return { attempt: inserted.data, status: isCorrect === null ? "under_review" : isCorrect ? "accepted" : "not_completed", evaluation };
}

export async function saveSessionRecordingRequirements(supabase: SupabaseClient, sessionId: string, body: Record<string, unknown>, actor: Actor) {
  const minWatch = optionalNumber(body.min_watch_percentage, 1, 100); const deadline = optionalNumber(body.deadline_hours, 1, 8760); const checkpointCount = optionalNumber(body.required_checkpoint_count, 0, 100);
  const linkedIds = {
    quiz_id: typeof body.quiz_id === "string" && body.quiz_id.trim() ? body.quiz_id.trim() : null,
    practical_assignment_id: typeof body.practical_assignment_id === "string" && body.practical_assignment_id.trim() ? body.practical_assignment_id.trim() : null,
    reflection_assignment_id: typeof body.reflection_assignment_id === "string" && body.reflection_assignment_id.trim() ? body.reflection_assignment_id.trim() : null,
  };
  const session = await supabase.from("class_sessions").select("cohort_course_id").eq("id", sessionId).maybeSingle();
  if (session.error || !session.data) throw new LmsAdminDataError("Class session not found.", 404);
  for (const [field, id] of Object.entries(linkedIds)) {
    if (!id) continue;
    const table = field === "quiz_id" ? "quizzes" : "assignments";
    const linked = await supabase.from(table).select("id").eq("id", id).eq("cohort_course_id", session.data.cohort_course_id).maybeSingle();
    if (linked.error || !linked.data) throw new LmsAdminDataError("Linked recorded-learning assessments must belong to this session's cohort course.", 400);
  }
  const existingAssignments = await supabase.from("recording_learning_assignments").select("id", { count: "exact", head: true }).eq("class_session_id", sessionId);
  if (existingAssignments.error) throw new LmsAdminDataError("Existing recorded-learning assignments could not be checked.");
  if ((existingAssignments.count ?? 0) > 0 && body.confirm_existing_assignments !== true) throw new LmsAdminDataError("Recorded-learning assignments already exist. Confirm that this change must not silently rewrite completed student evidence.", 409);
  if (boolean(body.requires_quiz) && !linkedIds.quiz_id) throw new LmsAdminDataError("Choose the quiz that supplies this recorded-learning evidence.", 400);
  if (boolean(body.requires_practical) && !linkedIds.practical_assignment_id) throw new LmsAdminDataError("Choose the practical assignment that supplies this recorded-learning evidence.", 400);
  if (boolean(body.requires_reflection) && !linkedIds.reflection_assignment_id) throw new LmsAdminDataError("Choose the reflection assignment that supplies this recorded-learning evidence.", 400);
  const values = { class_session_id: sessionId, min_watch_percentage: minWatch, deadline_hours: deadline, requires_checkpoints: boolean(body.requires_checkpoints), required_checkpoint_count: checkpointCount, requires_quiz: boolean(body.requires_quiz), requires_practical: boolean(body.requires_practical), requires_reflection: boolean(body.requires_reflection), requires_oral_verification: boolean(body.requires_oral_verification), allow_late_completion: boolean(body.allow_late_completion), ...linkedIds, requirement_status: "active", updated_at: new Date().toISOString() };
  const saved = await supabase.from("session_recording_requirements").upsert(values, { onConflict: "class_session_id" }).select("*").single();
  if (saved.error) throw new LmsAdminDataError("Recorded-learning requirements could not be saved.");
  await recordLmsAudit(supabase, { action: "recording_requirements_updated", entityType: "class_session", entityId: sessionId, actorUserId: actor.actorUserId, metadata: { assignments_exist: (existingAssignments.count ?? 0) > 0, requirements: values, actor: actorReference(actor) } });
  return saved.data;
}

export async function createRecordingCheckpoint(supabase: SupabaseClient, recordingId: string, body: Record<string, unknown>, actor: Actor) {
  const title = requiredText(body.title, "Checkpoint title is required.", 240); const seconds = optionalNumber(body.position_seconds, 0); const percentage = optionalNumber(body.position_percentage, 0, 100); const order = optionalNumber(body.checkpoint_order, 1) ?? 1;
  if (seconds === null && percentage === null) invalid("Provide a checkpoint position in seconds or percentage.");
  if (seconds !== null && percentage !== null) invalid("Choose either a checkpoint position in seconds or a position percentage, not both.");
  const saved = await supabase.from("recording_checkpoints").insert({ class_recording_id: recordingId, title, position_seconds: seconds, position_percentage: percentage, checkpoint_order: order, is_required: body.is_required !== false, is_active: true }).select("*").single();
  if (saved.error) throw new LmsAdminDataError("Recording checkpoint could not be created.");
  await recordLmsAudit(supabase, { action: "recording_requirements_updated", entityType: "class_recording", entityId: recordingId, actorUserId: actor.actorUserId, metadata: { checkpoint_id: saved.data.id } });
  return saved.data;
}

export async function createCheckpointQuestion(supabase: SupabaseClient, checkpointId: string, body: Record<string, unknown>, actor: Actor) {
  const type = body.question_type; if (!["multiple_choice", "true_false", "short_answer"].includes(String(type))) invalid("Choose a valid checkpoint question type.");
  const prompt = requiredText(body.prompt, "Question prompt is required."); const options = Array.isArray(body.options) ? body.options : [];
  if (type === "multiple_choice" && options.length < 2) invalid("Multiple-choice questions require at least two options.");
  if (type !== "short_answer" && (body.correct_answer === undefined || body.correct_answer === null || body.correct_answer === "")) invalid("An automatic-grading answer key is required.");
  if (type !== "short_answer" && !options.some((option) => answersEqual(option, body.correct_answer))) invalid("The correct answer must match one of the configured options.");
  const question = await supabase.from("recording_checkpoint_questions").insert({ checkpoint_id: checkpointId, question_type: type, prompt, options, is_active: true, sort_order: optionalNumber(body.sort_order, 0) ?? 0 }).select("*").single();
  if (question.error) throw new LmsAdminDataError("Checkpoint question could not be created.");
  if (type !== "short_answer") {
    const key = await supabase.from("recording_checkpoint_answer_keys").insert({ question_id: question.data.id, correct_answer: body.correct_answer, explanation: typeof body.explanation === "string" ? body.explanation.trim() || null : null });
    if (key.error) throw new LmsAdminDataError("The private checkpoint answer key could not be saved.");
  }
  await recordLmsAudit(supabase, { action: "recording_requirements_updated", entityType: "class_recording", entityId: String((await supabase.from("recording_checkpoints").select("class_recording_id").eq("id", checkpointId).single()).data?.class_recording_id), actorUserId: actor.actorUserId, metadata: { checkpoint_id: checkpointId, question_id: question.data.id, question_type: type } });
  return question.data;
}

export async function applyAdminRecordingAction(supabase: SupabaseClient, assignmentId: string, body: Record<string, unknown>, actor: Actor) {
  const action = requiredText(body.action, "A recorded-learning action is required.", 80);
  if (action === "reevaluate") return evaluateRecordedLearningAssignment(supabase, assignmentId, actor);
  if (action === "extend_deadline") {
    const dueAt = requiredText(body.due_at, "A new deadline is required.", 80); if (!Number.isFinite(Date.parse(dueAt))) invalid("A valid new deadline is required.");
    const reason = requiredText(body.reason, "A reason for extending the deadline is required.", 1000);
    const current = await supabase.from("recording_learning_assignments").select("due_at").eq("id", assignmentId).maybeSingle();
    if (current.error || !current.data) throw new LmsAdminDataError("Recorded-learning assignment not found.", 404);
    const nextDueAt = new Date(dueAt).toISOString();
    if (current.data.due_at && Date.parse(nextDueAt) <= Date.parse(current.data.due_at)) invalid("The extended deadline must be later than the current deadline.");
    const result = await supabase.from("recording_learning_assignments").update({ due_at: nextDueAt, exception_note: reason, updated_at: new Date().toISOString() }).eq("id", assignmentId).select("id").single();
    if (result.error) throw new LmsAdminDataError("Recording deadline could not be extended.");
    await recordLmsAudit(supabase, { action: "recording_deadline_extended", entityType: "recording_learning_assignment", entityId: assignmentId, actorUserId: actor.actorUserId, metadata: { previous_due_at: current.data.due_at, due_at: nextDueAt, reason, actor: actorReference(actor) } });
    return evaluateRecordedLearningAssignment(supabase, assignmentId, actor);
  }
  if (action === "verify_external_requirement") {
    const requirement = requiredText(body.requirement_type, "A requirement type is required.", 80) as RecordingRequirementType;
    if (!recordingRequirementTypes.includes(requirement)) invalid("Choose a valid requirement type.");
    const note = requiredText(body.note, "A concise evidence note is required.", 1000);
    const result = await supabase.from("recording_requirement_statuses").update({ requirement_status: "satisfied", evidence_source: "external_manual_verification", evidence_reference: typeof body.evidence_reference === "string" ? body.evidence_reference.trim() || null : null, completed_at: new Date().toISOString(), verified_at: new Date().toISOString(), verified_by: actorReference(actor), verification_note: note, updated_at: new Date().toISOString() }).eq("recording_assignment_id", assignmentId).eq("requirement_type", requirement).eq("is_required", true).select("id");
    if (result.error || !result.data?.length) throw new LmsAdminDataError("The required evidence status could not be verified.", 409);
    if (requirement === "watch") await supabase.from("recording_progress").update({ watch_requirement_met: true, completed_watch_at: new Date().toISOString(), updated_at: new Date().toISOString() }).eq("recording_assignment_id", assignmentId);
    await recordLmsAudit(supabase, { action: "recording_requirement_verified_external", entityType: "recording_learning_assignment", entityId: assignmentId, actorUserId: actor.actorUserId, metadata: { requirement_type: requirement, evidence_source: "external_manual_verification" } });
    return evaluateRecordedLearningAssignment(supabase, assignmentId, actor);
  }
  if (action === "flag_integrity") {
    const note = requiredText(body.note, "A neutral integrity-review reason is required.", 1000);
    const result = await supabase.from("recording_progress").update({ integrity_status: "review_required", progress_status: "integrity_review", integrity_note: note, updated_at: new Date().toISOString() }).eq("recording_assignment_id", assignmentId).select("id");
    if (result.error || !result.data?.length) throw new LmsAdminDataError("Integrity review could not be opened.");
    await recordLmsAudit(supabase, { action: "recording_integrity_flagged", entityType: "recording_learning_assignment", entityId: assignmentId, actorUserId: actor.actorUserId, metadata: { review_note: note, actor: actorReference(actor) } });
    return evaluateRecordedLearningAssignment(supabase, assignmentId, actor);
  }
  if (action === "resolve_integrity") {
    const note = requiredText(body.note, "A review resolution note is required.", 1000);
    const result = await supabase.from("recording_progress").update({ integrity_status: "clear", integrity_note: `review_resolved:${note}`, updated_at: new Date().toISOString() }).eq("recording_assignment_id", assignmentId).select("id");
    if (result.error || !result.data?.length) throw new LmsAdminDataError("Integrity review could not be resolved.");
    await recordLmsAudit(supabase, { action: "recording_integrity_review_resolved", entityType: "recording_learning_assignment", entityId: assignmentId, actorUserId: actor.actorUserId, metadata: { resolution_note: note } });
    return evaluateRecordedLearningAssignment(supabase, assignmentId, actor);
  }
  throw new LmsAdminDataError("This recorded-learning action is not supported.", 400);
}
