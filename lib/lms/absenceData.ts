import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { LmsAdminDataError, requireLmsAdminClient } from "@/lib/lms/adminData";
import { resolveStudentAbsenceContext } from "@/lib/lms/absenceService";

function object(value: unknown): Record<string, unknown> { return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {}; }
function relation(value: unknown) { return Array.isArray(value) ? object(value[0]) : object(value); }

const requestSelect = "*, class_sessions(id, title, scheduled_start_at, session_status, cohort_courses(id, courses(id, code, title), cohorts(id, code, name))), course_enrollments(id, student_enrollments(id, students(id, student_number, legal_name, preferred_name, email))), makeup_requirements(*)";

function safeStudentRequest(raw: Record<string, unknown>) {
  const session = relation(raw.class_sessions); const offering = relation(session.cohort_courses); const course = relation(offering.courses); const makeup = relation(raw.makeup_requirements);
  return {
    id: String(raw.id), courseEnrollmentId: String(raw.course_enrollment_id), sessionId: String(raw.class_session_id), knownInAdvance: Boolean(raw.known_in_advance), reasonCategory: String(raw.reason_category), explanation: String(raw.explanation), status: String(raw.request_status), studentRequestedMakeup: Boolean(raw.student_requested_makeup), submittedAt: raw.submitted_at as string | null, informationRequestedAt: raw.information_requested_at as string | null, reviewedAt: raw.reviewed_at as string | null, decisionNote: raw.decision_note as string | null, createdAt: String(raw.created_at), updatedAt: String(raw.updated_at),
    session: { id: String(session.id), title: String(session.title), scheduledStartAt: session.scheduled_start_at as string | null, status: String(session.session_status), courseCode: String(course.code ?? ""), courseTitle: String(course.title ?? "Course") },
    makeup: makeup.id ? { id: String(makeup.id), purposeCode: String(makeup.purpose_code), status: String(makeup.makeup_status), instructions: makeup.instructions as string | null, availableAt: makeup.available_at as string | null, dueAt: makeup.due_at as string | null, completedAt: makeup.completed_at as string | null, outcome: makeup.completion_outcome as string | null, recordingAssignmentId: makeup.recording_learning_assignment_id as string | null, quizId: makeup.linked_quiz_id as string | null, practicalAssignmentId: makeup.linked_practical_assignment_id as string | null, reflectionAssignmentId: makeup.linked_reflection_assignment_id as string | null, requiresOralVerification: Boolean(makeup.requires_oral_verification), oralVerificationStatus: makeup.oral_verification_status as string | null } : null,
  };
}

export async function getStudentAbsenceRequests(profileId: string) {
  const supabase = requireLmsAdminClient(); const context = await resolveStudentAbsenceContext(supabase, profileId);
  if (!context.courseEnrollmentIds.length) return [];
  const result = await supabase.from("absence_requests").select(requestSelect).in("course_enrollment_id", context.courseEnrollmentIds).order("created_at", { ascending: false });
  if (result.error) throw new LmsAdminDataError("Absence requests could not be loaded.");
  return (result.data ?? []).map((row) => safeStudentRequest(row as unknown as Record<string, unknown>));
}

export async function getStudentStandaloneMakeups(profileId: string) {
  const supabase = requireLmsAdminClient(); const context = await resolveStudentAbsenceContext(supabase, profileId); if (!context.courseEnrollmentIds.length) return [];
  const result = await supabase.from("makeup_requirements").select("id, course_enrollment_id, class_session_id, purpose_code, makeup_status, instructions, due_at, completion_outcome, recording_learning_assignment_id, linked_quiz_id, linked_practical_assignment_id, linked_reflection_assignment_id, requires_oral_verification, oral_verification_status, class_sessions(id, title, scheduled_start_at, cohort_courses(courses(code, title)))").in("course_enrollment_id", context.courseEnrollmentIds).is("absence_request_id", null).order("due_at", { ascending: true, nullsFirst: false });
  if (result.error) throw new LmsAdminDataError("Make-up learning could not be loaded.");
  return (result.data ?? []).map((row) => { const session = relation(row.class_sessions); const course = relation(relation(session.cohort_courses).courses); return { id: row.id, purposeCode: row.purpose_code, status: row.makeup_status, instructions: row.instructions, dueAt: row.due_at, outcome: row.completion_outcome, recordingAssignmentId: row.recording_learning_assignment_id, quizId: row.linked_quiz_id, practicalAssignmentId: row.linked_practical_assignment_id, reflectionAssignmentId: row.linked_reflection_assignment_id, requiresOralVerification: row.requires_oral_verification, oralVerificationStatus: row.oral_verification_status, session: { id: String(session.id), title: String(session.title), scheduledStartAt: session.scheduled_start_at as string | null, courseCode: String(course.code ?? ""), courseTitle: String(course.title ?? "Course") } }; });
}

export async function getStudentAbsenceRequest(profileId: string, requestId: string) {
  const supabase = requireLmsAdminClient(); const context = await resolveStudentAbsenceContext(supabase, profileId);
  const result = await supabase.from("absence_requests").select(requestSelect).eq("id", requestId).in("course_enrollment_id", context.courseEnrollmentIds).maybeSingle();
  if (result.error || !result.data) return null;
  const [evidence, events, completion, attendance, makeupEvents] = await Promise.all([
    supabase.from("absence_request_evidence").select("id, title, description, evidence_type, storage_path, file_name, mime_type, size_bytes, evidence_status, created_at").eq("absence_request_id", requestId).order("created_at"),
    supabase.from("absence_request_events").select("id, event_type, note, created_at").eq("absence_request_id", requestId).order("created_at", { ascending: false }),
    supabase.from("session_learning_completion").select("completion_status, completion_method, required_action, due_at, completed_at, verified_at").eq("course_enrollment_id", result.data.course_enrollment_id).eq("class_session_id", result.data.class_session_id).maybeSingle(),
    supabase.from("session_attendance").select("attendance_status, absence_weight, finalized_at").eq("course_enrollment_id", result.data.course_enrollment_id).eq("class_session_id", result.data.class_session_id).maybeSingle(),
    supabase.from("makeup_requirement_events").select("id, event_type, created_at").in("makeup_requirement_id", (result.data.makeup_requirements ?? []).map((item: { id: string }) => item.id).length ? (result.data.makeup_requirements ?? []).map((item: { id: string }) => item.id) : ["00000000-0000-0000-0000-000000000000"]).order("created_at", { ascending: false }),
  ]);
  if (evidence.error || events.error || completion.error || attendance.error || makeupEvents.error) throw new LmsAdminDataError("Absence request details could not be loaded.");
  const publicEvents = (events.data ?? []).map((event) => ({ ...event, note: ["absence_information_requested", "absence_request_approved", "absence_request_declined"].includes(event.event_type) ? event.note : null }));
  const safeEvidence = (evidence.data ?? []).map(({ storage_path, ...item }) => ({ ...item, downloadUrl: storage_path && item.evidence_status === "active" ? `/api/student/absence-evidence/${item.id}/download` : null }));
  return { ...safeStudentRequest(result.data as unknown as Record<string, unknown>), evidence: safeEvidence, events: publicEvents, makeupEvents: makeupEvents.data ?? [], learning: completion.data, attendance: attendance.data };
}

export async function getStudentAbsenceSessionOptions(profileId: string) {
  const supabase = requireLmsAdminClient(); const context = await resolveStudentAbsenceContext(supabase, profileId);
  if (!context.courseEnrollmentIds.length) return [];
  const enrollments = await supabase.from("course_enrollments").select("id, cohort_course_id, cohort_courses(courses(code, title))").in("id", context.courseEnrollmentIds);
  if (enrollments.error) throw new LmsAdminDataError("Eligible course sessions could not be loaded.");
  const offeringIds = (enrollments.data ?? []).map((item) => item.cohort_course_id); if (!offeringIds.length) return [];
  const sessions = await supabase.from("class_sessions").select("id, cohort_course_id, title, scheduled_start_at, session_status, is_required").in("cohort_course_id", offeringIds).eq("is_required", true).neq("session_status", "cancelled").order("scheduled_start_at", { ascending: false, nullsFirst: false });
  if (sessions.error) throw new LmsAdminDataError("Eligible course sessions could not be loaded.");
  const existing = await supabase.from("absence_requests").select("class_session_id").in("course_enrollment_id", context.courseEnrollmentIds); if (existing.error) throw new LmsAdminDataError("Existing requests could not be checked."); const used = new Set((existing.data ?? []).map((item) => item.class_session_id));
  const byOffering = new Map((enrollments.data ?? []).map((item) => { const course = relation(relation(item.cohort_courses).courses); return [item.cohort_course_id, { courseEnrollmentId: item.id, courseCode: String(course.code ?? ""), courseTitle: String(course.title ?? "Course") }]; }));
  return (sessions.data ?? []).filter((item) => !used.has(item.id)).flatMap((item) => { const course = byOffering.get(item.cohort_course_id); return course ? [{ id: item.id, title: item.title, scheduledStartAt: item.scheduled_start_at, status: item.session_status, ...course }] : []; });
}

export async function fetchAdminAbsenceMakeup(supabase: SupabaseClient, filters: Record<string, string | undefined> = {}) {
  const result = await supabase.from("absence_requests").select(requestSelect).order("created_at", { ascending: false }).limit(5000); if (result.error) throw new LmsAdminDataError("Absence and make-up records could not be loaded.");
  const standaloneResult = await supabase.from("makeup_requirements").select("*, class_sessions(id, title, scheduled_start_at, cohort_course_id, cohort_courses(id, courses(id, code, title), cohorts(id, code, name))), course_enrollments(id, student_enrollments(students(id, student_number, legal_name, preferred_name, email)))").is("absence_request_id", null).order("created_at", { ascending: false }).limit(5000); if (standaloneResult.error) throw new LmsAdminDataError("Standalone make-up records could not be loaded.");
  const rows = (result.data ?? []).filter((raw) => { const session = relation(raw.class_sessions); const offering = relation(session.cohort_courses); const course = relation(offering.courses); const cohort = relation(offering.cohorts); const enrollment = relation(raw.course_enrollments); const student = relation(relation(enrollment.student_enrollments).students); const makeup = relation(raw.makeup_requirements); if (filters.status && raw.request_status !== filters.status) return false; if (filters.makeup && makeup.makeup_status !== filters.makeup) return false; if (filters.cohort && cohort.id !== filters.cohort) return false; if (filters.course && course.id !== filters.course) return false; if (filters.student && !`${student.legal_name} ${student.preferred_name} ${student.student_number}`.toLowerCase().includes(filters.student.toLowerCase())) return false; return true; });
  const standaloneMakeups = (standaloneResult.data ?? []).filter((row) => { const student = relation(relation(row.course_enrollments).student_enrollments).students; if (filters.makeup && row.makeup_status !== filters.makeup) return false; if (filters.student && !JSON.stringify(student).toLowerCase().includes(filters.student.toLowerCase())) return false; return true; });
  const metrics = { total: rows.length + standaloneMakeups.length, pending: rows.filter((item) => ["submitted", "under_review"].includes(item.request_status)).length, informationRequired: rows.filter((item) => item.request_status === "more_information_required").length, approved: rows.filter((item) => item.request_status === "approved").length, declined: rows.filter((item) => item.request_status === "declined").length, makeupOutstanding: rows.filter((item) => { const makeup = relation(item.makeup_requirements); return makeup.id && !["completed", "late_complete", "waived", "cancelled"].includes(String(makeup.makeup_status)); }).length + standaloneMakeups.filter((item) => !["completed", "late_complete", "waived", "cancelled"].includes(item.makeup_status)).length };
  return { rows, standaloneMakeups, metrics };
}

export async function fetchAdminAbsenceRequest(supabase: SupabaseClient, requestId: string) {
  const request = await supabase.from("absence_requests").select(requestSelect).eq("id", requestId).maybeSingle(); if (request.error || !request.data) throw new LmsAdminDataError("Absence request not found.", 404);
  const makeupIds = (request.data.makeup_requirements ?? []).map((item: { id: string }) => item.id);
  const [evidence, events, attendance, learning, makeupEvents] = await Promise.all([
    supabase.from("absence_request_evidence").select("*").eq("absence_request_id", requestId).order("created_at"),
    supabase.from("absence_request_events").select("*").eq("absence_request_id", requestId).order("created_at", { ascending: false }),
    supabase.from("session_attendance").select("*").eq("course_enrollment_id", request.data.course_enrollment_id).eq("class_session_id", request.data.class_session_id).maybeSingle(),
    supabase.from("session_learning_completion").select("*").eq("course_enrollment_id", request.data.course_enrollment_id).eq("class_session_id", request.data.class_session_id).maybeSingle(),
    supabase.from("makeup_requirement_events").select("*").in("makeup_requirement_id", makeupIds.length ? makeupIds : ["00000000-0000-0000-0000-000000000000"]).order("created_at", { ascending: false }),
  ]); if (evidence.error || events.error || attendance.error || learning.error || makeupEvents.error) throw new LmsAdminDataError("Absence review details could not be loaded.");
  const protectedEvidence = (evidence.data ?? []).map(({ storage_path, ...item }) => ({ ...item, external_url: storage_path && item.evidence_status === "active" ? `/api/admin/absence-evidence/${item.id}/download` : item.external_url }));
  return { request: request.data, evidence: protectedEvidence, events: events.data ?? [], attendance: attendance.data, learning: learning.data, makeupEvents: makeupEvents.data ?? [] };
}

export async function fetchFacilitatorMakeup(supabase: SupabaseClient, offeringIds: readonly string[]) {
  if (!offeringIds.length) return [];
  const result = await supabase.from("makeup_requirements").select("id, purpose_code, makeup_status, instructions, due_at, linked_quiz_id, linked_practical_assignment_id, linked_reflection_assignment_id, requires_oral_verification, oral_verification_status, recording_learning_assignment_id, class_sessions!inner(id, title, scheduled_start_at, cohort_course_id, cohort_courses(courses(code, title))), course_enrollments(student_enrollments(students(student_number, legal_name, preferred_name))), session_learning_completion(completion_status)").in("class_sessions.cohort_course_id", [...offeringIds]).order("due_at", { ascending: true, nullsFirst: false });
  if (result.error) throw new LmsAdminDataError("Assigned make-up requirements could not be loaded."); return result.data ?? [];
}
