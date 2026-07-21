export const academicStandings = [
  "good_standing",
  "reminder",
  "warning",
  "participation_review",
  "probation",
  "deferment_review",
  "withdrawal_review",
] as const;

export const noticeTypes = [
  "reminder",
  "formal_warning",
  "participation_review_notice",
  "probation_notice",
  "deferment_review_notice",
  "withdrawal_review_notice",
  "recovery_plan_notice",
] as const;

export const noticeStatuses = ["draft", "issued", "acknowledged", "responded", "resolved", "withdrawn"] as const;
export const reviewTypes = ["participation_review", "probation_review", "deferment_review", "withdrawal_review"] as const;
export const reviewStatuses = ["open", "evidence_review", "awaiting_student_response", "decision_pending", "closed"] as const;
export const reviewOutcomes = ["no_further_action", "reminder", "support_plan", "recovery_plan", "probation", "exceptional_approval", "deferment_recommended", "withdrawal_recommended", "case_closed"] as const;
export const recoveryPlanStatuses = ["draft", "active", "completed", "closed", "unsuccessful", "cancelled"] as const;
export const mentorFollowupStatuses = ["attempted", "contacted", "no_response", "rescheduled", "completed"] as const;

export type AcademicStanding = (typeof academicStandings)[number];
export type NoticeType = (typeof noticeTypes)[number];
export type NoticeStatus = (typeof noticeStatuses)[number];
export type ReviewType = (typeof reviewTypes)[number];
export type ReviewStatus = (typeof reviewStatuses)[number];
export type ReviewOutcome = (typeof reviewOutcomes)[number];
export type RecoveryPlanStatus = (typeof recoveryPlanStatuses)[number];

export type EngagementMetrics = {
  unapprovedAbsenceUnits: number;
  unapprovedAbsenceCount: number;
  lateCount: number;
  partialCount: number;
  unresolvedAttendanceCount: number;
  overdueRecordedModules: number;
  incompleteRecordedModules: number;
  overdueMakeups: number;
  incompleteMakeups: number;
  overdueAssignments: number;
  missingAssignments: number;
  resubmissionsRequired: number;
  failedQuizAttempts: number;
  quizzesWithAttemptsExhausted: number;
  openIntegrityReviews: number;
  lastMeaningfulActivityAt: string | null;
  inactivityDays: number | null;
};

export type EngagementRule = {
  id: string;
  rule_code: string;
  signal_type: string;
  threshold_value: number | null;
  severity: string;
  recommended_action: string | null;
};

const signalMetricKeys: Record<string, keyof EngagementMetrics> = {
  unapproved_absence_units: "unapprovedAbsenceUnits",
  unapproved_absence_count: "unapprovedAbsenceCount",
  late_count: "lateCount",
  partial_count: "partialCount",
  unresolved_attendance_count: "unresolvedAttendanceCount",
  overdue_recorded_modules: "overdueRecordedModules",
  incomplete_recorded_modules: "incompleteRecordedModules",
  overdue_makeups: "overdueMakeups",
  incomplete_makeups: "incompleteMakeups",
  overdue_assignments: "overdueAssignments",
  missing_assignments: "missingAssignments",
  resubmissions_required: "resubmissionsRequired",
  failed_quiz_attempts: "failedQuizAttempts",
  quizzes_with_attempts_exhausted: "quizzesWithAttemptsExhausted",
  open_integrity_reviews: "openIntegrityReviews",
  inactivity_days: "inactivityDays",
};

export function metricForSignal(metrics: EngagementMetrics, signalType: string) {
  const key = signalMetricKeys[signalType];
  const value = key ? metrics[key] : null;
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

export function ruleMatches(metrics: EngagementMetrics, rule: EngagementRule) {
  const current = metricForSignal(metrics, rule.signal_type);
  return current !== null && rule.threshold_value !== null && current >= rule.threshold_value;
}

export function engagementDeduplicationKey(rule: Pick<EngagementRule, "rule_code" | "signal_type" | "threshold_value">) {
  const threshold = Number(rule.threshold_value ?? 0);
  if (rule.signal_type === "unapproved_absence_units") return `attendance:unapproved-units:${threshold}`;
  if (rule.signal_type === "overdue_recorded_modules") return `recording:overdue-count:${threshold}`;
  return `${rule.signal_type.replaceAll("_", "-")}:${rule.rule_code}`;
}

export function inactivityDays(lastActivityAt: string | null, now = Date.now()) {
  if (!lastActivityAt) return null;
  const then = Date.parse(lastActivityAt);
  if (!Number.isFinite(then)) return null;
  return Math.max(0, Math.floor((now - then) / 86_400_000));
}

export function isRecordingComplete(status: string | null | undefined) {
  return status === "verified_complete" || status === "late_complete";
}

export function isMakeupComplete(status: string | null | undefined) {
  return ["completed", "late_complete", "waived", "cancelled"].includes(status ?? "");
}

export function humanizeEngagement(value: string | null | undefined) {
  if (!value) return "Not set";
  return value.replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

export function noticeAuditAction(type: NoticeType) {
  return type === "reminder" ? "student_reminder_issued" as const : "student_warning_issued" as const;
}
