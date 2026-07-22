import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

import {
  august2026AssessmentContentPending,
  august2026AssessmentCounts,
  august2026AssessmentInstructions,
  august2026AssessmentShells,
  august2026Rubrics,
} from "../lib/lms/august2026Assessments.ts";

const seed = await readFile(new URL("./setup-august-2026-assessments.mjs", import.meta.url), "utf8");
const assessmentData = await readFile(new URL("../lib/lms/assessmentData.ts", import.meta.url), "utf8");
const studentData = await readFile(new URL("../lib/lms/assessmentData.ts", import.meta.url), "utf8");
const facilitatorAssignments = await readFile(new URL("../app/api/facilitator/assignments/route.ts", import.meta.url), "utf8");
const facilitatorQuizzes = await readFile(new URL("../app/api/facilitator/quizzes/route.ts", import.meta.url), "utf8");
const facilitatorQuiz = await readFile(new URL("../app/api/facilitator/quizzes/[id]/route.ts", import.meta.url), "utf8");
const facilitatorQuestions = await readFile(new URL("../app/api/facilitator/quizzes/[id]/questions/route.ts", import.meta.url), "utf8");
const quizRecord = await readFile(new URL("../components/admin/QuizRecord.tsx", import.meta.url), "utf8");
const privateStorage = await readFile(new URL("../lib/lms/privateStorage.server.ts", import.meta.url), "utf8");
const privateFilePolicy = await readFile(new URL("../lib/lms/privateFilePolicy.ts", import.meta.url), "utf8");
const results = await readFile(new URL("../lib/lms/resultService.ts", import.meta.url), "utf8");

let passed = 0;
function check(label, callback) { callback(); passed += 1; void label; }
const counts = august2026AssessmentCounts();
const byRoute = (route) => august2026AssessmentShells.filter((item) => item.route === route);
const totalForRubric = (key) => august2026Rubrics[key].reduce((sum, item) => sum + item.maxPoints, 0);

check("shell counts are intentional", () => assert.deepEqual(counts, { foundational: 8, advanced: 6, web: 9, cyber: 9 }));
check("there are 32 unique shells", () => { assert.equal(august2026AssessmentShells.length, 32); assert.equal(new Set(august2026AssessmentShells.map((item) => item.stableKey)).size, 32); });
check("no ADV206 shell exists", () => assert.equal(august2026AssessmentShells.some((item) => item.courseCode.includes("ADV 206")), false));
check("all shells remain draft-only preparation", () => assert.ok(august2026AssessmentShells.every((item) => item.countsTowardResult === false && item.activeWeighting === false)));
check("no shell invents a deadline", () => assert.ok(august2026AssessmentShells.every((item) => item.dueAt === null)));
check("every shell has explicit pending content", () => assert.ok(august2026AssessmentShells.every((item) => august2026AssessmentInstructions(item).includes(august2026AssessmentContentPending))));
check("AI policy remains per assessment", () => assert.ok(august2026AssessmentShells.every((item) => /allowed, restricted, disclosure-required or prohibited/.test(august2026AssessmentInstructions(item)))));
check("questions and answer keys are not generated", () => { assert.doesNotMatch(seed, /from\("quiz_questions"\)\.(?:insert|upsert)/); assert.doesNotMatch(seed, /from\("quiz_answer_keys"\)\.(?:insert|upsert)/); });
check("only intentional empty quiz shells are prepared", () => { assert.equal(august2026AssessmentShells.filter((item) => item.assessmentKind === "quiz").length, 3); assert.match(seed, /quiz_status: "draft"/); assert.match(seed, /questionsCreated: 0/); });
check("rubrics each total 100", () => Object.keys(august2026Rubrics).forEach((key) => assert.equal(totalForRubric(key), 100)));
check("assignments use a matching 100-point rubric and quizzes declare planned marks", () => { assert.ok(august2026AssessmentShells.filter((item) => item.assessmentKind === "assignment").every((item) => item.maxScore === totalForRubric(item.rubricKey))); assert.ok(august2026AssessmentShells.filter((item) => item.assessmentKind === "quiz").every((item) => item.rubricKey === null && /Planned maximum marks: 100/.test(august2026AssessmentInstructions(item)))); });
check("discipleship policy categories total 40", () => assert.equal([...new Map(byRoute("foundational").map((item) => [item.assessmentCategory, item.categoryMaxPoints])).values()].reduce((sum, value) => sum + value, 0), 40));
check("skill policy categories total 45", () => assert.equal([...new Map(byRoute("web").map((item) => [item.assessmentCategory, item.categoryMaxPoints])).values()].reduce((sum, value) => sum + value, 0), 45));
check("foundational covers every discipleship category", () => assert.equal(new Set(byRoute("foundational").map((item) => item.assessmentCategory)).size, 5));
check("advanced covers every discipleship category", () => assert.equal(new Set(byRoute("advanced").map((item) => item.assessmentCategory)).size, 5));
check("web covers every skill category", () => assert.equal(new Set(byRoute("web").map((item) => item.assessmentCategory)).size, 5));
check("cyber covers every skill category", () => assert.equal(new Set(byRoute("cyber").map((item) => item.assessmentCategory)).size, 5));
check("final route shells are graduation mappings", () => assert.ok(august2026AssessmentShells.filter((item) => item.assessmentCategory === "final_route_assessment").every((item) => item.requiredForGraduation)));
check("both capstones are graduation mappings", () => { const capstones = august2026AssessmentShells.filter((item) => item.assessmentCategory === "capstone"); assert.equal(capstones.length, 2); assert.ok(capstones.every((item) => item.requiredForGraduation)); });
check("web capstone uses realistic URL evidence", () => { const item = august2026AssessmentShells.find((shell) => shell.courseCode === "RSD-WEB 190"); assert.equal(item.submissionRequirements.repository_url_required, true); assert.equal(item.submissionRequirements.deployment_url_required, true); });
check("cyber shells preserve authorised scope", () => assert.ok(byRoute("cyber").every((item) => /approved|authorised|professional|workflow|scope/i.test(item.evidencePurpose))));
check("cyber capstone bans unsafe targets", () => assert.match(august2026AssessmentShells.find((item) => item.courseCode === "RSD-CYB 190").evidencePurpose, /No real-world target, malware sample or unsafe executable/));
check("file submission stays optional and private", () => { assert.ok(august2026AssessmentShells.every((item) => !("file_upload_required" in item.submissionRequirements))); assert.match(privateFilePolicy, /assessment-submissions/); assert.match(privateStorage, /createSignedUrl/); });
check("seed is dry-run first and double-confirmed", () => { assert.match(seed, /process\.argv\.includes\("--apply"\)/); assert.match(seed, /NEXT_6_APPLY/); assert.match(seed, /mode: apply \? "apply" : "dry-run"/); });
check("stable deterministic IDs prevent duplicates", () => { assert.match(seed, /stableUuid/); assert.match(seed, /same_offering_title_has_different_id/); });
check("seed never creates courses or offerings", () => { assert.doesNotMatch(seed, /from\("courses"\)\.insert/); assert.doesNotMatch(seed, /from\("cohort_courses"\)\.insert/); });
check("students query published assessments only", () => { assert.match(studentData, /eq\("assignment_status", "published"\)/); assert.match(studentData, /eq\("quiz_status", "published"\)/); });
check("content readiness is visible to academic managers", () => { assert.match(assessmentData, /content_readiness/); assert.match(assessmentData, /CONTENT PENDING FACILITATOR TEACHING/); });
check("facilitator assignment creation remains assigned-course scoped", () => { assert.match(facilitatorAssignments, /context\.offeringIds\.includes/); assert.match(facilitatorAssignments, /saveAssignment/); });
check("facilitators can create and edit assigned draft quizzes", () => { assert.match(facilitatorQuizzes, /export async function POST/); assert.match(facilitatorQuizzes, /context\.offeringIds\.includes/); assert.match(facilitatorQuiz, /export async function PATCH/); assert.match(facilitatorQuiz, /requireFacilitatorAssessmentRecord/); });
check("facilitator questions stay assigned and draft-only", () => { assert.match(facilitatorQuestions, /requireFacilitatorAssessmentRecord/); assert.match(facilitatorQuestions, /addQuizQuestion/); assert.match(quizRecord, /Admin publishes after academic review/); });
check("attendance remains outside assessment mappings", () => assert.ok(august2026AssessmentShells.every((item) => item.assessmentDomain !== "engagement")));
check("results preserve independent gates", () => { assert.match(results, /discipleship_gate_points/); assert.match(results, /skill_gate_points/); assert.match(results, /engagement_gate_points/); assert.match(results, /capstone_defence_gate_met/); });

assert.equal(passed, 33);
console.log(`NEXT 6 August assessment framework checks passed (${passed}).`);
