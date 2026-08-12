export const registrationStatuses = ["open", "closed"] as const;

export type RegistrationStatus = (typeof registrationStatuses)[number];

export type RegistrationCohort = {
  id: string;
  code: string;
  name: string;
  registration_status: RegistrationStatus;
  registration_opens_at: string | null;
  registration_closes_at: string | null;
  is_public_registration_cohort: boolean;
};

export type RegistrationAvailability = {
  isOpen: boolean;
  reason: "open" | "manually_closed" | "not_yet_open" | "window_closed";
};

export const registrationClosedMessage = "Registration for this cohort is currently closed.";

export function registrationAvailability(
  cohort: Pick<RegistrationCohort, "registration_status" | "registration_opens_at" | "registration_closes_at">,
  now = new Date(),
): RegistrationAvailability {
  if (cohort.registration_status !== "open") return { isOpen: false, reason: "manually_closed" };
  const current = now.valueOf();
  const opensAt = cohort.registration_opens_at ? Date.parse(cohort.registration_opens_at) : null;
  const closesAt = cohort.registration_closes_at ? Date.parse(cohort.registration_closes_at) : null;
  if (opensAt !== null && Number.isFinite(opensAt) && current < opensAt) return { isOpen: false, reason: "not_yet_open" };
  if (closesAt !== null && Number.isFinite(closesAt) && current >= closesAt) return { isOpen: false, reason: "window_closed" };
  return { isOpen: true, reason: "open" };
}

export function normalizeInviteEmail(value: string) {
  return value.trim().toLowerCase();
}

export function lateRegistrationInviteStatus(invite: {
  expires_at: string;
  revoked_at: string | null;
  consumed_at: string | null;
}, now = new Date()): "active" | "used" | "expired" | "revoked" {
  if (invite.revoked_at) return "revoked";
  if (invite.consumed_at) return "used";
  if (Date.parse(invite.expires_at) <= now.valueOf()) return "expired";
  return "active";
}

export function validRegistrationWindow(opensAt: string | null, closesAt: string | null) {
  if (!opensAt || !closesAt) return true;
  return Date.parse(closesAt) > Date.parse(opensAt);
}
