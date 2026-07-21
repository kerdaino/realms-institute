import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { LmsAdminDataError } from "@/lib/lms/adminData";
import { selectCurrentStudentEnrollment } from "@/lib/lms/currentEnrollment";

type Row = Record<string, unknown>;
function object(value: unknown): Row { return value && typeof value === "object" && !Array.isArray(value) ? value as Row : {}; }
function relation(value: unknown): Row { return Array.isArray(value) ? object(value[0]) : object(value); }
function failed(error: { code?: string; message?: string } | null, message: string) { if (error) throw new LmsAdminDataError(message); }

export type ResultFilters = { cohort?: string; route?: string; skill?: string; outcome?: string; status?: string; missingGate?: string; integrityReview?: string };

export async function fetchResultConfiguration(supabase: SupabaseClient, cohortId?: string) {
  const cohorts = await supabase.from("cohorts").select("id, code, name, status").order("start_date", { ascending: false, nullsFirst: false });
  failed(cohorts.error, "Cohorts could not be loaded.");
  const selectedCohortId = cohortId ?? cohorts.data?.find((row) => row.status === "active")?.id ?? cohorts.data?.[0]?.id ?? null;
  if (!selectedCohortId) return { cohorts: cohorts.data ?? [], selectedCohortId: null, policy: null, categories: [], weightings: [], assignments: [], quizzes: [] };
  const policy = await supabase.from("programme_scoring_policies").select("*").eq("cohort_id", selectedCohortId).maybeSingle();
  failed(policy.error, "Scoring policy could not be loaded.");
  if (!policy.data) return { cohorts: cohorts.data ?? [], selectedCohortId, policy: null, categories: [], weightings: [], assignments: [], quizzes: [] };
  const [categories, assignments, quizzes] = await Promise.all([
    supabase.from("programme_score_categories").select("*").eq("scoring_policy_id", policy.data.id).order("sequence_number"),
    supabase.from("assignments").select("id, title, assessment_domain, assessment_category, assignment_status, cohort_course_id, cohort_courses!inner(cohort_id, courses(code, title, course_category, discipleship_route, skill_pathway))").eq("cohort_courses.cohort_id", selectedCohortId).order("title"),
    supabase.from("quizzes").select("id, title, assessment_domain, assessment_category, quiz_status, cohort_course_id, cohort_courses!inner(cohort_id, courses(code, title, course_category, discipleship_route, skill_pathway))").eq("cohort_courses.cohort_id", selectedCohortId).order("title"),
  ]);
  [categories, assignments, quizzes].forEach((result) => failed(result.error, "Result configuration could not be loaded."));
  const categoryIds = (categories.data ?? []).map((row) => row.id);
  const weightings = categoryIds.length ? await supabase.from("assessment_weightings").select("*").in("score_category_id", categoryIds).order("created_at") : { data: [], error: null };
  failed(weightings.error, "Assessment weightings could not be loaded.");
  const assignmentById = new Map((assignments.data ?? []).map((row) => [row.id, row]));
  const quizById = new Map((quizzes.data ?? []).map((row) => [row.id, row]));
  return { cohorts: cohorts.data ?? [], selectedCohortId, policy: policy.data, categories: categories.data ?? [], weightings: (weightings.data ?? []).map((row) => ({ ...row, assessment: row.assessment_type === "assignment" ? assignmentById.get(row.assessment_id) ?? null : quizById.get(row.assessment_id) ?? null })), assignments: assignments.data ?? [], quizzes: quizzes.data ?? [] };
}

export async function fetchAdminResults(supabase: SupabaseClient, filters: ResultFilters = {}) {
  const [enrollments, results, categories, components, trackers, engagement, defences, cohorts] = await Promise.all([
    supabase.from("student_enrollments").select("id, cohort_id, discipleship_route, skill_pathway, enrolment_status, students(id, student_number, legal_name, preferred_name), cohorts(id, code, name)").in("enrolment_status", ["active", "enrolled", "completed"]).order("enrolled_at", { ascending: false }).limit(5000),
    supabase.from("student_programme_results").select("*").limit(5000),
    supabase.from("programme_score_categories").select("id, category_code, category_name, score_domain, calculation_source, max_points").eq("active", true),
    supabase.from("student_component_scores").select("id, student_enrollment_id, score_category_id, evidence_complete, calculation_status").limit(20000),
    supabase.from("student_graduation_requirements").select("student_enrollment_id, requirement_status, graduation_requirement_definitions(requirement_code)").limit(20000),
    supabase.from("student_engagement_component_evaluations").select("student_enrollment_id, evaluation_status").limit(20000),
    supabase.from("capstone_defences").select("student_enrollment_id, defence_status, defence_outcome").limit(5000),
    supabase.from("cohorts").select("id, code, name, status").order("start_date", { ascending: false, nullsFirst: false }),
  ]);
  [enrollments, results, categories, components, trackers, engagement, defences, cohorts].forEach((result) => failed(result.error, "Results dashboard could not be loaded. Apply the Build 11 security migration and try again."));
  const resultByEnrollment = new Map((results.data ?? []).map((row) => [row.student_enrollment_id, row]));
  const componentsByEnrollment = new Map<string, Row[]>(); for (const row of components.data ?? []) componentsByEnrollment.set(row.student_enrollment_id, [...(componentsByEnrollment.get(row.student_enrollment_id) ?? []), object(row)]);
  const trackersByEnrollment = new Map<string, Row[]>(); for (const row of trackers.data ?? []) trackersByEnrollment.set(row.student_enrollment_id, [...(trackersByEnrollment.get(row.student_enrollment_id) ?? []), object(row)]);
  const engagementByEnrollment = new Map<string, Row[]>(); for (const row of engagement.data ?? []) engagementByEnrollment.set(row.student_enrollment_id, [...(engagementByEnrollment.get(row.student_enrollment_id) ?? []), object(row)]);
  const categoryById = new Map((categories.data ?? []).map((row) => [row.id, row]));
  const rows = (enrollments.data ?? []).map((enrollment) => {
    const result = resultByEnrollment.get(enrollment.id) ?? null;
    const componentRows = componentsByEnrollment.get(enrollment.id) ?? [];
    const trackerRows = trackersByEnrollment.get(enrollment.id) ?? [];
    const engagementRows = engagementByEnrollment.get(enrollment.id) ?? [];
    const missingGates = trackerRows.filter((row) => !["met", "waived", "not_applicable"].includes(String(row.requirement_status))).map((row) => String(relation(row.graduation_requirement_definitions).requirement_code));
    const integrityReview = trackerRows.some((row) => relation(row.graduation_requirement_definitions).requirement_code === "integrity_and_conduct" && row.requirement_status === "under_review");
    return { enrollment, student: relation(enrollment.students), cohort: relation(enrollment.cohorts), result, componentRows, trackerRows, engagementRows, missingGates, integrityReview, defence: (defences.data ?? []).find((row) => row.student_enrollment_id === enrollment.id) ?? null, incompleteEvidence: componentRows.some((row) => !row.evidence_complete), engagementPending: engagementRows.filter((row) => row.evaluation_status === "pending" || row.evaluation_status === "evaluated"), awaitingModeration: engagementRows.filter((row) => row.evaluation_status === "evaluated"), categoryById };
  }).filter((row) => {
    if (filters.cohort && row.enrollment.cohort_id !== filters.cohort) return false;
    if (filters.route && row.enrollment.discipleship_route !== filters.route) return false;
    if (filters.skill && row.enrollment.skill_pathway !== filters.skill) return false;
    if (filters.outcome && row.result?.result_outcome !== filters.outcome) return false;
    if (filters.status && row.result?.result_status !== filters.status) return false;
    if (filters.missingGate && !row.missingGates.includes(filters.missingGate)) return false;
    if (filters.integrityReview === "true" && !row.integrityReview) return false;
    return true;
  });
  const allRows = rows;
  const metrics = {
    studentsEnrolled: allRows.length,
    resultsNotCalculated: allRows.filter((row) => !row.result).length,
    incompleteEvidence: allRows.filter((row) => row.incompleteEvidence).length,
    awaitingEngagementEvaluation: allRows.filter((row) => row.engagementPending.length).length,
    awaitingModeration: allRows.filter((row) => row.awaitingModeration.length).length,
    calculated: allRows.filter((row) => row.result?.result_status === "calculated").length,
    reviewRequired: allRows.filter((row) => row.result?.result_status === "review_required").length,
    eligibleForCompletion: allRows.filter((row) => row.result?.result_outcome === "eligible_for_completion").length,
    notYetEligible: allRows.filter((row) => row.result?.result_outcome === "not_yet_eligible").length,
    capstoneDefenceOutstanding: allRows.filter((row) => row.missingGates.includes("capstone_defence")).length,
    finalDiscipleshipAssessmentOutstanding: allRows.filter((row) => row.missingGates.includes("final_discipleship_assessment")).length,
    attendanceGateOutstanding: allRows.filter((row) => row.missingGates.includes("attendance_compliance")).length,
    integrityReviewOutstanding: allRows.filter((row) => row.integrityReview).length,
    approvedResults: allRows.filter((row) => row.result?.result_status === "approved").length,
    publishedResults: allRows.filter((row) => row.result?.result_status === "published").length,
  };
  return { rows, metrics, cohorts: cohorts.data ?? [] };
}

export async function fetchAdminResultDetail(supabase: SupabaseClient, studentEnrollmentId: string) {
  const enrollment = await supabase.from("student_enrollments").select("*, students(id, student_number, legal_name, preferred_name, email, identity_verification_status), cohorts(id, code, name)").eq("id", studentEnrollmentId).maybeSingle();
  failed(enrollment.error, "Student result identity could not be loaded."); if (!enrollment.data) throw new LmsAdminDataError("Student enrolment not found.", 404);
  const [result, components, tracker, engagement, defences] = await Promise.all([
    supabase.from("student_programme_results").select("*").eq("student_enrollment_id", studentEnrollmentId).maybeSingle(),
    supabase.from("student_component_scores").select("*, programme_score_categories(*)").eq("student_enrollment_id", studentEnrollmentId).order("created_at"),
    supabase.from("student_graduation_requirements").select("*, graduation_requirement_definitions(*)").eq("student_enrollment_id", studentEnrollmentId).order("created_at"),
    supabase.from("student_engagement_component_evaluations").select("*, programme_score_categories(*)").eq("student_enrollment_id", studentEnrollmentId).order("created_at"),
    supabase.from("capstone_defences").select("*, assignments(id, title, cohort_course_id), assignment_submissions(id, attempt_number, score_percentage, review_outcome)").eq("student_enrollment_id", studentEnrollmentId).order("created_at", { ascending: false }),
  ]);
  [result, components, tracker, engagement, defences].forEach((query) => failed(query.error, "Student result detail could not be loaded."));
  const resultId = result.data?.id;
  const [history, batchItems, capstoneOptions] = await Promise.all([
    resultId ? supabase.from("programme_result_change_events").select("*").eq("student_programme_result_id", resultId).order("created_at", { ascending: false }) : Promise.resolve({ data: [], error: null }),
    resultId ? supabase.from("academic_result_batch_items").select("*, academic_result_batches(id, batch_name, batch_status, approval_reference, authority_reference, approved_at, published_at)").eq("student_programme_result_id", resultId) : Promise.resolve({ data: [], error: null }),
    supabase.from("assignments").select("id, title, cohort_course_id, cohort_courses!inner(cohort_id, courses(skill_pathway)), assignment_submissions(id, course_enrollment_id, attempt_number, submission_status, review_outcome, score_percentage, course_enrollments!inner(student_enrollment_id))").eq("assessment_domain", "skill").eq("assessment_category", "capstone").eq("cohort_courses.cohort_id", enrollment.data.cohort_id),
  ]);
  [history, batchItems, capstoneOptions].forEach((query) => failed(query.error, "Student result history could not be loaded."));
  return { enrollment: enrollment.data, result: result.data, components: components.data ?? [], tracker: tracker.data ?? [], engagement: engagement.data ?? [], defences: defences.data ?? [], history: history.data ?? [], batchItems: batchItems.data ?? [], capstoneOptions: (capstoneOptions.data ?? []).filter((assignment) => {
    const course = relation(relation(assignment.cohort_courses).courses);
    return !course.skill_pathway || course.skill_pathway === enrollment.data?.skill_pathway || (course.skill_pathway === "cybersecurity" && enrollment.data?.skill_pathway === "cybersecurity_foundations");
  }).map((assignment) => ({ ...assignment, assignment_submissions: (assignment.assignment_submissions ?? []).filter((submission) => relation(submission.course_enrollments).student_enrollment_id === studentEnrollmentId) })) };
}

export async function fetchResultBatches(supabase: SupabaseClient) {
  const result = await supabase.from("academic_result_batches").select("*, cohorts(id, code, name), academic_result_batch_items(id, item_status)").order("created_at", { ascending: false });
  failed(result.error, "Result batches could not be loaded."); return result.data ?? [];
}

export async function fetchResultBatchDetail(supabase: SupabaseClient, id: string) {
  const batch = await supabase.from("academic_result_batches").select("*, cohorts(id, code, name)").eq("id", id).maybeSingle();
  failed(batch.error, "Result batch could not be loaded."); if (!batch.data) throw new LmsAdminDataError("Result batch not found.", 404);
  const [items, available] = await Promise.all([
    supabase.from("academic_result_batch_items").select("*, student_programme_results(*, student_enrollments(id, students(student_number, legal_name, preferred_name)))").eq("result_batch_id", id).order("created_at"),
    supabase.from("student_programme_results").select("*, student_enrollments!inner(id, cohort_id, students(student_number, legal_name, preferred_name))").eq("student_enrollments.cohort_id", batch.data.cohort_id).in("result_status", ["calculated", "review_required", "corrected"]),
  ]);
  [items, available].forEach((query) => failed(query.error, "Result batch detail could not be loaded."));
  const included = new Set((items.data ?? []).map((item) => item.student_programme_result_id));
  return { batch: batch.data, items: items.data ?? [], available: (available.data ?? []).filter((result) => !included.has(result.id)) };
}

export async function fetchStudentResultData(supabase: SupabaseClient, profileId: string) {
  const student = await supabase.from("students").select("id").eq("profile_id", profileId).maybeSingle(); failed(student.error, "Student result account could not be loaded.");
  if (!student.data) throw new LmsAdminDataError("Student record not found.", 404);
  const enrollment = await selectCurrentStudentEnrollment<{ id: string; cohort_id: string; discipleship_route: string; skill_pathway: string }>(supabase, student.data.id, "id, cohort_id, discipleship_route, skill_pathway"); failed(enrollment.error, "Student enrolment could not be loaded.");
  if (!enrollment.data) throw new LmsAdminDataError("Student enrolment not found.", 404);
  const result = await supabase.from("student_programme_results").select("id, student_enrollment_id, scoring_policy_id, discipleship_points, skill_points, engagement_points, total_points, result_outcome, result_status, published_at").eq("student_enrollment_id", enrollment.data.id).eq("result_status", "published").maybeSingle();
  failed(result.error, "Published programme result could not be loaded.");
  const components = result.data ? await supabase.from("student_component_scores").select("score_category_id, weighted_points, moderated_points, maximum_points, programme_score_categories(category_code, category_name, score_domain, sequence_number)").eq("student_enrollment_id", enrollment.data.id) : { data: [], error: null };
  failed(components.error, "Published component scores could not be loaded.");
  return { enrollment: enrollment.data, result: result.data, components: components.data ?? [] };
}

export async function fetchStudentGraduationTracker(supabase: SupabaseClient, profileId: string) {
  const student = await supabase.from("students").select("id").eq("profile_id", profileId).maybeSingle(); failed(student.error, "Student account could not be loaded.");
  if (!student.data) throw new LmsAdminDataError("Student record not found.", 404);
  const enrollment = await selectCurrentStudentEnrollment<{ id: string; cohort_id: string }>(supabase, student.data.id, "id, cohort_id"); failed(enrollment.error, "Student enrolment could not be loaded.");
  if (!enrollment.data) throw new LmsAdminDataError("Student enrolment not found.", 404);
  const policy = await supabase.from("programme_scoring_policies").select("id").eq("cohort_id", enrollment.data.cohort_id).eq("policy_status", "active").maybeSingle(); failed(policy.error, "Programme completion policy could not be loaded.");
  if (!policy.data) return { enrollment: enrollment.data, rows: [] };
  const [definitions, tracker] = await Promise.all([
    supabase.from("graduation_requirement_definitions").select("id, requirement_code, requirement_name, requirement_description, threshold_value, sequence_number").eq("scoring_policy_id", policy.data.id).eq("active", true).order("sequence_number"),
    supabase.from("student_graduation_requirements").select("requirement_definition_id, requirement_status, current_value, required_value, evidence_summary, evaluated_at").eq("student_enrollment_id", enrollment.data.id),
  ]);
  [definitions, tracker].forEach((query) => failed(query.error, "Programme completion tracker could not be loaded."));
  const byDefinition = new Map((tracker.data ?? []).map((row) => [row.requirement_definition_id, row]));
  return { enrollment: enrollment.data, rows: (definitions.data ?? []).map((definition) => ({ definition, tracker: byDefinition.get(definition.id) ?? { requirement_status: "pending", current_value: null, required_value: definition.threshold_value, evidence_summary: "This requirement has not yet been formally evaluated.", evaluated_at: null } })) };
}

export async function fetchFacilitatorGradebook(supabase: SupabaseClient, offeringIds: string[]) {
  if (!offeringIds.length) return { rows: [], capstones: [], engagement: [] };
  const [assignments, quizzes] = await Promise.all([
    supabase.from("assignments").select("id, title, cohort_course_id, assessment_category, assignment_submissions(id, attempt_number, submission_status, score_percentage, review_outcome, course_enrollments(student_enrollment_id, student_enrollments(students(student_number, legal_name, preferred_name))))").in("cohort_course_id", offeringIds),
    supabase.from("quizzes").select("id, title, cohort_course_id, assessment_category, quiz_attempts(id, attempt_number, attempt_status, score_percentage, course_enrollments(student_enrollment_id, student_enrollments(students(student_number, legal_name, preferred_name))))").in("cohort_course_id", offeringIds),
  ]);
  [assignments, quizzes].forEach((query) => failed(query.error, "Assigned-course gradebook could not be loaded."));
  const rows = [
    ...(assignments.data ?? []).flatMap((assignment) => (assignment.assignment_submissions ?? []).map((submission) => ({ kind: "Assignment", assessmentId: assignment.id, assessment: assignment.title, category: assignment.assessment_category, recordId: submission.id, status: submission.submission_status, score: submission.score_percentage, reviewStatus: submission.review_outcome, attemptNumber: submission.attempt_number, studentEnrollmentId: relation(submission.course_enrollments).student_enrollment_id, student: relation(relation(submission.course_enrollments).student_enrollments).students }))),
    ...(quizzes.data ?? []).flatMap((quiz) => (quiz.quiz_attempts ?? []).map((attempt) => ({ kind: "Quiz", assessmentId: quiz.id, assessment: quiz.title, category: quiz.assessment_category, recordId: attempt.id, status: attempt.attempt_status, score: attempt.score_percentage, reviewStatus: attempt.attempt_status, attemptNumber: attempt.attempt_number, studentEnrollmentId: relation(attempt.course_enrollments).student_enrollment_id, student: relation(relation(attempt.course_enrollments).student_enrollments).students }))),
  ];
  const enrollmentIds = [...new Set(rows.map((row) => String(row.studentEnrollmentId)).filter(Boolean))];
  const engagement = enrollmentIds.length ? await supabase.from("student_engagement_component_evaluations").select("*, programme_score_categories(category_code, category_name, max_points)").in("student_enrollment_id", enrollmentIds).in("evaluation_status", ["pending", "evaluated"]) : { data: [], error: null };
  failed(engagement.error, "Assigned engagement evidence could not be loaded.");
  return { rows, capstones: (assignments.data ?? []).filter((assignment) => assignment.assessment_category === "capstone"), engagement: engagement.data ?? [] };
}
