// Historical compatibility only. New public applications receive their cohort
// from the admin-selected public registration cohort, never from this value.
export const historicalAugust2026CohortCode = "RSD-AUG-2026";

export const applicationDeletionReasons = [
  "duplicate_application",
  "applicant_restarted_application",
  "test_application",
  "submitted_in_error",
  "applicant_requested_removal",
  "administrative_cleanup",
  "other",
] as const;

export type ApplicationDeletionReason = (typeof applicationDeletionReasons)[number];
export type ApplicationRecordScope = "active" | "deleted" | "all";

export const applicationDeletionReasonLabels: Record<ApplicationDeletionReason, string> = {
  duplicate_application: "Duplicate application",
  applicant_restarted_application: "Applicant restarted application",
  test_application: "Test application",
  submitted_in_error: "Submitted in error",
  applicant_requested_removal: "Applicant requested removal",
  administrative_cleanup: "Administrative cleanup",
  other: "Other",
};

export const duplicateApplicationMessage = `An application for this email already exists for the current REALMS cohort.

If you started an application previously or need to correct submitted information, please use the existing application process or contact REALMS Admissions for assistance.`;

export class DuplicateActiveApplicationError extends Error {
  constructor() {
    super("ACTIVE_APPLICATION_ALREADY_EXISTS");
    this.name = "DuplicateActiveApplicationError";
  }
}

export function normalizeApplicantEmail(value: string) {
  return value.trim().toLowerCase();
}

export function escapePostgrestLikePattern(value: string) {
  return value.replace(/[\\%_]/g, "\\$&");
}

export function isApplicationDeletionReason(value: unknown): value is ApplicationDeletionReason {
  return typeof value === "string" && (applicationDeletionReasons as readonly string[]).includes(value);
}

export function isApplicationRecordScope(value: unknown): value is ApplicationRecordScope {
  return value === "active" || value === "deleted" || value === "all";
}

export function validateApplicationRemoval(input: {
  confirmation: unknown;
  reason: unknown;
  note: unknown;
  supersededByApplicationId: unknown;
}) {
  const confirmation = typeof input.confirmation === "string" ? input.confirmation.trim() : "";
  const reason = isApplicationDeletionReason(input.reason) ? input.reason : null;
  const note = typeof input.note === "string" ? input.note.trim().slice(0, 5000) : "";
  const supersededByApplicationId = typeof input.supersededByApplicationId === "string" && input.supersededByApplicationId.trim()
    ? input.supersededByApplicationId.trim()
    : null;

  if (confirmation !== "DELETE") return { success: false as const, message: "Type DELETE to confirm application removal." };
  if (!reason) return { success: false as const, message: "Choose a deletion reason." };
  if (reason === "other" && !note) return { success: false as const, message: "Add an administrative note when the reason is Other." };
  if (supersededByApplicationId && !/^[0-9a-f-]{36}$/i.test(supersededByApplicationId)) {
    return { success: false as const, message: "Choose a valid application to keep." };
  }
  if (supersededByApplicationId && reason !== "duplicate_application" && reason !== "applicant_restarted_application") {
    return { success: false as const, message: "An application to keep may only be recorded for a duplicate or restarted application." };
  }
  return { success: true as const, data: { reason, note: note || null, supersededByApplicationId } };
}
