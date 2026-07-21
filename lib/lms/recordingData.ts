import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { LmsAdminDataError } from "@/lib/lms/adminData";
import { providerTrackingMode, recordingPurposeLabels, resolveEffectiveRecordingRequirements, type RecordingPurposeCode } from "@/lib/lms/recording";
import { createSupabaseServerClient } from "@/lib/supabase/server";

function object(value: unknown): Record<string, unknown> { return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {}; }
function relation(value: unknown) { return Array.isArray(value) ? object(value[0]) : object(value); }

const assignmentSelect = "*, class_recordings(id, title, provider, embed_url, external_url, duration_seconds, recording_status, available_from, available_until), class_sessions(id, title, scheduled_start_at, cohort_course_id, cohort_courses(id, cohort_id, cohorts(id, code, name), courses(id, code, title, course_category))), course_enrollments(id, delivery_route, student_enrollments!inner(student_id, students(id, profile_id, student_number, legal_name, preferred_name)))";

export function safeRecordingEmbed(recording: Record<string, unknown>) {
  const embed = typeof recording.embed_url === "string" ? recording.embed_url : null;
  return providerTrackingMode(String(recording.provider ?? ""), embed, typeof recording.duration_seconds === "number" ? recording.duration_seconds : null) === "automated" ? embed : null;
}

function safeExternalRecordingUrl(value: unknown) {
  if (typeof value !== "string") return null;
  try { const url = new URL(value); return url.protocol === "https:" || (process.env.NODE_ENV !== "production" && url.protocol === "http:") ? url.toString() : null; }
  catch { return null; }
}

function mapAssignment(raw: Record<string, unknown>) {
  const recording = relation(raw.class_recordings); const session = relation(raw.class_sessions); const offering = relation(session.cohort_courses); const course = relation(offering.courses);
  const cohort = relation(offering.cohorts); const enrollment = relation(raw.course_enrollments); const progress = relation(raw.recording_progress); const completion = relation(raw.session_learning_completion);
  const requirementRows = Array.isArray(raw.recording_requirement_statuses) ? raw.recording_requirement_statuses.map(object) : [];
  const requirement = (type: string) => requirementRows.find((item) => item.requirement_type === type);
  const availableAt = typeof raw.available_at === "string" ? raw.available_at : typeof recording.available_from === "string" ? recording.available_from : null;
  const availableUntil = typeof recording.available_until === "string" ? recording.available_until : null;
  const now = Date.now();
  const accessState = availableAt && Date.parse(availableAt) > now ? "upcoming" : availableUntil && Date.parse(availableUntil) < now ? "expired" : "available";
  const purposeCode = raw.purpose_code as RecordingPurposeCode;
  const completionStatus = typeof completion.completion_status === "string" ? completion.completion_status : null;
  const dueAt = typeof raw.due_at === "string" ? raw.due_at : null;
  const baseDisplayStatus = purposeCode === "REV" ? String(progress.progress_status ?? "not_started") : completionStatus ?? String(progress.progress_status ?? "not_started");
  const displayStatus = String(progress.integrity_status ?? "clear") !== "clear" ? "integrity_review" : purposeCode !== "REV" && dueAt && Date.parse(dueAt) < now && !["verified_complete", "late_complete"].includes(completionStatus ?? "") ? "incomplete" : baseDisplayStatus;
  return {
    id: String(raw.id), purposeCode, purposeLabel: recordingPurposeLabels[purposeCode] ?? String(raw.purpose_code), assignmentStatus: String(raw.assignment_status), assignedDeliveryRoute: String(enrollment.delivery_route ?? ""), availableAt, availableUntil, accessState, dueAt,
    recording: { id: String(recording.id), title: String(recording.title), provider: String(recording.provider), status: String(recording.recording_status), durationSeconds: typeof recording.duration_seconds === "number" ? recording.duration_seconds : null, trackingMode: providerTrackingMode(String(recording.provider ?? ""), typeof recording.embed_url === "string" ? recording.embed_url : null, typeof recording.duration_seconds === "number" ? recording.duration_seconds : null), embedUrl: safeRecordingEmbed(recording), externalUrl: safeExternalRecordingUrl(recording.external_url) },
    session: { id: String(session.id), title: String(session.title), scheduledStartAt: session.scheduled_start_at as string | null },
    course: { id: String(course.id), code: String(course.code), title: String(course.title), category: String(course.course_category) },
    cohort: { id: String(cohort.id ?? offering.cohort_id), code: String(cohort.code ?? ""), name: String(cohort.name ?? "") },
    progress: { status: String(progress.progress_status ?? "not_started"), watchPercentage: Number(progress.watch_percentage ?? 0), watchRequirementMet: Boolean(progress.watch_requirement_met), checkpointRequirementMet: Boolean(progress.checkpoint_requirement_met), integrityStatus: String(progress.integrity_status ?? "clear") },
    completionStatus,
    displayStatus,
    effectiveRequirements: object(raw._effective_recording_requirements),
    requirements: requirementRows.map((item) => ({ id: String(item.id), type: String(item.requirement_type), required: Boolean(item.is_required), status: String(item.requirement_status), evidenceSource: typeof item.evidence_source === "string" ? item.evidence_source : null })),
    requirementSummary: {
      checkpoints: String(requirement("checkpoints")?.requirement_status ?? "not_required"),
      quiz: String(requirement("quiz")?.requirement_status ?? "not_required"),
      practical: String(requirement("practical")?.requirement_status ?? "not_required"),
      reflection: String(requirement("reflection")?.requirement_status ?? "not_required"),
      oralVerification: String(requirement("oral_verification")?.requirement_status ?? "not_required"),
    },
  };
}

async function attachCompletions(supabase: SupabaseClient, rows: Array<Record<string, unknown>>): Promise<Array<Record<string, unknown>>> {
  const enrollmentIds = [...new Set(rows.map((row) => String(row.course_enrollment_id)))];
  if (!enrollmentIds.length) return rows;
  const result = await supabase.from("session_learning_completion").select("*").in("course_enrollment_id", enrollmentIds);
  if (result.error) throw new LmsAdminDataError("Learning-completion states could not be loaded.");
  const byKey = new Map((result.data ?? []).map((row) => [`${row.course_enrollment_id}:${row.class_session_id}`, row]));
  return rows.map((row): Record<string, unknown> => ({ ...row, session_learning_completion: byKey.get(`${row.course_enrollment_id}:${row.class_session_id}`) ?? null }));
}

async function attachEffectiveRequirements(supabase: SupabaseClient, rows: Array<Record<string, unknown>>) {
  const cohortIds = [...new Set(rows.map((row) => String(relation(relation(row.class_sessions).cohort_courses).cohort_id)).filter(Boolean))];
  const sessionIds = [...new Set(rows.map((row) => String(row.class_session_id)).filter(Boolean))];
  const [policies, overrides] = await Promise.all([
    cohortIds.length ? supabase.from("recording_completion_policies").select("*").in("cohort_id", cohortIds).eq("policy_status", "active") : Promise.resolve({ data: [], error: null }),
    sessionIds.length ? supabase.from("session_recording_requirements").select("*").in("class_session_id", sessionIds).eq("requirement_status", "active") : Promise.resolve({ data: [], error: null }),
  ]);
  if (policies.error || overrides.error) throw new LmsAdminDataError("Recorded-learning policy could not be loaded.");
  const policyByCohort = new Map((policies.data ?? []).map((row) => [String(row.cohort_id), row]));
  const overrideBySession = new Map((overrides.data ?? []).map((row) => [String(row.class_session_id), row]));
  return rows.map((row): Record<string, unknown> => {
    const session = relation(row.class_sessions); const offering = relation(session.cohort_courses); const course = relation(offering.courses);
    const current = resolveEffectiveRecordingRequirements({ policy: policyByCohort.get(String(offering.cohort_id)), sessionOverride: overrideBySession.get(String(row.class_session_id)), courseCategory: String(course.course_category), purpose: row.purpose_code as RecordingPurposeCode });
    const snapshot = object(row.requirement_snapshot);
    return { ...row, _effective_recording_requirements: typeof snapshot.minWatchPercentage === "number" ? { ...current, ...snapshot } : current };
  });
}

async function prepareAssignments(supabase: SupabaseClient, rows: Array<Record<string, unknown>>) {
  return attachEffectiveRequirements(supabase, await attachCompletions(supabase, rows));
}

export type StudentRecordingAssignment = ReturnType<typeof mapAssignment>;

export async function getStudentRecordingAssignments(profileId: string) {
  const supabase = await createSupabaseServerClient();
  const student = await supabase.from("students").select("id").eq("profile_id", profileId).maybeSingle();
  if (student.error || !student.data) throw new LmsAdminDataError("Student access required.", 403);
  const result = await supabase.from("recording_learning_assignments").select(`${assignmentSelect}, recording_progress(*), recording_requirement_statuses(*)`).eq("course_enrollments.student_enrollments.student_id", student.data.id).order("due_at", { ascending: true, nullsFirst: false });
  if (result.error) throw new LmsAdminDataError("Recorded-learning assignments could not be loaded.");
  const rows = await prepareAssignments(supabase, (result.data ?? []).map((row) => row as unknown as Record<string, unknown>));
  return rows.map(mapAssignment);
}

export async function getStudentRecordingAssignment(profileId: string, assignmentId: string) {
  const supabase = await createSupabaseServerClient();
  const student = await supabase.from("students").select("id").eq("profile_id", profileId).maybeSingle();
  if (student.error || !student.data) throw new LmsAdminDataError("Student access required.", 403);
  const assignment = await supabase.from("recording_learning_assignments").select(`${assignmentSelect}, recording_progress(*), recording_requirement_statuses(*)`).eq("id", assignmentId).eq("course_enrollments.student_enrollments.student_id", student.data.id).maybeSingle();
  if (assignment.error || !assignment.data) return null;
  const [raw] = await prepareAssignments(supabase, [assignment.data as unknown as Record<string, unknown>]); const recording = relation(raw.class_recordings);
  const checkpoints = await supabase.from("recording_checkpoints").select("id, title, position_seconds, position_percentage, checkpoint_order, is_required, recording_checkpoint_questions(id, question_type, prompt, options, is_active, sort_order)").eq("class_recording_id", String(recording.id)).eq("is_active", true).order("checkpoint_order");
  if (checkpoints.error) throw new LmsAdminDataError("Recording checkpoints could not be loaded.");
  const [attendance, attempts] = await Promise.all([
    supabase.from("session_attendance").select("attendance_status, attendance_route_used, finalized_at").eq("course_enrollment_id", String(raw.course_enrollment_id)).eq("class_session_id", String(raw.class_session_id)).maybeSingle(),
    supabase.from("recording_checkpoint_attempts").select("checkpoint_id, question_id, is_correct, answered_at").eq("recording_assignment_id", assignmentId),
  ]);
  if (attendance.error || attempts.error) throw new LmsAdminDataError("Recording evidence context could not be loaded.");
  const completedCheckpointIds = (checkpoints.data ?? []).flatMap((checkpoint) => {
    const questions = (checkpoint.recording_checkpoint_questions ?? []).filter((question) => question.is_active !== false);
    return questions.length && questions.every((question) => (attempts.data ?? []).some((attempt) => attempt.question_id === question.id && attempt.is_correct === true)) ? [checkpoint.id] : [];
  });
  return { ...mapAssignment(raw), checkpoints: checkpoints.data ?? [], completedCheckpointIds, attendance: attendance.data };
}

export type RecordingDashboardFilters = { cohort?: string; course?: string; student?: string; purpose?: string; learningStatus?: string; recordingStatus?: string; deadlineFrom?: string; deadlineTo?: string; overdue?: string; integrityStatus?: string };

export async function fetchAdminRecordingDashboard(supabase: SupabaseClient, filters: RecordingDashboardFilters = {}) {
  const result = await supabase.from("recording_learning_assignments").select(`${assignmentSelect}, recording_progress(*), recording_requirement_statuses(*)`).order("due_at", { ascending: true, nullsFirst: false }).limit(5000);
  if (result.error) throw new LmsAdminDataError("Recorded-learning dashboard could not be loaded.");
  const attached = await prepareAssignments(supabase, (result.data ?? []).map((row) => row as unknown as Record<string, unknown>));
  const allRows = attached.map((row) => { const student = relation(relation(relation(row.course_enrollments).student_enrollments).students); return { ...mapAssignment(row), student: { id: String(student.id), number: String(student.student_number), name: String(student.preferred_name || student.legal_name) } }; });
  const now = Date.now();
  const isComplete = (row: (typeof allRows)[number]) => row.purposeCode === "REV" ? row.progress.watchRequirementMet : ["verified_complete", "late_complete"].includes(row.completionStatus ?? "");
  const isOverdue = (row: (typeof allRows)[number]) => Boolean(row.dueAt && Date.parse(row.dueAt) < now && !isComplete(row));
  const from = filters.deadlineFrom && /^\d{4}-\d{2}-\d{2}$/.test(filters.deadlineFrom) ? Date.parse(`${filters.deadlineFrom}T00:00:00Z`) : null;
  const to = filters.deadlineTo && /^\d{4}-\d{2}-\d{2}$/.test(filters.deadlineTo) ? Date.parse(`${filters.deadlineTo}T23:59:59Z`) : null;
  const rows = allRows.filter((row) => {
    if (filters.purpose && row.purposeCode !== filters.purpose) return false;
    if (filters.learningStatus && row.displayStatus !== filters.learningStatus) return false;
    if (filters.recordingStatus && row.recording.status !== filters.recordingStatus) return false;
    if (filters.integrityStatus && row.progress.integrityStatus !== filters.integrityStatus) return false;
    if (filters.course && row.course.id !== filters.course) return false;
    if (filters.cohort && row.cohort.id !== filters.cohort) return false;
    if (filters.student && !`${row.student.name} ${row.student.number}`.toLowerCase().includes(filters.student.toLowerCase())) return false;
    if (filters.overdue === "yes" && !isOverdue(row)) return false;
    if (filters.overdue === "no" && isOverdue(row)) return false;
    const due = row.dueAt ? Date.parse(row.dueAt) : null;
    if (from !== null && (due === null || due < from)) return false;
    if (to !== null && (due === null || due > to)) return false;
    return true;
  });
  const stateCount = (state: string) => rows.filter((row) => row.displayStatus === state).length;
  const options = {
    cohorts: [...new Map(allRows.map((row) => [row.cohort.id, row.cohort])).values()].filter((item) => item.id).sort((a, b) => a.code.localeCompare(b.code)),
    courses: [...new Map(allRows.map((row) => [row.course.id, row.course])).values()].sort((a, b) => a.code.localeCompare(b.code)),
  };
  return { rows, options, metrics: { total: rows.length, notStarted: stateCount("not_started"), inProgress: stateCount("in_progress"), awaitingCheckpoints: stateCount("awaiting_checkpoint"), awaitingQuiz: stateCount("awaiting_quiz"), awaitingPractical: stateCount("awaiting_practical"), underReview: stateCount("under_review"), verifiedComplete: stateCount("verified_complete"), lateComplete: stateCount("late_complete"), incomplete: stateCount("incomplete"), integrityReview: stateCount("integrity_review"), overdue: rows.filter(isOverdue).length } };
}

export async function fetchAdminRecordingDetail(supabase: SupabaseClient, assignmentId: string) {
  const assignment = await supabase.from("recording_learning_assignments").select(`${assignmentSelect}, recording_progress(*), recording_requirement_statuses(*), recording_playback_sessions(*, recording_watch_segments(*))`).eq("id", assignmentId).maybeSingle();
  if (assignment.error || !assignment.data) throw new LmsAdminDataError("Recorded-learning assignment not found.", 404);
  const [raw] = await prepareAssignments(supabase, [assignment.data as unknown as Record<string, unknown>]); const recording = relation(raw.class_recordings); const completion = relation(raw.session_learning_completion);
  const [checkpoints, attendance, events, audits] = await Promise.all([
    supabase.from("recording_checkpoints").select("*, recording_checkpoint_questions(*, recording_checkpoint_answer_keys(*))").eq("class_recording_id", String(recording.id)).order("checkpoint_order"),
    supabase.from("session_attendance").select("*").eq("course_enrollment_id", String(raw.course_enrollment_id)).eq("class_session_id", String(raw.class_session_id)).maybeSingle(),
    typeof completion.id === "string" ? supabase.from("learning_completion_change_events").select("*").eq("learning_completion_id", completion.id).order("created_at", { ascending: false }) : Promise.resolve({ data: [], error: null }),
    supabase.from("audit_logs").select("*").eq("entity_type", "recording_learning_assignment").eq("entity_id", assignmentId).order("created_at", { ascending: false }).limit(200),
  ]);
  if (checkpoints.error || attendance.error || events.error || audits.error) throw new LmsAdminDataError("Recorded-learning evidence could not be loaded.");
  const student = relation(relation(relation(raw.course_enrollments).student_enrollments).students);
  return { assignment: raw, summary: { ...mapAssignment(raw), student: { id: String(student.id), number: String(student.student_number), name: String(student.preferred_name || student.legal_name) } }, checkpoints: checkpoints.data ?? [], attendance: attendance.data, events: events.data ?? [], audits: audits.data ?? [] };
}

export async function fetchFacilitatorRecordingAssignments(supabase: SupabaseClient, facilitatorId: string) {
  const assignments = await supabase.from("facilitator_course_assignments").select("cohort_course_id").eq("facilitator_id", facilitatorId);
  if (assignments.error) throw new LmsAdminDataError("Facilitator scope could not be loaded.");
  const ids = (assignments.data ?? []).map((row) => row.cohort_course_id); if (!ids.length) return [];
  const result = await supabase.from("recording_learning_assignments").select(`${assignmentSelect}, recording_progress(*), recording_requirement_statuses(*)`).in("class_sessions.cohort_course_id", ids).order("due_at", { ascending: true });
  if (result.error) throw new LmsAdminDataError("Assigned-course recording progress could not be loaded.");
  const rows = await prepareAssignments(supabase, (result.data ?? []).map((row) => row as unknown as Record<string, unknown>));
  return rows.filter((row) => ids.includes(String(relation(row.class_sessions).cohort_course_id))).map((row) => { const student = relation(relation(relation(row.course_enrollments).student_enrollments).students); return { ...mapAssignment(row), student: { number: String(student.student_number), name: String(student.preferred_name || student.legal_name) } }; });
}
