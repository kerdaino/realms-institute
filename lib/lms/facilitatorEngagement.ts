import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { LmsAdminDataError } from "@/lib/lms/adminData";
import { isMakeupComplete, isRecordingComplete } from "@/lib/lms/engagement";

type Row = Record<string, unknown>;
function object(value: unknown): Row { return value && typeof value === "object" && !Array.isArray(value) ? value as Row : {}; }
function relation(value: unknown) { return Array.isArray(value) ? object(value[0]) : object(value); }
function fail(message: string, error: { code?: string } | null) { if (!error) return; console.error(message, { code: error.code }); throw new LmsAdminDataError(message); }

export async function fetchFacilitatorEngagementIndicators(supabase: SupabaseClient, offeringIds: string[]) {
  if (!offeringIds.length) return [];
  const enrollmentResult = await supabase.from("course_enrollments").select("id, cohort_course_id, student_enrollments(id, students(id, student_number, legal_name, preferred_name)), cohort_courses(courses(code, title), cohorts(code, name))").in("cohort_course_id", offeringIds).in("enrollment_status", ["active", "enrolled"]);
  fail("Assigned-course enrolments could not be loaded.", enrollmentResult.error);
  const enrollments = (enrollmentResult.data ?? []) as Row[]; const ids = enrollments.map((item) => String(item.id)); if (!ids.length) return [];
  const [attendance, recording, learning, makeup, assignments, quizzes] = await Promise.all([
    supabase.from("session_attendance").select("course_enrollment_id, attendance_status, absence_weight, finalized_at").in("course_enrollment_id", ids).not("finalized_at", "is", null),
    supabase.from("recording_learning_assignments").select("id, course_enrollment_id, class_session_id, purpose_code, due_at").in("course_enrollment_id", ids).neq("purpose_code", "REV"),
    supabase.from("session_learning_completion").select("course_enrollment_id, class_session_id, completion_status").in("course_enrollment_id", ids),
    supabase.from("makeup_requirements").select("course_enrollment_id, makeup_status, due_at").in("course_enrollment_id", ids),
    supabase.from("assignments").select("id, cohort_course_id, due_at, allow_late_submission").in("cohort_course_id", offeringIds).eq("assignment_status", "published"),
    supabase.from("quizzes").select("id, cohort_course_id, max_attempts").in("cohort_course_id", offeringIds).in("quiz_status", ["published", "closed"]),
  ]);
  for (const [label, result] of [["Attendance", attendance], ["Recorded learning", recording], ["Learning completion", learning], ["Make-up learning", makeup], ["Assignments", assignments], ["Quizzes", quizzes]] as const) fail(`${label} indicators could not be loaded.`, result.error);
  const assignmentIds = (assignments.data ?? []).map((item) => item.id); const quizIds = (quizzes.data ?? []).map((item) => item.id);
  const [submissions, attempts, replacementGrants] = await Promise.all([
    assignmentIds.length ? supabase.from("assignment_submissions").select("assignment_id, course_enrollment_id, submission_status, submitted_at").in("assignment_id", assignmentIds).in("course_enrollment_id", ids) : { data: [], error: null },
    quizIds.length ? supabase.from("quiz_attempts").select("quiz_id, course_enrollment_id, attempt_status, passed, integrity_status, official_result_eligible, replacement_for_attempt_id").in("quiz_id", quizIds).in("course_enrollment_id", ids) : { data: [], error: null },
    quizIds.length ? supabase.from("quiz_attempt_replacement_grants").select("quiz_id, course_enrollment_id, grant_status").in("quiz_id", quizIds).in("course_enrollment_id", ids).eq("grant_status", "pending") : { data: [], error: null },
  ]);
  fail("Assignment indicators could not be loaded.", submissions.error); fail("Quiz indicators could not be loaded.", attempts.error); fail("Quiz replacement indicators could not be loaded.", replacementGrants.error);
  const learningMap = new Map((learning.data ?? []).map((item) => [`${item.course_enrollment_id}:${item.class_session_id}`, item.completion_status])); const now = Date.now();
  return enrollments.map((enrollment) => {
    const id = String(enrollment.id); const offeringId = String(enrollment.cohort_course_id); const attendanceRows = (attendance.data ?? []).filter((item) => item.course_enrollment_id === id); const recordingRows = (recording.data ?? []).filter((item) => item.course_enrollment_id === id); const makeupRows = (makeup.data ?? []).filter((item) => item.course_enrollment_id === id); const assignmentRows = (assignments.data ?? []).filter((item) => item.cohort_course_id === offeringId); const quizRows = (quizzes.data ?? []).filter((item) => item.cohort_course_id === offeringId);
    const missingAssignments = assignmentRows.filter((assignment) => assignment.due_at && Date.parse(assignment.due_at) < now && !(submissions.data ?? []).some((item) => item.assignment_id === assignment.id && item.course_enrollment_id === id && (item.submitted_at || ["submitted", "awaiting_review", "graded"].includes(item.submission_status)))).length;
    const quizConcerns = quizRows.filter((quiz) => { const rows = (attempts.data ?? []).filter((item) => item.quiz_id === quiz.id && item.course_enrollment_id === id && item.official_result_eligible !== false); const replacementPending = (replacementGrants.data ?? []).some((item) => item.quiz_id === quiz.id && item.course_enrollment_id === id); return !replacementPending && !rows.some((item) => item.passed === true) && !rows.some((item) => ["in_progress", "submitted", "awaiting_review"].includes(item.attempt_status) || item.integrity_status === "under_review") && rows.filter((item) => !item.replacement_for_attempt_id && item.attempt_status === "graded").length >= Number(quiz.max_attempts); }).length;
    return { courseEnrollmentId: id, student: relation(relation(enrollment.student_enrollments).students), offering: relation(enrollment.cohort_courses), absenceUnits: attendanceRows.reduce((sum, item) => sum + Number(item.absence_weight ?? 0), 0), lateOrPartial: attendanceRows.filter((item) => item.attendance_status === "late" || item.attendance_status === "partial").length, overdueRecordings: recordingRows.filter((item) => item.due_at && Date.parse(item.due_at) < now && !isRecordingComplete(learningMap.get(`${id}:${item.class_session_id}`))).length, overdueMakeups: makeupRows.filter((item) => item.due_at && Date.parse(item.due_at) < now && !isMakeupComplete(item.makeup_status)).length, missingAssignments, quizConcerns };
  }).filter((item) => item.absenceUnits || item.lateOrPartial || item.overdueRecordings || item.overdueMakeups || item.missingAssignments || item.quizConcerns);
}
