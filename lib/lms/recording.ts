export const recordingPurposeCodes = ["REV", "RP", "DR-E", "MU-E", "MU-U", "LE-C"] as const;
export type RecordingPurposeCode = (typeof recordingPurposeCodes)[number];

export const recordingPurposeLabels: Record<RecordingPurposeCode, string> = {
  REV: "General Replay / Revision",
  RP: "Official Recorded Attendance",
  "DR-E": "Official Recorded Attendance",
  "MU-E": "Approved Absence Make-Up",
  "MU-U": "Required Absence Make-Up",
  "LE-C": "Late Entry Catch-Up",
};

export const recordingPurposeStudentCopy: Record<RecordingPurposeCode, { heading: string; description: string }> = {
  REV: {
    heading: "Available for review",
    description: "This replay is for learning and revision. Watching it does not change attendance or satisfy a separate make-up requirement.",
  },
  RP: {
    heading: "Required Recorded Session",
    description: "Completion contributes to your official recorded-attendance evidence after every required learning check is verified.",
  },
  "DR-E": {
    heading: "Required Recorded Session",
    description: "Completion contributes to your official recorded-attendance evidence after every required learning check is verified.",
  },
  "MU-E": {
    heading: "Approved Make-Up Recording",
    description: "Your original excused-absence record remains unchanged. Complete this learning requirement and its evidence by the stated deadline.",
  },
  "MU-U": {
    heading: "Required Make-Up Recording",
    description: "Your original attendance record remains unchanged. Complete the assigned learning evidence by the stated deadline.",
  },
  "LE-C": {
    heading: "Late Entry Catch-Up",
    description: "Complete the assigned learning evidence for teaching delivered before your enrolment became active.",
  },
};

export type RecordingEvidenceReadiness = { ready: boolean; reasons: string[] };

function secureRecordingUrl(value: unknown) {
  if (typeof value !== "string" || !value.trim()) return false;
  try { return new URL(value).protocol === "https:"; }
  catch { return false; }
}

/**
 * Evidence-bearing assignments require a stronger gate than ordinary replay.
 * Manual providers may be reviewed by staff, while Vimeo automation additionally
 * needs a supported embed and duration for trustworthy watch calculations.
 */
export function recordingEvidenceReadiness(recording: Record<string, unknown>): RecordingEvidenceReadiness {
  const reasons: string[] = [];
  const provider = typeof recording.provider === "string" ? recording.provider : "";
  const external = secureRecordingUrl(recording.external_url);
  const embed = secureRecordingUrl(recording.embed_url);
  if (recording.recording_status !== "available") reasons.push("recording_not_available");
  if (recording.access_level !== "enrolled_students") reasons.push("not_available_to_enrolled_students");
  if (recording.quality_checked !== true) reasons.push("quality_check_required");
  if (typeof recording.title !== "string" || !recording.title.trim()) reasons.push("title_required");
  if (typeof recording.recording_date !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(recording.recording_date) || Number.isNaN(Date.parse(`${recording.recording_date}T00:00:00Z`))) reasons.push("recording_date_required");
  if (!external && !embed) reasons.push("secure_source_required");
  if (!['zoom', 'vimeo', 'youtube_unlisted', 'other'].includes(provider)) reasons.push("valid_provider_required");
  if (provider === "vimeo") {
    if (providerTrackingMode(provider, typeof recording.embed_url === "string" ? recording.embed_url : null, typeof recording.duration_seconds === "number" ? recording.duration_seconds : null) !== "automated") reasons.push("vimeo_embed_and_duration_required");
  }
  return { ready: reasons.length === 0, reasons };
}

export const recordingRequirementTypes = ["watch", "checkpoints", "quiz", "practical", "reflection", "oral_verification"] as const;
export type RecordingRequirementType = (typeof recordingRequirementTypes)[number];

export const learningCompletionStatuses = ["not_started", "in_progress", "awaiting_checkpoint", "awaiting_quiz", "awaiting_practical", "awaiting_reflection", "under_review", "makeup_required", "verified_complete", "late_complete", "incomplete", "integrity_review"] as const;
export type LearningCompletionStatus = (typeof learningCompletionStatuses)[number];

export const recordingProgressStatuses = ["not_started", "in_progress", "awaiting_checkpoint", "watch_complete", "under_review", "integrity_review"] as const;
export type RecordingProgressStatus = (typeof recordingProgressStatuses)[number];

export type WatchedSegment = { start: number; end: number };

export function mergeWatchedSegments(segments: readonly WatchedSegment[]) {
  const valid = segments
    .map((segment) => ({ start: Math.max(0, Number(segment.start)), end: Math.max(0, Number(segment.end)) }))
    .filter((segment) => Number.isFinite(segment.start) && Number.isFinite(segment.end) && segment.end > segment.start)
    .sort((a, b) => a.start - b.start || a.end - b.end);
  const merged: WatchedSegment[] = [];
  for (const segment of valid) {
    const previous = merged.at(-1);
    if (!previous || segment.start > previous.end) merged.push({ ...segment });
    else previous.end = Math.max(previous.end, segment.end);
  }
  return merged;
}

export function uniqueWatchedSeconds(segments: readonly WatchedSegment[]) {
  return Math.floor(mergeWatchedSegments(segments).reduce((sum, segment) => sum + segment.end - segment.start, 0));
}

export function watchPercentage(uniqueSeconds: number, durationSeconds: number | null | undefined) {
  if (!durationSeconds || durationSeconds <= 0) return 0;
  return Math.min(100, Math.max(0, Number(((uniqueSeconds / durationSeconds) * 100).toFixed(2))));
}

export type RecordingProgressProvider = {
  adapter: "vimeo" | "zoom_manual_verification" | "manual" | "unsupported_external";
  trackingMode: "automated" | "manual_review";
  supportedEvents: readonly string[];
};

export function resolveRecordingProgressProvider(provider: string | null | undefined, embedUrl: string | null | undefined, durationSeconds: number | null | undefined): RecordingProgressProvider {
  let supportedEmbed = false;
  if (embedUrl) {
    try { const url = new URL(embedUrl); supportedEmbed = url.protocol === "https:" && url.hostname.toLowerCase() === "player.vimeo.com"; }
    catch { supportedEmbed = false; }
  }
  if (provider === "vimeo" && supportedEmbed && Boolean(durationSeconds && durationSeconds > 0)) return { adapter: "vimeo", trackingMode: "automated", supportedEvents: ["play", "pause", "timeupdate", "seeked", "playbackratechange", "ended"] };
  if (provider === "zoom") return { adapter: "zoom_manual_verification", trackingMode: "manual_review", supportedEvents: [] };
  if (provider === "other") return { adapter: "manual", trackingMode: "manual_review", supportedEvents: [] };
  return { adapter: "unsupported_external", trackingMode: "manual_review", supportedEvents: [] };
}

export function providerTrackingMode(provider: string | null | undefined, embedUrl: string | null | undefined, durationSeconds: number | null | undefined) {
  return resolveRecordingProgressProvider(provider, embedUrl, durationSeconds).trackingMode;
}

export function creditedPlaybackSegment(input: { previousPosition: number; currentPosition: number; observedWallSeconds: number; playbackRate: number }) {
  const start = Math.max(0, input.previousPosition);
  const current = Math.max(0, input.currentPosition);
  const wall = Math.max(0, Math.min(input.observedWallSeconds, 120));
  const rate = Math.max(0.5, Math.min(input.playbackRate || 1, 2));
  if (current <= start || wall <= 0) return { segment: null, suspicious: current - start > 15 };
  const maximumCreditable = wall * rate * 1.25 + 5;
  const delta = current - start;
  return {
    segment: { start, end: start + Math.min(delta, maximumCreditable) },
    suspicious: delta > maximumCreditable + 15,
  };
}

export type RequirementEvidence = Record<RecordingRequirementType, { required: boolean; status: string }>;

export type EffectiveRecordingRequirements = {
  minWatchPercentage: number;
  deadlineHours: number;
  requiredCheckpointCount: number;
  requiresCheckpoints: boolean;
  requiresQuiz: boolean;
  requiresPractical: boolean;
  requiresReflection: boolean;
  requiresOralVerification: boolean;
  allowLateCompletion: boolean;
};

export type RecordingRequirementSnapshotResolution =
  | { status: "snapshot"; requirements: EffectiveRecordingRequirements }
  | { status: "legacy"; requirements: null };

/**
 * Accept only a complete assignment-time snapshot. Missing or partial
 * historical values must remain visibly legacy; substituting today's policy
 * would silently change the requirements under which the assignment began.
 */
export function resolveRecordingRequirementSnapshot(value: unknown): RecordingRequirementSnapshotResolution {
  if (!value || typeof value !== "object" || Array.isArray(value)) return { status: "legacy", requirements: null };
  const snapshot = value as Record<string, unknown>;
  const numberKeys = ["minWatchPercentage", "deadlineHours", "requiredCheckpointCount"] as const;
  const booleanKeys = ["requiresCheckpoints", "requiresQuiz", "requiresPractical", "requiresReflection", "requiresOralVerification", "allowLateCompletion"] as const;
  if (!numberKeys.every((key) => typeof snapshot[key] === "number" && Number.isFinite(snapshot[key]))) return { status: "legacy", requirements: null };
  if (!booleanKeys.every((key) => typeof snapshot[key] === "boolean")) return { status: "legacy", requirements: null };
  return { status: "snapshot", requirements: snapshot as EffectiveRecordingRequirements };
}

type RecordingPolicyRow = {
  min_watch_percentage?: number | string | null;
  default_deadline_hours?: number | string | null;
  default_required_checkpoints?: number | string | null;
};

type SessionRequirementRow = {
  min_watch_percentage?: number | string | null;
  deadline_hours?: number | string | null;
  required_checkpoint_count?: number | string | null;
  requires_checkpoints?: boolean | null;
  requires_quiz?: boolean | null;
  requires_practical?: boolean | null;
  requires_reflection?: boolean | null;
  requires_oral_verification?: boolean | null;
  allow_late_completion?: boolean | null;
  practical_assignment_id?: string | null;
};

export function resolveEffectiveRecordingRequirements(input: {
  policy?: RecordingPolicyRow | null;
  sessionOverride?: SessionRequirementRow | null;
  courseCategory: string;
  purpose: RecordingPurposeCode;
}): EffectiveRecordingRequirements {
  const policy = input.policy ?? {};
  const override = input.sessionOverride;
  const skillPrimary = input.courseCategory === "skill" && input.purpose === "RP";
  const discipleshipException = input.courseCategory === "discipleship" && input.purpose === "DR-E";
  const lateEntrySkill = input.courseCategory === "skill" && input.purpose === "LE-C";
  return {
    minWatchPercentage: Number(override?.min_watch_percentage ?? policy.min_watch_percentage ?? 85),
    deadlineHours: Number(override?.deadline_hours ?? policy.default_deadline_hours ?? 72),
    requiredCheckpointCount: Number(override?.required_checkpoint_count ?? policy.default_required_checkpoints ?? 2),
    requiresCheckpoints: override?.requires_checkpoints ?? true,
    requiresQuiz: override?.requires_quiz ?? (skillPrimary || discipleshipException),
    requiresPractical: override?.requires_practical ?? (skillPrimary || lateEntrySkill),
    requiresReflection: override?.requires_reflection ?? discipleshipException,
    requiresOralVerification: override?.requires_oral_verification ?? false,
    allowLateCompletion: override?.allow_late_completion ?? true,
  };
}

export function evaluateRecordedRequirements(input: {
  purpose: RecordingPurposeCode;
  progressIntegrityStatus: string;
  watchRequirementMet: boolean;
  checkpointRequirementMet: boolean;
  configuredRequiredCheckpoints: number;
  requiredCheckpointCount: number;
  requirements: RequirementEvidence;
  dueAt: string | null;
  allowLateCompletion: boolean;
  now?: Date;
}): { learningStatus: LearningCompletionStatus; progressStatus: RecordingProgressStatus; complete: boolean; warning?: string } {
  if (input.progressIntegrityStatus !== "clear") return { learningStatus: "integrity_review", progressStatus: "integrity_review", complete: false };
  if (input.purpose === "REV") return { learningStatus: "in_progress", progressStatus: input.watchRequirementMet ? "watch_complete" : "in_progress", complete: input.watchRequirementMet };
  const overdue = Boolean(input.dueAt && Date.parse(input.dueAt) < (input.now ?? new Date()).valueOf());
  if (!input.watchRequirementMet) return { learningStatus: overdue ? "incomplete" : "in_progress", progressStatus: "in_progress", complete: false };
  if (input.requirements.checkpoints.required && input.configuredRequiredCheckpoints < input.requiredCheckpointCount) return { learningStatus: overdue ? "incomplete" : "awaiting_checkpoint", progressStatus: "awaiting_checkpoint", complete: false, warning: "Recorded verification cannot complete because the required checkpoints have not all been configured." };
  if (input.requirements.checkpoints.required && !input.checkpointRequirementMet) return { learningStatus: overdue ? "incomplete" : "awaiting_checkpoint", progressStatus: "awaiting_checkpoint", complete: false };
  if (input.requirements.quiz.required && input.requirements.quiz.status !== "satisfied") return { learningStatus: overdue ? "incomplete" : "awaiting_quiz", progressStatus: "watch_complete", complete: false };
  if (input.requirements.practical.required && input.requirements.practical.status !== "satisfied") return { learningStatus: overdue ? "incomplete" : "awaiting_practical", progressStatus: "watch_complete", complete: false };
  if (input.requirements.reflection.required && input.requirements.reflection.status !== "satisfied") return { learningStatus: overdue ? "incomplete" : "awaiting_reflection", progressStatus: "watch_complete", complete: false };
  if (input.requirements.oral_verification.required && input.requirements.oral_verification.status !== "satisfied") return { learningStatus: overdue ? "incomplete" : "under_review", progressStatus: "under_review", complete: false };
  if (input.purpose === "MU-E") return { learningStatus: "verified_complete", progressStatus: "watch_complete", complete: true };
  if (input.purpose === "MU-U") return { learningStatus: "late_complete", progressStatus: "watch_complete", complete: true };
  if (input.purpose === "LE-C") return { learningStatus: overdue ? "late_complete" : "verified_complete", progressStatus: "watch_complete", complete: true };
  if (overdue && !input.allowLateCompletion) return { learningStatus: "incomplete", progressStatus: "watch_complete", complete: false };
  return { learningStatus: overdue ? "late_complete" : "verified_complete", progressStatus: "watch_complete", complete: true };
}
