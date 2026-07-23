import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

import { automaticAnswersEqual } from "../lib/lms/assessment.ts";
import {
  applyQuizAttemptOrder,
  createQuizAttemptOrderSnapshot,
  defaultQuizTabPolicy,
  isOfficialQuizAttempt,
  quizAnswerReviewEligibility,
  tabPolicyOutcome,
} from "../lib/lms/quizIntegrity.ts";

const root = new URL("../", import.meta.url);
const read = (path) => readFile(new URL(path, root), "utf8");
const [migration, service, data, resultService, player, adminUi, expiryRoute, build13] = await Promise.all([
  read("supabase/lms_quiz_integrity_controls.sql"),
  read("lib/lms/assessmentService.ts"),
  read("lib/lms/assessmentData.ts"),
  read("lib/lms/resultService.ts"),
  read("components/student/StudentAssessmentUi.tsx"),
  read("components/admin/QuizRecord.tsx"),
  read("app/api/system/quiz-attempts/finalize-expired/route.ts"),
  read("supabase/lms_build_13_readiness_patch.sql"),
]);

let passed = 0;
function check(name, test) {
  test();
  passed += 1;
  console.log(`ok ${passed} - ${name}`);
}

const reviewBase = {
  permitsReview: true,
  reviewableAt: "2026-08-03T12:00:00.000Z",
  now: new Date("2026-08-03T12:01:00.000Z"),
  hasActiveAttempt: false,
  hasAttemptUnderReview: false,
  hasPendingReplacement: false,
  hasAvailableNormalAttempt: false,
  hasCompletedOfficialAttempt: true,
};

check("published questions are unavailable before opens_at at the RLS boundary", () => {
  assert.match(migration, /q\.opens_at is null or q\.opens_at <= now\(\)/);
  assert.match(migration, /q\.closes_at is null or q\.closes_at > now\(\)/);
});
check("questions require an owned valid active attempt", () => {
  assert.match(migration, /qa\.attempt_status = 'in_progress'/);
  assert.match(migration, /is_own_student_enrollment\(ce\.student_enrollment_id\)/);
  assert.doesNotMatch(migration, /current_user_owns_course_enrollment/);
  assert.match(migration, /ce\.enrollment_status in \('active', 'enrolled'\)/);
});
check("answer keys remain inaccessible to authenticated students", () => {
  assert.match(migration, /revoke select on public\.quiz_answer_keys from anon, authenticated/);
  assert.match(data, /quiz_answer_keys\(id, question_id\)/);
});
check("the timer remains server authoritative", () => {
  assert.match(service, /Date\.parse\(String\(attempt\.expires_at\)\) <= Date\.now\(\)/);
  assert.match(player, /server-created expiry/);
});
check("expired attempts are finalised automatically and idempotently", () => {
  assert.match(service, /finalizeExpiredQuizAttempts/);
  assert.match(service, /\.eq\("attempt_status", "in_progress"\)/);
  assert.match(expiryRoute, /QUIZ_EXPIRY_CRON_SECRET/);
});
check("expiry preserves saved answers", () => {
  assert.match(service, /saved_answers_preserved: true/);
  assert.doesNotMatch(service, /quiz_attempt_answers"\)\.delete/);
});
check("auto-submission does not release correct answers", () => assert.equal(quizAnswerReviewEligibility({ ...reviewBase, hasActiveAttempt: true }).eligible, false));
check("submission before review time does not release answers", () => assert.equal(quizAnswerReviewEligibility({ ...reviewBase, now: new Date("2026-08-03T11:59:00.000Z") }).reason, "review_time_pending"));
check("answer review works after every configured release condition", () => assert.deepEqual(quizAnswerReviewEligibility(reviewBase), { eligible: true, reason: "released" }));
check("the first tab exit receives calm warning behavior", () => assert.deepEqual(tabPolicyOutcome({ hiddenEventCount: 1, monitoringEnabled: true, warningThreshold: 1, flagThreshold: 3 }), { warning: "first", flag: false, autoSubmit: false }));
check("repeated tab exits create factual hidden and returned telemetry", () => {
  assert.match(migration, /'visibility_hidden', 'visibility_returned'/);
  assert.match(service, /source: "document_visibility"/);
});
check("the threshold flags review without declaring misconduct", () => {
  assert.deepEqual(tabPolicyOutcome({ hiddenEventCount: 3, monitoringEnabled: true, warningThreshold: 1, flagThreshold: 3 }), { warning: "repeated", flag: true, autoSubmit: false });
  assert.match(service, /not proof of misconduct|not, by themselves, a finding|factual event record/i);
});
check("the default policy does not auto-submit for tab switching", () => assert.deepEqual(defaultQuizTabPolicy, { monitoringEnabled: true, warningThreshold: 1, flagThreshold: 3, autoSubmitThreshold: null }));
check("deliberately configured optional tab auto-submit works", () => assert.equal(tabPolicyOutcome({ hiddenEventCount: 5, monitoringEnabled: true, warningThreshold: 1, flagThreshold: 3, autoSubmitThreshold: 5 }).autoSubmit, true));
check("admin can grant a replacement through an atomic function", () => {
  assert.match(migration, /function public\.grant_quiz_replacement_attempt/);
  assert.match(adminUi, /Grant Replacement/);
});
check("replacement retains the original attempt and answers", () => {
  assert.match(migration, /set attempt_status = 'voided_for_replacement'/);
  assert.doesNotMatch(migration, /delete from public\.quiz_attempts/);
  assert.doesNotMatch(migration, /delete from public\.quiz_attempt_answers/);
});
check("the original attempt is excluded from official results", () => {
  assert.match(migration, /official_result_eligible = false/);
  assert.match(resultService, /isOfficialQuizAttempt/);
});
check("replacement eligibility is scoped to one student's course enrollment", () => {
  assert.match(migration, /course_enrollment_id uuid not null/);
  assert.match(service, /eq\("course_enrollment_id", enrollment\.id\)/);
});
check("duplicate replacement grants are idempotently prevented", () => {
  assert.match(migration, /original_attempt_id uuid not null unique/);
  assert.match(migration, /if existing\.id is not null then[\s\S]*return next existing/);
});
check("answer review is hidden as soon as replacement is granted", () => assert.equal(quizAnswerReviewEligibility({ ...reviewBase, hasPendingReplacement: true }).reason, "replacement_pending"));
check("an active replacement attempt cannot see previous correct answers", () => {
  assert.equal(quizAnswerReviewEligibility({ ...reviewBase, hasActiveAttempt: true }).eligible, false);
  assert.match(data, /if \(active \|\| review\.eligible\)/);
});
check("integrity review has an explicit resolution workflow", () => {
  assert.match(migration, /function public\.resolve_quiz_attempt_integrity/);
  assert.match(adminUi, /Resolve Review/);
});
check("a cleared review stops blocking result readiness", () => {
  assert.equal(isOfficialQuizAttempt({ official_result_eligible: true, integrity_status: "resolved" }), true);
  assert.equal(isOfficialQuizAttempt({ official_result_eligible: true, integrity_status: "under_review" }), false);
});

const questions = [
  { id: "q1", question_type: "multiple_choice", options: ["A", "B", "C"] },
  { id: "q2", question_type: "true_false", options: [true, false] },
  { id: "q3", question_type: "short_answer", options: [] },
];
const sequence = [0.9, 0.1, 0.8, 0.2, 0.7];
const firstOrder = createQuizAttemptOrderSnapshot(questions, { randomizeQuestionOrder: true, randomizeOptionOrder: true }, (() => { let i = 0; return () => sequence[i++ % sequence.length]; })());
check("question randomisation remains stable within an attempt", () => assert.deepEqual(applyQuizAttemptOrder(questions, firstOrder), applyQuizAttemptOrder(questions, firstOrder)));
check("different attempts can receive different question orders", () => {
  const another = createQuizAttemptOrderSnapshot(questions, { randomizeQuestionOrder: true, randomizeOptionOrder: true }, () => 0);
  assert.notDeepEqual(firstOrder.questionOrder, another.questionOrder);
});
check("option randomisation preserves correct scoring and true-false order", () => {
  const displayed = applyQuizAttemptOrder(questions, firstOrder);
  assert.equal(automaticAnswersEqual("multiple_choice", "B", displayed.find((item) => item.id === "q1").options.find((option) => option === "B")), true);
  assert.deepEqual(displayed.find((item) => item.id === "q2").options, [true, false]);
});
check("concurrent starts resolve to one active attempt", () => {
  assert.match(migration, /quiz_attempt_one_active_idx/);
  assert.match(service, /saved\.error\.code === "23505"[\s\S]*eq\("attempt_status", "in_progress"\)/);
});
check("existing assessment, result and graduation contracts remain connected", () => {
  assert.match(service, /evaluateRecordedLearningAssignment/);
  assert.match(resultService, /graduationRequirementStatuses/);
});
check("Build 13 security remains present and the new migration grants no student writes", () => {
  assert.match(build13, /current_student_enrolled_in_offering/);
  assert.match(migration, /revoke all on public\.quiz_attempt_events, public\.quiz_attempt_integrity_decisions, public\.quiz_attempt_replacement_grants from anon, authenticated/);
});

assert.equal(passed, 29);
console.log(`Quiz-integrity checks passed (${passed}).`);
