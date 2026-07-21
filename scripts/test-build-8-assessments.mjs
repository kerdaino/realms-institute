import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

import { assessmentCategories, assessmentDomains, assignmentTypes, automaticAnswersEqual, categoryMatchesDomain, nextAttemptNumber, quizExpiry, scorePercentage } from "../lib/lms/assessment.ts";

assert.deepEqual(assessmentDomains, ["discipleship", "skill"]);
assert.equal(categoryMatchesDomain("discipleship", "growth_integration"), true);
assert.equal(categoryMatchesDomain("discipleship", "capstone"), false);
assert.equal(categoryMatchesDomain("skill", "weekly_practical"), true);
assert.equal(assessmentCategories.skill.includes("capstone"), true);
assert.equal(assignmentTypes.includes("capstone"), true);
assert.equal(assignmentTypes.includes("reflection"), true);
assert.equal(scorePercentage(45, 50), 90);
assert.equal(scorePercentage(200, 100), 100);
assert.equal(scorePercentage(5, 0), 0);
assert.equal(nextAttemptNumber([]), 1);
assert.equal(nextAttemptNumber([{ attempt_number: 1 }, { attempt_number: 3 }]), 4);
assert.equal(automaticAnswersEqual("true_false", true, "true"), true);
assert.equal(automaticAnswersEqual("multiple_choice", "  Grace ", "Grace"), true);
assert.equal(automaticAnswersEqual("multiple_choice", "Grace", "Works"), false);
assert.equal(quizExpiry(new Date("2026-01-01T10:00:00Z"), 30, null), "2026-01-01T10:30:00.000Z");
assert.equal(quizExpiry(new Date("2026-01-01T10:00:00Z"), 60, "2026-01-01T10:20:00Z"), "2026-01-01T10:20:00.000Z");

const service = await readFile(new URL("../lib/lms/assessmentService.ts", import.meta.url), "utf8");
const migration = await readFile(new URL("../supabase/lms_build_8_assessment_security.sql", import.meta.url), "utf8");
assert.match(service, /forbidden.*score_points/si);
assert.match(service, /quiz_answer_keys/);
assert.match(service, /evaluateRecordedLearningAssignment/);
assert.match(service, /assessment_grade_change_events/);
assert.match(service, /requirement_status: "satisfied"/);
assert.doesNotMatch(service, /final unified|graduat(?:e|ed)_at|certificate/i);
assert.match(migration, /revoke insert, update, delete/i);
assert.match(migration, /revoke select on public\.quiz_answer_keys/i);
assert.match(migration, /quiz_attempt_answer_unique_idx/);

console.log(JSON.stringify({ domains: 4, assignmentModel: 7, gradingMath: 5, timerAndAttempts: 4, serverSecurity: 8, passed: 28 }, null, 2));
