import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { recordLmsAudit } from "@/lib/lms/adminAudit";
import { LmsAdminDataError } from "@/lib/lms/adminData";
import {
  engagementDeduplicationKey,
  inactivityDays,
  isMakeupComplete,
  isRecordingComplete,
  metricForSignal,
  ruleMatches,
  type EngagementMetrics,
  type EngagementRule,
} from "@/lib/lms/engagement";

type Row = Record<string, unknown>;
type Actor = { actorLabel: string; actorUserId?: string | null };

function object(value: unknown): Row { return value && typeof value === "object" && !Array.isArray(value) ? value as Row : {}; }
function relation(value: unknown) { return Array.isArray(value) ? object(value[0]) : object(value); }
function text(value: unknown) { return typeof value === "string" ? value : null; }
function number(value: unknown) { const parsed = Number(value); return Number.isFinite(parsed) ? parsed : 0; }
function fail(label: string, error: { code?: string; message?: string } | null) { if (!error) return; console.error(label, { code: error.code }); throw new LmsAdminDataError(label); }

function validAssignmentSubmission(row: Row) {
  return Boolean(row.submitted_at) || ["submitted", "awaiting_review", "graded", "under_integrity_review"].includes(String(row.submission_status ?? ""));
}

function quizIsAwaitingManualReview(row: Row) {
  return ["submitted", "awaiting_review"].includes(String(row.attempt_status ?? "")) && row.passed == null;
}

export type StudentEngagementEvaluation = {
  studentEnrollment: Row;
  student: Row;
  cohort: Row;
  metrics: EngagementMetrics;
  facts: {
    overdueRecordingIds: string[];
    overdueMakeupIds: string[];
    overdueAssignmentIds: string[];
    attemptsExhaustedQuizIds: string[];
    integritySources: Array<{ type: string; id: string }>;
  };
};

export async function calculateStudentEngagementMetrics(supabase: SupabaseClient, studentEnrollmentId: string, now = new Date()): Promise<StudentEngagementEvaluation> {
  const enrollmentResult = await supabase.from("student_enrollments").select("*, students(id, profile_id, student_number, legal_name, preferred_name, email, student_status), cohorts(id, code, name, status)").eq("id", studentEnrollmentId).maybeSingle();
  fail("Student engagement enrolment could not be loaded.", enrollmentResult.error);
  if (!enrollmentResult.data) throw new LmsAdminDataError("Student enrolment not found.", 404);
  const studentEnrollment = object(enrollmentResult.data);
  const student = relation(studentEnrollment.students);
  const cohort = relation(studentEnrollment.cohorts);

  const courseResult = await supabase.from("course_enrollments").select("id, cohort_course_id, enrollment_status").eq("student_enrollment_id", studentEnrollmentId).in("enrollment_status", ["active", "enrolled"]);
  fail("Student course enrolments could not be loaded.", courseResult.error);
  const courseEnrollments = (courseResult.data ?? []) as Row[];
  const courseEnrollmentIds = courseEnrollments.map((row) => String(row.id));
  const offeringIds = [...new Set(courseEnrollments.map((row) => String(row.cohort_course_id)))];
  const empty = { data: [] as Row[], error: null };

  const [attendanceResult, learningResult, recordingResult, makeupResult, assignmentResult, quizResult] = await Promise.all([
    courseEnrollmentIds.length ? supabase.from("session_attendance").select("id, course_enrollment_id, class_session_id, attendance_status, absence_weight, finalized_at, integrity_flag").in("course_enrollment_id", courseEnrollmentIds) : empty,
    courseEnrollmentIds.length ? supabase.from("session_learning_completion").select("id, course_enrollment_id, class_session_id, completion_status, due_at, updated_at").in("course_enrollment_id", courseEnrollmentIds) : empty,
    courseEnrollmentIds.length ? supabase.from("recording_learning_assignments").select("id, course_enrollment_id, class_session_id, purpose_code, assignment_status, due_at, completed_at").in("course_enrollment_id", courseEnrollmentIds) : empty,
    courseEnrollmentIds.length ? supabase.from("makeup_requirements").select("id, course_enrollment_id, class_session_id, makeup_status, due_at").in("course_enrollment_id", courseEnrollmentIds) : empty,
    offeringIds.length ? supabase.from("assignments").select("id, cohort_course_id, title, due_at, allow_late_submission, assignment_status").in("cohort_course_id", offeringIds).eq("assignment_status", "published") : empty,
    offeringIds.length ? supabase.from("quizzes").select("id, cohort_course_id, title, closes_at, max_attempts, quiz_status").in("cohort_course_id", offeringIds).in("quiz_status", ["published", "closed"]) : empty,
  ]);
  for (const [label, result] of [["Attendance", attendanceResult], ["Learning completion", learningResult], ["Recorded learning", recordingResult], ["Make-up learning", makeupResult], ["Assignments", assignmentResult], ["Quizzes", quizResult]] as const) fail(`${label} engagement facts could not be loaded.`, result.error);

  const assignments = (assignmentResult.data ?? []) as Row[];
  const quizzes = (quizResult.data ?? []) as Row[];
  const [submissionResult, attemptResult] = await Promise.all([
    assignments.length && courseEnrollmentIds.length ? supabase.from("assignment_submissions").select("id, assignment_id, course_enrollment_id, submission_status, submitted_at, review_outcome").in("assignment_id", assignments.map((row) => String(row.id))).in("course_enrollment_id", courseEnrollmentIds) : empty,
    quizzes.length && courseEnrollmentIds.length ? supabase.from("quiz_attempts").select("id, quiz_id, course_enrollment_id, attempt_number, attempt_status, passed, graded_at").in("quiz_id", quizzes.map((row) => String(row.id))).in("course_enrollment_id", courseEnrollmentIds) : empty,
  ]);
  fail("Assignment engagement facts could not be loaded.", submissionResult.error);
  fail("Quiz engagement facts could not be loaded.", attemptResult.error);

  const attendance = (attendanceResult.data ?? []) as Row[];
  const finalizedAttendance = attendance.filter((row) => Boolean(row.finalized_at) && row.attendance_status !== "pending");
  const learning = (learningResult.data ?? []) as Row[];
  const learningByEnrollmentSession = new Map(learning.map((row) => [`${row.course_enrollment_id}:${row.class_session_id}`, row]));
  const recordings = ((recordingResult.data ?? []) as Row[]).filter((row) => row.purpose_code !== "REV");
  const overdueRecordings = recordings.filter((row) => {
    if (!row.due_at || Date.parse(String(row.due_at)) >= now.valueOf()) return false;
    const status = text(learningByEnrollmentSession.get(`${row.course_enrollment_id}:${row.class_session_id}`)?.completion_status) ?? text(row.assignment_status);
    return !isRecordingComplete(status);
  });
  const incompleteRecordings = recordings.filter((row) => {
    const status = text(learningByEnrollmentSession.get(`${row.course_enrollment_id}:${row.class_session_id}`)?.completion_status) ?? text(row.assignment_status);
    return !isRecordingComplete(status);
  });
  const makeups = (makeupResult.data ?? []) as Row[];
  const overdueMakeups = makeups.filter((row) => row.due_at && Date.parse(String(row.due_at)) < now.valueOf() && !isMakeupComplete(text(row.makeup_status)));
  const incompleteMakeups = makeups.filter((row) => !isMakeupComplete(text(row.makeup_status)));
  const submissions = (submissionResult.data ?? []) as Row[];
  const overdueAssignments = assignments.filter((assignment) => {
    if (!assignment.due_at || Date.parse(String(assignment.due_at)) >= now.valueOf()) return false;
    return !submissions.some((submission) => submission.assignment_id === assignment.id && validAssignmentSubmission(submission));
  });
  const missingAssignments = overdueAssignments.filter((assignment) => assignment.allow_late_submission === false);
  const resubmissionsRequired = new Set(submissions.filter((row) => row.review_outcome === "revision_required").map((row) => String(row.assignment_id))).size;
  const attempts = (attemptResult.data ?? []) as Row[];
  const failedQuizAttempts = attempts.filter((row) => row.attempt_status === "graded" && row.passed === false).length;
  const exhaustedQuizzes = quizzes.filter((quiz) => {
    const quizAttempts = attempts.filter((attempt) => attempt.quiz_id === quiz.id);
    if (quizAttempts.some((attempt) => attempt.passed === true) || quizAttempts.some(quizIsAwaitingManualReview)) return false;
    return quizAttempts.filter((attempt) => attempt.attempt_status === "graded").length >= number(quiz.max_attempts);
  });
  const integritySources = [
    ...attendance.filter((row) => row.integrity_flag === true).map((row) => ({ type: "attendance", id: String(row.id) })),
    ...learning.filter((row) => row.completion_status === "integrity_review").map((row) => ({ type: "recording", id: String(row.id) })),
    ...submissions.filter((row) => row.submission_status === "under_integrity_review").map((row) => ({ type: "assignment", id: String(row.id) })),
    ...attempts.filter((row) => row.attempt_status === "under_integrity_review").map((row) => ({ type: "quiz", id: String(row.id) })),
  ];
  const lastMeaningfulActivityAt = text(studentEnrollment.last_meaningful_activity_at);
  const metrics: EngagementMetrics = {
    unapprovedAbsenceUnits: Number(finalizedAttendance.reduce((total, row) => total + number(row.absence_weight), 0).toFixed(2)),
    unapprovedAbsenceCount: finalizedAttendance.filter((row) => row.attendance_status === "absent").length,
    lateCount: finalizedAttendance.filter((row) => row.attendance_status === "late").length,
    partialCount: finalizedAttendance.filter((row) => row.attendance_status === "partial").length,
    unresolvedAttendanceCount: attendance.filter((row) => !row.finalized_at || row.attendance_status === "pending").length,
    overdueRecordedModules: overdueRecordings.length,
    incompleteRecordedModules: incompleteRecordings.length,
    overdueMakeups: overdueMakeups.length,
    incompleteMakeups: incompleteMakeups.length,
    overdueAssignments: overdueAssignments.length,
    missingAssignments: missingAssignments.length,
    resubmissionsRequired,
    failedQuizAttempts,
    quizzesWithAttemptsExhausted: exhaustedQuizzes.length,
    openIntegrityReviews: integritySources.length,
    lastMeaningfulActivityAt,
    inactivityDays: inactivityDays(lastMeaningfulActivityAt, now.valueOf()),
  };
  return { studentEnrollment, student, cohort, metrics, facts: { overdueRecordingIds: overdueRecordings.map((row) => String(row.id)), overdueMakeupIds: overdueMakeups.map((row) => String(row.id)), overdueAssignmentIds: overdueAssignments.map((row) => String(row.id)), attemptsExhaustedQuizIds: exhaustedQuizzes.map((row) => String(row.id)), integritySources } };
}

function alertCopy(rule: EngagementRule, currentValue: number) {
  const labels: Record<string, string> = {
    unapproved_absence_units: "Attendance pattern requires attention",
    overdue_recorded_modules: "Recorded learning requires attention",
    overdue_makeups: "Make-up learning requires attention",
    missing_assignments: "Assignment completion requires attention",
    quizzes_with_attempts_exhausted: "Quiz completion requires review",
    open_integrity_reviews: "Academic review is open",
    inactivity_days: "Recent activity requires attention",
  };
  return {
    title: labels[rule.signal_type] ?? "Student engagement requires attention",
    summary: `Current verified value: ${currentValue}. Configured review threshold: ${rule.threshold_value}. This operational alert is not a disciplinary finding.`,
  };
}

export async function generateStudentEngagementAlerts(supabase: SupabaseClient, evaluation: StudentEngagementEvaluation, actor: Actor = { actorLabel: "System evaluation" }) {
  const cohortId = String(evaluation.studentEnrollment.cohort_id);
  const rulesResult = await supabase.from("engagement_alert_rules").select("id, rule_code, signal_type, threshold_value, severity, recommended_action").eq("cohort_id", cohortId).eq("active", true).eq("auto_create_alert", true);
  fail("Engagement rules could not be loaded.", rulesResult.error);
  const rules = (rulesResult.data ?? []) as EngagementRule[];
  const existingResult = await supabase.from("student_engagement_alerts").select("*").eq("student_enrollment_id", String(evaluation.studentEnrollment.id));
  fail("Existing engagement alerts could not be loaded.", existingResult.error);
  const existing = (existingResult.data ?? []) as Row[];
  let created = 0; let updated = 0; let resolved = 0;
  const now = new Date().toISOString();

  for (const rule of rules) {
    const key = engagementDeduplicationKey(rule);
    const currentValue = metricForSignal(evaluation.metrics, rule.signal_type);
    const matching = existing.find((row) => row.deduplication_key === key);
    if (ruleMatches(evaluation.metrics, rule) && currentValue !== null) {
      const copy = alertCopy(rule, currentValue);
      const values = { alert_rule_id: rule.id, signal_type: rule.signal_type, severity: rule.severity, alert_title: copy.title, alert_summary: copy.summary, current_value: currentValue, threshold_value: rule.threshold_value, source_type: "engagement_evaluation", source_record_id: String(evaluation.studentEnrollment.id), deduplication_key: key, alert_status: "open", auto_generated: true, last_detected_at: now, resolved_at: null, resolved_by: null, resolution_note: null, context: { rule_code: rule.rule_code, recommended_action: rule.recommended_action } };
      if (matching) {
        const result = await supabase.from("student_engagement_alerts").update({ ...values, updated_at: now }).eq("id", String(matching.id));
        fail("Engagement alert could not be updated.", result.error); updated += 1;
        await recordLmsAudit(supabase, { action: "engagement_alert_updated", entityType: "student_engagement_alert", entityId: String(matching.id), actorUserId: actor.actorUserId, metadata: { rule_code: rule.rule_code, current_value: currentValue } });
      } else {
        const result = await supabase.from("student_engagement_alerts").insert({ student_enrollment_id: String(evaluation.studentEnrollment.id), first_detected_at: now, created_at: now, updated_at: now, ...values }).select("id").single();
        fail("Engagement alert could not be created.", result.error); if (!result.data) throw new LmsAdminDataError("Engagement alert could not be created."); created += 1;
        await recordLmsAudit(supabase, { action: "engagement_alert_created", entityType: "student_engagement_alert", entityId: String(result.data.id), actorUserId: actor.actorUserId, metadata: { rule_code: rule.rule_code, current_value: currentValue } });
      }
    } else if (matching && matching.alert_status !== "resolved") {
      const result = await supabase.from("student_engagement_alerts").update({ alert_status: "resolved", resolved_at: now, resolved_by: actor.actorLabel, resolution_note: "The underlying evaluated fact is now below the configured threshold.", updated_at: now }).eq("id", String(matching.id));
      fail("Cleared engagement alert could not be resolved.", result.error); resolved += 1;
      await recordLmsAudit(supabase, { action: "engagement_alert_resolved", entityType: "student_engagement_alert", entityId: String(matching.id), actorUserId: actor.actorUserId, metadata: { rule_code: rule.rule_code, resolution: "underlying_fact_cleared" } });
    }
  }

  const reviewRequired = rules.some((rule) => rule.recommended_action === "attendance_case_review" && ruleMatches(evaluation.metrics, rule));
  const enrollmentUpdate: Row = { last_engagement_evaluated_at: now, updated_at: now };
  if (reviewRequired) enrollmentUpdate.standing_review_required = true;
  const savedEnrollment = await supabase.from("student_enrollments").update(enrollmentUpdate).eq("id", String(evaluation.studentEnrollment.id));
  fail("Engagement evaluation timestamp could not be saved.", savedEnrollment.error);
  await recordLmsAudit(supabase, { action: "engagement_evaluation_run", entityType: "student_enrollment", entityId: String(evaluation.studentEnrollment.id), actorUserId: actor.actorUserId, metadata: { created, updated, resolved, rule_count: rules.length, standing_review_required: reviewRequired } });
  return { metrics: evaluation.metrics, created, updated, resolved, evaluatedAt: now, standingReviewRequired: reviewRequired };
}

export async function evaluateStudentEngagement(supabase: SupabaseClient, studentEnrollmentId: string, actor: Actor = { actorLabel: "System evaluation" }) {
  const evaluation = await calculateStudentEngagementMetrics(supabase, studentEnrollmentId);
  return generateStudentEngagementAlerts(supabase, evaluation, actor);
}

export async function evaluateCohortEngagement(supabase: SupabaseClient, cohortId: string, actor: Actor = { actorLabel: "System evaluation" }) {
  const result = await supabase.from("student_enrollments").select("id").eq("cohort_id", cohortId).in("enrolment_status", ["pending_onboarding", "active", "enrolled"]);
  fail("Cohort enrolments could not be loaded.", result.error);
  const totals = { students: 0, created: 0, updated: 0, resolved: 0 };
  for (const row of result.data ?? []) {
    const evaluation = await evaluateStudentEngagement(supabase, row.id, actor);
    totals.students += 1; totals.created += evaluation.created; totals.updated += evaluation.updated; totals.resolved += evaluation.resolved;
  }
  return totals;
}

export async function triggerEngagementEvaluationForCourseEnrollment(supabase: SupabaseClient, courseEnrollmentId: string) {
  const enrollment = await supabase.from("course_enrollments").select("student_enrollment_id").eq("id", courseEnrollmentId).maybeSingle();
  if (enrollment.error || !enrollment.data) { console.error("Material-event engagement evaluation could not resolve the student enrolment", { code: enrollment.error?.code }); return false; }
  try { await evaluateStudentEngagement(supabase, enrollment.data.student_enrollment_id, { actorLabel: "System evaluation" }); return true; }
  catch (error) { console.error("Material-event engagement evaluation could not be completed", error instanceof Error ? { name: error.name, message: error.message } : { name: "UnknownError" }); return false; }
}

export async function recordStudentEnrollmentMeaningfulActivity(supabase: SupabaseClient, studentEnrollmentId: string, occurredAt = new Date().toISOString()) {
  const current = await supabase.from("student_enrollments").select("last_meaningful_activity_at").eq("id", studentEnrollmentId).maybeSingle();
  if (current.error || !current.data) return false;
  if (current.data.last_meaningful_activity_at && Date.parse(current.data.last_meaningful_activity_at) >= Date.parse(occurredAt)) return true;
  const result = await supabase.from("student_enrollments").update({ last_meaningful_activity_at: occurredAt, updated_at: occurredAt }).eq("id", studentEnrollmentId);
  if (result.error) console.error("Meaningful activity timestamp could not be updated", { code: result.error.code });
  if (!result.error) {
    try { await evaluateStudentEngagement(supabase, studentEnrollmentId, { actorLabel: "System evaluation" }); }
    catch (error) { console.error("Post-activity engagement evaluation could not be completed", error instanceof Error ? { name: error.name, message: error.message } : { name: "UnknownError" }); }
  }
  return !result.error;
}

export async function recordStudentMeaningfulActivity(supabase: SupabaseClient, profileId: string, occurredAt = new Date().toISOString()) {
  const student = await supabase.from("students").select("id").eq("profile_id", profileId).maybeSingle();
  if (student.error || !student.data) return false;
  const enrollment = await supabase.from("student_enrollments").select("id").eq("student_id", student.data.id).in("enrolment_status", ["pending_onboarding", "active", "enrolled"]).order("enrolled_at", { ascending: false }).limit(1).maybeSingle();
  if (enrollment.error || !enrollment.data) return false;
  return recordStudentEnrollmentMeaningfulActivity(supabase, enrollment.data.id, occurredAt);
}
