import assert from "node:assert/strict";

import { creditedPlaybackSegment, evaluateRecordedRequirements, mergeWatchedSegments, providerTrackingMode, resolveRecordingProgressProvider, resolveRecordingRequirementSnapshot, uniqueWatchedSeconds, watchPercentage } from "../lib/lms/recording.ts";

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
assert.equal(providerTrackingMode("vimeo", "https://vimeo.com/123", 100), "manual_review");
assert.equal(providerTrackingMode("vimeo", "https://example.com/?next=player.vimeo.com/video/123", 100), "manual_review");
assert.equal(resolveRecordingProgressProvider("vimeo", "https://player.vimeo.com/video/123", 100).adapter, "vimeo");
assert.equal(resolveRecordingProgressProvider("zoom", "https://zoom.us/rec/share/example", 100).adapter, "unsupported_external");

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

console.log(JSON.stringify({ segmentMerge: "passed", elapsedTimeCap: "passed", providerModes: "passed", evaluatorCases: 10, requirementSnapshotCases: 4, passed: 28 }, null, 2));
