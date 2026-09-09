import assert from "node:assert/strict";
import vm from "node:vm";
import ts from "typescript";
import * as recordingDomain from "../lib/lms/recording.ts";
import { readFile } from "node:fs/promises";

import { creditedPlaybackSegment, evaluateRecordedRequirements, mergeWatchedSegments, providerTrackingMode, resolveRecordingProgressProvider, resolveRecordingRequirementSnapshot, uniqueWatchedSeconds, watchPercentage } from "../lib/lms/recording.ts";
import { normalizeViewerEmail, parseZoomEvidenceCsv } from "../lib/lms/zoomEvidence.ts";
import { formatRecordingTime, formatRequiredCheckpoints, formatRequirementHours, parseRecordingTime } from "../lib/lms/recordingTime.ts";

assert.deepEqual(parseRecordingTime("02:00:00"), { ok: true, seconds: 7200 });
assert.deepEqual(parseRecordingTime("01:35:00"), { ok: true, seconds: 5700 });
assert.deepEqual(parseRecordingTime("45:00"), { ok: true, seconds: 2700 });
assert.deepEqual(parseRecordingTime("60:00"), { ok: true, seconds: 3600 });
assert.deepEqual(parseRecordingTime(""), { ok: true, seconds: null });
assert.equal(parseRecordingTime("01:75:00").ok, false);
assert.equal(parseRecordingTime("00:60").ok, false);
assert.equal(parseRecordingTime("1:2").ok, false);
assert.equal(parseRecordingTime("90").ok, false);
assert.equal(formatRecordingTime(5700), "01:35:00");
assert.equal(formatRecordingTime(2700), "00:45:00");
assert.equal(formatRecordingTime("7200"), "02:00:00");
assert.equal(formatRequirementHours(72), "Complete within 72 hours");
assert.equal(formatRequiredCheckpoints(2), "2 required checkpoints");
assert.equal(formatRequiredCheckpoints(1), "1 required checkpoint");
assert.equal(formatRequiredCheckpoints(0), "No checkpoints required");

const merged = mergeWatchedSegments([{ start: 0, end: 40 }, { start: 20, end: 60 }, { start: 75, end: 90 }, { start: 90, end: 100 }]);
assert.deepEqual(merged, [{ start: 0, end: 60 }, { start: 75, end: 100 }]);
assert.equal(uniqueWatchedSeconds(merged), 85);
assert.equal(watchPercentage(85, 100), 85);
assert.equal(watchPercentage(120, 100), 100);

const normal = creditedPlaybackSegment({ previousPosition: 10, currentPosition: 30, observedWallSeconds: 20, playbackRate: 1 });
assert.deepEqual(normal.segment, { start: 10, end: 30 });
assert.equal(normal.suspicious, false);
const seek = creditedPlaybackSegment({ previousPosition: 10, currentPosition: 300, observedWallSeconds: 20, playbackRate: 1 });
assert.deepEqual(seek.segment, { start: 10, end: 40 });
assert.equal(seek.suspicious, true);
assert.equal(providerTrackingMode("vimeo", "https://player.vimeo.com/video/123", 100), "automated");
assert.equal(providerTrackingMode("zoom", "https://zoom.us/rec/share/example", 100), "manual_review");
assert.equal(resolveRecordingProgressProvider("zoom", "https://zoom.us/rec/share/example", 100).adapter, "zoom_manual_verification");
assert.equal(providerTrackingMode("vimeo", "https://vimeo.com/123", 100), "manual_review");
assert.equal(providerTrackingMode("vimeo", "https://example.com/?next=player.vimeo.com/video/123", 100), "manual_review");
assert.equal(resolveRecordingProgressProvider("vimeo", "https://player.vimeo.com/video/123", 100).adapter, "vimeo");

const evidence = (overrides = {}) => ({ watch: { required: true, status: "satisfied" }, checkpoints: { required: true, status: "satisfied" }, quiz: { required: true, status: "pending" }, practical: { required: true, status: "pending" }, reflection: { required: false, status: "not_required" }, oral_verification: { required: false, status: "not_required" }, ...overrides });
assert.equal(evaluateRecordedRequirements({ purpose: "RP", progressIntegrityStatus: "clear", watchRequirementMet: true, checkpointRequirementMet: true, configuredRequiredCheckpoints: 2, requiredCheckpointCount: 2, requirements: evidence(), dueAt: null, allowLateCompletion: true }).learningStatus, "awaiting_quiz");
assert.equal(evaluateRecordedRequirements({ purpose: "RP", progressIntegrityStatus: "clear", watchRequirementMet: true, checkpointRequirementMet: true, configuredRequiredCheckpoints: 2, requiredCheckpointCount: 2, requirements: evidence({ quiz: { required: true, status: "satisfied" } }), dueAt: null, allowLateCompletion: true }).learningStatus, "awaiting_practical");
assert.equal(evaluateRecordedRequirements({ purpose: "RP", progressIntegrityStatus: "clear", watchRequirementMet: true, checkpointRequirementMet: true, configuredRequiredCheckpoints: 2, requiredCheckpointCount: 2, requirements: evidence({ quiz: { required: true, status: "satisfied" }, practical: { required: true, status: "satisfied" } }), dueAt: null, allowLateCompletion: true }).learningStatus, "verified_complete");
assert.equal(evaluateRecordedRequirements({ purpose: "DR-E", progressIntegrityStatus: "clear", watchRequirementMet: false, checkpointRequirementMet: false, configuredRequiredCheckpoints: 0, requiredCheckpointCount: 2, requirements: evidence(), dueAt: null, allowLateCompletion: true }).learningStatus, "in_progress");
assert.equal(evaluateRecordedRequirements({ purpose: "REV", progressIntegrityStatus: "clear", watchRequirementMet: true, checkpointRequirementMet: false, configuredRequiredCheckpoints: 0, requiredCheckpointCount: 0, requirements: evidence(), dueAt: null, allowLateCompletion: true }).complete, true);
assert.equal(evaluateRecordedRequirements({ purpose: "RP", progressIntegrityStatus: "review_required", watchRequirementMet: true, checkpointRequirementMet: true, configuredRequiredCheckpoints: 2, requiredCheckpointCount: 2, requirements: evidence(), dueAt: null, allowLateCompletion: true }).learningStatus, "integrity_review");
assert.equal(evaluateRecordedRequirements({ purpose: "RP", progressIntegrityStatus: "clear", watchRequirementMet: true, checkpointRequirementMet: true, configuredRequiredCheckpoints: 2, requiredCheckpointCount: 2, requirements: evidence({ quiz: { required: true, status: "satisfied" }, practical: { required: true, status: "satisfied" } }), dueAt: "2020-01-01T00:00:00.000Z", allowLateCompletion: true }).learningStatus, "late_complete");
assert.equal(evaluateRecordedRequirements({ purpose: "MU-E", progressIntegrityStatus: "clear", watchRequirementMet: true, checkpointRequirementMet: true, configuredRequiredCheckpoints: 2, requiredCheckpointCount: 2, requirements: evidence({ quiz: { required: true, status: "satisfied" }, practical: { required: true, status: "satisfied" } }), dueAt: "2020-01-01T00:00:00.000Z", allowLateCompletion: true }).learningStatus, "verified_complete");
assert.equal(evaluateRecordedRequirements({ purpose: "MU-U", progressIntegrityStatus: "clear", watchRequirementMet: true, checkpointRequirementMet: true, configuredRequiredCheckpoints: 2, requiredCheckpointCount: 2, requirements: evidence({ quiz: { required: true, status: "satisfied" }, practical: { required: true, status: "satisfied" } }), dueAt: null, allowLateCompletion: true }).learningStatus, "late_complete");
assert.match(evaluateRecordedRequirements({ purpose: "RP", progressIntegrityStatus: "clear", watchRequirementMet: true, checkpointRequirementMet: false, configuredRequiredCheckpoints: 1, requiredCheckpointCount: 2, requirements: evidence(), dueAt: null, allowLateCompletion: true }).warning ?? "", /required checkpoints/i);

const frozenRequirements = { minWatchPercentage: 85, deadlineHours: 72, requiredCheckpointCount: 2, requiresCheckpoints: true, requiresQuiz: true, requiresPractical: false, requiresReflection: true, requiresOralVerification: false, allowLateCompletion: true };
const frozen = resolveRecordingRequirementSnapshot(frozenRequirements);
assert.equal(frozen.status, "snapshot");
assert.deepEqual(frozen.requirements, frozenRequirements);
assert.equal(frozen.requirements?.minWatchPercentage, 85, "A later policy change must not alter an assignment-time snapshot.");
assert.deepEqual(resolveRecordingRequirementSnapshot(null), { status: "legacy", requirements: null });
assert.deepEqual(resolveRecordingRequirementSnapshot({}), { status: "legacy", requirements: null });
assert.deepEqual(resolveRecordingRequirementSnapshot({ minWatchPercentage: 85, deadlineHours: 72 }), { status: "legacy", requirements: null });

const [studentDetailSource, studentListSource, recordingServiceSource, recordingDataSource, sessionDataSource, sessionRecordSource, adminSessionPageSource, checkpointRouteSource, zoomServiceSource, zoomMigrationSource, zoomCheckpointMigrationSource, checkpointGuidanceMigrationSource, zoomAdminSource, recordedLearningAdminSource, checkpointFormSource, checkpointAdminSource] = await Promise.all([
  readFile(new URL("../app/student/(academic)/recordings/[assignmentId]/page.tsx", import.meta.url), "utf8"),
  readFile(new URL("../app/student/(academic)/recordings/page.tsx", import.meta.url), "utf8"),
  readFile(new URL("../lib/lms/recordingService.ts", import.meta.url), "utf8"),
  readFile(new URL("../lib/lms/recordingData.ts", import.meta.url), "utf8"),
  readFile(new URL("../lib/lms/sessionData.ts", import.meta.url), "utf8"),
  readFile(new URL("../components/admin/SessionRecord.tsx", import.meta.url), "utf8"),
  readFile(new URL("../app/admin/sessions/[id]/page.tsx", import.meta.url), "utf8"),
  readFile(new URL("../app/api/admin/recordings/checkpoints/[id]/route.ts", import.meta.url), "utf8"),
  readFile(new URL("../lib/lms/zoomEvidenceService.ts", import.meta.url), "utf8"),
  readFile(new URL("../supabase/lms_zoom_viewing_evidence.sql", import.meta.url), "utf8"),
  readFile(new URL("../supabase/lms_zoom_manual_checkpoints.sql", import.meta.url), "utf8"),
  readFile(new URL("../supabase/lms_checkpoint_answer_guidance.sql", import.meta.url), "utf8"),
  readFile(new URL("../components/admin/ZoomEvidencePanel.tsx", import.meta.url), "utf8"),
  readFile(new URL("../components/admin/RecordedLearningAdminPanel.tsx", import.meta.url), "utf8"),
  readFile(new URL("../components/student/RecordingPlayer.tsx", import.meta.url), "utf8"),
  readFile(new URL("../components/admin/RecordingAdminActions.tsx", import.meta.url), "utf8"),
]);
assert.match(studentDetailSource, /isRevision \? <StudentPanel title="Revision recording"/);
assert.match(studentDetailSource, /No minimum watch requirement/);
assert.match(studentDetailSource, /No required checkpoints/);
assert.match(studentDetailSource, /No academic deadline/);
assert.match(studentDetailSource, /const playerCheckpoints = isRevision \|\| isZoomManual \? \[\]/);
assert.match(studentListSource, /isRevision \? "Optional revision"/);
assert.match(studentListSource, /Automatic revision viewing progress unavailable/);
assert.match(studentListSource, /item\.purposeCode === "REV" \? item\.progress\.watchRequirementMet/);
assert.match(recordingServiceSource, /input\.purpose === "REV" \? null/);
assert.match(recordingServiceSource, /if \(input\.purpose !== "REV"\)/);
assert.match(recordingServiceSource, /evaluation\.complete && \(purpose === "RP" \|\| purpose === "DR-E"\)/);
assert.match(recordingServiceSource, /Zoom viewing must be verified from matched Zoom viewing evidence/);
assert.match(studentDetailSource, /\["MU-E", "MU-U"\]\.includes\(detail\.purposeCode\)/);
assert.match(studentDetailSource, /Automatic playback measurement is unavailable for this Zoom recording/);
assert.match(studentListSource, /!isZoomManual/);
assert.match(zoomAdminSource, /never labelled unique watch duration/i);
assert.match(zoomServiceSource, /candidates\.length === 1/);
assert.match(zoomServiceSource, /registered_email/);
assert.match(zoomServiceSource, /inserted\.error\?\.code === "23505"/);
assert.match(zoomServiceSource, /Zoom viewing evidence cannot verify official learning by itself/);
assert.match(zoomServiceSource, /\.in\("purpose_code", \["RP", "DR-E", "MU-E", "MU-U"\]\)/);
assert.match(zoomMigrationSource, /source_hash text not null unique/);
assert.match(zoomMigrationSource, /revoke all on public\.zoom_recording_viewer_evidence from anon, authenticated/);
assert.match(recordingServiceSource, /zoom_manual_verification/);
assert.match(recordingServiceSource, /Zoom manual-verification checkpoints must not include a playback time or percentage/);
assert.match(recordingServiceSource, /A checkpoint question is required for Zoom manual verification/);
assert.match(recordingServiceSource, /question_type: "short_answer"/);
assert.match(recordingDataSource, /position_seconds: null, position_percentage: null/);
assert.match(zoomCheckpointMigrationSource, /position_percentage is not null\)::integer <= 1/);
assert.match(recordedLearningAdminSource, /Zoom manual verification uses checkpoint order, not playback positions/);
assert.match(recordedLearningAdminSource, /question: zoomManual \? form\.get\("question"\) : null/);
assert.match(checkpointFormSource, /Checkpoint \{String\(checkpoint\.checkpoint_order\)\}/);
assert.doesNotMatch(studentDetailSource, /around each configured point/);
assert.match(recordedLearningAdminSource, /both understanding and evidence of engagement with this specific class/);
assert.match(checkpointAdminSource, /Prefer facilitator examples, explanations, Scripture applications, demonstrations, or instructions over generic knowledge questions/);
assert.match(checkpointAdminSource, /defaultValue="80"/);
assert.match(checkpointAdminSource, /defaultValue="200"/);
assert.match(recordingServiceSource, /Your response must contain at least/);
assert.match(recordingServiceSource, /Your response must contain no more than/);
assert.match(checkpointFormSource, /answerGuidance/);
assert.match(checkpointGuidanceMigrationSource, /response_format.*short_text.*long_text/s);
assert.match(checkpointGuidanceMigrationSource, /min_words/);
assert.match(checkpointGuidanceMigrationSource, /max_words/);
assert.match(studentDetailSource, /neither verifies attendance by itself/);
assert.match(recordingDataSource, /Student recording checkpoint query failed/);
assert.match(recordingDataSource, /checkpointResult\.error\.code === "42703"/);
assert.match(recordingDataSource, /Student recording checkpoint legacy query failed/);
assert.match(recordingDataSource, /recording_checkpoint_questions\(id, question_type, prompt, options, is_active, sort_order\)/);
assert.match(recordingServiceSource, /Checkpoint answer guidance columns are not deployed/);
assert.match(checkpointRouteSource, /await createRecordingCheckpoint[\s\S]*status: 201/);
assert.match(checkpointRouteSource, /isAdminAuthenticated[\s\S]*Unauthorized/);
assert.match(recordingServiceSource, /Recording checkpoint insert failed/);
assert.match(recordingServiceSource, /code: error\.code, message: error\.message, details: error\.details, hint: error\.hint/);
assert.match(recordingServiceSource, /This checkpoint already exists for this recording/);
assert.match(recordingServiceSource, /required checkpoints are configured by this policy, but only/);
assert.match(sessionDataSource, /recordingCheckpoints/);
assert.match(sessionDataSource, /Admin session recording checkpoint query failed/);
assert.match(sessionDataSource, /current\.error\.code !== "42703"/);
assert.match(sessionRecordSource, /checkpoints=\{record\.recordingCheckpoints\.map/);
assert.match(recordedLearningAdminSource, /configured \/ \{requiredByPolicy\} required/);
assert.match(adminSessionPageSource, /Checkpoint created successfully\./);
assert.match(recordedLearningAdminSource, /window\.location\.assign\(`\/admin\/sessions\/\$\{sessionId\}\?checkpoint=created#recorded-learning`\)/);
assert.match(recordedLearningAdminSource, /!isZoomManual \? <p[\s\S]*Position:/);
assert.match(checkpointRouteSource, /export async function DELETE[\s\S]*isAdminAuthenticated[\s\S]*removeRecordingCheckpoint/);
assert.match(checkpointRouteSource, /export async function PATCH[\s\S]*isAdminAuthenticated[\s\S]*updateRecordingCheckpoint/);
assert.match(checkpointRouteSource, /revalidatePath\(`\/admin\/sessions\/\$\{result\.sessionId\}`\)/);
assert.match(recordingServiceSource, /recording_checkpoint_attempts[\s\S]*head: true[\s\S]*checkpoint_id/);
assert.match(recordingServiceSource, /student learning evidence and cannot be deleted/);
assert.match(recordingServiceSource, /student learning evidence and cannot be edited/);
assert.match(recordingServiceSource, /normalizeCheckpointOrder[\s\S]*index \+ 1/);
assert.match(recordedLearningAdminSource, /Remove this checkpoint\?\\n\\nThis action is allowed only if no student learning evidence depends on it\./);
assert.match(recordedLearningAdminSource, /\?checkpoint=removed#recorded-learning/);
assert.match(adminSessionPageSource, /Checkpoint removed successfully\./);
assert.match(recordedLearningAdminSource, />Edit<\/button><button[\s\S]*>Remove<\/button>/);
assert.equal(normalizeViewerEmail(" Student@REALMS.example "), "student@realms.example");
const zoomRows = parseZoomEvidenceCsv('Viewer Name,Viewer Email,View Date/Time,View Duration,Recording ID\n"Ada, Learner",Student@REALMS.example,2026-09-04T10:00:00Z,01:05:30,zoom-123');
assert.deepEqual(zoomRows.map((row) => ({ name: row.viewerName, email: row.viewerEmail, duration: row.reportedDurationSeconds, identifier: row.recordingIdentifier })), [{ name: "Ada, Learner", email: "student@realms.example", duration: 3930, identifier: "zoom-123" }]);

// Execute the actual service with an in-memory query boundary; never connect to production.
class TestDataError extends Error {
  constructor(message, status = 500) { super(message); this.status = status; }
}
const serviceModule = { exports: {} };
vm.runInNewContext(ts.transpileModule(recordingServiceSource, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText, {
  exports: serviceModule.exports,
  require(name) {
    if (name === "server-only") return {};
    if (name === "@/lib/lms/recording") return recordingDomain;
    if (name === "@/lib/lms/adminData") return { LmsAdminDataError: TestDataError };
    if (name === "@/lib/lms/adminAudit") return { recordLmsAudit: async () => {} };
    return new Proxy({}, { get: (_, key) => () => { throw new Error(`Unexpected service dependency: ${name}.${String(key)}`); } });
  },
  console,
});
const service = serviceModule.exports;
function recordingFixture(status = "draft", count = 2) {
  const recording = { id: "recording", class_session_id: "session", title: "Class recording", recording_date: "2026-08-24", provider: "zoom", recording_status: status, quality_checked: true, access_level: "enrolled_students", external_url: "https://zoom.us/rec/share/example", duration_seconds: 6689 };
  const tables = {
    class_sessions: [{ id: "session", cohort_course_id: "course", cohort_courses: { cohort_id: "cohort", courses: { course_category: "discipleship" } } }],
    class_recordings: [recording],
    session_recording_requirements: [],
    recording_completion_policies: [],
    course_enrollments: [{ cohort_course_id: "course", enrollment_status: "active", delivery_route: "DR-E" }],
    recording_learning_assignments: [],
    recording_checkpoints: Array.from({ length: count }, (_, index) => ({ id: `checkpoint-${index}`, class_recording_id: "recording", is_active: true, is_required: true, checkpoint_order: index + 1, position_seconds: null, position_percentage: null, recording_checkpoint_questions: [{ id: `question-${index}`, is_active: true, question_type: "short_answer" }] })),
    recording_checkpoint_attempts: [],
    recording_progress: [],
    recording_requirement_statuses: [],
    session_learning_completion: [],
  };
  const writes = [];
  const db = { from(table) {
    assert.ok(Object.hasOwn(tables, table), `Unexpected table access: ${table}`);
    const filters = []; let single = false; let values; let operation;
    const query = {
      select() { return query; },
      eq(key, value) { filters.push(row => row[key] === value); return query; },
      in(key, values) { filters.push(row => values.includes(row[key])); return query; },
      single() { single = true; return query; },
      maybeSingle() { single = true; return query; },
      upsert(value) { operation = "upsert"; values = value; return query; },
      update(value) { operation = "update"; values = value; return query; },
      then(resolve, reject) {
        return Promise.resolve().then(() => {
          let rows = tables[table].filter(row => filters.every(filter => filter(row)));
          if (operation) {
            writes.push({ table, operation });
            if (operation === "upsert") { rows = [structuredClone(values)]; tables[table] = rows; }
            else rows.forEach(row => Object.assign(row, values));
          }
          return { data: single ? rows[0] ?? null : rows, count: rows.length, error: null };
        }).then(resolve, reject);
      },
    };
    return query;
  } };
  return { db, tables, writes, recording };
}
const policyBody = { min_watch_percentage: 85, deadline_hours: 96, required_checkpoint_count: 2, requires_checkpoints: true, requires_quiz: false, requires_practical: false, requires_reflection: false, requires_oral_verification: false, allow_late_completion: false, quiz_id: null, practical_assignment_id: null, reflection_assignment_id: null };
const actor = { actorLabel: "REALMS Admin" };
const draft = recordingFixture();
const savedPolicy = await service.saveSessionRecordingRequirements(draft.db, "session", policyBody, actor);
for (const [key, value] of Object.entries(policyBody)) assert.equal(savedPolicy[key], value);
assert.equal(draft.recording.recording_status, "draft");
assert.equal(recordingDomain.recordingEvidenceReadiness(draft.recording).ready, false);
assert.deepEqual(draft.writes, [{ table: "session_recording_requirements", operation: "upsert" }]);
assert.equal(draft.tables.recording_learning_assignments.length, 0);
assert.ok(draft.tables.recording_checkpoints.every(row => row.position_seconds === null && row.position_percentage === null));
const insufficient = recordingFixture("draft", 1);
await assert.rejects(service.saveSessionRecordingRequirements(insufficient.db, "session", policyBody, actor), error => error.status === 409 && error.message.includes("only 1 required checkpoint"));
assert.deepEqual(insufficient.writes, []);
const available = recordingFixture("available");
await service.saveSessionRecordingRequirements(available.db, "session", policyBody, actor);
await service.assertRecordingActivationReady(available.db, "session", "recording");
// An explicitly saved requirement still blocks activation if its link is absent.
for (const requirement of ["quiz", "practical", "reflection"]) {
  available.tables.session_recording_requirements[0][`requires_${requirement}`] = true;
  await assert.rejects(service.assertRecordingActivationReady(available.db, "session", "recording"), error => error.status === 409 && error.message === `Link a valid ${requirement} before activating official recorded learning.`);
  available.tables.session_recording_requirements[0][`requires_${requirement}`] = false;
}
for (const status of ["archived", "superseded", "failed", "deleted"]) {
  const inactive = recordingFixture(status);
  await assert.rejects(service.saveSessionRecordingRequirements(inactive.db, "session", policyBody, actor), error => error.status === 409);
  assert.deepEqual(inactive.writes, []);
}
for (const change of [row => { row.is_active = false; }, row => { row.is_required = false; }, row => { row.recording_checkpoint_questions[0].is_active = false; }]) {
  const invalid = recordingFixture();
  change(invalid.tables.recording_checkpoints[1]);
  await assert.rejects(service.saveSessionRecordingRequirements(invalid.db, "session", policyBody, actor), error => error.status === 409);
}
const protectedAssignments = recordingFixture();
protectedAssignments.tables.recording_learning_assignments.push({ id: "existing", class_session_id: "session" });
await assert.rejects(service.saveSessionRecordingRequirements(protectedAssignments.db, "session", policyBody, actor), error => error.status === 409 && error.message.includes("assignments already exist"));
assert.deepEqual(protectedAssignments.writes, []);
// Exercise General Replay through the actual evaluator; attendance access is forbidden by the fixture.
const replay = recordingFixture("available");
replay.tables.recording_learning_assignments.push({ id: "replay", purpose_code: "REV", class_session_id: "session", course_enrollment_id: "enrollment", class_recordings: replay.recording, requirement_snapshot: frozenRequirements });
replay.tables.recording_progress.push({ id: "progress", recording_assignment_id: "replay", integrity_status: "clear", watch_requirement_met: true, watch_percentage: 100 });
const replayResult = await service.evaluateRecordedLearningAssignment(replay.db, "replay", actor);
assert.equal(replayResult.complete, true);
assert.ok(replay.writes.every(write => ["recording_progress", "recording_requirement_statuses"].includes(write.table)));
console.log("Authoring-policy regression cases A-G and inactive-state/evidence protections passed.");

console.log(JSON.stringify({ timeAuthoringCases: 16, segmentMerge: "passed", elapsedTimeCap: "passed", providerModes: "passed", evaluatorCases: 10, requirementSnapshotCases: 4, purposeAwarePresentationCases: 12, zoomEvidenceCases: 14, zoomCheckpointCases: 10, checkpointIntegrityCases: 11, checkpointSchemaFallbackCases: 5, passed: 96 }, null, 2));
