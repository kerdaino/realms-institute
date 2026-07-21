import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import ts from "typescript";

const absenceSource = await readFile(new URL("../lib/lms/absence.ts", import.meta.url), "utf8");
const compiled = ts.transpileModule(absenceSource, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText;
const { absenceReasonCategories, absenceRequestStatuses, makeupStatuses, makeupStatusFromLearning, oralVerificationStatuses } = await import(`data:text/javascript;base64,${Buffer.from(compiled).toString("base64")}`);

assert.equal(absenceReasonCategories.length, 8);
assert.ok(absenceReasonCategories.includes("illness"));
assert.ok(absenceReasonCategories.includes("connectivity_or_power"));
assert.deepEqual(absenceRequestStatuses, ["draft", "submitted", "under_review", "more_information_required", "approved", "declined", "withdrawn"]);
assert.ok(makeupStatuses.includes("awaiting_materials"));
assert.ok(makeupStatuses.includes("integrity_review"));
assert.equal(makeupStatusFromLearning("verified_complete", true), "completed");
assert.equal(makeupStatusFromLearning("late_complete", true), "late_complete");
assert.equal(makeupStatusFromLearning("awaiting_quiz", false), "awaiting_quiz");
assert.equal(makeupStatusFromLearning("incomplete", false, "2020-01-01T00:00:00Z"), "overdue");
assert.ok(oralVerificationStatuses.includes("satisfactory"));

const service = await readFile(new URL("../lib/lms/absenceService.ts", import.meta.url), "utf8");
const attendance = await readFile(new URL("../lib/lms/attendanceService.ts", import.meta.url), "utf8");
const recording = await readFile(new URL("../lib/lms/recordingService.ts", import.meta.url), "utf8");
const migration = await readFile(new URL("../supabase/lms_build_9_absence_makeup_security.sql", import.meta.url), "utf8");

assert.match(service, /eq\("profile_id", profileId\)/);
assert.match(service, /eq\("course_enrollment_id", courseEnrollmentId\).*eq\("class_session_id", sessionId\)/s);
assert.match(service, /attendance_status: "excused_absence", absence_weight: 0/);
assert.match(service, /attendance_unchanged: true/);
assert.match(service, /awaiting_materials/);
assert.match(service, /external_makeup_evidence_verified/);
assert.match(attendance, /request_status", "approved"/);
assert.match(attendance, /attendance_status: approved \? "excused_absence"/);
assert.match(recording, /purpose === "MU-E" \|\| purpose === "MU-U"/);
assert.match(recording, /attendance_unchanged: true/);
assert.match(migration, /absence_request_enrollment_session_unique_idx/);
assert.match(migration, /makeup_requirement_enrollment_session_purpose_unique_idx/);
assert.match(migration, /revoke insert, update, delete/i);
assert.match(migration, /No authenticated SELECT policy is intentionally defined/);
assert.doesNotMatch(service, /withdrawn.*student_status|automatic.*withdraw/i);

console.log(JSON.stringify({ domainAndStatusModel: 11, ownershipAndIdempotency: 4, attendanceHistoryProtection: 5, privacyAndRls: 4, noAutomaticDiscipline: 1, passed: 25 }, null, 2));
