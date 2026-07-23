import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { recordLmsAudit } from "@/lib/lms/adminAudit";
import { LmsAdminDataError } from "@/lib/lms/adminData";
import {
  attemptSelections,
  assessmentMatchesStudentProgramme,
  calculateAttendanceComponent,
  calculateWeightedAssessmentCategory,
  defenceOutcomes,
  defenceStatuses,
  evaluateProgrammeEligibility,
  graduationRequirementStatuses,
  resultBatchStatuses,
  resultOutcomes,
  type AssessmentAttemptEvidence,
  type AttemptSelection,
  type GraduationRequirementStatus,
  type WeightedAssessmentEvidence,
} from "@/lib/lms/results";
import { isOfficialQuizAttempt } from "@/lib/lms/quizIntegrity";

type Row = Record<string, unknown>;
export type ResultActor = { actorUserId?: string | null; actorLabel: string };

function invalid(message: string, status = 400): never { throw new LmsAdminDataError(message, status); }
function object(value: unknown): Row { return value && typeof value === "object" && !Array.isArray(value) ? value as Row : {}; }
function relation(value: unknown): Row { return Array.isArray(value) ? object(value[0]) : object(value); }
function text(value: unknown) { return typeof value === "string" && value.trim() ? value.trim() : null; }
function requiredText(value: unknown, message: string, minimum = 1, maximum = 10_000) { const result = text(value); if (!result || result.length < minimum) invalid(message); return result.slice(0, maximum); }
function numeric(value: unknown, message: string, minimum = 0, maximum?: number) { const result = Number(value); if (!Number.isFinite(result) || result < minimum || (maximum !== undefined && result > maximum)) invalid(message); return result; }
function boolean(value: unknown, fallback = false) { return value === undefined ? fallback : value === true || value === "true" || value === "on"; }
function timestamp(value: unknown) { const candidate = text(value); if (!candidate) return null; const date = new Date(candidate); if (!Number.isFinite(date.valueOf())) invalid("Enter a valid date and time."); return date.toISOString(); }
function round(value: number) { return Math.round((value + Number.EPSILON) * 100) / 100; }
function actorReference(actor: ResultActor) { return actor.actorUserId ?? actor.actorLabel; }
function queryFailed(error: { code?: string; message?: string } | null, message: string) { if (error) throw new LmsAdminDataError(message); }
function compatibleCourse(course: Row, enrollment: Row) {
  return assessmentMatchesStudentProgramme({ courseCategory: String(course.course_category ?? ""), courseDiscipleshipRoute: text(course.discipleship_route), courseSkillPathway: text(course.skill_pathway), studentDiscipleshipRoute: String(enrollment.discipleship_route ?? ""), studentSkillPathway: String(enrollment.skill_pathway ?? "") });
}

async function loadEnrollmentPolicy(supabase: SupabaseClient, studentEnrollmentId: string) {
  const enrollmentResult = await supabase.from("student_enrollments").select("id, student_id, cohort_id, discipleship_route, skill_pathway, enrolment_status, students(id, student_number, legal_name, preferred_name, email), cohorts(id, code, name)").eq("id", studentEnrollmentId).maybeSingle();
  queryFailed(enrollmentResult.error, "Student enrolment could not be loaded.");
  if (!enrollmentResult.data) invalid("Student enrolment not found.", 404);
  const policyResult = await supabase.from("programme_scoring_policies").select("*").eq("cohort_id", enrollmentResult.data.cohort_id).eq("policy_status", "active").maybeSingle();
  queryFailed(policyResult.error, "The active scoring policy could not be loaded.");
  if (!policyResult.data) invalid("No active scoring policy is configured for this cohort.", 409);
  return { enrollment: object(enrollmentResult.data), policy: object(policyResult.data) };
}

async function loadCategoryContext(supabase: SupabaseClient, studentEnrollmentId: string, scoreCategoryId: string) {
  const context = await loadEnrollmentPolicy(supabase, studentEnrollmentId);
  const categoryResult = await supabase.from("programme_score_categories").select("*").eq("id", scoreCategoryId).eq("scoring_policy_id", String(context.policy.id)).eq("active", true).maybeSingle();
  queryFailed(categoryResult.error, "Score category could not be loaded.");
  if (!categoryResult.data) invalid("The score category is not active for this student's cohort.", 409);
  return { ...context, category: object(categoryResult.data) };
}

async function assessmentRecord(supabase: SupabaseClient, type: string, assessmentId: string): Promise<Row | null> {
  if (type === "assignment") {
    const result = await supabase.from("assignments").select("id, title, assessment_domain, assessment_category, assignment_status, cohort_course_id, cohort_courses(id, cohort_id, courses(id, code, title, course_category, discipleship_route, skill_pathway))").eq("id", assessmentId).maybeSingle();
    queryFailed(result.error, "Assignment could not be loaded.");
    return result.data ? { ...object(result.data), type: "assignment", status: result.data.assignment_status } as Row : null;
  }
  if (type === "quiz") {
    const result = await supabase.from("quizzes").select("id, title, assessment_domain, assessment_category, quiz_status, cohort_course_id, cohort_courses(id, cohort_id, courses(id, code, title, course_category, discipleship_route, skill_pathway))").eq("id", assessmentId).maybeSingle();
    queryFailed(result.error, "Quiz could not be loaded.");
    return result.data ? { ...object(result.data), type: "quiz", status: result.data.quiz_status } as Row : null;
  }
  invalid("Choose an assignment or quiz.");
}

export async function saveAssessmentWeighting(supabase: SupabaseClient, body: Row, actor: ResultActor) {
  const scoreCategoryId = requiredText(body.score_category_id, "Choose a score category.", 1, 80);
  const assessmentType = requiredText(body.assessment_type, "Choose an assessment type.", 1, 20);
  const assessmentId = requiredText(body.assessment_id, "Choose an assessment.", 1, 80);
  const attemptSelection = requiredText(body.attempt_selection, "Choose an attempt-selection rule.", 1, 30);
  if (!attemptSelections.includes(attemptSelection as AttemptSelection)) invalid("Choose a supported attempt-selection rule.");
  const categoryResult = await supabase.from("programme_score_categories").select("*, programme_scoring_policies(id, cohort_id)").eq("id", scoreCategoryId).maybeSingle();
  queryFailed(categoryResult.error, "Score category could not be loaded.");
  if (!categoryResult.data || !categoryResult.data.active) invalid("Choose an active score category.");
  const category = object(categoryResult.data);
  const policy = relation(category.programme_scoring_policies);
  const assessment = await assessmentRecord(supabase, assessmentType, assessmentId);
  if (!assessment) invalid("Assessment not found.", 404);
  const offering = relation(assessment.cohort_courses);
  if (offering.cohort_id !== policy.cohort_id) invalid("Assessment cohort must match the scoring-policy cohort.");
  if (assessment.assessment_domain !== category.score_domain) invalid("Assessment domain must match the score-category domain.");
  const metadataConflict = assessment.assessment_category !== category.category_code;
  if (metadataConflict && !boolean(body.confirm_metadata_conflict)) invalid("This mapping conflicts with the assessment category metadata. Confirm the reviewed conflict and record a reason.", 409);
  const conflictReason = metadataConflict ? requiredText(body.conflict_reason, "Explain why the category-metadata conflict is academically valid.", 15, 2000) : null;
  const values = {
    score_category_id: scoreCategoryId,
    assessment_type: assessmentType,
    assessment_id: assessmentId,
    weight_units: numeric(body.weight_units ?? 1, "Weight units must be greater than zero.", 0.01, 10_000),
    attempt_selection: attemptSelection,
    is_required: boolean(body.is_required, true),
    required_for_graduation: boolean(body.required_for_graduation),
    counts_toward_result: boolean(body.counts_toward_result, true),
    active: boolean(body.active, true),
    updated_at: new Date().toISOString(),
  };
  const existing = await supabase.from("assessment_weightings").select("id").eq("score_category_id", scoreCategoryId).eq("assessment_type", assessmentType).eq("assessment_id", assessmentId).maybeSingle();
  queryFailed(existing.error, "Existing assessment mapping could not be checked.");
  const saved = existing.data
    ? await supabase.from("assessment_weightings").update(values).eq("id", existing.data.id).select("*").single()
    : await supabase.from("assessment_weightings").insert(values).select("*").single();
  queryFailed(saved.error, "Assessment weighting could not be saved. Please contact a REALMS administrator.");
  await recordLmsAudit(supabase, { action: existing.data ? "assessment_weighting_updated" : "assessment_weighting_added", entityType: "assessment_weighting", entityId: String(saved.data.id), actorUserId: actor.actorUserId, metadata: { assessment_type: assessmentType, assessment_id: assessmentId, score_category_id: scoreCategoryId, metadata_conflict_reviewed: metadataConflict, conflict_reason: conflictReason } });
  return saved.data;
}

async function loadAttempts(supabase: SupabaseClient, assessment: Row, enrollment: Row): Promise<AssessmentAttemptEvidence[]> {
  const offering = relation(assessment.cohort_courses);
  const courseEnrollment = await supabase.from("course_enrollments").select("id").eq("student_enrollment_id", String(enrollment.id)).eq("cohort_course_id", String(offering.id)).maybeSingle();
  queryFailed(courseEnrollment.error, "Course enrolment could not be resolved for scoring.");
  if (!courseEnrollment.data) return [];
  if (assessment.type === "assignment") {
    const attempts = await supabase.from("assignment_submissions").select("id, attempt_number, submission_status, score_percentage, review_outcome, graded_at").eq("assignment_id", String(assessment.id)).eq("course_enrollment_id", courseEnrollment.data.id).order("attempt_number");
    queryFailed(attempts.error, "Assignment evidence could not be loaded.");
    return (attempts.data ?? []).map((row) => ({ id: row.id, attemptNumber: Number(row.attempt_number), status: String(row.submission_status), scorePercentage: row.score_percentage === null ? null : Number(row.score_percentage), gradedAt: row.graded_at, accepted: row.review_outcome === "accepted" }));
  }
  const attempts = await supabase.from("quiz_attempts").select("id, attempt_number, attempt_status, score_percentage, graded_at, integrity_status, official_result_eligible").eq("quiz_id", String(assessment.id)).eq("course_enrollment_id", courseEnrollment.data.id).order("attempt_number");
  queryFailed(attempts.error, "Quiz evidence could not be loaded.");
  return (attempts.data ?? []).map((row) => ({ id: row.id, attemptNumber: Number(row.attempt_number), status: row.integrity_status === "under_review" ? "integrity_review" : String(row.attempt_status), scorePercentage: row.score_percentage === null ? null : Number(row.score_percentage), gradedAt: row.graded_at, accepted: isOfficialQuizAttempt(row) }));
}

async function saveComponentScore(supabase: SupabaseClient, input: {
  studentEnrollmentId: string;
  category: Row;
  rawPercentage: number | null;
  weightedPoints: number | null;
  evidenceComplete: boolean;
  calculationStatus: string;
  details: Row;
  actor: ResultActor;
}) {
  const values = {
    student_enrollment_id: input.studentEnrollmentId,
    score_category_id: String(input.category.id),
    raw_percentage: input.rawPercentage,
    weighted_points: input.weightedPoints,
    maximum_points: Number(input.category.max_points),
    evidence_complete: input.evidenceComplete,
    calculation_status: input.calculationStatus,
    calculation_details: input.details,
    calculated_at: new Date().toISOString(),
    calculated_by: actorReference(input.actor),
    updated_at: new Date().toISOString(),
  };
  const saved = await supabase.from("student_component_scores").upsert(values, { onConflict: "student_enrollment_id,score_category_id" }).select("*").single();
  queryFailed(saved.error, "Component score could not be saved. Please contact a REALMS administrator.");
  return saved.data;
}

async function calculateAssessmentCategory(supabase: SupabaseClient, context: Awaited<ReturnType<typeof loadCategoryContext>>, actor: ResultActor) {
  const weightingsResult = await supabase.from("assessment_weightings").select("*").eq("score_category_id", String(context.category.id)).eq("counts_toward_result", true).eq("active", true).order("created_at");
  queryFailed(weightingsResult.error, "Assessment weightings could not be loaded.");
  const evidence: WeightedAssessmentEvidence[] = [];
  const configurationWarnings: Row[] = [];
  for (const weighting of weightingsResult.data ?? []) {
    const assessment = await assessmentRecord(supabase, weighting.assessment_type, weighting.assessment_id);
    if (!assessment) { configurationWarnings.push({ assessment_id: weighting.assessment_id, issue: "assessment_missing" }); continue; }
    const offering = relation(assessment.cohort_courses);
    const course = relation(offering.courses);
    if (offering.cohort_id !== context.enrollment.cohort_id || assessment.assessment_domain !== context.category.score_domain) {
      configurationWarnings.push({ assessment_id: assessment.id, issue: "cohort_or_domain_conflict" });
      continue;
    }
    if (!compatibleCourse(course, context.enrollment)) continue;
    const attempts = await loadAttempts(supabase, assessment, context.enrollment);
    evidence.push({ assessmentType: assessment.type as "assignment" | "quiz", assessmentId: String(assessment.id), title: String(assessment.title), weightUnits: Number(weighting.weight_units), attemptSelection: weighting.attempt_selection as AttemptSelection, required: Boolean(weighting.is_required), attempts });
  }
  const calculated = calculateWeightedAssessmentCategory({ maximumPoints: Number(context.category.max_points), assessments: evidence });
  const requiredConfigurationMissing = (weightingsResult.data ?? []).length === 0 || configurationWarnings.length > 0;
  return saveComponentScore(supabase, {
    studentEnrollmentId: String(context.enrollment.id), category: context.category,
    rawPercentage: calculated.rawPercentage, weightedPoints: calculated.weightedPoints,
    evidenceComplete: calculated.evidenceComplete && !requiredConfigurationMissing,
    calculationStatus: configurationWarnings.length ? "review_required" : calculated.calculationStatus,
    details: { source: "assessment", assessments: calculated.evidence, configuration_warnings: configurationWarnings }, actor,
  });
}

async function attendanceRecords(supabase: SupabaseClient, studentEnrollmentId: string) {
  const courses = await supabase.from("course_enrollments").select("id, cohort_course_id").eq("student_enrollment_id", studentEnrollmentId).in("enrollment_status", ["active", "enrolled", "completed"]);
  queryFailed(courses.error, "Course enrolments could not be loaded for attendance scoring.");
  const offeringIds = (courses.data ?? []).map((row) => row.cohort_course_id);
  const courseEnrollmentIds = (courses.data ?? []).map((row) => row.id);
  if (!offeringIds.length) return [];
  const sessions = await supabase.from("class_sessions").select("id, is_required, session_status, scheduled_end_at").in("cohort_course_id", offeringIds).eq("is_required", true).neq("session_status", "cancelled");
  queryFailed(sessions.error, "Required sessions could not be loaded for attendance scoring.");
  const sessionIds = (sessions.data ?? []).map((row) => row.id);
  const rows = courseEnrollmentIds.length && sessionIds.length ? await supabase.from("session_attendance").select("id, class_session_id, attendance_status, finalized_at").in("course_enrollment_id", courseEnrollmentIds).in("class_session_id", sessionIds) : { data: [], error: null };
  queryFailed(rows.error, "Attendance evidence could not be loaded for scoring.");
  const attendanceBySession = new Map((rows.data ?? []).map((row) => [row.class_session_id, row]));
  return (sessions.data ?? []).map((session) => {
    const attendance = attendanceBySession.get(session.id);
    return { id: attendance?.id ?? `missing:${session.id}`, required: true, cancelled: false, finalized: Boolean(attendance?.finalized_at), status: String(attendance?.attendance_status ?? "pending") };
  });
}

export async function calculateStudentAttendanceScore(supabase: SupabaseClient, studentEnrollmentId: string, scoreCategoryId: string, actor: ResultActor) {
  const context = await loadCategoryContext(supabase, studentEnrollmentId, scoreCategoryId);
  if (context.category.calculation_source !== "attendance") invalid("This category does not use attendance evidence.");
  const records = await attendanceRecords(supabase, studentEnrollmentId);
  const mapping = object(context.policy.attendance_credit_mapping) as Record<string, number | null>;
  const calculated = calculateAttendanceComponent({ maximumPoints: Number(context.category.max_points), records, creditMapping: mapping });
  return saveComponentScore(supabase, { studentEnrollmentId, category: context.category, rawPercentage: calculated.rawPercentage, weightedPoints: calculated.weightedPoints, evidenceComplete: calculated.evidenceComplete, calculationStatus: calculated.calculationStatus, details: { source: "attendance", earned_credits: calculated.earnedCredits, eligible_required_sessions: calculated.eligibleCredits, unresolved_attendance_record_ids: calculated.unresolvedRecordIds }, actor });
}

async function calculateReviewCategory(supabase: SupabaseClient, context: Awaited<ReturnType<typeof loadCategoryContext>>, actor: ResultActor) {
  const evaluation = await supabase.from("student_engagement_component_evaluations").select("*").eq("student_enrollment_id", String(context.enrollment.id)).eq("score_category_id", String(context.category.id)).maybeSingle();
  queryFailed(evaluation.error, "Engagement evaluation could not be loaded.");
  const approved = evaluation.data?.evaluation_status === "approved" && evaluation.data.awarded_points !== null;
  const points = approved ? Number(evaluation.data?.awarded_points) : null;
  return saveComponentScore(supabase, { studentEnrollmentId: String(context.enrollment.id), category: context.category, rawPercentage: points === null ? null : round(points / Number(context.category.max_points) * 100), weightedPoints: points, evidenceComplete: approved, calculationStatus: approved ? "calculated" : "review_required", details: { source: "approved_engagement_evaluation", evaluation_id: evaluation.data?.id ?? null, evaluation_status: evaluation.data?.evaluation_status ?? "pending", evidence_summary: evaluation.data?.evidence_summary ?? null }, actor });
}

export async function calculateStudentCategoryScore(supabase: SupabaseClient, studentEnrollmentId: string, scoreCategoryId: string, actor: ResultActor) {
  const context = await loadCategoryContext(supabase, studentEnrollmentId, scoreCategoryId);
  if (context.category.calculation_source === "attendance") return calculateStudentAttendanceScore(supabase, studentEnrollmentId, scoreCategoryId, actor);
  if (context.category.calculation_source === "review") return calculateReviewCategory(supabase, context, actor);
  if (context.category.calculation_source === "assessment") return calculateAssessmentCategory(supabase, context, actor);
  invalid("This category has an unsupported calculation source.", 409);
}

async function engagementSuggestionEvidence(supabase: SupabaseClient, studentEnrollmentId: string) {
  const courseEnrollments = await supabase.from("course_enrollments").select("id").eq("student_enrollment_id", studentEnrollmentId);
  queryFailed(courseEnrollments.error, "Engagement evidence could not be prepared.");
  const ids = (courseEnrollments.data ?? []).map((row) => row.id);
  if (!ids.length) return { participation: {}, timeliness: {}, integrity: {} };
  const now = new Date().toISOString();
  const [attendance, submissions, recordings, makeups, plans, assignmentReviews, quizReviews] = await Promise.all([
    supabase.from("session_attendance").select("engagement_checks_expected, engagement_checks_completed").in("course_enrollment_id", ids).not("finalized_at", "is", null),
    supabase.from("assignment_submissions").select("is_late, submission_status").in("course_enrollment_id", ids),
    supabase.from("recording_learning_assignments").select("assignment_status, due_at").in("course_enrollment_id", ids).in("purpose_code", ["RP", "DR-E"]),
    supabase.from("makeup_requirements").select("makeup_status, due_at").in("course_enrollment_id", ids),
    supabase.from("student_recovery_plans").select("id, plan_status").eq("student_enrollment_id", studentEnrollmentId),
    supabase.from("assignment_submissions").select("id").in("course_enrollment_id", ids).eq("submission_status", "under_integrity_review"),
    supabase.from("quiz_attempts").select("id").in("course_enrollment_id", ids).eq("integrity_status", "under_review").eq("official_result_eligible", true),
  ]);
  [attendance, submissions, recordings, makeups, plans, assignmentReviews, quizReviews].forEach((result) => queryFailed(result.error, "Engagement evidence could not be prepared."));
  const expected = (attendance.data ?? []).reduce((sum, row) => sum + Number(row.engagement_checks_expected ?? 0), 0);
  const completed = (attendance.data ?? []).reduce((sum, row) => sum + Number(row.engagement_checks_completed ?? 0), 0);
  const late = (submissions.data ?? []).filter((row) => row.is_late).length;
  const overdueRecordings = (recordings.data ?? []).filter((row) => row.assignment_status !== "completed" && row.due_at && row.due_at < now).length;
  const overdueMakeups = (makeups.data ?? []).filter((row) => !["completed", "late_complete", "waived"].includes(row.makeup_status) && row.due_at && row.due_at < now).length;
  return {
    participation: { checks_expected: expected, checks_completed: completed },
    timeliness: { late_assignments: late, overdue_recordings: overdueRecordings, overdue_makeups: overdueMakeups, recovery_plans: plans.data ?? [] },
    integrity: { assignment_reviews: assignmentReviews.data?.length ?? 0, quiz_reviews: quizReviews.data?.length ?? 0 },
  };
}

export async function initialiseEngagementEvaluations(supabase: SupabaseClient, studentEnrollmentId: string, actor: ResultActor) {
  const { policy } = await loadEnrollmentPolicy(supabase, studentEnrollmentId);
  const categories = await supabase.from("programme_score_categories").select("*").eq("scoring_policy_id", String(policy.id)).eq("score_domain", "engagement").eq("calculation_source", "review").eq("active", true);
  queryFailed(categories.error, "Engagement categories could not be loaded.");
  const evidence = await engagementSuggestionEvidence(supabase, studentEnrollmentId);
  const rows = (categories.data ?? []).map((category) => {
    const max = Number(category.max_points);
    let suggested: number | null = null;
    let snapshot: Row = {};
    if (category.category_code === "participation") {
      snapshot = evidence.participation;
      const expected = Number(snapshot.checks_expected ?? 0);
      suggested = expected > 0 ? round(Number(snapshot.checks_completed ?? 0) / expected * max) : null;
    } else if (category.category_code === "timeliness_recovery") {
      snapshot = evidence.timeliness;
      suggested = Math.max(0, round(max - Number(snapshot.late_assignments ?? 0) * 0.1 - Number(snapshot.overdue_recordings ?? 0) * 0.25 - Number(snapshot.overdue_makeups ?? 0) * 0.25));
    } else snapshot = evidence.integrity;
    return { student_enrollment_id: studentEnrollmentId, score_category_id: category.id, suggested_points: suggested, evaluation_status: "pending", evidence_snapshot: { ...snapshot, suggestion_generated_by: actorReference(actor) }, updated_at: new Date().toISOString() };
  });
  if (rows.length) {
    const saved = await supabase.from("student_engagement_component_evaluations").upsert(rows, { onConflict: "student_enrollment_id,score_category_id", ignoreDuplicates: true });
    queryFailed(saved.error, "Engagement evaluation records could not be prepared. Please contact a REALMS administrator.");
  }
  return rows.length;
}

export async function updateEngagementEvaluation(supabase: SupabaseClient, evaluationId: string, body: Row, actor: ResultActor) {
  const action = requiredText(body.action, "Choose an engagement review action.", 1, 20);
  const reviewer = requiredText(body.reviewer_name ?? actor.actorLabel, "Record the reviewer's identity.", 3, 200);
  const current = await supabase.from("student_engagement_component_evaluations").select("*, programme_score_categories(max_points, category_code)").eq("id", evaluationId).maybeSingle();
  queryFailed(current.error, "Engagement evaluation could not be loaded.");
  if (!current.data) invalid("Engagement evaluation not found.", 404);
  const category = relation(current.data.programme_score_categories);
  const now = new Date().toISOString();
  let values: Row;
  let auditAction: "engagement_component_evaluated" | "engagement_component_moderated";
  if (action === "evaluate") {
    const evidenceSummary = requiredText(body.evidence_summary, "Provide a concise evidence summary before awarding engagement points.", 20, 5000);
    const points = numeric(body.awarded_points, "Awarded points must be within the category maximum.", 0, Number(category.max_points));
    values = { awarded_points: points, evidence_summary: evidenceSummary, evaluation_status: "evaluated", evaluated_at: now, evaluated_by: reviewer, updated_at: now };
    auditAction = "engagement_component_evaluated";
  } else if (action === "moderate") {
    if (current.data.evaluation_status !== "evaluated") invalid("Only an evaluated component can be moderated.", 409);
    if (current.data.evaluated_by === reviewer) invalid("The evaluator and moderator must be different reviewers.", 409);
    values = { awarded_points: numeric(body.awarded_points ?? current.data.awarded_points, "Awarded points must be within the category maximum.", 0, Number(category.max_points)), evaluation_status: "moderated", moderated_at: now, moderated_by: reviewer, moderation_note: requiredText(body.moderation_note, "Record the moderation evidence and reason.", 20, 5000), updated_at: now };
    auditAction = "engagement_component_moderated";
  } else if (action === "approve") {
    if (current.data.evaluation_status !== "moderated") invalid("Only a moderated component can be approved.", 409);
    if ([current.data.evaluated_by, current.data.moderated_by].includes(reviewer)) invalid("The approver must be different from the evaluator and moderator.", 409);
    values = { evaluation_status: "approved", approved_at: now, approved_by: reviewer, updated_at: now };
    auditAction = "engagement_component_moderated";
  } else invalid("Choose evaluate, moderate, or approve.");
  const saved = await supabase.from("student_engagement_component_evaluations").update(values).eq("id", evaluationId).select("*").single();
  queryFailed(saved.error, "Engagement evaluation could not be saved. Please contact a REALMS administrator.");
  await recordLmsAudit(supabase, { action: auditAction, entityType: "engagement_component_evaluation", entityId: evaluationId, actorUserId: actor.actorUserId, metadata: { review_action: action, reviewer, category_code: category.category_code, points_before: current.data.awarded_points, points_after: saved.data.awarded_points } });
  return saved.data;
}

export async function saveCapstoneDefence(supabase: SupabaseClient, body: Row, actor: ResultActor) {
  const studentEnrollmentId = requiredText(body.student_enrollment_id, "Choose a student enrolment.", 1, 80);
  const assignmentId = requiredText(body.capstone_assignment_id, "Choose a capstone assignment.", 1, 80);
  const submissionId = text(body.assignment_submission_id);
  const defenceStatus = requiredText(body.defence_status, "Choose a defence status.", 1, 40);
  const outcome = text(body.defence_outcome);
  if (!defenceStatuses.includes(defenceStatus as never)) invalid("Choose a valid defence status.");
  if (outcome && !defenceOutcomes.includes(outcome as never)) invalid("Choose a valid defence outcome.");
  if (outcome && defenceStatus !== "completed") invalid("A defence outcome can be recorded only after completion.");
  if (defenceStatus === "completed" && !outcome) invalid("A completed defence must record the panel outcome.");
  const { enrollment } = await loadEnrollmentPolicy(supabase, studentEnrollmentId);
  const assignment = await assessmentRecord(supabase, "assignment", assignmentId);
  if (!assignment || assignment.assessment_category !== "capstone" || assignment.assessment_domain !== "skill") invalid("Choose a skill capstone assignment.");
  if (!compatibleCourse(relation(relation(assignment.cohort_courses).courses), enrollment)) invalid("The capstone assignment must match the student's skill pathway.");
  if (submissionId) {
    const submission = await supabase.from("assignment_submissions").select("id, assignment_id, submission_status, review_outcome, course_enrollments(student_enrollment_id)").eq("id", submissionId).maybeSingle();
    queryFailed(submission.error, "Accepted capstone submission could not be loaded.");
    const courseEnrollment = relation(submission.data?.course_enrollments);
    if (!submission.data || submission.data.assignment_id !== assignmentId || courseEnrollment.student_enrollment_id !== studentEnrollmentId || submission.data.submission_status !== "graded" || submission.data.review_outcome !== "accepted") invalid("Choose an accepted graded submission for this student's capstone.");
  }
  if (defenceStatus === "completed" && !submissionId) invalid("A completed defence must reference the accepted capstone submission.");
  const scheduledAt = timestamp(body.scheduled_at);
  if (["scheduled", "completed"].includes(defenceStatus) && !scheduledAt) invalid("Record the scheduled defence date and time.");
  const panelText = text(body.panel_members);
  const panel = Array.isArray(body.panel_members) ? body.panel_members.map(String).filter(Boolean) : panelText ? panelText.split(",").map((item) => item.trim()).filter(Boolean) : [];
  if (["scheduled", "completed"].includes(defenceStatus) && !panel.length) invalid("Record the defence panel members.");
  const values = { student_enrollment_id: studentEnrollmentId, capstone_assignment_id: assignmentId, assignment_submission_id: submissionId, scheduled_at: scheduledAt, completed_at: defenceStatus === "completed" ? timestamp(body.completed_at) ?? new Date().toISOString() : null, defence_status: defenceStatus, defence_outcome: outcome, panel_members: panel, defence_note: defenceStatus === "completed" ? requiredText(body.defence_note, "Record an academic note for the completed defence.", 15, 5000) : text(body.defence_note), recorded_by: actorReference(actor), updated_at: new Date().toISOString() };
  const saved = await supabase.from("capstone_defences").upsert(values, { onConflict: "student_enrollment_id,capstone_assignment_id" }).select("*").single();
  queryFailed(saved.error, "Capstone defence could not be saved. Please contact a REALMS administrator.");
  await recordLmsAudit(supabase, { action: defenceStatus === "completed" ? "capstone_defence_completed" : "capstone_defence_scheduled", entityType: "capstone_defence", entityId: String(saved.data.id), actorUserId: actor.actorUserId, metadata: { student_enrollment_id: studentEnrollmentId, capstone_assignment_id: assignmentId, defence_status: defenceStatus, defence_outcome: outcome } });
  return saved.data;
}

async function categoryCompletion(supabase: SupabaseClient, enrollment: Row, policyId: string, categoryCode: string) {
  const category = await supabase.from("programme_score_categories").select("id").eq("scoring_policy_id", policyId).eq("category_code", categoryCode).eq("active", true).maybeSingle();
  if (category.error || !category.data) return { status: "pending" as GraduationRequirementStatus, summary: "Required score category is not configured.", evidence: {} };
  const weightings = await supabase.from("assessment_weightings").select("*").eq("score_category_id", category.data.id).eq("active", true).eq("counts_toward_result", true);
  if (weightings.error) return { status: "under_review" as GraduationRequirementStatus, summary: "Assessment mappings could not be reviewed.", evidence: {} };
  let review = false;
  for (const weighting of weightings.data ?? []) {
    const assessment = await assessmentRecord(supabase, weighting.assessment_type, weighting.assessment_id);
    if (!assessment || !compatibleCourse(relation(relation(assessment.cohort_courses).courses), enrollment)) continue;
    const attempts = await loadAttempts(supabase, assessment, enrollment);
    if (attempts.some((attempt) => attempt.status === "graded" && attempt.scorePercentage !== null && attempt.accepted !== false)) return { status: "met" as GraduationRequirementStatus, summary: `${assessment.title} has accepted graded evidence.`, evidence: { assessment_type: weighting.assessment_type, assessment_id: assessment.id } };
    if (attempts.some((attempt) => ["awaiting_review", "under_integrity_review", "integrity_review"].includes(attempt.status))) review = true;
  }
  return review ? { status: "under_review" as GraduationRequirementStatus, summary: "Required assessment evidence is under review.", evidence: {} } : { status: "not_met" as GraduationRequirementStatus, summary: "Required accepted assessment evidence is outstanding.", evidence: {} };
}

async function attendanceCompliance(supabase: SupabaseClient, enrollment: Row) {
  const [attendancePolicy, records, exceptional] = await Promise.all([
    supabase.from("cohort_attendance_policies").select("max_unapproved_absence_units").eq("cohort_id", String(enrollment.cohort_id)).eq("policy_status", "active").maybeSingle(),
    attendanceRecords(supabase, String(enrollment.id)),
    supabase.from("student_status_review_cases").select("id, case_status, decision_outcome, evidence_summary").eq("student_enrollment_id", String(enrollment.id)).eq("case_status", "closed").eq("decision_outcome", "exceptional_approval").not("evidence_summary", "is", null).limit(1),
  ]);
  if (attendancePolicy.error || !attendancePolicy.data) return { status: "under_review" as GraduationRequirementStatus, summary: "Attendance policy is not available for final evaluation.", evidence: {} };
  const unresolved = records.filter((record) => !record.finalized || ["pending", "not_verified", "pending_recorded_verification"].includes(record.status));
  if (unresolved.length) return { status: "under_review" as GraduationRequirementStatus, summary: `${unresolved.length} required attendance record(s) remain unresolved.`, evidence: { unresolved_count: unresolved.length } };
  const courseIds = await supabase.from("course_enrollments").select("id").eq("student_enrollment_id", String(enrollment.id));
  const ids = (courseIds.data ?? []).map((row) => row.id);
  const absenceRows = ids.length ? await supabase.from("session_attendance").select("absence_weight, finalized_at").in("course_enrollment_id", ids).not("finalized_at", "is", null) : { data: [], error: null };
  const units = (absenceRows.data ?? []).reduce((sum, row) => sum + Number(row.absence_weight ?? 0), 0);
  const limit = Number(attendancePolicy.data.max_unapproved_absence_units);
  if (units <= limit) return { status: "met" as GraduationRequirementStatus, summary: `${round(units)} attendance units used against the published ${limit}-unit limit.`, evidence: { attendance_units: round(units), published_limit: limit } };
  if (!exceptional.error && exceptional.data?.length) return { status: "met" as GraduationRequirementStatus, summary: "Published threshold exceeded; a documented authorised exceptional decision permits continued eligibility.", evidence: { attendance_units: round(units), published_limit: limit, exception_case_id: exceptional.data[0].id } };
  return { status: "not_met" as GraduationRequirementStatus, summary: `${round(units)} attendance units exceed the published ${limit}-unit limit and no documented exception is approved.`, evidence: { attendance_units: round(units), published_limit: limit } };
}

async function catchupCompliance(supabase: SupabaseClient, enrollment: Row) {
  const courses = await supabase.from("course_enrollments").select("id").eq("student_enrollment_id", String(enrollment.id));
  const ids = (courses.data ?? []).map((row) => row.id);
  if (!ids.length) return { status: "pending" as GraduationRequirementStatus, summary: "Course enrolment evidence is not available.", evidence: {} };
  const [makeups, recordings, recoveryPlans] = await Promise.all([
    supabase.from("makeup_requirements").select("id, makeup_status").in("course_enrollment_id", ids),
    supabase.from("recording_learning_assignments").select("id, purpose_code, assignment_status").in("course_enrollment_id", ids).in("purpose_code", ["RP", "DR-E"]),
    supabase.from("student_recovery_plans").select("id, plan_status, recovery_plan_actions(id, action_status)").eq("student_enrollment_id", String(enrollment.id)).in("plan_status", ["active", "completed", "closed"]),
  ]);
  if (makeups.error || recordings.error || recoveryPlans.error) return { status: "under_review" as GraduationRequirementStatus, summary: "Catch-up evidence could not be fully evaluated.", evidence: {} };
  const outstandingMakeups = (makeups.data ?? []).filter((row) => !["completed", "late_complete", "waived"].includes(row.makeup_status));
  const outstandingRecordings = (recordings.data ?? []).filter((row) => row.assignment_status !== "completed");
  const actions = (recoveryPlans.data ?? []).flatMap((plan) => plan.recovery_plan_actions ?? []);
  const outstandingActions = actions.filter((action) => !["completed", "verified", "waived"].includes(action.action_status));
  const outstanding = outstandingMakeups.length + outstandingRecordings.length + outstandingActions.length;
  return outstanding ? { status: "not_met" as GraduationRequirementStatus, summary: `${outstanding} required catch-up or recovery action(s) remain outstanding.`, evidence: { makeup_count: outstandingMakeups.length, recorded_count: outstandingRecordings.length, recovery_action_count: outstandingActions.length } } : { status: "met" as GraduationRequirementStatus, summary: "Required make-up, recorded-primary, recorded-exception, and recovery actions are complete or formally waived.", evidence: { revision_only_excluded: true } };
}

async function integrityCompliance(supabase: SupabaseClient, enrollment: Row) {
  const courses = await supabase.from("course_enrollments").select("id").eq("student_enrollment_id", String(enrollment.id));
  const ids = (courses.data ?? []).map((row) => row.id);
  const recordings = ids.length ? await supabase.from("recording_learning_assignments").select("id, recording_progress(integrity_status)").in("course_enrollment_id", ids) : { data: [], error: null };
  const [assignmentReviews, quizReviews, cases] = await Promise.all([
    ids.length ? supabase.from("assignment_submissions").select("id").in("course_enrollment_id", ids).eq("submission_status", "under_integrity_review") : Promise.resolve({ data: [], error: null }),
    ids.length ? supabase.from("quiz_attempts").select("id").in("course_enrollment_id", ids).eq("integrity_status", "under_review").eq("official_result_eligible", true) : Promise.resolve({ data: [], error: null }),
    supabase.from("student_status_review_cases").select("id, case_title, concern_summary, case_status").eq("student_enrollment_id", String(enrollment.id)).neq("case_status", "closed"),
  ]);
  if (recordings.error || assignmentReviews.error || quizReviews.error || cases.error) return { status: "under_review" as GraduationRequirementStatus, summary: "Integrity and conduct records could not be fully evaluated.", evidence: {} };
  const recordingReviews = (recordings.data ?? []).filter((row) => relation(row.recording_progress).integrity_status && relation(row.recording_progress).integrity_status !== "clear");
  const seriousCases = (cases.data ?? []).filter((row) => `${row.case_title ?? ""} ${row.concern_summary ?? ""}`.toLowerCase().match(/integrity|conduct|identity|plagiarism|dishonest/));
  const total = recordingReviews.length + (assignmentReviews.data?.length ?? 0) + (quizReviews.data?.length ?? 0) + seriousCases.length;
  return total ? { status: "under_review" as GraduationRequirementStatus, summary: `${total} integrity or serious-conduct record(s) require institutional resolution. This status is not a finding of guilt.`, evidence: { recording_reviews: recordingReviews.length, assessment_reviews: (assignmentReviews.data?.length ?? 0) + (quizReviews.data?.length ?? 0), serious_case_reviews: seriousCases.length } } : { status: "met" as GraduationRequirementStatus, summary: "No unresolved serious integrity or conduct review was found in current records.", evidence: {} };
}

export async function evaluateStudentGraduationRequirements(supabase: SupabaseClient, studentEnrollmentId: string, actor: ResultActor) {
  const { enrollment, policy } = await loadEnrollmentPolicy(supabase, studentEnrollmentId);
  const [definitions, scores, defence] = await Promise.all([
    supabase.from("graduation_requirement_definitions").select("*").eq("scoring_policy_id", String(policy.id)).eq("active", true).order("sequence_number"),
    supabase.from("student_component_scores").select("weighted_points, moderated_points, programme_score_categories(score_domain)").eq("student_enrollment_id", studentEnrollmentId),
    supabase.from("capstone_defences").select("id, defence_status, defence_outcome").eq("student_enrollment_id", studentEnrollmentId).eq("defence_status", "completed").eq("defence_outcome", "passed").limit(1),
  ]);
  queryFailed(definitions.error, "Graduation requirements could not be loaded.");
  queryFailed(scores.error, "Current component scores could not be loaded.");
  const totals = { discipleship: 0, skill: 0, engagement: 0 };
  for (const score of scores.data ?? []) {
    const domain = String(relation(score.programme_score_categories).score_domain) as keyof typeof totals;
    if (domain in totals) totals[domain] += Number(score.moderated_points ?? score.weighted_points ?? 0);
  }
  const total = round(totals.discipleship + totals.skill + totals.engagement);
  const existing = await supabase.from("student_graduation_requirements").select("*").eq("student_enrollment_id", studentEnrollmentId);
  queryFailed(existing.error, "Existing graduation tracker could not be loaded.");
  const existingByDefinition = new Map((existing.data ?? []).map((row) => [row.requirement_definition_id, row]));
  const evaluated: Row[] = [];
  for (const definition of definitions.data ?? []) {
    const prior = existingByDefinition.get(definition.id);
    if (prior?.manually_overridden) { evaluated.push(prior); continue; }
    let assessment: { status: GraduationRequirementStatus; summary: string; evidence: Row; current?: number | null; required?: number | null };
    if (definition.requirement_code === "overall_result") assessment = { status: total >= Number(definition.threshold_value) ? "met" : "not_met", summary: `${total} of ${definition.threshold_value} required points.`, evidence: {}, current: total, required: Number(definition.threshold_value) };
    else if (definition.requirement_code === "discipleship_result") assessment = { status: totals.discipleship >= Number(definition.threshold_value) ? "met" : "not_met", summary: `${round(totals.discipleship)} of ${definition.threshold_value} required discipleship points.`, evidence: {}, current: round(totals.discipleship), required: Number(definition.threshold_value) };
    else if (definition.requirement_code === "skill_result") assessment = { status: totals.skill >= Number(definition.threshold_value) ? "met" : "not_met", summary: `${round(totals.skill)} of ${definition.threshold_value} required skill points.`, evidence: {}, current: round(totals.skill), required: Number(definition.threshold_value) };
    else if (definition.requirement_code === "engagement_result") assessment = { status: totals.engagement >= Number(definition.threshold_value) ? "met" : "not_met", summary: `${round(totals.engagement)} of ${definition.threshold_value} required engagement points.`, evidence: {}, current: round(totals.engagement), required: Number(definition.threshold_value) };
    else if (definition.requirement_code === "capstone_submission") assessment = await categoryCompletion(supabase, enrollment, String(policy.id), "capstone");
    else if (definition.requirement_code === "capstone_defence") assessment = defence.data?.length ? { status: "met", summary: "Capstone defence completed with a passed outcome.", evidence: { capstone_defence_id: defence.data[0].id } } : { status: "not_met", summary: "A scheduled defence alone does not satisfy this requirement; a completed passed outcome is required.", evidence: {} };
    else if (definition.requirement_code === "final_discipleship_assessment") assessment = await categoryCompletion(supabase, enrollment, String(policy.id), "final_route_assessment");
    else if (definition.requirement_code === "attendance_compliance") assessment = await attendanceCompliance(supabase, enrollment);
    else if (definition.requirement_code === "catchup_requirements") assessment = await catchupCompliance(supabase, enrollment);
    else if (definition.requirement_code === "integrity_and_conduct") assessment = await integrityCompliance(supabase, enrollment);
    else assessment = { status: "pending", summary: "This requirement needs an evaluator.", evidence: {} };
    const values = { student_enrollment_id: studentEnrollmentId, requirement_definition_id: definition.id, requirement_status: assessment.status, current_value: assessment.current ?? null, required_value: assessment.required ?? definition.threshold_value ?? null, evidence_summary: assessment.summary, evidence_snapshot: assessment.evidence, evaluated_at: new Date().toISOString(), evaluated_by: actorReference(actor), manually_overridden: false, override_reason: null, override_by: null, updated_at: new Date().toISOString() };
    const saved = await supabase.from("student_graduation_requirements").upsert(values, { onConflict: "student_enrollment_id,requirement_definition_id" }).select("*").single();
    queryFailed(saved.error, "Completion tracker could not be saved. Please contact a REALMS administrator.");
    evaluated.push(saved.data);
  }
  await recordLmsAudit(supabase, { action: "graduation_requirements_evaluated", entityType: "student_enrollment", entityId: studentEnrollmentId, actorUserId: actor.actorUserId, metadata: { requirement_count: evaluated.length, met_count: evaluated.filter((row) => ["met", "waived", "not_applicable"].includes(String(row.requirement_status))).length } });
  return evaluated;
}

export async function overrideGraduationRequirement(supabase: SupabaseClient, requirementId: string, body: Row, actor: ResultActor) {
  const status = requiredText(body.requirement_status, "Choose an override status.", 1, 30);
  if (!graduationRequirementStatuses.includes(status as GraduationRequirementStatus) || status === "pending") invalid("Choose a valid resolved override status.");
  const reason = requiredText(body.reason, "A documented override reason is required.", 20, 5000);
  const reviewer = requiredText(body.reviewer_name ?? actor.actorLabel, "Record the authorised reviewer's identity.", 3, 200);
  const current = await supabase.from("student_graduation_requirements").select("*, graduation_requirement_definitions(requirement_type, requirement_code)").eq("id", requirementId).maybeSingle();
  queryFailed(current.error, "Graduation requirement could not be loaded.");
  if (!current.data) invalid("Graduation requirement not found.", 404);
  const definition = relation(current.data.graduation_requirement_definitions);
  if (definition.requirement_type === "score" && ["met", "waived", "not_applicable"].includes(status)) invalid("Minimum score gates cannot be manually satisfied or waived; correct the underlying approved score evidence instead.", 409);
  const next = { requirement_status: status, manually_overridden: true, override_reason: reason, override_by: reviewer, updated_at: new Date().toISOString() };
  const saved = await supabase.from("student_graduation_requirements").update(next).eq("id", requirementId).select("*").single();
  queryFailed(saved.error, "Graduation requirement override could not be saved.");
  const event = await supabase.from("graduation_requirement_events").insert({ student_graduation_requirement_id: requirementId, event_type: "manual_override", previous_state: current.data, new_state: saved.data, reason, changed_by: reviewer });
  queryFailed(event.error, "Graduation requirement history could not be saved.");
  await recordLmsAudit(supabase, { action: "graduation_requirement_overridden", entityType: "student_graduation_requirement", entityId: requirementId, actorUserId: actor.actorUserId, metadata: { previous_status: current.data.requirement_status, next_status: status, reviewer } });
  return saved.data;
}

function materialSnapshot(snapshot: Row) { const material = { ...snapshot }; delete material.calculated_at; delete material.calculation_version; return JSON.stringify(material); }

export async function calculateStudentProgrammeResult(supabase: SupabaseClient, studentEnrollmentId: string, actor: ResultActor) {
  const { enrollment, policy } = await loadEnrollmentPolicy(supabase, studentEnrollmentId);
  const categories = await supabase.from("programme_score_categories").select("*").eq("scoring_policy_id", String(policy.id)).eq("active", true).order("sequence_number");
  queryFailed(categories.error, "Programme score categories could not be loaded.");
  const components: Row[] = [];
  for (const category of categories.data ?? []) components.push(object(await calculateStudentCategoryScore(supabase, studentEnrollmentId, category.id, actor)));
  const requirements = await evaluateStudentGraduationRequirements(supabase, studentEnrollmentId, actor);
  const sums = { discipleship: 0, skill: 0, engagement: 0 };
  for (const component of components) {
    const category = (categories.data ?? []).find((row) => row.id === component.score_category_id);
    const domain = String(category?.score_domain) as keyof typeof sums;
    if (domain in sums) sums[domain] += Number(component.moderated_points ?? component.weighted_points ?? 0);
  }
  sums.discipleship = round(sums.discipleship); sums.skill = round(sums.skill); sums.engagement = round(sums.engagement);
  const total = round(sums.discipleship + sums.skill + sums.engagement);
  const evidenceComplete = components.every((component) => component.evidence_complete === true);
  const requirementByCode = new Map((requirements as Row[]).map((row) => { const definition = (categories.data ?? []); void definition; return [String(row.requirement_definition_id), row]; }));
  void requirementByCode;
  const definitions = await supabase.from("graduation_requirement_definitions").select("id, requirement_code, mandatory").eq("scoring_policy_id", String(policy.id)).eq("active", true);
  queryFailed(definitions.error, "Graduation requirement definitions could not be loaded.");
  const requirementsWithCodes = (definitions.data ?? []).map((definition) => ({ ...definition, tracker: (requirements as Row[]).find((row) => row.requirement_definition_id === definition.id) }));
  const eligibility = evaluateProgrammeEligibility({ totalPoints: total, discipleshipPoints: sums.discipleship, skillPoints: sums.skill, engagementPoints: sums.engagement, overallMinimum: Number(policy.overall_pass_points), discipleshipMinimum: Number(policy.discipleship_gate_points), skillMinimum: Number(policy.skill_gate_points), engagementMinimum: Number(policy.engagement_gate_points), evidenceComplete, requirements: requirementsWithCodes.map((item) => ({ mandatory: Boolean(item.mandatory), status: String(item.tracker?.requirement_status ?? "pending") as GraduationRequirementStatus })) });
  const status = !evidenceComplete || eligibility.outcome === "under_review" ? "review_required" : "calculated";
  const snapshot: Row = { policy: { id: policy.id, cohort_id: policy.cohort_id, discipleship_max_points: policy.discipleship_max_points, skill_max_points: policy.skill_max_points, engagement_max_points: policy.engagement_max_points, overall_pass_points: policy.overall_pass_points, discipleship_gate_points: policy.discipleship_gate_points, skill_gate_points: policy.skill_gate_points, engagement_gate_points: policy.engagement_gate_points }, student_route: enrollment.discipleship_route, skill_pathway: enrollment.skill_pathway, components: components.map((component) => { const category = (categories.data ?? []).find((row) => row.id === component.score_category_id); return { category_code: category?.category_code, category_name: category?.category_name, score_domain: category?.score_domain, weighted_points: component.weighted_points, moderated_points: component.moderated_points, maximum_points: component.maximum_points, evidence_complete: component.evidence_complete, calculation_status: component.calculation_status }; }), requirements: requirementsWithCodes.map((item) => ({ requirement_code: item.requirement_code, requirement_status: item.tracker?.requirement_status, current_value: item.tracker?.current_value, required_value: item.tracker?.required_value })), calculated_at: new Date().toISOString() };
  const existing = await supabase.from("student_programme_results").select("*").eq("student_enrollment_id", studentEnrollmentId).eq("scoring_policy_id", String(policy.id)).maybeSingle();
  queryFailed(existing.error, "Existing programme result could not be loaded.");
  if (existing.data && ["approved", "published"].includes(existing.data.result_status)) invalid("Approved or published results require the controlled correction workflow.", 409);
  const changed = !existing.data || materialSnapshot(object(existing.data.result_snapshot)) !== materialSnapshot(snapshot);
  const version = existing.data ? Number(existing.data.calculation_version) + (changed ? 1 : 0) : 1;
  const gates = Object.fromEntries(requirementsWithCodes.map((item) => [item.requirement_code, ["met", "waived", "not_applicable"].includes(String(item.tracker?.requirement_status))]));
  const values = { student_enrollment_id: studentEnrollmentId, scoring_policy_id: policy.id, discipleship_points: sums.discipleship, skill_points: sums.skill, engagement_points: sums.engagement, total_points: total, discipleship_gate_met: eligibility.scoreGates.discipleship, skill_gate_met: eligibility.scoreGates.skill, engagement_gate_met: eligibility.scoreGates.engagement, overall_score_gate_met: eligibility.scoreGates.overall, capstone_gate_met: Boolean(gates.capstone_submission), capstone_defence_gate_met: Boolean(gates.capstone_defence), final_discipleship_assessment_gate_met: Boolean(gates.final_discipleship_assessment), attendance_compliance_gate_met: Boolean(gates.attendance_compliance), catchup_requirements_gate_met: Boolean(gates.catchup_requirements), integrity_conduct_gate_met: Boolean(gates.integrity_and_conduct), all_graduation_gates_met: eligibility.allGatesMet, result_outcome: eligibility.outcome, result_status: status, calculation_version: version, calculated_at: new Date().toISOString(), calculated_by: actorReference(actor), result_snapshot: { ...snapshot, calculation_version: version }, updated_at: new Date().toISOString() };
  let saved;
  if (existing.data) {
    if (!changed) return existing.data;
    const event = await supabase.from("programme_result_change_events").insert({ student_programme_result_id: existing.data.id, event_type: "recalculation", previous_state: existing.data, new_state: values, reason: "Academic evidence or configured scoring data changed.", changed_by: actorReference(actor) });
    queryFailed(event.error, "Previous programme result state could not be preserved.");
    saved = await supabase.from("student_programme_results").update(values).eq("id", existing.data.id).select("*").single();
  } else saved = await supabase.from("student_programme_results").insert(values).select("*").single();
  queryFailed(saved.error, "Programme result could not be saved. Please contact a REALMS administrator.");
  await recordLmsAudit(supabase, { action: existing.data ? "student_result_recalculated" : "student_result_calculated", entityType: "student_programme_result", entityId: String(saved.data.id), actorUserId: actor.actorUserId, metadata: { student_enrollment_id: studentEnrollmentId, calculation_version: version, result_status: status, result_outcome: eligibility.outcome, material_change: changed } });
  return saved.data;
}

export async function calculateCohortResults(supabase: SupabaseClient, cohortId: string, actor: ResultActor) {
  const enrollments = await supabase.from("student_enrollments").select("id").eq("cohort_id", cohortId).in("enrolment_status", ["active", "enrolled", "completed"]);
  queryFailed(enrollments.error, "Cohort enrolments could not be loaded.");
  const results = [];
  for (const enrollment of enrollments.data ?? []) {
    try { results.push({ studentEnrollmentId: enrollment.id, result: await calculateStudentProgrammeResult(supabase, enrollment.id, actor), error: null }); }
    catch (error) { results.push({ studentEnrollmentId: enrollment.id, result: null, error: error instanceof Error ? error.message : "Calculation failed." }); }
  }
  return results;
}

export async function moderateComponentScore(supabase: SupabaseClient, componentScoreId: string, body: Row, actor: ResultActor) {
  const current = await supabase.from("student_component_scores").select("*").eq("id", componentScoreId).maybeSingle();
  queryFailed(current.error, "Component score could not be loaded.");
  if (!current.data) invalid("Component score not found.", 404);
  const result = await supabase.from("student_programme_results").select("result_status").eq("student_enrollment_id", current.data.student_enrollment_id).maybeSingle();
  queryFailed(result.error, "Programme result state could not be checked before moderation.");
  if (result.data && ["approved", "published"].includes(result.data.result_status)) invalid("Approved or published scores require the controlled correction workflow.", 409);
  return moderateLoadedComponent(supabase, current.data, body, actor);
}

async function moderateLoadedComponent(supabase: SupabaseClient, current: Row, body: Row, actor: ResultActor) {
  const reviewer = requiredText(body.reviewer_name ?? actor.actorLabel, "Record the moderator's identity.", 3, 200);
  if (current.calculated_by === reviewer) invalid("The calculator and moderator must be different reviewers.", 409);
  const points = numeric(body.moderated_points, "Moderated points must be within the category maximum.", 0, Number(current.maximum_points));
  const note = requiredText(body.moderation_note, "Moderation must record evidence and a reason; it is not a route for arbitrary marks.", 20, 5000);
  const saved = await supabase.from("student_component_scores").update({ moderated_points: points, moderation_note: note, moderated_at: new Date().toISOString(), moderated_by: reviewer, updated_at: new Date().toISOString() }).eq("id", String(current.id)).select("*").single();
  queryFailed(saved.error, "Component moderation could not be saved.");
  await recordLmsAudit(supabase, { action: "student_result_moderated", entityType: "student_programme_result", entityId: String(current.student_enrollment_id), actorUserId: actor.actorUserId, metadata: { component_score_id: current.id, points_before: current.weighted_points, points_after: points, moderator: reviewer } });
  return saved.data;
}

export async function withholdProgrammeResult(supabase: SupabaseClient, resultId: string, body: Row, actor: ResultActor) {
  const reason = requiredText(body.reason, "Record a legitimate administrative, academic, or integrity reason for withholding.", 20, 5000);
  const communication = requiredText(body.student_communication, "Record the student-facing communication.", 20, 5000);
  const current = await supabase.from("student_programme_results").select("*").eq("id", resultId).maybeSingle();
  queryFailed(current.error, "Programme result could not be loaded."); if (!current.data) invalid("Programme result not found.", 404);
  const saved = await supabase.from("student_programme_results").update({ result_status: "withheld", result_outcome: "withheld", withheld_reason: reason, updated_at: new Date().toISOString() }).eq("id", resultId).select("*").single();
  queryFailed(saved.error, "Programme result could not be withheld.");
  const event = await supabase.from("programme_result_change_events").insert({ student_programme_result_id: resultId, event_type: "withheld", previous_state: current.data, new_state: saved.data, reason, changed_by: actorReference(actor) });
  queryFailed(event.error, "Result-withholding history could not be saved.");
  await recordLmsAudit(supabase, { action: "student_result_withheld", entityType: "student_programme_result", entityId: resultId, actorUserId: actor.actorUserId, metadata: { student_communication_recorded: Boolean(communication) } });
  return saved.data;
}

export async function correctProgrammeResult(supabase: SupabaseClient, resultId: string, body: Row, actor: ResultActor) {
  const reason = requiredText(body.correction_reason, "Record the correction reason.", 20, 5000);
  const evidence = requiredText(body.evidence, "Record the correction evidence.", 20, 5000);
  const initiator = requiredText(body.initiator, "Record the correction initiator.", 3, 200);
  const approver = requiredText(body.approver, "Record the correction approver.", 3, 200);
  if (initiator === approver) invalid("The correction initiator and approver must be different people.", 409);
  const current = await supabase.from("student_programme_results").select("*").eq("id", resultId).maybeSingle();
  queryFailed(current.error, "Programme result could not be loaded."); if (!current.data) invalid("Programme result not found.", 404);
  if (!["approved", "published", "withheld"].includes(current.data.result_status)) invalid("Use normal recalculation for a result that has not been approved or published.", 409);
  const requestedOutcome = requiredText(body.result_outcome ?? current.data.result_outcome, "Choose the corrected result outcome.", 1, 80);
  if (!resultOutcomes.includes(requestedOutcome as never)) invalid("Choose a supported result outcome.");
  const policy = await supabase.from("programme_scoring_policies").select("discipleship_max_points, skill_max_points, engagement_max_points, overall_pass_points, discipleship_gate_points, skill_gate_points, engagement_gate_points").eq("id", current.data.scoring_policy_id).maybeSingle();
  queryFailed(policy.error, "Scoring policy could not be loaded for correction validation."); if (!policy.data) invalid("Scoring policy not found.", 409);
  const scoreFields = ["discipleship_points", "skill_points", "engagement_points"] as const;
  const maxima = { discipleship_points: Number(policy.data.discipleship_max_points), skill_points: Number(policy.data.skill_max_points), engagement_points: Number(policy.data.engagement_max_points) };
  const nextScores = Object.fromEntries(scoreFields.map((field) => [field, numeric(body[field] ?? current.data[field], `Enter a valid corrected ${field.replaceAll("_", " ")}.`, 0, maxima[field])]));
  const nextTotal = round(Number(nextScores.discipleship_points) + Number(nextScores.skill_points) + Number(nextScores.engagement_points));
  const scoreGates = { overall: nextTotal >= Number(policy.data.overall_pass_points), discipleship: Number(nextScores.discipleship_points) >= Number(policy.data.discipleship_gate_points), skill: Number(nextScores.skill_points) >= Number(policy.data.skill_gate_points), engagement: Number(nextScores.engagement_points) >= Number(policy.data.engagement_gate_points) };
  const otherGates = [current.data.capstone_gate_met, current.data.capstone_defence_gate_met, current.data.final_discipleship_assessment_gate_met, current.data.attendance_compliance_gate_met, current.data.catchup_requirements_gate_met, current.data.integrity_conduct_gate_met].every(Boolean);
  const allGatesMet = Object.values(scoreGates).every(Boolean) && otherGates;
  const nextOutcome = allGatesMet ? "eligible_for_completion" : "not_yet_eligible";
  if (requestedOutcome !== nextOutcome && !["withheld", "under_review", "deferred_result", "resit_required", "failed"].includes(requestedOutcome)) invalid(`The corrected scores and current gates require the outcome ${nextOutcome}.`, 409);
  const finalOutcome = ["withheld", "under_review", "deferred_result", "resit_required", "failed"].includes(requestedOutcome) ? requestedOutcome : nextOutcome;
  const next = { ...nextScores, total_points: nextTotal, discipleship_gate_met: scoreGates.discipleship, skill_gate_met: scoreGates.skill, engagement_gate_met: scoreGates.engagement, overall_score_gate_met: scoreGates.overall, all_graduation_gates_met: allGatesMet, result_outcome: finalOutcome, result_status: "corrected", calculation_version: Number(current.data.calculation_version) + 1, approved_at: null, approved_by: null, published_at: null, updated_at: new Date().toISOString(), result_snapshot: { ...object(current.data.result_snapshot), corrected_scores: nextScores, corrected_total: nextTotal, corrected_outcome: finalOutcome, correction_evidence_summary: evidence, calculation_version: Number(current.data.calculation_version) + 1 } };
  const event = await supabase.from("programme_result_change_events").insert({ student_programme_result_id: resultId, event_type: "approved_correction", previous_state: current.data, new_state: next, reason, changed_by: initiator, approved_by: approver });
  queryFailed(event.error, "Original result snapshot could not be preserved.");
  const saved = await supabase.from("student_programme_results").update(next).eq("id", resultId).select("*").single();
  queryFailed(saved.error, "Corrected result could not be saved.");
  const definitions = await supabase.from("graduation_requirement_definitions").select("id, requirement_code, threshold_value").eq("scoring_policy_id", current.data.scoring_policy_id).eq("requirement_type", "score").eq("active", true);
  queryFailed(definitions.error, "Corrected score gates could not be loaded.");
  const scoreValues: Record<string, number> = { overall_result: nextTotal, discipleship_result: Number(nextScores.discipleship_points), skill_result: Number(nextScores.skill_points), engagement_result: Number(nextScores.engagement_points) };
  for (const definition of definitions.data ?? []) {
    const tracker = await supabase.from("student_graduation_requirements").select("*").eq("student_enrollment_id", current.data.student_enrollment_id).eq("requirement_definition_id", definition.id).maybeSingle();
    queryFailed(tracker.error, "Corrected score gate could not be loaded.");
    if (!tracker.data) continue;
    const currentValue = scoreValues[definition.requirement_code]; const requiredValue = Number(definition.threshold_value); const trackerNext = { requirement_status: currentValue >= requiredValue ? "met" : "not_met", current_value: currentValue, required_value: requiredValue, evidence_summary: `${currentValue} of ${requiredValue} required points after approved correction.`, evidence_snapshot: { correction_result_id: resultId }, evaluated_at: new Date().toISOString(), evaluated_by: approver, manually_overridden: false, override_reason: null, override_by: null, updated_at: new Date().toISOString() };
    const trackerSaved = await supabase.from("student_graduation_requirements").update(trackerNext).eq("id", tracker.data.id).select("*").single();
    queryFailed(trackerSaved.error, "Corrected score gate could not be saved.");
    const trackerEvent = await supabase.from("graduation_requirement_events").insert({ student_graduation_requirement_id: tracker.data.id, event_type: "approved_result_correction", previous_state: tracker.data, new_state: trackerSaved.data, reason, changed_by: initiator });
    queryFailed(trackerEvent.error, "Corrected score-gate history could not be saved.");
  }
  await recordLmsAudit(supabase, { action: "student_result_corrected", entityType: "student_programme_result", entityId: resultId, actorUserId: actor.actorUserId, metadata: { initiator, approver, previous_status: current.data.result_status, publication_required: true } });
  return saved.data;
}

export async function createResultBatch(supabase: SupabaseClient, body: Row, actor: ResultActor) {
  const cohortId = requiredText(body.cohort_id, "Choose a cohort.", 1, 80);
  const name = requiredText(body.batch_name, "Batch name is required.", 5, 240);
  const cohort = await supabase.from("cohorts").select("id").eq("id", cohortId).maybeSingle(); queryFailed(cohort.error, "Cohort could not be loaded."); if (!cohort.data) invalid("Cohort not found.", 404);
  const saved = await supabase.from("academic_result_batches").insert({ cohort_id: cohortId, batch_name: name, batch_type: "final_results", batch_status: "draft", notes: text(body.notes) }).select("*").single();
  queryFailed(saved.error, "Result batch could not be created.");
  await recordLmsAudit(supabase, { action: "result_batch_created", entityType: "academic_result_batch", entityId: String(saved.data.id), actorUserId: actor.actorUserId, metadata: { cohort_id: cohortId } });
  return saved.data;
}

export async function addResultToBatch(supabase: SupabaseClient, batchId: string, resultId: string) {
  const [batch, result] = await Promise.all([supabase.from("academic_result_batches").select("id, cohort_id, batch_status").eq("id", batchId).maybeSingle(), supabase.from("student_programme_results").select("id, student_enrollments(cohort_id)").eq("id", resultId).maybeSingle()]);
  if (batch.error || result.error || !batch.data || !result.data) invalid("Batch or programme result was not found.", 404);
  if (batch.data.batch_status !== "draft") invalid("Results can be added only to a draft batch.", 409);
  if (relation(result.data.student_enrollments).cohort_id !== batch.data.cohort_id) invalid("Programme result cohort must match the result batch cohort.");
  const saved = await supabase.from("academic_result_batch_items").upsert({ result_batch_id: batchId, student_programme_result_id: resultId, item_status: "included", updated_at: new Date().toISOString() }, { onConflict: "result_batch_id,student_programme_result_id" }).select("*").single();
  queryFailed(saved.error, "Programme result could not be added to the batch."); return saved.data;
}

async function validateBatchSubmission(supabase: SupabaseClient, batchId: string) {
  const items = await supabase.from("academic_result_batch_items").select("id, student_programme_result_id, student_programme_results(*, student_enrollments(id, students(student_number, legal_name)))").eq("result_batch_id", batchId).eq("item_status", "included");
  queryFailed(items.error, "Batch results could not be validated.");
  if (!items.data?.length) invalid("Add at least one calculated programme result before submission.", 409);
  const issues: string[] = [];
  for (const item of items.data) {
    const result = relation(item.student_programme_results);
    const enrollment = relation(result.student_enrollments); const student = relation(enrollment.students);
    if (!result.result_outcome) issues.push(`${result.id}: result outcome is missing`);
    if (!["calculated", "review_required", "corrected"].includes(String(result.result_status))) issues.push(`${result.id}: result is not ready for batch review`);
    if (!student.student_number || !student.legal_name) issues.push(`${result.id}: student identity is incomplete`);
    const components = await supabase.from("student_component_scores").select("evidence_complete, calculation_status, programme_score_categories(calculation_source)").eq("student_enrollment_id", String(enrollment.id));
    if (components.error || (components.data ?? []).some((row) => !row.evidence_complete)) issues.push(`${result.id}: required score evidence is incomplete`);
    const reviewComponents = (components.data ?? []).filter((row) => relation(row.programme_score_categories).calculation_source === "review");
    if (reviewComponents.some((row) => row.calculation_status !== "calculated")) issues.push(`${result.id}: engagement evaluation is not approved`);
    const requirements = await supabase.from("student_graduation_requirements").select("requirement_status").eq("student_enrollment_id", String(enrollment.id));
    if (requirements.error || !(requirements.data?.length) || (requirements.data ?? []).some((row) => ["pending", "under_review"].includes(row.requirement_status))) issues.push(`${result.id}: graduation requirements are unresolved`);
  }
  if (issues.length) invalid(`Batch validation failed: ${issues.slice(0, 10).join("; ")}`, 409);
  return items.data;
}

export async function transitionResultBatch(supabase: SupabaseClient, batchId: string, body: Row, actor: ResultActor, notifyPublished?: (studentEnrollmentId: string) => Promise<unknown>) {
  const action = requiredText(body.action, "Choose a batch action.", 1, 40);
  const batch = await supabase.from("academic_result_batches").select("*").eq("id", batchId).maybeSingle(); queryFailed(batch.error, "Result batch could not be loaded."); if (!batch.data) invalid("Result batch not found.", 404);
  const transitions: Record<string, { from: string; to: string }> = { prepare: { from: "draft", to: "prepared" }, submit: { from: "prepared", to: "submitted_for_review" }, review: { from: "submitted_for_review", to: "reviewed" }, approve: { from: "reviewed", to: "approved" }, publish: { from: "approved", to: "published" }, withdraw: { from: String(batch.data.batch_status), to: "withdrawn" } };
  const transition = transitions[action]; if (!transition || !resultBatchStatuses.includes(transition.to as never)) invalid("Choose a valid batch action.");
  if (batch.data.batch_status !== transition.from) invalid(`This batch must be ${transition.from.replaceAll("_", " ")} before it can be ${transition.to.replaceAll("_", " ")}.`, 409);
  if (["prepare", "submit"].includes(action)) await validateBatchSubmission(supabase, batchId);
  const reviewer = requiredText(body.reviewer_name ?? actor.actorLabel, "Record the authorised reviewer's identity.", 3, 200);
  const now = new Date().toISOString();
  const values: Row = { batch_status: transition.to, updated_at: now };
  if (action === "prepare") Object.assign(values, { prepared_at: now, prepared_by: reviewer });
  if (action === "submit") Object.assign(values, { submitted_for_review_at: now });
  if (action === "review") Object.assign(values, { reviewed_at: now, reviewed_by: reviewer });
  if (action === "approve") Object.assign(values, { approval_reference: requiredText(body.approval_reference, "Record the batch approval reference.", 3, 500), authority_reference: requiredText(body.authority_reference, "Record the Academic Council or authorised authority reference.", 3, 500), approved_at: timestamp(body.approval_date) ?? now, approved_by: reviewer, notes: text(body.notes) ?? batch.data.notes });
  if (action === "publish") Object.assign(values, { published_at: now });
  if (action === "review" && batch.data.prepared_by === reviewer) invalid("The batch preparer and reviewer must be different people.", 409);
  if (action === "approve" && [batch.data.prepared_by, batch.data.reviewed_by].includes(reviewer)) invalid("The batch approver must be different from the preparer and reviewer.", 409);
  if (action === "publish") {
    const items = await supabase.from("academic_result_batch_items").select("student_programme_result_id, student_programme_results(student_enrollment_id, result_status)").eq("result_batch_id", batchId).eq("item_status", "included");
    queryFailed(items.error, "Approved batch results could not be loaded for publication.");
    for (const item of items.data ?? []) {
      const result = relation(item.student_programme_results);
      if (!["approved", "submitted_for_approval", "calculated", "corrected"].includes(String(result.result_status))) invalid("Every included result must remain in an approvable state before publication.", 409);
      const updated = await supabase.from("student_programme_results").update({ result_status: "published", published_at: now, approved_at: batch.data.approved_at, approved_by: batch.data.approved_by, updated_at: now }).eq("id", item.student_programme_result_id);
      queryFailed(updated.error, "An included student result could not be published.");
      await recordLmsAudit(supabase, { action: "student_result_published", entityType: "student_programme_result", entityId: item.student_programme_result_id, actorUserId: actor.actorUserId, metadata: { result_batch_id: batchId } });
      if (notifyPublished) await notifyPublished(String(result.student_enrollment_id));
    }
  } else if (["submit", "approve"].includes(action)) {
    const items = await supabase.from("academic_result_batch_items").select("student_programme_result_id").eq("result_batch_id", batchId).eq("item_status", "included");
    const nextResultStatus = action === "submit" ? "submitted_for_approval" : "approved";
    if (items.data?.length) await supabase.from("student_programme_results").update({ result_status: nextResultStatus, ...(action === "approve" ? { approved_at: values.approved_at, approved_by: reviewer } : {}), updated_at: now }).in("id", items.data.map((item) => item.student_programme_result_id));
  }
  const saved = await supabase.from("academic_result_batches").update(values).eq("id", batchId).select("*").single(); queryFailed(saved.error, "Result batch transition could not be saved.");
  const auditActions = { submit: "result_batch_submitted", review: "result_batch_reviewed", approve: "result_batch_approved", publish: "result_batch_published" } as const;
  if (action in auditActions) await recordLmsAudit(supabase, { action: auditActions[action as keyof typeof auditActions], entityType: "academic_result_batch", entityId: batchId, actorUserId: actor.actorUserId, metadata: { previous_status: batch.data.batch_status, next_status: transition.to, reviewer } });
  return saved.data;
}
