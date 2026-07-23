import "server-only";

import { randomInt } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";

import { recordLmsAudit } from "@/lib/lms/adminAudit";
import { LmsAdminDataError } from "@/lib/lms/adminData";
import {
  assessmentCategories,
  assessmentDomains,
  assignmentStatuses,
  assignmentTypes,
  automaticAnswersEqual,
  categoryMatchesDomain,
  emptySubmissionRequirements,
  nextAttemptNumber,
  quizExpiry,
  quizQuestionTypes,
  quizStatuses,
  reviewOutcomes,
  scorePercentage,
  type AssessmentDomain,
  type SubmissionRequirements,
} from "@/lib/lms/assessment";
import { evaluateRecordedLearningAssignment } from "@/lib/lms/recordingService";
import { triggerEngagementEvaluationForCourseEnrollment } from "@/lib/lms/engagementService";
import {
  createQuizAttemptOrderSnapshot,
  defaultQuizTabPolicy,
  normalQuizAttemptsUsed,
  quizIntegrityDecisions,
  tabPolicyOutcome,
  type QuizIntegrityDecision,
} from "@/lib/lms/quizIntegrity";

export type AssessmentActor = { actorUserId?: string | null; actorLabel: "REALMS Admin" | "Facilitator" | "Student" | "System" };
type Row = Record<string, unknown>;

function invalid(message: string, status = 400): never { throw new LmsAdminDataError(message, status); }
function object(value: unknown): Row { return value && typeof value === "object" && !Array.isArray(value) ? value as Row : {}; }
function relation(value: unknown) { return Array.isArray(value) ? object(value[0]) : object(value); }
function requiredText(value: unknown, message: string, maximum = 10_000) { if (typeof value !== "string" || !value.trim()) invalid(message); return value.trim().slice(0, maximum); }
function optionalText(value: unknown, maximum = 10_000) { return typeof value === "string" && value.trim() ? value.trim().slice(0, maximum) : null; }
function numberValue(value: unknown, message: string, minimum = 0, maximum?: number) { const number = Number(value); if (!Number.isFinite(number) || number < minimum || (maximum !== undefined && number > maximum)) invalid(message); return number; }
function optionalNumber(value: unknown, message: string, minimum = 0, maximum?: number) { if (value === null || value === undefined || value === "") return null; return numberValue(value, message, minimum, maximum); }
function booleanValue(value: unknown, fallback = false) { return value === undefined ? fallback : value === true || value === "true" || value === "on"; }
function actorReference(actor: AssessmentActor) { return actor.actorUserId ?? actor.actorLabel; }
function randomUnit() { return randomInt(0, 1_000_000) / 1_000_000; }
function safeUrl(value: unknown, label: string, required = false) {
  const candidate = optionalText(value, 2048);
  if (!candidate) { if (required) invalid(`${label} is required.`); return null; }
  try { const url = new URL(candidate); if (url.protocol !== "https:") invalid(`${label} must use HTTPS.`); return url.toString(); }
  catch { invalid(`Enter a valid ${label.toLowerCase()}.`); }
}

function submissionRequirements(value: unknown): SubmissionRequirements {
  const raw = object(value);
  return {
    text_response_required: booleanValue(raw.text_response_required),
    repository_url_required: booleanValue(raw.repository_url_required),
    deployment_url_required: booleanValue(raw.deployment_url_required),
    external_url_allowed: booleanValue(raw.external_url_allowed, true),
    file_upload_allowed: booleanValue(raw.file_upload_allowed),
  };
}

async function offeringDomain(supabase: SupabaseClient, offeringId: string) {
  const result = await supabase.from("cohort_courses").select("id, courses(id, code, title, course_category), cohorts(id, code, name)").eq("id", offeringId).maybeSingle();
  if (result.error || !result.data) invalid("Cohort course not found.", 404);
  const course = relation(result.data.courses);
  return { offering: result.data as Row, course, domain: String(course.course_category ?? "") };
}

async function validateAssessmentClassification(supabase: SupabaseClient, input: { offeringId: string; domain: string; category: string; overrideConfirmed?: boolean }) {
  if (!assessmentDomains.includes(input.domain as AssessmentDomain)) invalid("Choose a valid assessment domain.");
  if (!categoryMatchesDomain(input.domain, input.category)) invalid("The assessment category does not belong to the selected academic domain.");
  const offering = await offeringDomain(supabase, input.offeringId);
  if (offering.domain !== input.domain && !input.overrideConfirmed) invalid(`This course is classified as ${offering.domain || "unclassified"}. Confirm the administrative domain correction before saving.`, 409);
  return offering;
}

async function validateSessionOffering(supabase: SupabaseClient, sessionId: string | null, offeringId: string) {
  if (!sessionId) return;
  const result = await supabase.from("class_sessions").select("id").eq("id", sessionId).eq("cohort_course_id", offeringId).maybeSingle();
  if (result.error || !result.data) invalid("The optional class session must belong to the selected cohort course.");
}

export async function assertFacilitatorOfferingAccess(supabase: SupabaseClient, facilitatorId: string, offeringId: string) {
  const result = await supabase.from("facilitator_course_assignments").select("id").eq("facilitator_id", facilitatorId).eq("cohort_course_id", offeringId).limit(1).maybeSingle();
  if (result.error || !result.data) invalid("You are not assigned to this cohort course.", 403);
}

export async function resolveStudentCourseEnrollment(supabase: SupabaseClient, profileId: string, offeringId: string) {
  const student = await supabase.from("students").select("id").eq("profile_id", profileId).maybeSingle();
  if (student.error || !student.data) invalid("Student access required.", 403);
  const enrollment = await supabase.from("course_enrollments").select("id, cohort_course_id, enrollment_status, student_enrollments!inner(student_id)").eq("cohort_course_id", offeringId).eq("student_enrollments.student_id", student.data.id).in("enrollment_status", ["active", "enrolled"]).maybeSingle();
  if (enrollment.error || !enrollment.data) invalid("This assessment is not part of your enrolled courses.", 403);
  return enrollment.data;
}

export async function saveAssignment(supabase: SupabaseClient, body: Row, actor: AssessmentActor, assignmentId?: string) {
  const offeringId = requiredText(body.cohort_course_id, "Choose a cohort course.", 80);
  const assignmentType = requiredText(body.assignment_type, "Choose an assignment type.", 80);
  const domain = requiredText(body.assessment_domain, "Choose an assessment domain.", 80);
  const category = requiredText(body.assessment_category, "Choose an assessment category.", 120);
  if (!(assignmentTypes as readonly string[]).includes(assignmentType)) invalid("Choose a valid assignment type.");
  await validateAssessmentClassification(supabase, { offeringId, domain, category, overrideConfirmed: actor.actorLabel === "REALMS Admin" && booleanValue(body.domain_override_confirmed) });
  const sessionId = optionalText(body.class_session_id, 80);
  await validateSessionOffering(supabase, sessionId, offeringId);
  const dueAt = optionalText(body.due_at, 80);
  if (dueAt && !Number.isFinite(Date.parse(dueAt))) invalid("Enter a valid due date.");
  const values = {
    cohort_course_id: offeringId,
    class_session_id: sessionId,
    title: requiredText(body.title, "Assignment title is required.", 240),
    description: optionalText(body.description),
    instructions: optionalText(body.instructions, 30_000),
    assignment_type: assignmentType,
    assessment_domain: domain,
    assessment_category: category,
    max_score: numberValue(body.max_score ?? 100, "Maximum score must be greater than zero.", 0.01, 1_000_000),
    due_at: dueAt ? new Date(dueAt).toISOString() : null,
    allow_late_submission: booleanValue(body.allow_late_submission, true),
    max_submission_attempts: numberValue(body.max_submission_attempts ?? 1, "Maximum submission attempts must be at least one.", 1, 100),
    submission_requirements: submissionRequirements(body.submission_requirements ?? body),
    updated_by: actor.actorUserId ?? null,
    updated_at: new Date().toISOString(),
  };
  if (assignmentId) {
    const current = await supabase.from("assignments").select("id, assignment_status").eq("id", assignmentId).maybeSingle();
    if (current.error || !current.data) invalid("Assignment not found.", 404);
    if (current.data.assignment_status !== "draft") invalid("Only draft assignments can be edited. Close or archive a published assignment instead.", 409);
    const saved = await supabase.from("assignments").update(values).eq("id", assignmentId).select("*").single();
    if (saved.error) throw new LmsAdminDataError("Assignment could not be updated.");
    return saved.data;
  }
  const saved = await supabase.from("assignments").insert({ ...values, assignment_status: "draft", created_by: actor.actorUserId ?? null }).select("*").single();
  if (saved.error) throw new LmsAdminDataError("Assignment could not be created.");
  await recordLmsAudit(supabase, { action: "assignment_created", entityType: "assignment", entityId: saved.data.id, actorUserId: actor.actorUserId, metadata: { assessment_domain: domain, assessment_category: category } });
  return saved.data;
}

export async function addRubricCriterion(supabase: SupabaseClient, assignmentId: string, body: Row) {
  const assignment = await supabase.from("assignments").select("id, assignment_status").eq("id", assignmentId).maybeSingle();
  if (assignment.error || !assignment.data) invalid("Assignment not found.", 404);
  if (assignment.data.assignment_status !== "draft") invalid("The rubric can only be changed while the assignment is a draft.", 409);
  const saved = await supabase.from("assignment_rubric_criteria").insert({ assignment_id: assignmentId, criterion: requiredText(body.criterion, "Criterion name is required.", 240), description: optionalText(body.description), max_points: numberValue(body.max_points, "Maximum points must be greater than zero.", 0.01, 1_000_000), sort_order: numberValue(body.sort_order ?? 0, "Sort order must be zero or greater.", 0, 10_000) }).select("*").single();
  if (saved.error) throw new LmsAdminDataError("Rubric criterion could not be created.");
  return saved.data;
}

export async function setAssignmentStatus(supabase: SupabaseClient, assignmentId: string, body: Row, actor: AssessmentActor) {
  const status = requiredText(body.assignment_status, "Choose an assignment status.", 40);
  if (!(assignmentStatuses as readonly string[]).includes(status)) invalid("Choose a valid assignment status.");
  const [assignment, rubric, submissionCount] = await Promise.all([
    supabase.from("assignments").select("*").eq("id", assignmentId).maybeSingle(),
    supabase.from("assignment_rubric_criteria").select("max_points").eq("assignment_id", assignmentId),
    supabase.from("assignment_submissions").select("id", { count: "exact", head: true }).eq("assignment_id", assignmentId),
  ]);
  if (assignment.error || !assignment.data) invalid("Assignment not found.", 404);
  if (rubric.error || submissionCount.error) throw new LmsAdminDataError("Assignment publication checks could not be completed.");
  if (status === "draft" && assignment.data.assignment_status !== "draft") invalid("A published assignment cannot be returned to draft.", 409);
  if (status === "archived" && (submissionCount.count ?? 0) > 0 && body.confirm_archive !== true) invalid("Confirm archival because student submissions already exist.", 409);
  const rubricTotal = (rubric.data ?? []).reduce((sum, item) => sum + Number(item.max_points), 0);
  const mismatch = rubricTotal > 0 && Math.abs(rubricTotal - Number(assignment.data.max_score)) > 0.001;
  if (status === "published" && mismatch && body.confirm_rubric_mismatch !== true) invalid(`Rubric points total ${rubricTotal}, but the assignment maximum is ${assignment.data.max_score}. Confirm publication to keep this intentional mismatch.`, 409);
  const wasPublished = assignment.data.assignment_status === "published";
  const saved = await supabase.from("assignments").update({ assignment_status: status, published_at: status === "published" ? assignment.data.published_at ?? new Date().toISOString() : assignment.data.published_at, updated_by: actor.actorUserId ?? null, updated_at: new Date().toISOString() }).eq("id", assignmentId).select("*").single();
  if (saved.error) throw new LmsAdminDataError("Assignment status could not be updated.");
  if (status === "published" && !wasPublished) await recordLmsAudit(supabase, { action: "assignment_published", entityType: "assignment", entityId: assignmentId, actorUserId: actor.actorUserId, metadata: { rubric_total: rubricTotal, max_score: assignment.data.max_score, rubric_mismatch: mismatch } });
  return { assignment: saved.data, rubricTotal, rubricMismatch: mismatch };
}

export async function submitAssignment(supabase: SupabaseClient, profileId: string, assignmentId: string, body: Row, actor: AssessmentActor, options: { hasValidatedFile?: boolean } = {}) {
  for (const forbidden of ["score_points", "score_percentage", "review_outcome", "graded_at", "graded_by", "is_late", "attempt_number"]) if (body[forbidden] !== undefined) invalid("Assessment results are determined by REALMS on the server.");
  const assignment = await supabase.from("assignments").select("*").eq("id", assignmentId).eq("assignment_status", "published").maybeSingle();
  if (assignment.error || !assignment.data) invalid("This assignment is not currently available.", 404);
  const enrollment = await resolveStudentCourseEnrollment(supabase, profileId, assignment.data.cohort_course_id);
  const attempts = await supabase.from("assignment_submissions").select("id, attempt_number, submission_status, review_outcome").eq("assignment_id", assignmentId).eq("course_enrollment_id", enrollment.id).order("attempt_number");
  if (attempts.error) throw new LmsAdminDataError("Submission history could not be checked.");
  const nextAttempt = nextAttemptNumber(attempts.data ?? []);
  if (nextAttempt > Number(assignment.data.max_submission_attempts)) invalid("The maximum number of submission attempts has been reached.", 409);
  if (nextAttempt > 1 && attempts.data?.at(-1)?.review_outcome !== "revision_required") invalid("A new attempt is available only after a facilitator requests a revision.", 409);
  const now = new Date(); const dueAt = assignment.data.due_at ? Date.parse(assignment.data.due_at) : null; const isLate = dueAt !== null && now.valueOf() > dueAt;
  if (isLate && !assignment.data.allow_late_submission) invalid("The submission deadline has passed and late submission is not enabled.", 409);
  const requirements = { ...emptySubmissionRequirements, ...submissionRequirements(assignment.data.submission_requirements) };
  const responseText = optionalText(body.response_text, 50_000);
  const repositoryUrl = safeUrl(body.repository_url, "Repository URL", requirements.repository_url_required);
  const deploymentUrl = safeUrl(body.deployment_url, "Deployment URL", requirements.deployment_url_required);
  const externalUrl = requirements.external_url_allowed ? safeUrl(body.external_url, "External URL") : null;
  if (options.hasValidatedFile && !requirements.file_upload_allowed) invalid("This assignment does not accept file attachments.", 409);
  if (requirements.text_response_required && !responseText) invalid("A written response is required.");
  if (!responseText && !repositoryUrl && !deploymentUrl && !externalUrl && !options.hasValidatedFile) invalid("Provide at least one required response or evidence file.");
  if (body.file_artifact || body.storage_path) invalid("Submit private files through the protected attachment field. Public storage paths are not accepted.", 409);
  const saved = await supabase.from("assignment_submissions").insert({ assignment_id: assignmentId, course_enrollment_id: enrollment.id, attempt_number: nextAttempt, response_text: responseText, repository_url: repositoryUrl, deployment_url: deploymentUrl, external_url: externalUrl, submission_status: "submitted", submitted_at: now.toISOString(), is_late: isLate }).select("*").single();
  if (saved.error) throw new LmsAdminDataError("Assignment submission could not be saved.");
  await recordLmsAudit(supabase, { action: nextAttempt === 1 ? "assignment_submitted" : "assignment_resubmitted", entityType: "assignment_submission", entityId: saved.data.id, actorUserId: actor.actorUserId, metadata: { assignment_id: assignmentId, attempt_number: nextAttempt, is_late: isLate } });
  return saved.data;
}

async function linkedRecordingAssignments(supabase: SupabaseClient, courseEnrollmentId: string, assignmentId: string, kind: "practical" | "reflection") {
  const field = kind === "practical" ? "practical_assignment_id" : "reflection_assignment_id";
  const requirements = await supabase.from("session_recording_requirements").select(`class_session_id, ${field}`).eq(field, assignmentId);
  if (requirements.error) throw new LmsAdminDataError("Recorded-learning links could not be checked.");
  const sessionIds = (requirements.data ?? []).map((item) => item.class_session_id);
  if (!sessionIds.length) return [];
  const assignments = await supabase.from("recording_learning_assignments").select("id").eq("course_enrollment_id", courseEnrollmentId).in("class_session_id", sessionIds);
  if (assignments.error) throw new LmsAdminDataError("Recorded-learning assignments could not be checked.");
  return assignments.data ?? [];
}

async function syncAssignmentRecordingEvidence(supabase: SupabaseClient, submission: Row, assignment: Row, actor: AssessmentActor) {
  if (submission.submission_status !== "graded" || submission.review_outcome !== "accepted") return;
  const kinds: Array<"practical" | "reflection"> = ["practical", "reflection"];
  for (const kind of kinds) {
    const linked = await linkedRecordingAssignments(supabase, String(submission.course_enrollment_id), String(assignment.id), kind);
    for (const recording of linked) {
      const now = new Date().toISOString();
      const status = await supabase.from("recording_requirement_statuses").update({ requirement_status: "satisfied", evidence_source: "assignment_submission", evidence_reference: String(submission.id), completed_at: now, verified_at: now, verified_by: actorReference(actor), verification_note: `${kind === "reflection" ? "Reflection" : "Practical"} accepted through assessment review.`, updated_at: now }).eq("recording_assignment_id", recording.id).eq("requirement_type", kind).eq("is_required", true).select("id");
      if (status.error) throw new LmsAdminDataError("Recorded-learning requirement evidence could not be synchronized.");
      if (status.data?.length) {
        await recordLmsAudit(supabase, { action: kind === "reflection" ? "recording_reflection_requirement_completed" : "recording_practical_requirement_completed", entityType: "recording_learning_assignment", entityId: recording.id, actorUserId: actor.actorUserId, metadata: { assignment_id: assignment.id, submission_id: submission.id } });
        await evaluateRecordedLearningAssignment(supabase, recording.id, actor);
      }
    }
  }
}

export async function gradeAssignmentSubmission(supabase: SupabaseClient, submissionId: string, body: Row, actor: AssessmentActor) {
  const submissionResult = await supabase.from("assignment_submissions").select("*, assignments(*)").eq("id", submissionId).maybeSingle();
  if (submissionResult.error || !submissionResult.data) invalid("Assignment submission not found.", 404);
  const current = submissionResult.data as Row; const assignment = relation(current.assignments);
  const outcome = requiredText(body.review_outcome, "Choose a review outcome.", 40);
  if (!(reviewOutcomes as readonly string[]).includes(outcome)) invalid("Choose a valid review outcome.");
  const rubric = await supabase.from("assignment_rubric_criteria").select("id, max_points").eq("assignment_id", assignment.id).order("sort_order");
  if (rubric.error) throw new LmsAdminDataError("Assignment rubric could not be loaded.");
  const suppliedScores = Array.isArray(body.rubric_scores) ? body.rubric_scores.map(object) : [];
  let points: number;
  if (rubric.data?.length) {
    const rubricIds = new Set(rubric.data.map((criterion) => criterion.id));
    if (suppliedScores.length !== rubric.data.length || suppliedScores.some((score) => !rubricIds.has(String(score.rubric_criterion_id)))) invalid("Every rubric criterion must be scored exactly once.");
    points = suppliedScores.reduce((sum, score) => {
      const criterion = rubric.data!.find((item) => item.id === score.rubric_criterion_id)!;
      return sum + numberValue(score.awarded_points, "Rubric points must be within the criterion maximum.", 0, Number(criterion.max_points));
    }, 0);
  } else points = numberValue(body.score_points, "Enter a valid score.", 0, Number(assignment.max_score));
  if (points > Number(assignment.max_score)) invalid("The calculated score cannot exceed the assignment maximum.");
  const percentage = scorePercentage(points, Number(assignment.max_score));
  const alreadyGraded = current.submission_status === "graded" || current.score_points !== null;
  const changed = alreadyGraded && (Number(current.score_points) !== points || current.review_outcome !== outcome);
  const reason = optionalText(body.change_reason, 2000);
  if (changed && !reason) invalid("A reason is required when correcting an existing grade.", 409);
  if (changed) {
    const event = await supabase.from("assessment_grade_change_events").insert({ assessment_type: "assignment", assessment_id: assignment.id, record_id: submissionId, previous_score: current.score_points, new_score: points, reason, changed_by: actorReference(actor) });
    if (event.error) throw new LmsAdminDataError("Grade correction history could not be preserved.");
  }
  if (rubric.data?.length) {
    const rows = suppliedScores.map((score) => ({ submission_id: submissionId, rubric_criterion_id: score.rubric_criterion_id, awarded_points: Number(score.awarded_points), feedback: optionalText(score.feedback, 5000), graded_by: actorReference(actor), graded_at: new Date().toISOString() }));
    const savedScores = await supabase.from("assignment_rubric_scores").upsert(rows, { onConflict: "submission_id,rubric_criterion_id" });
    if (savedScores.error) throw new LmsAdminDataError("Rubric scores could not be saved.");
  }
  const now = new Date().toISOString();
  const saved = await supabase.from("assignment_submissions").update({ submission_status: outcome === "revision_required" ? "revision_required" : "graded", score_points: points, score_percentage: percentage, review_outcome: outcome, feedback: optionalText(body.feedback, 20_000), graded_at: now, graded_by: actorReference(actor), updated_at: now }).eq("id", submissionId).select("*").single();
  if (saved.error) throw new LmsAdminDataError("Assignment grade could not be saved.");
  await recordLmsAudit(supabase, { action: changed ? "assignment_grade_corrected" : outcome === "revision_required" ? "assignment_resubmission_requested" : "assignment_graded", entityType: "assignment_submission", entityId: submissionId, actorUserId: actor.actorUserId, metadata: { assignment_id: assignment.id, score_points: points, score_percentage: percentage, review_outcome: outcome, correction_reason: reason } });
  await syncAssignmentRecordingEvidence(supabase, saved.data as Row, assignment, actor);
  return saved.data;
}

export async function saveQuiz(supabase: SupabaseClient, body: Row, actor: AssessmentActor, quizId?: string) {
  const offeringId = requiredText(body.cohort_course_id, "Choose a cohort course.", 80);
  const domain = requiredText(body.assessment_domain, "Choose an assessment domain.", 80);
  const category = requiredText(body.assessment_category, "Choose an assessment category.", 120);
  await validateAssessmentClassification(supabase, { offeringId, domain, category, overrideConfirmed: actor.actorLabel === "REALMS Admin" && booleanValue(body.domain_override_confirmed) });
  const sessionId = optionalText(body.class_session_id, 80); await validateSessionOffering(supabase, sessionId, offeringId);
  const opensAt = optionalText(body.opens_at, 80); const closesAt = optionalText(body.closes_at, 80);
  if (opensAt && !Number.isFinite(Date.parse(opensAt))) invalid("Enter a valid opening time.");
  if (closesAt && !Number.isFinite(Date.parse(closesAt))) invalid("Enter a valid closing time.");
  if (opensAt && closesAt && Date.parse(opensAt) >= Date.parse(closesAt)) invalid("Quiz closing time must be after its opening time.");
  const answersReviewableAt = optionalText(body.answers_reviewable_at, 80);
  if (answersReviewableAt && !Number.isFinite(Date.parse(answersReviewableAt))) invalid("Enter a valid answer-review release time.");
  if (answersReviewableAt && closesAt && Date.parse(answersReviewableAt) < Date.parse(closesAt)) invalid("Correct-answer review cannot open before the quiz closes.");
  const values: Row = { cohort_course_id: offeringId, class_session_id: sessionId, title: requiredText(body.title, "Quiz title is required.", 240), description: optionalText(body.description), instructions: optionalText(body.instructions, 30_000), quiz_type: optionalText(body.quiz_type, 80) ?? "lesson_quiz", assessment_domain: domain, assessment_category: category, opens_at: opensAt ? new Date(opensAt).toISOString() : null, closes_at: closesAt ? new Date(closesAt).toISOString() : null, duration_minutes: optionalNumber(body.duration_minutes, "Duration must be at least one minute.", 1, 1440), max_attempts: numberValue(body.max_attempts ?? 1, "Maximum attempts must be at least one.", 1, 100), passing_score_percentage: numberValue(body.passing_score_percentage ?? 70, "Passing score must be between zero and 100.", 0, 100), show_score_after_submission: booleanValue(body.show_score_after_submission, true), show_correct_answers: booleanValue(body.show_correct_answers), updated_by: actor.actorUserId ?? null, updated_at: new Date().toISOString() };
  if (actor.actorLabel === "REALMS Admin") {
    const monitoringEnabled = booleanValue(body.tab_monitoring_enabled, defaultQuizTabPolicy.monitoringEnabled);
    const warningThreshold = numberValue(body.tab_warning_threshold ?? defaultQuizTabPolicy.warningThreshold, "Tab warning threshold must be at least one.", 1, 100);
    const flagThreshold = numberValue(body.tab_flag_threshold ?? defaultQuizTabPolicy.flagThreshold, "Tab review threshold must be at least the warning threshold.", warningThreshold, 100);
    const autoSubmitThreshold = optionalNumber(body.tab_auto_submit_threshold, "Tab auto-submit threshold must be at least the review threshold.", flagThreshold, 100);
    Object.assign(values, {
      answers_reviewable_at: answersReviewableAt ? new Date(answersReviewableAt).toISOString() : null,
      tab_monitoring_enabled: monitoringEnabled,
      tab_warning_threshold: warningThreshold,
      tab_flag_threshold: flagThreshold,
      tab_auto_submit_threshold: autoSubmitThreshold,
      randomize_question_order: booleanValue(body.randomize_question_order),
      randomize_option_order: booleanValue(body.randomize_option_order),
    });
  }
  if (quizId) {
    const current = await supabase.from("quizzes").select("id, quiz_status").eq("id", quizId).maybeSingle();
    if (current.error || !current.data) invalid("Quiz not found.", 404);
    if (current.data.quiz_status !== "draft") invalid("Only draft quizzes can be edited.", 409);
    const saved = await supabase.from("quizzes").update(values).eq("id", quizId).select("*").single();
    if (saved.error) throw new LmsAdminDataError("Quiz could not be updated."); return saved.data;
  }
  const saved = await supabase.from("quizzes").insert({ ...values, quiz_status: "draft", created_by: actor.actorUserId ?? null }).select("*").single();
  if (saved.error) throw new LmsAdminDataError("Quiz could not be created.");
  await recordLmsAudit(supabase, { action: "quiz_created", entityType: "quiz", entityId: saved.data.id, actorUserId: actor.actorUserId, metadata: { assessment_domain: domain, assessment_category: category } });
  return saved.data;
}

export async function addQuizQuestion(supabase: SupabaseClient, quizId: string, body: Row) {
  const quiz = await supabase.from("quizzes").select("id, quiz_status").eq("id", quizId).maybeSingle();
  if (quiz.error || !quiz.data) invalid("Quiz not found.", 404);
  if (quiz.data.quiz_status !== "draft") invalid("Questions can only be changed while the quiz is a draft.", 409);
  const type = requiredText(body.question_type, "Choose a question type.", 40);
  if (!(quizQuestionTypes as readonly string[]).includes(type)) invalid("Choose a valid question type.");
  const options = type === "true_false" ? [true, false] : Array.isArray(body.options) ? body.options.flatMap((item) => typeof item === "string" && item.trim() ? [item.trim().slice(0, 1000)] : []) : [];
  if (type === "multiple_choice" && options.length < 2) invalid("Multiple-choice questions require at least two options.");
  if (type === "multiple_choice" && new Set(options.map((option) => String(option).toLocaleLowerCase())).size !== options.length) invalid("Multiple-choice options must be unique.");
  const answer = body.correct_answer;
  if (type !== "short_answer" && (answer === undefined || answer === null || answer === "")) invalid("An answer key is required for automatic grading.");
  if (type === "multiple_choice" && !options.some((option) => automaticAnswersEqual(type, option, answer))) invalid("The correct answer must match one configured option.");
  const question = await supabase.from("quiz_questions").insert({ quiz_id: quizId, question_type: type, prompt: requiredText(body.prompt, "Question prompt is required.", 10_000), options, points: numberValue(body.points ?? 1, "Question points must be greater than zero.", 0.01, 1_000_000), sort_order: numberValue(body.sort_order ?? 0, "Sort order must be zero or greater.", 0, 10_000), is_required: body.is_required !== false }).select("*").single();
  if (question.error) throw new LmsAdminDataError("Quiz question could not be created.");
  const key = await supabase.from("quiz_answer_keys").insert({ question_id: question.data.id, correct_answer: type === "short_answer" ? null : type === "true_false" ? String(answer).toLowerCase() === "true" || answer === true : answer, grading_guidance: optionalText(body.grading_guidance, 10_000) });
  if (key.error) throw new LmsAdminDataError("The private quiz grading key could not be saved.");
  return question.data;
}

export async function setQuizStatus(supabase: SupabaseClient, quizId: string, body: Row, actor: AssessmentActor) {
  const status = requiredText(body.quiz_status, "Choose a quiz status.", 40);
  if (!(quizStatuses as readonly string[]).includes(status)) invalid("Choose a valid quiz status.");
  const [quiz, questions] = await Promise.all([supabase.from("quizzes").select("*").eq("id", quizId).maybeSingle(), supabase.from("quiz_questions").select("id, question_type, points, quiz_answer_keys(id, correct_answer)").eq("quiz_id", quizId)]);
  if (quiz.error || !quiz.data) invalid("Quiz not found.", 404);
  if (questions.error) throw new LmsAdminDataError("Quiz publication checks could not be completed.");
  if (status === "published") {
    if (!questions.data?.length) invalid("Add at least one question before publishing.", 409);
    if (questions.data.reduce((sum, question) => sum + Number(question.points), 0) <= 0) invalid("Quiz total points must be greater than zero.", 409);
    if (questions.data.some((question) => question.question_type !== "short_answer" && !(question.quiz_answer_keys as unknown as Row[])?.length)) invalid("Every automatically graded question requires an answer key.", 409);
    if (quiz.data.opens_at && quiz.data.closes_at && Date.parse(quiz.data.opens_at) >= Date.parse(quiz.data.closes_at)) invalid("Quiz opening and closing times are not valid.", 409);
    if (quiz.data.show_correct_answers && !quiz.data.answers_reviewable_at) invalid("Choose a correct-answer review release time, or keep correct-answer review disabled.", 409);
    if (quiz.data.answers_reviewable_at && quiz.data.closes_at && Date.parse(quiz.data.answers_reviewable_at) < Date.parse(quiz.data.closes_at)) invalid("Correct-answer review cannot open before the quiz closes.", 409);
  }
  const wasPublished = quiz.data.quiz_status === "published";
  const saved = await supabase.from("quizzes").update({ quiz_status: status, published_at: status === "published" ? quiz.data.published_at ?? new Date().toISOString() : quiz.data.published_at, updated_by: actor.actorUserId ?? null, updated_at: new Date().toISOString() }).eq("id", quizId).select("*").single();
  if (saved.error) throw new LmsAdminDataError("Quiz status could not be updated.");
  if (status === "published" && !wasPublished) await recordLmsAudit(supabase, { action: "quiz_published", entityType: "quiz", entityId: quizId, actorUserId: actor.actorUserId, metadata: { question_count: questions.data?.length ?? 0 } });
  return saved.data;
}

export async function startQuizAttempt(supabase: SupabaseClient, profileId: string, quizId: string, actor: AssessmentActor) {
  const quiz = await supabase.from("quizzes").select("*").eq("id", quizId).eq("quiz_status", "published").maybeSingle();
  if (quiz.error || !quiz.data) invalid("This quiz is not currently available.", 404);
  const enrollment = await resolveStudentCourseEnrollment(supabase, profileId, quiz.data.cohort_course_id);
  const now = new Date();
  if (quiz.data.opens_at && Date.parse(quiz.data.opens_at) > now.valueOf()) invalid("This quiz has not opened yet.", 409);
  if (quiz.data.closes_at && Date.parse(quiz.data.closes_at) <= now.valueOf()) invalid("This quiz is closed.", 409);
  let attempts = await supabase.from("quiz_attempts").select("*").eq("quiz_id", quizId).eq("course_enrollment_id", enrollment.id).order("attempt_number");
  if (attempts.error) throw new LmsAdminDataError("Quiz attempt history could not be checked.");
  const expiredActive = attempts.data?.find((attempt) => attempt.attempt_status === "in_progress" && attempt.expires_at && Date.parse(attempt.expires_at) <= now.valueOf());
  if (expiredActive) {
    await finalizeExpiredQuizAttempt(supabase, String(expiredActive.id), { actorLabel: "System" });
    attempts = await supabase.from("quiz_attempts").select("*").eq("quiz_id", quizId).eq("course_enrollment_id", enrollment.id).order("attempt_number");
    if (attempts.error) throw new LmsAdminDataError("Quiz attempt history could not be refreshed.");
  }
  const active = attempts.data?.find((attempt) => attempt.attempt_status === "in_progress");
  if (active && (!active.expires_at || Date.parse(active.expires_at) > now.valueOf())) return active;
  const grants = await supabase.from("quiz_attempt_replacement_grants").select("*").eq("quiz_id", quizId).eq("course_enrollment_id", enrollment.id).eq("grant_status", "pending").order("granted_at").limit(1);
  if (grants.error) throw new LmsAdminDataError("Replacement-attempt eligibility could not be checked.");
  const replacementGrant = grants.data?.[0] ?? null;
  if (!replacementGrant && normalQuizAttemptsUsed(attempts.data ?? []) >= Number(quiz.data.max_attempts)) invalid("The maximum number of quiz attempts has been reached.", 409);
  const questions = await supabase.from("quiz_questions").select("id, question_type, options, points, sort_order").eq("quiz_id", quizId).order("sort_order");
  if (questions.error || !questions.data?.length) invalid("This quiz is not ready to start.", 409);
  const maxPoints = questions.data.reduce((sum, question) => sum + Number(question.points), 0);
  const order = createQuizAttemptOrderSnapshot(questions.data, { randomizeQuestionOrder: quiz.data.randomize_question_order === true, randomizeOptionOrder: quiz.data.randomize_option_order === true }, randomUnit);
  const saved = await supabase.from("quiz_attempts").insert({ quiz_id: quizId, course_enrollment_id: enrollment.id, attempt_number: nextAttemptNumber(attempts.data ?? []), attempt_status: "in_progress", started_at: now.toISOString(), expires_at: quizExpiry(now, quiz.data.duration_minutes, quiz.data.closes_at), max_points: maxPoints, question_order: order.questionOrder, option_orders: order.optionOrders, official_result_eligible: true, replacement_for_attempt_id: replacementGrant?.original_attempt_id ?? null, replacement_status: replacementGrant ? "replacement" : "none" }).select("*").single();
  if (saved.error) {
    if (saved.error.code === "23505") {
      const winner = await supabase.from("quiz_attempts").select("*").eq("quiz_id", quizId).eq("course_enrollment_id", enrollment.id).eq("attempt_status", "in_progress").maybeSingle();
      if (!winner.error && winner.data) return winner.data;
    }
    throw new LmsAdminDataError("Quiz attempt could not be started.");
  }
  if (replacementGrant) {
    const consumed = await supabase.from("quiz_attempt_replacement_grants").update({ grant_status: "consumed", replacement_attempt_id: saved.data.id, consumed_at: now.toISOString(), updated_at: now.toISOString() }).eq("id", replacementGrant.id).eq("grant_status", "pending");
    if (consumed.error) throw new LmsAdminDataError("The replacement attempt was started, but its grant could not be finalised.");
    await supabase.from("quiz_attempt_events").upsert({ quiz_attempt_id: saved.data.id, event_type: "replacement_attempt_started", event_key: "replacement-attempt-started", metadata: { original_attempt_id: replacementGrant.original_attempt_id }, actor_user_id: actor.actorUserId ?? null, actor_label: actor.actorLabel }, { onConflict: "quiz_attempt_id,event_key", ignoreDuplicates: true });
  }
  await recordLmsAudit(supabase, { action: "quiz_attempt_started", entityType: "quiz_attempt", entityId: saved.data.id, actorUserId: actor.actorUserId, metadata: { quiz_id: quizId, attempt_number: saved.data.attempt_number } });
  return saved.data;
}

async function resolveOwnedAttempt(supabase: SupabaseClient, profileId: string, attemptId: string) {
  const attempt = await supabase.from("quiz_attempts").select("*, quizzes(*)").eq("id", attemptId).maybeSingle();
  if (attempt.error || !attempt.data) invalid("Quiz attempt not found.", 404);
  const quiz = relation(attempt.data.quizzes);
  const enrollment = await resolveStudentCourseEnrollment(supabase, profileId, String(quiz.cohort_course_id));
  if (attempt.data.course_enrollment_id !== enrollment.id) invalid("This quiz attempt does not belong to you.", 403);
  return { attempt: attempt.data as Row, quiz };
}

export async function saveQuizAnswer(supabase: SupabaseClient, profileId: string, attemptId: string, body: Row) {
  for (const forbidden of ["is_correct", "awarded_points", "feedback", "graded_at", "graded_by"]) if (body[forbidden] !== undefined) invalid("Quiz grading fields are determined by REALMS on the server.");
  const { attempt, quiz } = await resolveOwnedAttempt(supabase, profileId, attemptId);
  if (attempt.attempt_status !== "in_progress") invalid("This quiz attempt is no longer active.", 409);
  if (attempt.expires_at && Date.parse(String(attempt.expires_at)) <= Date.now()) {
    await finalizeExpiredQuizAttempt(supabase, attemptId, { actorLabel: "System" });
    invalid("The quiz timer ended and the answers saved before expiry were submitted automatically.", 409);
  }
  const questionId = requiredText(body.question_id, "Choose a quiz question.", 80);
  const question = await supabase.from("quiz_questions").select("id, question_type").eq("id", questionId).eq("quiz_id", quiz.id).maybeSingle();
  if (question.error || !question.data) invalid("This question does not belong to the quiz.", 403);
  const answer = body.submitted_answer;
  if (answer === undefined || answer === null || (typeof answer === "string" && !answer.trim())) invalid("Enter an answer before saving.");
  const saved = await supabase.from("quiz_attempt_answers").upsert({ quiz_attempt_id: attemptId, question_id: questionId, submitted_answer: answer, is_correct: null, awarded_points: null, feedback: null, graded_at: null, graded_by: null, updated_at: new Date().toISOString() }, { onConflict: "quiz_attempt_id,question_id" }).select("id, question_id, submitted_answer, updated_at").single();
  if (saved.error) throw new LmsAdminDataError("Quiz answer could not be saved.");
  return saved.data;
}

async function syncQuizRecordingEvidence(supabase: SupabaseClient, attempt: Row, quiz: Row, actor: AssessmentActor) {
  if (attempt.attempt_status !== "graded" || attempt.passed !== true || attempt.official_result_eligible === false) return;
  const requirements = await supabase.from("session_recording_requirements").select("class_session_id").eq("quiz_id", quiz.id);
  if (requirements.error) throw new LmsAdminDataError("Recorded-learning quiz links could not be checked.");
  const sessionIds = (requirements.data ?? []).map((item) => item.class_session_id); if (!sessionIds.length) return;
  const linked = await supabase.from("recording_learning_assignments").select("id").eq("course_enrollment_id", attempt.course_enrollment_id).in("class_session_id", sessionIds);
  if (linked.error) throw new LmsAdminDataError("Recorded-learning assignments could not be checked.");
  for (const recording of linked.data ?? []) {
    const now = new Date().toISOString();
    const status = await supabase.from("recording_requirement_statuses").update({ requirement_status: "satisfied", evidence_source: "quiz_attempt", evidence_reference: String(attempt.id), completed_at: now, verified_at: now, verified_by: actorReference(actor), verification_note: "Passing quiz attempt.", updated_at: now }).eq("recording_assignment_id", recording.id).eq("requirement_type", "quiz").eq("is_required", true).select("id");
    if (status.error) throw new LmsAdminDataError("Recorded-learning quiz evidence could not be synchronized.");
    if (status.data?.length) {
      await recordLmsAudit(supabase, { action: "recording_quiz_requirement_completed", entityType: "recording_learning_assignment", entityId: recording.id, actorUserId: actor.actorUserId, metadata: { quiz_id: quiz.id, quiz_attempt_id: attempt.id } });
      await evaluateRecordedLearningAssignment(supabase, recording.id, actor);
    }
  }
}

async function calculateQuizAttempt(supabase: SupabaseClient, attemptId: string, actor: AssessmentActor) {
  const attemptResult = await supabase.from("quiz_attempts").select("*, quizzes(*)").eq("id", attemptId).maybeSingle();
  if (attemptResult.error || !attemptResult.data) invalid("Quiz attempt not found.", 404);
  const attempt = attemptResult.data as Row; const quiz = relation(attempt.quizzes);
  if (attempt.official_result_eligible === false || ["administratively_invalidated", "voided_for_replacement"].includes(String(attempt.attempt_status))) {
    invalid("This attempt is not eligible for grading.", 409);
  }
  const [questions, answers] = await Promise.all([
    supabase.from("quiz_questions").select("id, question_type, points, quiz_answer_keys(correct_answer)").eq("quiz_id", quiz.id),
    supabase.from("quiz_attempt_answers").select("*").eq("quiz_attempt_id", attemptId),
  ]);
  if (questions.error || answers.error) throw new LmsAdminDataError("Quiz answers could not be evaluated.");
  let auto = 0; let manual = 0; let manualPending = false;
  for (const question of questions.data ?? []) {
    const answer = answers.data?.find((item) => item.question_id === question.id);
    if (question.question_type === "short_answer") {
      if (!answer) {
        const placeholder = await supabase.from("quiz_attempt_answers").insert({ quiz_attempt_id: attemptId, question_id: question.id, submitted_answer: null }).select("id").single();
        if (placeholder.error) throw new LmsAdminDataError("Short-answer review record could not be initialized.");
        manualPending = true;
      } else if (answer.awarded_points === null) manualPending = true;
      else manual += Number(answer.awarded_points);
      continue;
    }
    const key = relation(question.quiz_answer_keys);
    const correct = Boolean(answer) && automaticAnswersEqual(question.question_type, key.correct_answer, answer?.submitted_answer);
    const awarded = correct ? Number(question.points) : 0; auto += awarded;
    if (answer) {
      const updated = await supabase.from("quiz_attempt_answers").update({ is_correct: correct, awarded_points: awarded, graded_at: new Date().toISOString(), graded_by: "Automatic grading", updated_at: new Date().toISOString() }).eq("id", answer.id);
      if (updated.error) throw new LmsAdminDataError("Automatic quiz grading could not be saved.");
    }
  }
  const maxPoints = (questions.data ?? []).reduce((sum, question) => sum + Number(question.points), 0);
  const total = auto + manual; const percentage = scorePercentage(total, maxPoints); const now = new Date().toISOString();
  const values = manualPending ? { attempt_status: "awaiting_review", auto_score_points: auto, manual_score_points: manual, total_score_points: null, max_points: maxPoints, score_percentage: null, passed: null, graded_at: null, graded_by: null, updated_at: now } : { attempt_status: "graded", auto_score_points: auto, manual_score_points: manual, total_score_points: total, max_points: maxPoints, score_percentage: percentage, passed: percentage >= Number(quiz.passing_score_percentage), graded_at: now, graded_by: actorReference(actor), updated_at: now };
  const saved = await supabase.from("quiz_attempts").update(values).eq("id", attemptId).select("*").single();
  if (saved.error) throw new LmsAdminDataError("Quiz result could not be finalized.");
  if (!manualPending) {
    await recordLmsAudit(supabase, { action: "quiz_attempt_graded", entityType: "quiz_attempt", entityId: attemptId, actorUserId: actor.actorUserId, metadata: { quiz_id: quiz.id, score_percentage: percentage, passed: saved.data.passed } });
    await syncQuizRecordingEvidence(supabase, saved.data as Row, quiz, actor);
  }
  return saved.data;
}

async function finishAutomaticQuizAttempt(
  supabase: SupabaseClient,
  attempt: Row,
  quiz: Row,
  reason: "expired" | "visibility_policy",
  actor: AssessmentActor,
) {
  const now = new Date().toISOString();
  const eventType = reason === "expired" ? "expired_auto_submitted" : "visibility_policy_auto_submitted";
  const values = {
    attempt_status: "submitted",
    submitted_at: now,
    auto_submitted_at: now,
    expiry_finalized_at: reason === "expired" ? now : null,
    finalisation_reason: reason,
    updated_at: now,
  };
  const claimed = await supabase.from("quiz_attempts").update(values).eq("id", attempt.id).eq("attempt_status", "in_progress").select("*").maybeSingle();
  if (claimed.error) throw new LmsAdminDataError("The quiz attempt could not be finalised.");
  if (!claimed.data) {
    const current = await supabase.from("quiz_attempts").select("*").eq("id", attempt.id).maybeSingle();
    if (current.error || !current.data) invalid("Quiz attempt not found.", 404);
    if (current.data.attempt_status === "submitted" && current.data.finalisation_reason === reason) {
      return calculateQuizAttempt(supabase, String(attempt.id), actor);
    }
    return current.data;
  }
  const event = await supabase.from("quiz_attempt_events").upsert({
    quiz_attempt_id: attempt.id,
    event_type: eventType,
    event_key: eventType,
    metadata: { quiz_id: quiz.id, saved_answers_preserved: true },
    actor_user_id: actor.actorUserId ?? null,
    actor_label: actor.actorLabel,
  }, { onConflict: "quiz_attempt_id,event_key", ignoreDuplicates: true });
  if (event.error) throw new LmsAdminDataError("The automatic-submission audit event could not be preserved.");
  const graded = await calculateQuizAttempt(supabase, String(attempt.id), actor);
  await recordLmsAudit(supabase, {
    action: reason === "expired" ? "quiz_attempt_expired_auto_submitted" : "quiz_visibility_policy_auto_submitted",
    entityType: "quiz_attempt",
    entityId: String(attempt.id),
    actorUserId: actor.actorUserId,
    metadata: { quiz_id: quiz.id, finalisation_reason: reason, saved_answers_preserved: true },
  });
  return graded;
}

export async function finalizeExpiredQuizAttempt(supabase: SupabaseClient, attemptId: string, actor: AssessmentActor = { actorLabel: "System" }) {
  const result = await supabase.from("quiz_attempts").select("*, quizzes(*)").eq("id", attemptId).maybeSingle();
  if (result.error || !result.data) invalid("Quiz attempt not found.", 404);
  const attempt = result.data as Row;
  const quiz = relation(attempt.quizzes);
  if (attempt.attempt_status === "submitted" && attempt.finalisation_reason === "expired") {
    return calculateQuizAttempt(supabase, attemptId, actor);
  }
  if (attempt.attempt_status !== "in_progress") return attempt;
  if (!attempt.expires_at || Date.parse(String(attempt.expires_at)) > Date.now()) invalid("This quiz attempt has not expired.", 409);
  return finishAutomaticQuizAttempt(supabase, attempt, quiz, "expired", actor);
}

export async function finalizeExpiredQuizAttempts(supabase: SupabaseClient, limit = 100) {
  const boundedLimit = Math.max(1, Math.min(500, Math.floor(limit)));
  const [expired, interrupted] = await Promise.all([
    supabase
      .from("quiz_attempts")
      .select("id")
      .eq("attempt_status", "in_progress")
      .not("expires_at", "is", null)
      .lte("expires_at", new Date().toISOString())
      .order("expires_at")
      .limit(boundedLimit),
    supabase
      .from("quiz_attempts")
      .select("id, finalisation_reason, quizzes(*)")
      .eq("attempt_status", "submitted")
      .in("finalisation_reason", ["expired", "visibility_policy"])
      .order("submitted_at")
      .limit(boundedLimit),
  ]);
  if (expired.error || interrupted.error) throw new LmsAdminDataError("Expired quiz attempts could not be loaded.");
  const finalized: string[] = [];
  for (const attempt of expired.data ?? []) {
    await finalizeExpiredQuizAttempt(supabase, String(attempt.id), { actorLabel: "System" });
    finalized.push(String(attempt.id));
  }
  const recovered: string[] = [];
  for (const attempt of interrupted.data ?? []) {
    const quiz = relation(attempt.quizzes);
    await finishAutomaticQuizAttempt(supabase, attempt as Row, quiz, attempt.finalisation_reason === "expired" ? "expired" : "visibility_policy", { actorLabel: "System" });
    recovered.push(String(attempt.id));
  }
  return { finalized, recovered, count: finalized.length + recovered.length };
}

export async function submitQuizAttempt(supabase: SupabaseClient, profileId: string, attemptId: string, actor: AssessmentActor) {
  const { attempt, quiz } = await resolveOwnedAttempt(supabase, profileId, attemptId);
  if (attempt.attempt_status === "submitted" && attempt.finalisation_reason === "student_submitted") {
    return calculateQuizAttempt(supabase, attemptId, actor);
  }
  if (attempt.attempt_status !== "in_progress") invalid("This quiz attempt has already been submitted.", 409);
  if (attempt.expires_at && Date.parse(String(attempt.expires_at)) <= Date.now()) {
    return finalizeExpiredQuizAttempt(supabase, attemptId, { actorLabel: "System" });
  }
  const now = new Date().toISOString();
  const submitted = await supabase.from("quiz_attempts").update({ attempt_status: "submitted", submitted_at: now, finalisation_reason: "student_submitted", updated_at: now }).eq("id", attemptId).eq("attempt_status", "in_progress").select("id").maybeSingle();
  if (submitted.error) throw new LmsAdminDataError("Quiz attempt could not be submitted.");
  if (!submitted.data) invalid("This quiz attempt has already been submitted.", 409);
  await recordLmsAudit(supabase, { action: "quiz_attempt_submitted", entityType: "quiz_attempt", entityId: attemptId, actorUserId: actor.actorUserId, metadata: { quiz_id: quiz.id, expired: Boolean(attempt.expires_at && Date.parse(String(attempt.expires_at)) <= Date.now()) } });
  return calculateQuizAttempt(supabase, attemptId, actor);
}

export async function recordQuizAttemptVisibilityEvent(
  supabase: SupabaseClient,
  profileId: string,
  attemptId: string,
  body: Row,
  actor: AssessmentActor,
) {
  const eventType = requiredText(body.event_type, "Choose a visibility event.", 40);
  if (!["visibility_hidden", "visibility_returned"].includes(eventType)) invalid("Choose a valid visibility event.");
  const eventId = requiredText(body.event_id, "A visibility event identifier is required.", 80);
  if (!/^[a-zA-Z0-9_-]{8,80}$/.test(eventId)) invalid("The visibility event identifier is not valid.");
  const { attempt, quiz } = await resolveOwnedAttempt(supabase, profileId, attemptId);
  if (attempt.attempt_status !== "in_progress") return { active: false, warning: null, hiddenEventCount: Number(attempt.tab_exit_count ?? 0), flagged: false, autoSubmitted: false };
  if (attempt.expires_at && Date.parse(String(attempt.expires_at)) <= Date.now()) {
    await finalizeExpiredQuizAttempt(supabase, attemptId, { actorLabel: "System" });
    return { active: false, warning: null, hiddenEventCount: Number(attempt.tab_exit_count ?? 0), flagged: false, autoSubmitted: true };
  }
  if (quiz.tab_monitoring_enabled !== true) return { active: true, warning: null, hiddenEventCount: Number(attempt.tab_exit_count ?? 0), flagged: false, autoSubmitted: false };
  const inserted = await supabase.from("quiz_attempt_events").upsert({
    quiz_attempt_id: attemptId,
    event_type: eventType,
    event_key: `${eventType}-${eventId}`,
    metadata: { source: "document_visibility" },
    actor_user_id: actor.actorUserId ?? null,
    actor_label: actor.actorLabel,
  }, { onConflict: "quiz_attempt_id,event_key", ignoreDuplicates: true });
  if (inserted.error) throw new LmsAdminDataError("The quiz visibility event could not be recorded.");
  const count = await supabase.from("quiz_attempt_events").select("id", { count: "exact", head: true }).eq("quiz_attempt_id", attemptId).eq("event_type", "visibility_hidden");
  if (count.error) throw new LmsAdminDataError("Quiz visibility events could not be counted.");
  const hiddenEventCount = count.count ?? 0;
  const updated = await supabase.from("quiz_attempts").update({ tab_exit_count: hiddenEventCount, updated_at: new Date().toISOString() }).eq("id", attemptId).eq("attempt_status", "in_progress").lt("tab_exit_count", hiddenEventCount);
  if (updated.error) throw new LmsAdminDataError("The quiz visibility count could not be updated.");
  const outcome = tabPolicyOutcome({
    hiddenEventCount,
    monitoringEnabled: true,
    warningThreshold: Number(quiz.tab_warning_threshold ?? defaultQuizTabPolicy.warningThreshold),
    flagThreshold: Number(quiz.tab_flag_threshold ?? defaultQuizTabPolicy.flagThreshold),
    autoSubmitThreshold: quiz.tab_auto_submit_threshold === null || quiz.tab_auto_submit_threshold === undefined ? null : Number(quiz.tab_auto_submit_threshold),
  });
  let flagged = false;
  if (eventType === "visibility_hidden" && outcome.flag) {
    const openedAt = new Date().toISOString();
    const review = await supabase.from("quiz_attempts").update({
      integrity_status: "under_review",
      integrity_review_opened_at: openedAt,
      integrity_review_opened_by: "Automatic visibility policy",
      integrity_review_reason: `The assessment window was hidden ${hiddenEventCount} times. This is a factual event record for academic review.`,
      integrity_resolved_at: null,
      integrity_resolved_by: null,
      integrity_decision: null,
      integrity_resolution_reason: null,
      updated_at: openedAt,
    }).eq("id", attemptId).neq("integrity_status", "under_review").eq("official_result_eligible", true).select("id, course_enrollment_id").maybeSingle();
    if (review.error) throw new LmsAdminDataError("The visibility review could not be opened.");
    flagged = Boolean(review.data);
    if (review.data) {
      const reviewEvent = await supabase.from("quiz_attempt_events").upsert({
        quiz_attempt_id: attemptId,
        event_type: "integrity_review_opened",
        event_key: `visibility-review-${hiddenEventCount}`,
        metadata: { trigger: "visibility_threshold", hidden_event_count: hiddenEventCount },
        actor_label: "System",
      }, { onConflict: "quiz_attempt_id,event_key", ignoreDuplicates: true });
      if (reviewEvent.error) throw new LmsAdminDataError("The visibility-review audit event could not be preserved.");
      await recordLmsAudit(supabase, { action: "quiz_integrity_review_opened", entityType: "quiz_attempt", entityId: attemptId, actorUserId: actor.actorUserId, metadata: { reason: "Visibility threshold reached.", hidden_event_count: hiddenEventCount } });
      await triggerEngagementEvaluationForCourseEnrollment(supabase, review.data.course_enrollment_id);
    }
  }
  if (eventType === "visibility_hidden" && outcome.autoSubmit) {
    await finishAutomaticQuizAttempt(supabase, attempt, quiz, "visibility_policy", { actorLabel: "System" });
    return { active: false, warning: "This attempt was submitted under the assessment visibility policy.", hiddenEventCount, flagged: flagged || outcome.flag, autoSubmitted: true };
  }
  const warning = outcome.warning === "none"
    ? null
    : outcome.warning === "first"
      ? "You left the assessment window. This event has been recorded. Please remain on this page until you finish the assessment."
      : "Multiple exits from the assessment window have been recorded. Continued interruptions may cause this attempt to be referred for academic-integrity review.";
  return { active: true, warning, hiddenEventCount, flagged: flagged || outcome.flag, autoSubmitted: false };
}

export async function gradeQuizAnswer(supabase: SupabaseClient, answerId: string, body: Row, actor: AssessmentActor) {
  const answerResult = await supabase.from("quiz_attempt_answers").select("*, quiz_questions(id, quiz_id, question_type, points), quiz_attempts(id, attempt_status, official_result_eligible)").eq("id", answerId).maybeSingle();
  if (answerResult.error || !answerResult.data) invalid("Quiz answer not found.", 404);
  const answer = answerResult.data as Row; const question = relation(answer.quiz_questions); const attempt = relation(answer.quiz_attempts);
  if (attempt.official_result_eligible === false) invalid("This attempt is not eligible for grading.", 409);
  if (question.question_type !== "short_answer") invalid("Only short-answer questions require manual grading.");
  const points = numberValue(body.awarded_points, "Awarded points must be within the question maximum.", 0, Number(question.points));
  const changed = answer.awarded_points !== null && Number(answer.awarded_points) !== points; const reason = optionalText(body.change_reason, 2000);
  if (changed && !reason) invalid("A reason is required when correcting an existing quiz grade.", 409);
  if (changed) {
    const event = await supabase.from("assessment_grade_change_events").insert({ assessment_type: "quiz", assessment_id: question.quiz_id, record_id: attempt.id, previous_score: answer.awarded_points, new_score: points, reason, changed_by: actorReference(actor) });
    if (event.error) throw new LmsAdminDataError("Quiz grade correction history could not be preserved.");
    await recordLmsAudit(supabase, { action: "quiz_grade_corrected", entityType: "quiz_attempt", entityId: String(attempt.id), actorUserId: actor.actorUserId, metadata: { answer_id: answerId, previous_points: answer.awarded_points, new_points: points, reason } });
  }
  const now = new Date().toISOString();
  const saved = await supabase.from("quiz_attempt_answers").update({ awarded_points: points, is_correct: null, feedback: optionalText(body.feedback, 10_000), graded_at: now, graded_by: actorReference(actor), updated_at: now }).eq("id", answerId);
  if (saved.error) throw new LmsAdminDataError("Manual quiz grade could not be saved.");
  return calculateQuizAttempt(supabase, String(attempt.id), actor);
}

export async function flagAssessmentIntegrity(supabase: SupabaseClient, type: "assignment" | "quiz", recordId: string, body: Row, actor: AssessmentActor) {
  const reason = requiredText(body.reason, "A neutral academic-review reason is required.", 2000);
  const evidenceNote = optionalText(body.evidence_note, 5000);
  const now = new Date().toISOString();
  const saved = type === "assignment"
    ? await supabase.from("assignment_submissions").update({ submission_status: "under_integrity_review", updated_at: now }).eq("id", recordId).select("id, course_enrollment_id").single()
    : await supabase.from("quiz_attempts").update({
      integrity_status: "under_review",
      integrity_review_opened_at: now,
      integrity_review_opened_by: actorReference(actor),
      integrity_review_reason: reason,
      integrity_resolved_at: null,
      integrity_resolved_by: null,
      integrity_decision: null,
      integrity_resolution_reason: null,
      updated_at: now,
    }).eq("id", recordId).eq("official_result_eligible", true).select("id, course_enrollment_id").single();
  if (saved.error) throw new LmsAdminDataError("Academic review could not be opened.");
  if (type === "quiz") {
    const event = await supabase.from("quiz_attempt_events").insert({
      quiz_attempt_id: recordId,
      event_type: "integrity_review_opened",
      metadata: { reason, evidence_note: evidenceNote, source: "authorised_actor" },
      actor_user_id: actor.actorUserId ?? null,
      actor_label: actor.actorLabel,
    });
    if (event.error) throw new LmsAdminDataError("The academic-review audit event could not be preserved.");
  }
  await recordLmsAudit(supabase, { action: type === "assignment" ? "assignment_integrity_review_opened" : "quiz_integrity_review_opened", entityType: type === "assignment" ? "assignment_submission" : "quiz_attempt", entityId: recordId, actorUserId: actor.actorUserId, metadata: { reason, evidence_note: evidenceNote, neutral_student_message: "Your assessment is currently under academic review. REALMS may contact you for clarification." } });
  await triggerEngagementEvaluationForCourseEnrollment(supabase, saved.data.course_enrollment_id);
  return saved.data;
}

export async function resolveQuizAttemptIntegrity(supabase: SupabaseClient, attemptId: string, body: Row, actor: AssessmentActor) {
  const decision = requiredText(body.decision, "Choose an integrity-review outcome.", 60) as QuizIntegrityDecision;
  if (!(quizIntegrityDecisions as readonly string[]).includes(decision) || decision === "replacement_granted") invalid("Choose a supported integrity-review outcome.");
  const reason = requiredText(body.reason, "A documented integrity-review reason is required.", 2000);
  if (reason.length < 10) invalid("Provide a specific integrity-review reason of at least 10 characters.");
  const namedActor = actorReference(actor);
  const result = await supabase.rpc("resolve_quiz_attempt_integrity", { p_attempt_id: attemptId, p_decision: decision, p_reason: reason, p_actor: namedActor });
  if (result.error || !result.data?.[0]) throw new LmsAdminDataError(result.error?.message ?? "The integrity review could not be resolved.");
  const saved = result.data[0] as Row;
  await recordLmsAudit(supabase, { action: "quiz_integrity_review_resolved", entityType: "quiz_attempt", entityId: attemptId, actorUserId: actor.actorUserId, metadata: { decision, reason, decided_by: namedActor } });
  await triggerEngagementEvaluationForCourseEnrollment(supabase, String(saved.course_enrollment_id));
  return saved;
}

export async function grantQuizReplacementAttempt(supabase: SupabaseClient, attemptId: string, body: Row, actor: AssessmentActor) {
  const reason = requiredText(body.reason, "A documented replacement-attempt reason is required.", 2000);
  if (reason.length < 10) invalid("Provide a specific replacement-attempt reason of at least 10 characters.");
  if (body.confirm_replacement !== true) invalid("Confirm that the original attempt will be excluded and one replacement attempt granted.", 409);
  const namedActor = actorReference(actor);
  const result = await supabase.rpc("grant_quiz_replacement_attempt", { p_attempt_id: attemptId, p_reason: reason, p_actor: namedActor });
  if (result.error || !result.data?.[0]) throw new LmsAdminDataError(result.error?.message ?? "The replacement attempt could not be granted.");
  const grant = result.data[0] as Row;
  await recordLmsAudit(supabase, { action: "quiz_replacement_attempt_granted", entityType: "quiz_attempt", entityId: attemptId, actorUserId: actor.actorUserId, metadata: { replacement_grant_id: grant.id, reason, granted_by: namedActor } });
  await triggerEngagementEvaluationForCourseEnrollment(supabase, String(grant.course_enrollment_id));
  return grant;
}

export const build8DomainCategories = assessmentCategories;
