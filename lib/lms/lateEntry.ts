export const lateEntryCatchupPurpose = "LE-C" as const;
export const lateEntryCatchupDeadlineDays = 7;

export type LateEntrySessionCandidate = {
  id: string;
  cohort_course_id: string;
  is_required: boolean;
  session_status: string;
  scheduled_start_at: string | null;
  scheduled_end_at: string | null;
};

export function lateEntryCatchupDeadline(effectiveEnrolledAt: string | Date) {
  const timestamp = effectiveEnrolledAt instanceof Date ? effectiveEnrolledAt.valueOf() : Date.parse(effectiveEnrolledAt);
  if (!Number.isFinite(timestamp)) throw new Error("A valid effective enrolment timestamp is required.");
  return new Date(timestamp + lateEntryCatchupDeadlineDays * 24 * 60 * 60 * 1000).toISOString();
}

export function missedRequiredLateEntrySessions(
  sessions: readonly LateEntrySessionCandidate[],
  enrolledOfferingIds: ReadonlySet<string>,
  effectiveEnrolledAt: string | Date,
) {
  const effectiveAt = effectiveEnrolledAt instanceof Date ? effectiveEnrolledAt.valueOf() : Date.parse(effectiveEnrolledAt);
  if (!Number.isFinite(effectiveAt)) return [];
  return sessions.filter((session) => {
    if (!session.is_required || session.session_status === "cancelled" || !enrolledOfferingIds.has(session.cohort_course_id)) return false;
    const occurredAt = Date.parse(session.scheduled_end_at || session.scheduled_start_at || "");
    return Number.isFinite(occurredAt) && occurredAt < effectiveAt;
  });
}

export function isLateEntryCatchupOverdue(input: { due_at?: string | null; makeup_status?: string | null }, now = new Date()) {
  return Boolean(
    input.due_at
    && Date.parse(input.due_at) < now.valueOf()
    && !["completed", "late_complete", "waived", "cancelled"].includes(input.makeup_status || ""),
  );
}

export function lateEntryCatchupDisplayStatus(input: {
  makeup_status?: string | null;
  due_at?: string | null;
  evidenceSubmitted?: boolean;
}, now = new Date()) {
  if (["completed", "late_complete"].includes(input.makeup_status || "")) return "Completed";
  if (isLateEntryCatchupOverdue(input, now)) return "Catch-Up Overdue";
  if (["under_review", "awaiting_oral_verification", "integrity_review"].includes(input.makeup_status || "")) return "Under Review";
  if (input.evidenceSubmitted) return "Submitted";
  if (["alternative_required", "awaiting_materials"].includes(input.makeup_status || "")) return "Alternative Required";
  if (["in_progress", "awaiting_checkpoint", "awaiting_quiz", "awaiting_practical", "awaiting_reflection"].includes(input.makeup_status || "")) return "In Progress";
  return "Pending";
}
