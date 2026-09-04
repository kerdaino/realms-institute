import assert from "node:assert/strict";
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

const [studentDetailSource, studentListSource, recordingServiceSource, recordingDataSource, zoomServiceSource, zoomMigrationSource, zoomCheckpointMigrationSource, checkpointGuidanceMigrationSource, zoomAdminSource, recordedLearningAdminSource, checkpointFormSource, checkpointAdminSource] = await Promise.all([
  readFile(new URL("../app/student/(academic)/recordings/[assignmentId]/page.tsx", import.meta.url), "utf8"),
  readFile(new URL("../app/student/(academic)/recordings/page.tsx", import.meta.url), "utf8"),
  readFile(new URL("../lib/lms/recordingService.ts", import.meta.url), "utf8"),
  readFile(new URL("../lib/lms/recordingData.ts", import.meta.url), "utf8"),
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
assert.equal(normalizeViewerEmail(" Student@REALMS.example "), "student@realms.example");
const zoomRows = parseZoomEvidenceCsv('Viewer Name,Viewer Email,View Date/Time,View Duration,Recording ID\n"Ada, Learner",Student@REALMS.example,2026-09-04T10:00:00Z,01:05:30,zoom-123');
assert.deepEqual(zoomRows.map((row) => ({ name: row.viewerName, email: row.viewerEmail, duration: row.reportedDurationSeconds, identifier: row.recordingIdentifier })), [{ name: "Ada, Learner", email: "student@realms.example", duration: 3930, identifier: "zoom-123" }]);

console.log(JSON.stringify({ timeAuthoringCases: 16, segmentMerge: "passed", elapsedTimeCap: "passed", providerModes: "passed", evaluatorCases: 10, requirementSnapshotCases: 4, purposeAwarePresentationCases: 12, zoomEvidenceCases: 14, zoomCheckpointCases: 10, checkpointIntegrityCases: 11, checkpointSchemaFallbackCases: 5, passed: 96 }, null, 2));
