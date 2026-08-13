export const institutionalAnnouncementAudiences = ["students", "facilitators", "students_facilitators"] as const;
export const institutionalAnnouncementStatuses = ["draft", "published", "archived"] as const;
export const institutionalAnnouncementCohortScopes = ["specific", "current_upcoming", "active"] as const;
export const institutionalAnnouncementStudentStatuses = ["enrolled_active", "confirmed_active", "confirmed_conditional"] as const;

export type InstitutionalAnnouncementAudience = (typeof institutionalAnnouncementAudiences)[number];
export type InstitutionalAnnouncementStatus = (typeof institutionalAnnouncementStatuses)[number];
export type InstitutionalAnnouncementCohortScope = (typeof institutionalAnnouncementCohortScopes)[number];
export type InstitutionalAnnouncementStudentStatus = (typeof institutionalAnnouncementStudentStatuses)[number];
export type InstitutionalAnnouncementRecipientClass = "confirmed" | "conditional" | "facilitator";

export type AnnouncementRecipient = {
  recipientType: "student" | "applicant" | "facilitator";
  studentId: string | null;
  registrationId: string | null;
  facilitatorId: string | null;
  name: string;
  email: string;
  cohortId: string;
  recipientClass: InstitutionalAnnouncementRecipientClass;
  portalVisible: boolean;
  explicit: boolean;
};

export type AnnouncementRecipientPreview = {
  students: { confirmed: number; conditional: number; total: number };
  facilitators: number;
  totalUniqueEmailRecipients: number;
  portalRecipients: number;
  emailOnlyRecipients: number;
};

const activeCohortStatuses = new Set(["active", "current", "in_progress"]);
const currentUpcomingCohortStatuses = new Set([
  "planned",
  "upcoming",
  "admissions_open",
  "admissions_closed",
  ...activeCohortStatuses,
]);

export function normalizeAnnouncementToken(value: unknown) {
  return typeof value === "string" ? value.trim().toLowerCase().replace(/[\s-]+/g, "_") : "";
}

export function cohortCanReceiveAnnouncements(status: unknown, scope: InstitutionalAnnouncementCohortScope) {
  const normalized = normalizeAnnouncementToken(status);
  return scope === "active" ? activeCohortStatuses.has(normalized) : currentUpcomingCohortStatuses.has(normalized);
}

export function applicationMatchesStudentRecipientStatus(status: unknown, selection: InstitutionalAnnouncementStudentStatus) {
  const normalized = normalizeAnnouncementToken(status);
  if (selection === "enrolled_active") return false;
  if (normalized === "admitted") return true;
  return selection === "confirmed_conditional" && normalized === "conditional_admission_payment_outstanding";
}

export function isCurrentStudentEnrollment(status: unknown) {
  return ["pending_onboarding", "active", "enrolled", "matriculated"].includes(normalizeAnnouncementToken(status));
}

export function summarizeAnnouncementRecipients(recipients: AnnouncementRecipient[], publishToPortal = true): AnnouncementRecipientPreview {
  const confirmed = new Set<string>();
  const conditional = new Set<string>();
  const facilitators = new Set<string>();
  const emails = new Set<string>();
  const portals = new Set<string>();
  const portalEmails = new Set<string>();

  for (const recipient of recipients) {
    const email = normalizeRecipientEmail(recipient.email);
    emails.add(email);
    if (recipient.recipientClass === "confirmed") confirmed.add(email);
    if (recipient.recipientClass === "conditional") conditional.add(email);
    if (recipient.recipientClass === "facilitator") facilitators.add(email);
    if (recipient.portalVisible && recipient.studentId) { portals.add(`student:${recipient.studentId}`); portalEmails.add(email); }
    if (recipient.portalVisible && recipient.facilitatorId) { portals.add(`facilitator:${recipient.facilitatorId}`); portalEmails.add(email); }
  }

  return {
    students: { confirmed: confirmed.size, conditional: conditional.size, total: new Set([...confirmed, ...conditional]).size },
    facilitators: facilitators.size,
    totalUniqueEmailRecipients: emails.size,
    portalRecipients: publishToPortal ? portals.size : 0,
    emailOnlyRecipients: publishToPortal ? [...emails].filter((email) => !portalEmails.has(email)).length : emails.size,
  };
}

export function isActiveAnnouncement(input: {
  announcement_status: string;
  publish_to_portal: boolean;
  published_at: string | null;
  expires_at: string | null;
}, now = new Date()) {
  return input.announcement_status === "published"
    && input.publish_to_portal
    && Boolean(input.published_at)
    && Date.parse(input.published_at!) <= now.valueOf()
    && (!input.expires_at || Date.parse(input.expires_at) > now.valueOf());
}

export function announcementIsPinned(input: { pinned_until: string | null }, now = new Date()) {
  return Boolean(input.pinned_until && Date.parse(input.pinned_until) > now.valueOf());
}

export function normalizeRecipientEmail(value: string) {
  return value.trim().toLowerCase();
}
