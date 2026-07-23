import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { LmsAdminDataError } from "@/lib/lms/adminData";
import { humanizeAssessment } from "@/lib/lms/assessment";
import { resolveStudentCourseEnrollment } from "@/lib/lms/assessmentService";
import {
  applyQuizAttemptOrder,
  isOfficialQuizAttempt,
  normalQuizAttemptsUsed,
  quizAnswerReviewEligibility,
} from "@/lib/lms/quizIntegrity";

type Row = Record<string, unknown>;
export function assessmentClock() { return Date.now(); }
function object(value: unknown): Row { return value && typeof value === "object" && !Array.isArray(value) ? value as Row : {}; }
function relation(value: unknown) { return Array.isArray(value) ? object(value[0]) : object(value); }
function fail(message: string, error: { code?: string; message?: string } | null) { if (error) { console.error(message, { code: error.code }); throw new LmsAdminDataError(message); } }
function contentReadiness(status: unknown, content: unknown, supportingCount = 0) {
  if (status === "published") return "published";
  if (`${content ?? ""}`.includes("CONTENT PENDING FACILITATOR TEACHING / ACADEMIC REVIEW") || supportingCount === 0) return "content_pending";
  return "ready_for_review";
}

export type AssessmentFilters = { cohort?: string; course?: string; type?: string; domain?: string; category?: string; status?: string; due?: string };

export async function fetchAssessmentOptions(supabase: SupabaseClient) {
  const [offerings, sessions] = await Promise.all([
    supabase.from("cohort_courses").select("id, cohort_id, course_id, cohorts(id, code, name), courses(id, code, title, course_category)").order("created_at"),
    supabase.from("class_sessions").select("id, cohort_course_id, title, scheduled_start_at").order("scheduled_start_at", { ascending: true, nullsFirst: false }),
  ]);
  fail("Assessment course options could not be loaded.", offerings.error); fail("Assessment session options could not be loaded.", sessions.error);
  return { offerings: offerings.data ?? [], sessions: sessions.data ?? [] };
}

export async function fetchAdminAssignments(supabase: SupabaseClient, filters: AssessmentFilters = {}) {
  const result = await supabase.from("assignments").select("*, cohort_courses(id, cohort_id, course_id, cohorts(id, code, name), courses(id, code, title, course_category)), assignment_submissions(id, submission_status, is_late, review_outcome)").order("due_at", { ascending: true, nullsFirst: false }).limit(5000);
  fail("Assignments could not be loaded.", result.error);
  return (result.data ?? []).map((raw) => {
    const row = raw as unknown as Row; const offering = relation(row.cohort_courses); const submissions = (row.assignment_submissions ?? []) as Row[];
    return { ...row, content_readiness: contentReadiness(row.assignment_status, `${row.description ?? ""} ${row.instructions ?? ""}`, 1), submission_count: submissions.length, awaiting_review_count: submissions.filter((item) => item.submission_status === "submitted" || item.submission_status === "awaiting_review").length, late_submission_count: submissions.filter((item) => item.is_late).length, cohort: relation(offering.cohorts), course: relation(offering.courses) } as Row & { submission_count: number; awaiting_review_count: number; late_submission_count: number; cohort: Row; course: Row };
  }).filter((item) => {
    const offering = relation(item.cohort_courses); const due = typeof item.due_at === "string" ? Date.parse(item.due_at) : null;
    if (filters.cohort && offering.cohort_id !== filters.cohort) return false;
    if (filters.course && offering.course_id !== filters.course) return false;
    if (filters.type && item.assignment_type !== filters.type) return false;
    if (filters.domain && item.assessment_domain !== filters.domain) return false;
    if (filters.category && item.assessment_category !== filters.category) return false;
    if (filters.status && item.assignment_status !== filters.status) return false;
    if (filters.due === "overdue" && (!due || due >= Date.now())) return false;
    if (filters.due === "future" && (!due || due < Date.now())) return false;
    return true;
  });
}

export async function fetchAssignmentDetail(supabase: SupabaseClient, assignmentId: string) {
  const [assignment, rubric, submissions, changes] = await Promise.all([
    supabase.from("assignments").select("*, cohort_courses(id, cohort_id, course_id, cohorts(id, code, name), courses(id, code, title, course_category)), class_sessions(id, title)").eq("id", assignmentId).maybeSingle(),
    supabase.from("assignment_rubric_criteria").select("*").eq("assignment_id", assignmentId).order("sort_order"),
    supabase.from("assignment_submissions").select("*, course_enrollments(id, student_enrollments(id, students(id, student_number, legal_name, preferred_name))), assignment_rubric_scores(*), assignment_submission_artifacts(id, title, artifact_type, file_name, mime_type, size_bytes, artifact_status, created_at)").eq("assignment_id", assignmentId).order("submitted_at", { ascending: false, nullsFirst: false }),
    supabase.from("assessment_grade_change_events").select("*").eq("assessment_type", "assignment").eq("assessment_id", assignmentId).order("created_at", { ascending: false }),
  ]);
  fail("Assignment could not be loaded.", assignment.error); fail("Assignment rubric could not be loaded.", rubric.error); fail("Assignment submissions could not be loaded.", submissions.error); fail("Assignment grade history could not be loaded.", changes.error);
  if (!assignment.data) throw new LmsAdminDataError("Assignment not found.", 404);
  return { assignment: assignment.data, rubric: rubric.data ?? [], submissions: submissions.data ?? [], gradeChanges: changes.data ?? [] };
}

export async function fetchAdminQuizzes(supabase: SupabaseClient, filters: AssessmentFilters = {}) {
  const result = await supabase.from("quizzes").select("*, cohort_courses(id, cohort_id, course_id, cohorts(id, code, name), courses(id, code, title, course_category)), quiz_questions(id), quiz_attempts(id, attempt_status)").order("opens_at", { ascending: true, nullsFirst: false }).limit(5000);
  fail("Quizzes could not be loaded.", result.error);
  return (result.data ?? []).map((raw) => { const row = raw as unknown as Row; const offering = relation(row.cohort_courses); const attempts = (row.quiz_attempts ?? []) as Row[]; const questions = (row.quiz_questions ?? []) as Row[]; return { ...row, content_readiness: contentReadiness(row.quiz_status, `${row.description ?? ""} ${row.instructions ?? ""}`, questions.length), question_count: questions.length, attempt_count: attempts.length, awaiting_review_count: attempts.filter((item) => item.attempt_status === "awaiting_review").length, cohort: relation(offering.cohorts), course: relation(offering.courses) } as Row & { question_count: number; attempt_count: number; awaiting_review_count: number; cohort: Row; course: Row }; }).filter((item) => {
    const offering = relation(item.cohort_courses);
    if (filters.cohort && offering.cohort_id !== filters.cohort) return false;
    if (filters.course && offering.course_id !== filters.course) return false;
    if (filters.type && item.quiz_type !== filters.type) return false;
    if (filters.domain && item.assessment_domain !== filters.domain) return false;
    if (filters.category && item.assessment_category !== filters.category) return false;
    if (filters.status && item.quiz_status !== filters.status) return false;
    return true;
  });
}

export async function fetchQuizDetail(supabase: SupabaseClient, quizId: string, includeKeys = true) {
  const quiz = await supabase.from("quizzes").select("*, cohort_courses(id, cohort_id, course_id, cohorts(id, code, name), courses(id, code, title, course_category)), class_sessions(id, title)").eq("id", quizId).maybeSingle();
  fail("Quiz could not be loaded.", quiz.error); if (!quiz.data) throw new LmsAdminDataError("Quiz not found.", 404);
  const questionSelect = includeKeys ? "*, quiz_answer_keys(id, question_id)" : "id, quiz_id, question_type, prompt, options, points, sort_order, is_required";
  const [questions, attempts, changes] = await Promise.all([
    supabase.from("quiz_questions").select(questionSelect).eq("quiz_id", quizId).order("sort_order"),
    supabase.from("quiz_attempts").select("*, course_enrollments(id, student_enrollments(id, students(id, student_number, legal_name, preferred_name))), quiz_attempt_answers(*, quiz_questions(id, prompt, question_type, points))").eq("quiz_id", quizId).order("started_at", { ascending: false }),
    supabase.from("assessment_grade_change_events").select("*").eq("assessment_type", "quiz").eq("assessment_id", quizId).order("created_at", { ascending: false }),
  ]);
  fail("Quiz questions could not be loaded.", questions.error); fail("Quiz attempts could not be loaded.", attempts.error); fail("Quiz grade history could not be loaded.", changes.error);
  const attemptIds = (attempts.data ?? []).map((attempt) => attempt.id);
  const [events, decisions, replacementGrants] = attemptIds.length ? await Promise.all([
    supabase.from("quiz_attempt_events").select("*").in("quiz_attempt_id", attemptIds).order("occurred_at", { ascending: false }),
    supabase.from("quiz_attempt_integrity_decisions").select("*").in("quiz_attempt_id", attemptIds).order("decided_at", { ascending: false }),
    supabase.from("quiz_attempt_replacement_grants").select("*").eq("quiz_id", quizId).order("granted_at", { ascending: false }),
  ]) : [
    { data: [], error: null },
    { data: [], error: null },
    { data: [], error: null },
  ];
  fail("Quiz attempt events could not be loaded.", events.error);
  fail("Quiz integrity decisions could not be loaded.", decisions.error);
  fail("Quiz replacement grants could not be loaded.", replacementGrants.error);
  const enrichedAttempts = (attempts.data ?? []).map((attempt) => ({
    ...attempt,
    integrity_events: (events.data ?? []).filter((event) => event.quiz_attempt_id === attempt.id),
    integrity_decisions: (decisions.data ?? []).filter((decision) => decision.quiz_attempt_id === attempt.id),
    replacement_grants: (replacementGrants.data ?? []).filter((grant) => grant.original_attempt_id === attempt.id || grant.replacement_attempt_id === attempt.id),
  }));
  return { quiz: quiz.data, questions: (questions.data ?? []) as unknown as Row[], attempts: enrichedAttempts, gradeChanges: changes.data ?? [] };
}

async function studentIdentity(supabase: SupabaseClient, profileId: string) {
  const student = await supabase.from("students").select("id").eq("profile_id", profileId).maybeSingle();
  if (student.error || !student.data) throw new LmsAdminDataError("Student access required.", 403);
  const enrollments = await supabase.from("course_enrollments").select("id, cohort_course_id, enrollment_status, student_enrollments!inner(student_id)").eq("student_enrollments.student_id", student.data.id).in("enrollment_status", ["active", "enrolled"]);
  fail("Student assessment enrolments could not be loaded.", enrollments.error);
  return { studentId: student.data.id, enrollments: enrollments.data ?? [], enrollmentByOffering: new Map((enrollments.data ?? []).map((item) => [item.cohort_course_id, item])) };
}

export async function fetchStudentAssignments(supabase: SupabaseClient, profileId: string) {
  const identity = await studentIdentity(supabase, profileId); const offeringIds = [...identity.enrollmentByOffering.keys()];
  if (!offeringIds.length) return [];
  const assignments = await supabase.from("assignments").select("*, cohort_courses(id, courses(id, code, title), cohorts(id, code, name))").in("cohort_course_id", offeringIds).eq("assignment_status", "published").order("due_at", { ascending: true, nullsFirst: false });
  fail("Student assignments could not be loaded.", assignments.error);
  const assignmentIds = (assignments.data ?? []).map((item) => item.id); const enrollmentIds = identity.enrollments.map((item) => item.id);
  const submissions = assignmentIds.length ? await supabase.from("assignment_submissions").select("id, assignment_id, course_enrollment_id, attempt_number, submission_status, submitted_at, is_late, score_points, score_percentage, review_outcome, feedback").in("assignment_id", assignmentIds).in("course_enrollment_id", enrollmentIds).order("attempt_number", { ascending: false }) : { data: [], error: null };
  fail("Student submission history could not be loaded.", submissions.error);
  return (assignments.data ?? []).map((assignment) => ({ ...assignment, submissions: (submissions.data ?? []).filter((item) => item.assignment_id === assignment.id), latest_submission: (submissions.data ?? []).find((item) => item.assignment_id === assignment.id) ?? null }));
}

export async function fetchStudentAssignment(supabase: SupabaseClient, profileId: string, assignmentId: string) {
  const assignment = await supabase.from("assignments").select("*, cohort_courses(id, courses(id, code, title), cohorts(id, code, name)), class_sessions(id, title)").eq("id", assignmentId).eq("assignment_status", "published").maybeSingle();
  fail("Student assignment could not be loaded.", assignment.error); if (!assignment.data) throw new LmsAdminDataError("This assignment is not available.", 404);
  const enrollment = await resolveStudentCourseEnrollment(supabase, profileId, assignment.data.cohort_course_id);
  const [rubric, submissions] = await Promise.all([
    supabase.from("assignment_rubric_criteria").select("id, criterion, description, max_points, sort_order").eq("assignment_id", assignmentId).order("sort_order"),
    supabase.from("assignment_submissions").select("id, attempt_number, response_text, repository_url, deployment_url, external_url, submission_status, submitted_at, is_late, score_points, score_percentage, review_outcome, feedback, graded_at, assignment_submission_artifacts(id, title, artifact_type, file_name, mime_type, size_bytes, artifact_status, created_at)").eq("assignment_id", assignmentId).eq("course_enrollment_id", enrollment.id).order("attempt_number", { ascending: false }),
  ]);
  fail("Published rubric could not be loaded.", rubric.error); fail("Your submissions could not be loaded.", submissions.error);
  return { assignment: assignment.data, rubric: rubric.data ?? [], submissions: submissions.data ?? [], enrollment };
}

export async function fetchStudentQuizzes(supabase: SupabaseClient, profileId: string) {
  const identity = await studentIdentity(supabase, profileId); const offeringIds = [...identity.enrollmentByOffering.keys()];
  if (!offeringIds.length) return [];
  const quizzes = await supabase.from("quizzes").select("*, cohort_courses(id, courses(id, code, title), cohorts(id, code, name))").in("cohort_course_id", offeringIds).eq("quiz_status", "published").order("opens_at", { ascending: true, nullsFirst: false });
  fail("Student quizzes could not be loaded.", quizzes.error);
  const quizIds = (quizzes.data ?? []).map((item) => item.id); const enrollmentIds = identity.enrollments.map((item) => item.id);
  const [attempts, replacementGrants] = quizIds.length ? await Promise.all([
    supabase.from("quiz_attempts").select("id, quiz_id, course_enrollment_id, attempt_number, attempt_status, started_at, expires_at, submitted_at, auto_submitted_at, finalisation_reason, score_percentage, passed, integrity_status, integrity_decision, official_result_eligible, replacement_for_attempt_id, replacement_status").in("quiz_id", quizIds).in("course_enrollment_id", enrollmentIds).order("attempt_number", { ascending: false }),
    supabase.from("quiz_attempt_replacement_grants").select("id, quiz_id, course_enrollment_id, original_attempt_id, grant_status").in("quiz_id", quizIds).in("course_enrollment_id", enrollmentIds).eq("grant_status", "pending"),
  ]) : [{ data: [], error: null }, { data: [], error: null }];
  fail("Student quiz attempts could not be loaded.", attempts.error);
  fail("Student replacement-attempt eligibility could not be loaded.", replacementGrants.error);
  return (quizzes.data ?? []).map((quiz) => {
    const quizAttempts = (attempts.data ?? []).filter((attempt) => attempt.quiz_id === quiz.id);
    const pendingReplacement = (replacementGrants.data ?? []).find((grant) => grant.quiz_id === quiz.id) ?? null;
    return {
      ...quiz,
      attempts: quizAttempts,
      latest_attempt: quizAttempts[0] ?? null,
      normal_attempts_used: normalQuizAttemptsUsed(quizAttempts),
      pending_replacement: pendingReplacement,
      attempts_remaining: Math.max(0, Number(quiz.max_attempts) - normalQuizAttemptsUsed(quizAttempts)) + (pendingReplacement ? 1 : 0),
    };
  });
}

export async function fetchStudentQuiz(supabase: SupabaseClient, profileId: string, quizId: string) {
  const quiz = await supabase.from("quizzes").select("*, cohort_courses(id, courses(id, code, title), cohorts(id, code, name)), class_sessions(id, title)").eq("id", quizId).eq("quiz_status", "published").maybeSingle();
  fail("Student quiz could not be loaded.", quiz.error); if (!quiz.data) throw new LmsAdminDataError("This quiz is not available.", 404);
  const enrollment = await resolveStudentCourseEnrollment(supabase, profileId, quiz.data.cohort_course_id);
  const [attempts, replacementGrants] = await Promise.all([
    supabase.from("quiz_attempts").select("id, attempt_number, attempt_status, started_at, expires_at, submitted_at, auto_submitted_at, expiry_finalized_at, finalisation_reason, total_score_points, max_points, score_percentage, passed, graded_at, question_order, option_orders, tab_exit_count, integrity_status, integrity_review_opened_at, integrity_decision, integrity_resolved_at, official_result_eligible, replacement_for_attempt_id, replacement_status").eq("quiz_id", quizId).eq("course_enrollment_id", enrollment.id).order("attempt_number", { ascending: false }),
    supabase.from("quiz_attempt_replacement_grants").select("id, original_attempt_id, replacement_attempt_id, grant_status, granted_at").eq("quiz_id", quizId).eq("course_enrollment_id", enrollment.id).eq("grant_status", "pending"),
  ]);
  fail("Your quiz attempts could not be loaded.", attempts.error);
  fail("Your replacement-attempt eligibility could not be loaded.", replacementGrants.error);
  const now = assessmentClock();
  const allAttempts = attempts.data ?? [];
  const active = allAttempts.find((attempt) => attempt.attempt_status === "in_progress" && (!attempt.expires_at || Date.parse(attempt.expires_at) > now)) ?? null;
  const hasPendingReplacement = Boolean(replacementGrants.data?.length);
  const withinWindow = (!quiz.data.opens_at || Date.parse(quiz.data.opens_at) <= now) && (!quiz.data.closes_at || Date.parse(quiz.data.closes_at) > now);
  const review = quizAnswerReviewEligibility({
    permitsReview: quiz.data.show_correct_answers === true,
    reviewableAt: quiz.data.answers_reviewable_at,
    now: new Date(now),
    hasActiveAttempt: Boolean(active),
    hasAttemptUnderReview: allAttempts.some((attempt) => attempt.integrity_status === "under_review"),
    hasPendingReplacement,
    hasAvailableNormalAttempt: withinWindow && normalQuizAttemptsUsed(allAttempts) < Number(quiz.data.max_attempts),
    hasCompletedOfficialAttempt: allAttempts.some((attempt) => attempt.attempt_status === "graded" && isOfficialQuizAttempt(attempt)),
  });
  let questions: Row[] = [];
  if (active || review.eligible) {
    const result = await supabase.from("quiz_questions").select("id, question_type, prompt, options, points, sort_order, is_required").eq("quiz_id", quizId).order("sort_order");
    fail("Quiz questions could not be loaded.", result.error);
    questions = (result.data ?? []) as unknown as Row[];
  }
  if (active) {
    questions = applyQuizAttemptOrder(questions as Array<Row & { id: string; question_type: string; options?: readonly unknown[] | null }>, {
      questionOrder: Array.isArray(active.question_order) ? active.question_order.map(String) : [],
      optionOrders: object(active.option_orders) as Record<string, number[]>,
    });
  }
  let answers: Row[] = [];
  if (active) {
    const result = await supabase.from("quiz_attempt_answers").select("id, question_id, submitted_answer, updated_at").eq("quiz_attempt_id", active.id);
    fail("Saved quiz answers could not be loaded.", result.error); answers = (result.data ?? []) as Row[];
  }
  let correctAnswers: Row[] = [];
  if (review.eligible) {
    const reviewAttempt = allAttempts.find((attempt) => attempt.attempt_status === "graded" && isOfficialQuizAttempt(attempt));
    if (reviewAttempt) {
      questions = applyQuizAttemptOrder(questions as Array<Row & { id: string; question_type: string; options?: readonly unknown[] | null }>, {
        questionOrder: Array.isArray(reviewAttempt.question_order) ? reviewAttempt.question_order.map(String) : [],
        optionOrders: object(reviewAttempt.option_orders) as Record<string, number[]>,
      });
    }
    const keys = await supabase.from("quiz_answer_keys").select("question_id, correct_answer").in("question_id", questions.filter((question) => question.question_type !== "short_answer").map((question) => String(question.id)));
    fail("Permitted quiz answer review could not be loaded.", keys.error); correctAnswers = (keys.data ?? []) as Row[];
  }
  const safeAttempts = allAttempts.map((attempt) => quiz.data.show_score_after_submission ? attempt : { ...attempt, total_score_points: null, max_points: null, score_percentage: null, passed: null });
  return {
    quiz: quiz.data,
    questions,
    attempts: safeAttempts,
    activeAttempt: active,
    answers,
    correctAnswers,
    enrollment,
    answerReview: review,
    pendingReplacement: replacementGrants.data?.[0] ?? null,
    normalAttemptsUsed: normalQuizAttemptsUsed(allAttempts),
    canStart: withinWindow && (normalQuizAttemptsUsed(allAttempts) < Number(quiz.data.max_attempts) || hasPendingReplacement),
  };
}

export async function fetchAssessmentOverview(supabase: SupabaseClient) {
  const now = new Date().toISOString();
  const queries = await Promise.all([
    supabase.from("assignments").select("id", { count: "exact", head: true }).eq("assignment_status", "published"),
    supabase.from("assignments").select("id", { count: "exact", head: true }).eq("assignment_status", "published").or(`due_at.is.null,due_at.gte.${now}`),
    supabase.from("assignment_submissions").select("id", { count: "exact", head: true }).in("submission_status", ["submitted", "awaiting_review"]),
    supabase.from("assignment_submissions").select("id", { count: "exact", head: true }).eq("is_late", true),
    supabase.from("assignment_submissions").select("id", { count: "exact", head: true }).eq("review_outcome", "revision_required"),
    supabase.from("quizzes").select("id", { count: "exact", head: true }).eq("quiz_status", "published"),
    supabase.from("quizzes").select("id", { count: "exact", head: true }).eq("quiz_status", "published").or(`closes_at.is.null,closes_at.gte.${now}`),
    supabase.from("quiz_attempts").select("id", { count: "exact", head: true }).eq("attempt_status", "awaiting_review"),
  ]);
  queries.forEach((query) => fail("Assessment metrics could not be loaded.", query.error));
  const values = queries.map((query) => query.count ?? 0);
  return { assignmentsPublished: values[0], openAssignments: values[1], submissionsAwaitingReview: values[2], lateSubmissions: values[3], resubmissionsRequired: values[4], quizzesPublished: values[5], activeQuizzes: values[6], quizAttemptsAwaitingReview: values[7] };
}

export function assessmentStudentStatus(item: { due_at?: string | null; latest_submission?: Row | null }) {
  const latest = item.latest_submission;
  if (latest?.submission_status === "under_integrity_review") return "under_integrity_review";
  if (latest?.review_outcome === "revision_required") return "revision_required";
  if (latest?.submission_status === "graded") return "graded";
  if (latest) return "awaiting_review";
  return item.due_at && Date.parse(item.due_at) < Date.now() ? "overdue" : "open";
}

export function courseLabel(row: unknown) { const offering = relation(object(row).cohort_courses); const course = relation(offering.courses); return `${String(course.code ?? "Course")} · ${String(course.title ?? humanizeAssessment(String(object(row).assessment_domain ?? "assessment")))}`; }
