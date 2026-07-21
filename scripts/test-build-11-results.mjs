import assert from "node:assert/strict";
import {
  calculateAttendanceComponent,
  calculateWeightedAssessmentCategory,
  evaluateProgrammeEligibility,
  assessmentMatchesStudentProgramme,
  isStudentVisibleResult,
  selectGradedAttempt,
} from "../lib/lms/results.ts";

const attempt = (id, attemptNumber, scorePercentage, status = "graded", accepted = true) => ({ id, attemptNumber, scorePercentage, status, accepted, gradedAt: "2026-07-21T00:00:00Z" });
assert.equal(selectGradedAttempt([attempt("a", 1, 60), attempt("b", 2, 90)], "best_graded")?.id, "b");
assert.equal(selectGradedAttempt([attempt("a", 1, 60), attempt("b", 2, 90)], "first_graded")?.id, "a");
assert.equal(selectGradedAttempt([attempt("a", 1, 60), attempt("b", 2, 90)], "latest_graded")?.id, "b");
assert.equal(selectGradedAttempt([attempt("x", 1, 100, "under_integrity_review")], "best_graded"), null);

const weighted = calculateWeightedAssessmentCategory({ maximumPoints: 10, assessments: [
  { assessmentType: "quiz", assessmentId: "q1", title: "One", weightUnits: 1, attemptSelection: "best_graded", required: true, attempts: [attempt("a", 1, 60)] },
  { assessmentType: "quiz", assessmentId: "q2", title: "Two", weightUnits: 3, attemptSelection: "best_graded", required: true, attempts: [attempt("b", 1, 100)] },
] });
assert.equal(weighted.rawPercentage, 90);
assert.equal(weighted.weightedPoints, 9);
assert.equal(weighted.evidenceComplete, true);

const missing = calculateWeightedAssessmentCategory({ maximumPoints: 10, assessments: [
  { assessmentType: "assignment", assessmentId: "a1", title: "Required", weightUnits: 1, attemptSelection: "latest_graded", required: true, attempts: [] },
] });
assert.equal(missing.calculationStatus, "incomplete_evidence");
assert.equal(missing.weightedPoints, null);

const manual = calculateWeightedAssessmentCategory({ maximumPoints: 10, assessments: [
  { assessmentType: "quiz", assessmentId: "q3", title: "Manual", weightUnits: 1, attemptSelection: "best_graded", required: true, attempts: [attempt("c", 1, null, "awaiting_review")] },
] });
assert.equal(manual.calculationStatus, "review_required");

const attendance = calculateAttendanceComponent({ maximumPoints: 7, creditMapping: { present: 1, late: 0.5, absent: 0, excused_absence: null, pending: null }, records: [
  { id: "1", required: true, cancelled: false, finalized: true, status: "present" },
  { id: "2", required: true, cancelled: false, finalized: true, status: "late" },
  { id: "3", required: true, cancelled: false, finalized: true, status: "excused_absence" },
] });
assert.equal(attendance.rawPercentage, 75);
assert.equal(attendance.weightedPoints, 5.25);
assert.equal(attendance.eligibleCredits, 2);

const pendingAttendance = calculateAttendanceComponent({ maximumPoints: 7, creditMapping: { pending: null }, records: [{ id: "p", required: true, cancelled: false, finalized: false, status: "pending" }] });
assert.equal(pendingAttendance.calculationStatus, "review_required");

const baseRequirements = [{ mandatory: true, status: "met" }];
assert.equal(evaluateProgrammeEligibility({ totalPoints: 78, discipleshipPoints: 18, skillPoints: 40, engagementPoints: 12, overallMinimum: 60, discipleshipMinimum: 20, skillMinimum: 23, engagementMinimum: 8, evidenceComplete: true, requirements: baseRequirements }).allGatesMet, false);
assert.equal(evaluateProgrammeEligibility({ totalPoints: 72, discipleshipPoints: 30, skillPoints: 21, engagementPoints: 12, overallMinimum: 60, discipleshipMinimum: 20, skillMinimum: 23, engagementMinimum: 8, evidenceComplete: true, requirements: baseRequirements }).allGatesMet, false);
assert.equal(evaluateProgrammeEligibility({ totalPoints: 82, discipleshipPoints: 32, skillPoints: 38, engagementPoints: 12, overallMinimum: 60, discipleshipMinimum: 20, skillMinimum: 23, engagementMinimum: 8, evidenceComplete: true, requirements: [{ mandatory: true, status: "not_met" }] }).outcome, "not_yet_eligible");
assert.equal(evaluateProgrammeEligibility({ totalPoints: 82, discipleshipPoints: 32, skillPoints: 38, engagementPoints: 12, overallMinimum: 60, discipleshipMinimum: 20, skillMinimum: 23, engagementMinimum: 8, evidenceComplete: true, requirements: baseRequirements }).outcome, "eligible_for_completion");

assert.equal(assessmentMatchesStudentProgramme({ courseCategory: "discipleship", courseDiscipleshipRoute: "foundational", studentDiscipleshipRoute: "foundational", courseSkillPathway: null, studentSkillPathway: "web_development" }), true);
assert.equal(assessmentMatchesStudentProgramme({ courseCategory: "discipleship", courseDiscipleshipRoute: "foundational", studentDiscipleshipRoute: "advanced", courseSkillPathway: null, studentSkillPathway: "web_development" }), false);
assert.equal(assessmentMatchesStudentProgramme({ courseCategory: "skill", courseSkillPathway: "web_development", studentSkillPathway: "web_development", courseDiscipleshipRoute: null, studentDiscipleshipRoute: "foundational" }), true);
assert.equal(assessmentMatchesStudentProgramme({ courseCategory: "skill", courseSkillPathway: "web_development", studentSkillPathway: "cybersecurity_foundations", courseDiscipleshipRoute: null, studentDiscipleshipRoute: "advanced" }), false);
assert.equal(isStudentVisibleResult("approved"), false);
assert.equal(isStudentVisibleResult("published"), true);

console.log("Build 11 result-model tests passed (attempt selection, weighted categories, incomplete evidence, attendance denominator, and non-compensating gates).");
