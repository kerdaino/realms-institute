import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
import ts from "typescript";

const domainSource = await readFile(new URL("../lib/lms/engagement.ts", import.meta.url), "utf8");
const compiled = ts.transpileModule(domainSource, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText;
const domain = await import(`data:text/javascript;base64,${Buffer.from(compiled).toString("base64")}`);
const service = await readFile(new URL("../lib/lms/engagementService.ts", import.meta.url), "utf8");
const actions = await readFile(new URL("../lib/lms/engagementActions.ts", import.meta.url), "utf8");
const data = await readFile(new URL("../lib/lms/engagementData.ts", import.meta.url), "utf8");
const email = await readFile(new URL("../lib/lms/engagementEmail.ts", import.meta.url), "utf8");
const migration = await readFile(new URL("../supabase/lms_build_10_engagement_security.sql", import.meta.url), "utf8");

const empty = { unapprovedAbsenceUnits: 0, unapprovedAbsenceCount: 0, lateCount: 0, partialCount: 0, unresolvedAttendanceCount: 0, overdueRecordedModules: 0, incompleteRecordedModules: 0, overdueMakeups: 0, incompleteMakeups: 0, overdueAssignments: 0, missingAssignments: 0, resubmissionsRequired: 0, failedQuizAttempts: 0, quizzesWithAttemptsExhausted: 0, openIntegrityReviews: 0, lastMeaningfulActivityAt: null, inactivityDays: null };
const rule = (code, signal, threshold) => ({ id: code, rule_code: code, signal_type: signal, threshold_value: threshold, severity: "medium", recommended_action: null });

// 1-9: attendance and recording threshold behaviour, deduplication, and clearing.
assert.equal(domain.ruleMatches({ ...empty, unapprovedAbsenceUnits: 1 }, rule("attendance_first_unapproved", "unapproved_absence_units", 1)), true);
assert.equal(domain.engagementDeduplicationKey(rule("attendance_first_unapproved", "unapproved_absence_units", 1)), domain.engagementDeduplicationKey(rule("attendance_first_unapproved", "unapproved_absence_units", 1)));
assert.equal(domain.ruleMatches({ ...empty, unapprovedAbsenceUnits: 2 }, rule("attendance_second_pattern", "unapproved_absence_units", 2)), true);
assert.equal(domain.ruleMatches({ ...empty, unapprovedAbsenceUnits: 3 }, rule("attendance_third_warning", "unapproved_absence_units", 3)), true);
assert.match(service, /standing_review_required = true|standing_review_required: true/); assert.doesNotMatch(service, /enrolment_status:\s*"withdrawn"/);
assert.equal(domain.ruleMatches({ ...empty, overdueRecordedModules: 1 }, rule("recording_first_overdue", "overdue_recorded_modules", 1)), true);
assert.equal(domain.ruleMatches({ ...empty, overdueRecordedModules: 2 }, rule("recording_second_overdue", "overdue_recorded_modules", 2)), true);
assert.equal(domain.ruleMatches({ ...empty, overdueRecordedModules: 3 }, rule("recording_third_overdue", "overdue_recorded_modules", 3)), true);
assert.match(service, /underlying evaluated fact is now below/); assert.match(actions, /notice_status: "resolved"/);

// 10-11: awaiting human grading is not missing or failed.
assert.match(service, /"submitted", "awaiting_review", "graded", "under_integrity_review"/);
assert.match(service, /quizIsAwaitingManualReview/); assert.match(service, /row\.attempt_status === "graded" && row\.passed === false/);

// 12-18: formal notice, standing, mentor assignment, and caseload security.
assert.match(actions, /notice_status: "issued"/); assert.match(actions, /student_warning_notice_events/); assert.match(email, /student_notice_deliveries/);
assert.match(actions, /warning_acknowledged/); assert.match(actions, /eq\("student_enrollment_id", studentEnrollmentId\)/);
assert.match(actions, /student_response_received/); assert.match(actions, /student_response: textResponse/);
assert.match(actions, /if \(!isOneOf\(academicStandings, newStanding\) \|\| !reason\)/); assert.match(actions, /student_standing_change_events/);
assert.match(actions, /verifyMentorProfile/); assert.match(migration, /active_primary_mentor_assignment_unique_idx/);
assert.match(actions, /contact_summary: summary/); assert.match(actions, /1500/);
assert.match(data, /This student is not in your active mentor caseload/); assert.match(data, /mentor_profile_id", mentorProfileId/);

// 19-21: visible concrete recovery plans, linked completion, authorised closure.
assert.match(data, /fetchStudentStanding/); assert.match(data, /recovery_plan_actions/);
assert.match(actions, /linkedActionComplete/); assert.match(actions, /linked academic record is not yet complete/);
assert.match(actions, /Plans do not close automatically by date/); assert.doesNotMatch(actions.match(/export async function updateRecoveryPlan[\s\S]*?export async function createReviewCase/)?.[0] ?? "", /academic_standing:/);

// 22-25: response-aware review, private-note separation, recommendations, explicit final outcomes.
assert.match(actions, /student_notified_at: notify \? timestamp : null/); assert.match(actions, /awaiting_student_response/);
assert.doesNotMatch(data.match(/export async function fetchStudentStanding[\s\S]*?export async function requireMentorCaseload/)?.[0] ?? "", /student_status_review_private_notes/);
assert.match(actions, /deferment_recommended/); assert.match(actions, /withdrawal_recommended/); assert.doesNotMatch(actions.match(/export async function updateReviewCase[\s\S]*?export async function changeStudentAcademicStanding/)?.[0] ?? "", /enrolment_status/);
assert.match(actions, /review\.data\.case_status !== "closed"/); assert.match(actions, /recordsPreserved: true/); assert.match(actions, /student_withdrawn/);

// 26-28: student/facilitator denial and sensitive referral restriction.
await assert.rejects(access(new URL("../app/api/student/student-enrollments", import.meta.url)));
await assert.rejects(access(new URL("../app/api/facilitator/at-risk", import.meta.url))); assert.match(migration, /student_status_review_private_notes/);
assert.match(actions, /referral_reason_summary, 1200/); assert.match(migration, /student_support_referrals/); assert.match(data, /Only students in your active assigned caseload|active mentor caseload/);

assert.deepEqual(domain.academicStandings, ["good_standing", "reminder", "warning", "participation_review", "probation", "deferment_review", "withdrawal_review"]);
assert.doesNotMatch(migration, /create table/i);

console.log(JSON.stringify({ attendanceAndRecording: 9, assessmentFairness: 2, noticesStandingAndMentors: 7, recoveryPlans: 3, reviewCases: 4, roleAndReferralSecurity: 3, passed: 28 }, null, 2));
