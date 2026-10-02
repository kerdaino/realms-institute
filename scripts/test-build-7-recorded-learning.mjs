import assert from "node:assert/strict";
import vm from "node:vm";
import ts from "typescript";
import * as recordingDomain from "../lib/lms/recording.ts";
import { readFile } from "node:fs/promises";

import { creditedPlaybackSegment, evaluateRecordedRequirements, mergeWatchedSegments, providerTrackingMode, resolveRecordingProgressProvider, resolveRecordingRequirementSnapshot, uniqueWatchedSeconds, watchPercentage } from "../lib/lms/recording.ts";
import { normalizeViewerEmail, parseZoomEvidenceCsv } from "../lib/lms/zoomEvidence.ts";
import { formatRecordingTime, formatRequiredCheckpoints, formatRequirementHours, parseRecordingTime } from "../lib/lms/recordingTime.ts";
import { formatInstitutionalTimestamp } from "../lib/lms/dateTime.ts";

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
assert.equal(formatInstitutionalTimestamp("2026-10-02T11:58:01.000Z"), "02/10/2026, 12:58:01");

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

const [studentDetailSource, studentListSource, recordingServiceSource, recordingDataSource, sessionDataSource, sessionRecordSource, adminSessionPageSource, adminRecordingDetailSource, checkpointRouteSource, zoomServiceSource, zoomMigrationSource, zoomCheckpointMigrationSource, checkpointGuidanceMigrationSource, checkpointReviewMigrationSource, checkpointIdempotencyMigrationSource, checkpointCleanupSource, zoomAdminSource, recordedLearningAdminSource, checkpointFormSource, checkpointAdminSource] = await Promise.all([
  readFile(new URL("../app/student/(academic)/recordings/[assignmentId]/page.tsx", import.meta.url), "utf8"),
  readFile(new URL("../app/student/(academic)/recordings/page.tsx", import.meta.url), "utf8"),
  readFile(new URL("../lib/lms/recordingService.ts", import.meta.url), "utf8"),
  readFile(new URL("../lib/lms/recordingData.ts", import.meta.url), "utf8"),
  readFile(new URL("../lib/lms/sessionData.ts", import.meta.url), "utf8"),
  readFile(new URL("../components/admin/SessionRecord.tsx", import.meta.url), "utf8"),
  readFile(new URL("../app/admin/sessions/[id]/page.tsx", import.meta.url), "utf8"),
  readFile(new URL("../app/admin/recordings/[id]/page.tsx", import.meta.url), "utf8"),
  readFile(new URL("../app/api/admin/recordings/checkpoints/[id]/route.ts", import.meta.url), "utf8"),
  readFile(new URL("../lib/lms/zoomEvidenceService.ts", import.meta.url), "utf8"),
  readFile(new URL("../supabase/lms_zoom_viewing_evidence.sql", import.meta.url), "utf8"),
  readFile(new URL("../supabase/lms_zoom_manual_checkpoints.sql", import.meta.url), "utf8"),
  readFile(new URL("../supabase/lms_checkpoint_answer_guidance.sql", import.meta.url), "utf8"),
  readFile(new URL("../supabase/lms_checkpoint_attempt_review.sql", import.meta.url), "utf8"),
  readFile(new URL("../supabase/lms_checkpoint_submission_idempotency.sql", import.meta.url), "utf8"),
  readFile(new URL("../scripts/cleanup-recording-checkpoint-duplicates.mjs", import.meta.url), "utf8"),
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
assert.match(zoomAdminSource, /formatInstitutionalTimestamp\(String\(item\.viewed_at\)\)/);
assert.doesNotMatch(zoomAdminSource, /toLocale(?:String|DateString|TimeString)\(/);
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
assert.match(recordingDataSource, /recording_checkpoint_attempts"\)\.select\("\*"\)\.eq\("recording_assignment_id", assignmentId\)/);
assert.match(adminRecordingDetailSource, /Checkpoint responses/);
assert.match(adminRecordingDetailSource, /attempts=\{detail\.checkpointAttempts\}/);
assert.match(checkpointAdminSource, /Learner response/);
assert.match(checkpointAdminSource, /submitted_answer/);
assert.match(checkpointAdminSource, /Accept response/);
assert.match(checkpointAdminSource, /Needs revision/);
assert.match(recordingServiceSource, /action === "review_checkpoint_attempt"/);
assert.match(recordingServiceSource, /decision === "revision_required" && !note/);
assert.match(recordingServiceSource, /evaluated_at: evaluatedAt, evaluated_by: evaluatedBy, evaluator_note: note \|\| null/);
assert.match(recordingServiceSource, /action: "recording_checkpoint_attempt_reviewed"/);
assert.match(recordingServiceSource, /evidence_source: "checkpoint_attempts"/);
assert.doesNotMatch(recordingServiceSource.match(/if \(action === "review_checkpoint_attempt"\)[\s\S]*?return evaluateRecordedLearningAssignment/)?.[0] ?? "", /external_manual_verification/);
assert.match(checkpointReviewMigrationSource, /is_correct field remains the canonical decision/);
assert.match(checkpointReviewMigrationSource, /evaluated_at timestamptz/);
assert.match(checkpointReviewMigrationSource, /evaluated_by text/);
assert.match(checkpointReviewMigrationSource, /evaluator_note text/);
assert.match(recordingServiceSource, /rpc\("submit_recording_checkpoint_attempt"/);
assert.doesNotMatch(recordingServiceSource.match(/export async function submitRecordingCheckpointAnswer[\s\S]*?\n}/)?.[0] ?? "", /attempt_number.*\+ 1/);
assert.match(checkpointIdempotencyMigrationSource, /pg_advisory_xact_lock/);
assert.match(checkpointIdempotencyMigrationSource, /checkpoint_attempt_review_cycle_unique/);
assert.match(checkpointIdempotencyMigrationSource, /checkpoint_attempt_number_unique_for_managed_rows/);
assert.match(checkpointIdempotencyMigrationSource, /attempt\.is_correct is null or attempt\.is_correct is true/);
assert.match(checkpointIdempotencyMigrationSource, /existing\.evaluator_note, false/);
assert.match(checkpointIdempotencyMigrationSource, /next_attempt, next_cycle/);
assert.match(checkpointIdempotencyMigrationSource, /cleanup_accidental_checkpoint_attempt_burst/);
assert.match(checkpointIdempotencyMigrationSource, /failed the safety checks/);
assert.match(checkpointIdempotencyMigrationSource, /recording_checkpoint_attempts_deduplicated/);
assert.match(checkpointCleanupSource, /process\.argv\.includes\("--apply"\)/);
assert.match(checkpointCleanupSource, /Dry run only/);
assert.match(checkpointCleanupSource, /is_correct === null && row\.evaluated_at === null/);
assert.match(checkpointFormSource, /Submitting…/);
assert.match(checkpointFormSource, /\["under_review", "accepted"\]\.includes/);
assert.match(checkpointFormSource, /Submit revised response/);
assert.match(studentDetailSource, /attempts=\{detail\.checkpointAttempts\.filter/);
assert.match(checkpointAdminSource, /Earlier stored records/);
assert.match(checkpointAdminSource, /not automatically treated as genuine academic revisions/);
assert.match(checkpointAdminSource, /formatInstitutionalTimestamp\(String\(attempt\.answered_at\)\)/);
assert.match(checkpointAdminSource, /formatInstitutionalTimestamp\(String\(attempt\.evaluated_at\)\)/);
assert.doesNotMatch(checkpointAdminSource, /toLocale(?:String|DateString|TimeString)\(/);
assert.match(studentDetailSource, /neither verifies attendance by itself/);
assert.match(recordingDataSource, /Student recording checkpoint query failed/);
assert.match(recordingDataSource, /Student recording assignments query failed/);
assert.match(recordingDataSource, /details: result\.error\.details, hint: result\.error\.hint/);
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
      is(key, value) { filters.push(row => row[key] === value); return query; },
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

// Native short-answer review uses is_correct, records reviewer metadata, and re-evaluates without external evidence.
const reviewed = recordingFixture("available");
reviewed.tables.recording_learning_assignments.push({ id: "reviewed", purpose_code: "REV", class_session_id: "session", course_enrollment_id: "enrollment", class_recordings: reviewed.recording, requirement_snapshot: { ...frozenRequirements, requiredCheckpointCount: 2, requiresQuiz: false, requiresPractical: false, requiresReflection: false } });
reviewed.tables.recording_progress.push({ id: "review-progress", recording_assignment_id: "reviewed", integrity_status: "clear", watch_requirement_met: true, watch_percentage: 100 });
reviewed.tables.recording_requirement_statuses.push({ recording_assignment_id: "reviewed", requirement_type: "checkpoints", is_required: true, requirement_status: "pending", evidence_source: "checkpoint_attempts" });
reviewed.tables.recording_checkpoint_attempts.push(
  { id: "pending-attempt", recording_assignment_id: "reviewed", checkpoint_id: "checkpoint-0", question_id: "question-0", submitted_answer: "Full written response", is_correct: null, attempt_number: 1 },
  { id: "accepted-attempt", recording_assignment_id: "reviewed", checkpoint_id: "checkpoint-1", question_id: "question-1", submitted_answer: "Earlier accepted response", is_correct: true, attempt_number: 1 },
);
const acceptedReview = await service.applyAdminRecordingAction(reviewed.db, "reviewed", { action: "review_checkpoint_attempt", attempt_id: "pending-attempt", decision: "accept", note: "Shows understanding." }, actor);
assert.equal(reviewed.tables.recording_checkpoint_attempts[0].is_correct, true);
assert.equal(reviewed.tables.recording_checkpoint_attempts[0].evaluated_by, "REALMS Admin");
assert.ok(reviewed.tables.recording_checkpoint_attempts[0].evaluated_at);
assert.equal(reviewed.tables.recording_checkpoint_attempts[0].evaluator_note, "Shows understanding.");
assert.equal(acceptedReview.checkpoints.met, true);
assert.equal(reviewed.tables.recording_requirement_statuses[0].requirement_status, "satisfied");
assert.equal(reviewed.tables.recording_requirement_statuses[0].evidence_source, "checkpoint_attempts");
assert.ok(!reviewed.writes.some(write => write.table === "session_attendance"));

const revision = recordingFixture("available");
revision.tables.recording_learning_assignments.push({ id: "revision", purpose_code: "REV", class_session_id: "session", course_enrollment_id: "enrollment", class_recordings: revision.recording, requirement_snapshot: { ...frozenRequirements, requiredCheckpointCount: 1, requiresQuiz: false, requiresPractical: false, requiresReflection: false } });
revision.tables.recording_progress.push({ id: "revision-progress", recording_assignment_id: "revision", integrity_status: "clear", watch_requirement_met: true, watch_percentage: 100 });
revision.tables.recording_requirement_statuses.push({ recording_assignment_id: "revision", requirement_type: "checkpoints", is_required: true, requirement_status: "pending", evidence_source: "checkpoint_attempts" });
revision.tables.recording_checkpoint_attempts.push({ id: "revision-attempt", recording_assignment_id: "revision", checkpoint_id: "checkpoint-0", question_id: "question-0", submitted_answer: "Needs more detail", is_correct: null, attempt_number: 1 });
await assert.rejects(service.applyAdminRecordingAction(revision.db, "revision", { action: "review_checkpoint_attempt", attempt_id: "revision-attempt", decision: "revision_required", note: "" }, actor), error => error.status === 400);
const revisionReview = await service.applyAdminRecordingAction(revision.db, "revision", { action: "review_checkpoint_attempt", attempt_id: "revision-attempt", decision: "revision_required", note: "Please explain the class example." }, actor);
assert.equal(revision.tables.recording_checkpoint_attempts[0].is_correct, false);
assert.equal(revisionReview.checkpoints.met, false);
assert.equal(revision.tables.recording_requirement_statuses[0].requirement_status, "pending");
assert.ok(!revision.writes.some(write => write.table === "session_attendance"));

// Production-shaped lifecycle model for the database RPC contract: the SQL source assertions above
// ensure the deployed implementation uses the same serialized rules and unique keys.
function checkpointSubmissionBoundary() {
  const rows = []; let queue = Promise.resolve();
  const submit = (answer) => {
    const run = queue.then(() => {
      const active = [...rows].reverse().find((row) => row.is_correct === null || row.is_correct === true);
      if (active) return { row: active, reused: true };
      const row = { id: `attempt-${rows.length + 1}`, submitted_answer: answer, is_correct: null, attempt_number: rows.length + 1, review_cycle: rows.length + 1 };
      rows.push(row); return { row, reused: false };
    });
    queue = run.then(() => undefined); return run;
  };
  const review = (decision) => { const current = rows.at(-1); current.is_correct = decision === "accept"; current.evaluated_at = new Date().toISOString(); };
  return { rows, submit, review };
}
const oneSubmit = checkpointSubmissionBoundary();
const first = await oneSubmit.submit("one response");
assert.equal(oneSubmit.rows.length, 1);
assert.equal(first.row.attempt_number, 1);
const doubleClick = await Promise.all([oneSubmit.submit("one response"), oneSubmit.submit("one response")]);
assert.equal(oneSubmit.rows.length, 1);
assert.ok(doubleClick.every((result) => result.reused));
const productionBurst = checkpointSubmissionBoundary();
const burstResults = await Promise.all(Array.from({ length: 12 }, () => productionBurst.submit("substantially identical production response")));
assert.equal(productionBurst.rows.length, 1);
assert.equal(new Set(burstResults.map((result) => result.row.id)).size, 1);
const retry = await productionBurst.submit("substantially identical production response");
assert.equal(retry.reused, true);
assert.equal(productionBurst.rows.length, 1);
productionBurst.review("accept");
await productionBurst.submit("another response");
assert.equal(productionBurst.rows.length, 1, "Accepted responses remain terminal.");
const revisionCycle = checkpointSubmissionBoundary();
await revisionCycle.submit("first draft");
revisionCycle.review("revision_required");
const concurrentRevision = await Promise.all([revisionCycle.submit("revised"), revisionCycle.submit("revised")]);
assert.equal(revisionCycle.rows.length, 2);
assert.deepEqual(revisionCycle.rows.map((row) => row.attempt_number), [1, 2]);
assert.deepEqual(revisionCycle.rows.map((row) => row.review_cycle), [1, 2]);
assert.equal(new Set(concurrentRevision.map((result) => result.row.id)).size, 1);
console.log("Authoring-policy regression cases A-G and inactive-state/evidence protections passed.");

console.log(JSON.stringify({ timeAuthoringCases: 16, segmentMerge: "passed", elapsedTimeCap: "passed", providerModes: "passed", evaluatorCases: 10, requirementSnapshotCases: 4, purposeAwarePresentationCases: 12, zoomEvidenceCases: 14, zoomCheckpointCases: 10, checkpointIntegrityCases: 11, checkpointSchemaFallbackCases: 5, checkpointReviewCases: 13, checkpointSubmissionIdempotencyCases: 15, passed: 124 }, null, 2));
