export const absenceReasonCategories = [
  "illness",
  "family_emergency",
  "connectivity_or_power",
  "work_or_school_conflict",
  "travel",
  "ministry_commitment",
  "bereavement",
  "other",
] as const;

export type AbsenceReasonCategory = (typeof absenceReasonCategories)[number];

export const absenceReasonLabels: Record<AbsenceReasonCategory, string> = {
  illness: "Illness",
  family_emergency: "Family Emergency",
  connectivity_or_power: "Connectivity or Power",
  work_or_school_conflict: "Work or School Conflict",
  travel: "Travel",
  ministry_commitment: "Ministry Commitment",
  bereavement: "Bereavement",
  other: "Other",
};

export const absenceRequestStatuses = ["draft", "submitted", "under_review", "more_information_required", "approved", "declined", "withdrawn"] as const;
export type AbsenceRequestStatus = (typeof absenceRequestStatuses)[number];

export const absenceRequestStatusLabels: Record<AbsenceRequestStatus, string> = {
  draft: "Draft",
  submitted: "Submitted",
  under_review: "Under Review",
  more_information_required: "More Information Required",
  approved: "Approved",
  declined: "Declined",
  withdrawn: "Withdrawn",
};

export const makeupStatuses = ["awaiting_materials", "assigned", "not_started", "in_progress", "awaiting_checkpoint", "awaiting_quiz", "awaiting_practical", "awaiting_reflection", "awaiting_oral_verification", "under_review", "completed", "late_complete", "overdue", "incomplete", "waived", "cancelled", "integrity_review"] as const;
export type MakeupStatus = (typeof makeupStatuses)[number];

export const oralVerificationStatuses = ["scheduled", "completed", "satisfactory", "not_satisfactory", "reschedule_required"] as const;

export function humanizeAbsenceValue(value: string | null | undefined) {
  if (!value) return "Not Set";
  const labels: Record<string, string> = {
    awaiting_review: "Awaiting Review",
    under_review: "Under Review",
    not_required: "Not Required",
    more_information_required: "More Information Required",
    reschedule_required: "Rescheduling Required",
  };
  return labels[value] ?? value.replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

export function makeupPurposeLabel(value: string | null | undefined) {
  if (value === "MU-E") return "Approved Make-Up";
  if (value === "MU-U") return "Unapproved Make-Up";
  return humanizeAbsenceValue(value);
}

export function makeupStatusFromLearning(status: string, complete: boolean, dueAt?: string | null): MakeupStatus {
  if (complete) return status === "late_complete" ? "late_complete" : "completed";
  if (status === "integrity_review") return "integrity_review";
  if (status === "awaiting_checkpoint") return "awaiting_checkpoint";
  if (status === "awaiting_quiz") return "awaiting_quiz";
  if (status === "awaiting_practical") return "awaiting_practical";
  if (status === "awaiting_reflection") return "awaiting_reflection";
  if (status === "under_review") return "under_review";
  if (status === "incomplete" && dueAt && Date.parse(dueAt) < Date.now()) return "overdue";
  if (status === "incomplete") return "incomplete";
  return status === "not_started" ? "not_started" : "in_progress";
}
