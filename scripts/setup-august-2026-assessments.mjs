import { createHash } from "node:crypto";

import { createClient } from "@supabase/supabase-js";

import {
  august2026AssessmentCohortCode,
  august2026AssessmentCounts,
  august2026AssessmentDescription,
  august2026AssessmentInstructions,
  august2026AssessmentShells,
  august2026Rubrics,
} from "../lib/lms/august2026Assessments.ts";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !serviceKey) throw new Error("Supabase administrative environment variables are required.");

const apply = process.argv.includes("--apply");
if (apply && process.env.NEXT_6_APPLY !== "1") throw new Error("Set NEXT_6_APPLY=1 as well as --apply before creating production assessment drafts.");
const supabase = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });

function relation(value) { return Array.isArray(value) ? value[0] ?? {} : value ?? {}; }
function stableUuid(key) {
  const bytes = Buffer.from(createHash("sha256").update(`REALMS-NEXT-6:${key}`).digest("hex").slice(0, 32), "hex");
  bytes[6] = (bytes[6] & 0x0f) | 0x50;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = bytes.toString("hex");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}
function keyForWeight(categoryId, assessmentType, assessmentId) { return `${categoryId}:${assessmentType}:${assessmentId}`; }

const cohortResult = await supabase.from("cohorts").select("*").eq("code", august2026AssessmentCohortCode);
if (cohortResult.error) throw new Error(`Cohort lookup: ${cohortResult.error.message}`);
if (cohortResult.data.length !== 1) throw new Error(`Expected exactly one ${august2026AssessmentCohortCode} cohort.`);
const cohort = cohortResult.data[0];

const [offeringResult, policyResult] = await Promise.all([
  supabase.from("cohort_courses").select("id, course_id, courses(id, code, title, course_category, discipleship_route, skill_pathway)").eq("cohort_id", cohort.id),
  supabase.from("programme_scoring_policies").select("*").eq("cohort_id", cohort.id).eq("policy_status", "active"),
]);
if (offeringResult.error) throw new Error(`Offering lookup: ${offeringResult.error.message}`);
if (policyResult.error) throw new Error(`Scoring policy lookup: ${policyResult.error.message}`);
if (policyResult.data.length !== 1) throw new Error("Expected exactly one active August 2026 scoring policy.");
const policy = policyResult.data[0];
const expectedPolicy = { discipleship_max_points: 40, skill_max_points: 45, engagement_max_points: 15, overall_pass_points: 60, discipleship_gate_points: 20, skill_gate_points: 23, engagement_gate_points: 8 };
const policyConflicts = Object.entries(expectedPolicy).filter(([column, expected]) => Number(policy[column]) !== expected).map(([column, expected]) => ({ column, expected, actual: policy[column] }));
for (const flag of ["requires_capstone", "requires_capstone_defence", "requires_final_discipleship_assessment", "requires_attendance_compliance", "requires_no_unresolved_integrity_case"]) if (policy[flag] !== true) policyConflicts.push({ column: flag, expected: true, actual: policy[flag] });
if (policyConflicts.length) throw new Error(`The governing 40/45/15 policy or graduation gates do not match NEXT 6: ${JSON.stringify(policyConflicts)}`);

const categoriesResult = await supabase.from("programme_score_categories").select("*").eq("scoring_policy_id", policy.id).eq("active", true);
if (categoriesResult.error) throw new Error(`Score category lookup: ${categoriesResult.error.message}`);
const categoryByCode = new Map(categoriesResult.data.map((item) => [item.category_code, item]));
const offeringByCode = new Map(offeringResult.data.map((item) => [relation(item.courses).code, item]));
const missingOfferings = [...new Set(august2026AssessmentShells.map((item) => item.courseCode))].filter((code) => !offeringByCode.has(code));
const missingCategories = [...new Set(august2026AssessmentShells.map((item) => item.assessmentCategory))].filter((code) => !categoryByCode.has(code));
if (missingOfferings.length || missingCategories.length) throw new Error(JSON.stringify({ missingOfferings, missingCategories }));

for (const item of august2026AssessmentShells) {
  const category = categoryByCode.get(item.assessmentCategory);
  if (category.score_domain !== item.assessmentDomain || Number(category.max_points) !== item.categoryMaxPoints) throw new Error(`Score category ${item.assessmentCategory} does not match the approved ${item.assessmentDomain} ${item.categoryMaxPoints}-point configuration.`);
  if (item.rubricKey) {
    const total = august2026Rubrics[item.rubricKey].reduce((sum, criterion) => sum + criterion.maxPoints, 0);
    if (total !== item.maxScore) throw new Error(`${item.rubricKey} rubric totals ${total}, expected ${item.maxScore}.`);
  }
}

const desiredAssignments = august2026AssessmentShells.filter((item) => item.assessmentKind === "assignment").map((item) => ({
  config: item,
  row: {
    id: stableUuid(`assignment:${item.stableKey}`),
    cohort_course_id: offeringByCode.get(item.courseCode).id,
    class_session_id: null,
    title: item.title,
    description: august2026AssessmentDescription(item),
    instructions: august2026AssessmentInstructions(item),
    assignment_type: item.assignmentType,
    assessment_domain: item.assessmentDomain,
    assessment_category: item.assessmentCategory,
    max_score: item.maxScore,
    due_at: item.dueAt,
    allow_late_submission: item.allowLateSubmission,
    max_submission_attempts: item.maxSubmissionAttempts,
    submission_requirements: item.submissionRequirements,
    assignment_status: "draft",
    created_by: null,
    updated_by: null,
  },
}));
const desiredQuizzes = august2026AssessmentShells.filter((item) => item.assessmentKind === "quiz").map((item) => ({
  config: item,
  row: {
    id: stableUuid(`quiz:${item.stableKey}`),
    cohort_course_id: offeringByCode.get(item.courseCode).id,
    class_session_id: null,
    title: item.title,
    description: august2026AssessmentDescription(item),
    instructions: august2026AssessmentInstructions(item),
    quiz_type: "lesson_quiz",
    assessment_domain: item.assessmentDomain,
    assessment_category: item.assessmentCategory,
    opens_at: null,
    closes_at: null,
    duration_minutes: null,
    max_attempts: item.maxSubmissionAttempts,
    passing_score_percentage: 70,
    show_score_after_submission: false,
    show_correct_answers: false,
    quiz_status: "draft",
    created_by: null,
    updated_by: null,
  },
}));
const assignmentIds = desiredAssignments.map((item) => item.row.id);
const [existingAssignmentResult, existingQuizResult] = await Promise.all([
  supabase.from("assignments").select("*").in("cohort_course_id", offeringResult.data.map((item) => item.id)),
  supabase.from("quizzes").select("*").in("cohort_course_id", offeringResult.data.map((item) => item.id)),
]);
if (existingAssignmentResult.error) throw new Error(`Assignment inventory: ${existingAssignmentResult.error.message}`);
if (existingQuizResult.error) throw new Error(`Quiz inventory: ${existingQuizResult.error.message}`);
const existingById = new Map(existingAssignmentResult.data.map((item) => [item.id, item]));
const existingByOfferingTitle = new Map(existingAssignmentResult.data.map((item) => [`${item.cohort_course_id}:${item.title}`, item]));
const assignmentConflicts = [];
const missingAssignments = [];
const existingManagedAssignments = [];
for (const desired of desiredAssignments) {
  const byId = existingById.get(desired.row.id);
  const byTitle = existingByOfferingTitle.get(`${desired.row.cohort_course_id}:${desired.row.title}`);
  if (byId && byId.cohort_course_id !== desired.row.cohort_course_id) assignmentConflicts.push({ stableKey: desired.config.stableKey, id: desired.row.id, issue: "stable_id_used_by_other_offering" });
  else if (byTitle && byTitle.id !== desired.row.id) assignmentConflicts.push({ stableKey: desired.config.stableKey, id: byTitle.id, issue: "same_offering_title_has_different_id" });
  else if (byId) existingManagedAssignments.push({ id: byId.id, title: byId.title, status: byId.assignment_status });
  else missingAssignments.push(desired);
}

const existingQuizById = new Map(existingQuizResult.data.map((item) => [item.id, item]));
const existingQuizByOfferingTitle = new Map(existingQuizResult.data.map((item) => [`${item.cohort_course_id}:${item.title}`, item]));
const quizConflicts = [];
const missingQuizzes = [];
const existingManagedQuizzes = [];
for (const desired of desiredQuizzes) {
  const byId = existingQuizById.get(desired.row.id);
  const byTitle = existingQuizByOfferingTitle.get(`${desired.row.cohort_course_id}:${desired.row.title}`);
  if (byId && byId.cohort_course_id !== desired.row.cohort_course_id) quizConflicts.push({ stableKey: desired.config.stableKey, id: desired.row.id, issue: "stable_quiz_id_used_by_other_offering" });
  else if (byTitle && byTitle.id !== desired.row.id) quizConflicts.push({ stableKey: desired.config.stableKey, id: byTitle.id, issue: "same_offering_quiz_title_has_different_id" });
  else if (byId) existingManagedQuizzes.push({ id: byId.id, title: byId.title, status: byId.quiz_status });
  else missingQuizzes.push(desired);
}

const desiredRubrics = desiredAssignments.flatMap(({ config, row }) => august2026Rubrics[config.rubricKey].map((criterion, index) => ({
  id: stableUuid(`rubric:${config.stableKey}:${index}:${criterion.criterion}`),
  assignment_id: row.id,
  criterion: criterion.criterion,
  description: criterion.description,
  max_points: criterion.maxPoints,
  sort_order: index,
})));
const rubricResult = await supabase.from("assignment_rubric_criteria").select("*").in("assignment_id", assignmentIds);
if (rubricResult.error) throw new Error(`Rubric inventory: ${rubricResult.error.message}`);
const rubricById = new Map(rubricResult.data.map((item) => [item.id, item]));
const rubricConflicts = desiredRubrics.filter((item) => rubricById.has(item.id) && rubricById.get(item.id).assignment_id !== item.assignment_id).map((item) => ({ id: item.id, issue: "stable_rubric_id_used_by_other_assignment" }));
const missingRubrics = desiredRubrics.filter((item) => !rubricById.has(item.id));

const desiredWeights = [...desiredAssignments.map((item) => ({ ...item, assessmentType: "assignment" })), ...desiredQuizzes.map((item) => ({ ...item, assessmentType: "quiz" }))].map(({ config, row, assessmentType }) => {
  const category = categoryByCode.get(config.assessmentCategory);
  return {
    id: stableUuid(`weight:${config.stableKey}:${config.assessmentCategory}`),
    score_category_id: category.id,
    assessment_type: assessmentType,
    assessment_id: row.id,
    weight_units: config.weightUnits,
    attempt_selection: config.attemptSelection,
    is_required: config.isRequired,
    required_for_graduation: config.requiredForGraduation,
    counts_toward_result: config.countsTowardResult,
    active: config.activeWeighting,
  };
});
const weightResult = await supabase.from("assessment_weightings").select("*").in("score_category_id", categoriesResult.data.map((item) => item.id));
if (weightResult.error) throw new Error(`Weighting inventory: ${weightResult.error.message}`);
const weightByKey = new Map(weightResult.data.map((item) => [keyForWeight(item.score_category_id, item.assessment_type, item.assessment_id), item]));
const missingWeights = desiredWeights.filter((item) => !weightByKey.has(keyForWeight(item.score_category_id, item.assessment_type, item.assessment_id)));

const report = {
  mode: apply ? "apply" : "dry-run",
  cohort: { id: cohort.id, code: cohort.code },
  governingPolicy: { discipleship: 40, skill: 45, attendanceParticipationIntegrity: 15, overallGate: 60, discipleshipGate: 20, skillGate: 23, engagementGate: 8 },
  shells: { ...august2026AssessmentCounts(), total: august2026AssessmentShells.length, assignmentShells: desiredAssignments.length, quizShells: desiredQuizzes.length, detailedQuestionsCreated: 0, status: "draft" },
  preparation: { existingManagedAssignments: existingManagedAssignments.length, existingManagedQuizzes: existingManagedQuizzes.length, missingAssignments: missingAssignments.length, missingQuizzes: missingQuizzes.length, missingRubricCriteria: missingRubrics.length, missingInactiveWeightMappings: missingWeights.length, assignmentConflicts, quizConflicts, rubricConflicts },
  publishing: { studentVisible: false, contentPending: true, weightingCountsTowardResult: false, weightingActive: false },
  catalogue: { offeringsReused: offeringResult.data.length, offeringsCreated: 0, missingOfferings, missingCategories },
};

const conflicts = [...assignmentConflicts, ...quizConflicts, ...rubricConflicts];
if (!apply) {
  console.log(JSON.stringify(report, null, 2));
  if (conflicts.length) process.exitCode = 2;
} else {
  if (conflicts.length) throw new Error(`Assessment records require manual review before setup: ${JSON.stringify(conflicts)}`);
  const createdAssignmentIds = [];
  for (const desired of missingAssignments) {
    const inserted = await supabase.from("assignments").insert(desired.row).select("id").single();
    if (inserted.error) throw new Error(`${desired.config.courseCode} shell: ${inserted.error.message}`);
    createdAssignmentIds.push(inserted.data.id);
    const audit = await supabase.from("audit_logs").insert({ action: "assignment_created", entity_type: "assignment", entity_id: inserted.data.id, metadata: { source: "next_6_august_2026_assessment_framework", stable_key: desired.config.stableKey, content_pending: true } });
    if (audit.error) throw new Error(`Assignment audit: ${audit.error.message}`);
  }
  const createdQuizIds = [];
  for (const desired of missingQuizzes) {
    const inserted = await supabase.from("quizzes").insert(desired.row).select("id").single();
    if (inserted.error) throw new Error(`${desired.config.courseCode} quiz shell: ${inserted.error.message}`);
    createdQuizIds.push(inserted.data.id);
    const audit = await supabase.from("audit_logs").insert({ action: "quiz_created", entity_type: "quiz", entity_id: inserted.data.id, metadata: { source: "next_6_august_2026_assessment_framework", stable_key: desired.config.stableKey, content_pending: true, questions_created: 0 } });
    if (audit.error) throw new Error(`Quiz audit: ${audit.error.message}`);
  }
  if (missingRubrics.length) {
    const inserted = await supabase.from("assignment_rubric_criteria").insert(missingRubrics);
    if (inserted.error) throw new Error(`Rubric criteria: ${inserted.error.message}`);
  }
  if (missingWeights.length) {
    const inserted = await supabase.from("assessment_weightings").insert(missingWeights);
    if (inserted.error) throw new Error(`Inactive weight mappings: ${inserted.error.message}`);
  }
  console.log(JSON.stringify({ ...report, applied: { assignmentsCreated: createdAssignmentIds.length, quizzesCreated: createdQuizIds.length, rubricCriteriaCreated: missingRubrics.length, inactiveWeightMappingsCreated: missingWeights.length, questionsCreated: 0, publishedAssessments: 0 } }, null, 2));
}
