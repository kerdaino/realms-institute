export const institutionalAnnouncementAudiences = ["students", "facilitators", "students_facilitators"] as const;
export const institutionalAnnouncementStatuses = ["draft", "published", "archived"] as const;

export type InstitutionalAnnouncementAudience = (typeof institutionalAnnouncementAudiences)[number];
export type InstitutionalAnnouncementStatus = (typeof institutionalAnnouncementStatuses)[number];

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
