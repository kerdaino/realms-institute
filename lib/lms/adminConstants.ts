export const studentStatuses = ["pending_onboarding", "active", "on_leave", "deferred", "withdrawn", "completed", "suspended"] as const;
export const onboardingStatuses = ["not_started", "in_progress", "completed"] as const;
export const cohortStatuses = ["planned", "admissions_open", "admissions_closed", "active", "completed", "archived"] as const;
export const facilitatorStatuses = ["active", "inactive", "on_leave"] as const;
export const assignmentRoles = ["lead", "co_facilitator", "assistant", "guest"] as const;
export const courseCategories = ["discipleship", "skill", "capstone"] as const;
export const sessionTypes = ["teaching", "prayer", "q_and_a", "practical", "review", "assessment", "commissioning", "orientation", "other"] as const;
export const sessionDeliveryModes = ["online", "physical", "hybrid", "recorded_primary"] as const;
export const sessionStatuses = ["scheduled", "live", "completed", "cancelled", "rescheduled"] as const;
export const sessionVisibilityStatuses = ["enrolled_only", "facilitators_only", "admin_only"] as const;
export const summaryStatuses = ["draft", "published", "archived"] as const;
export const resourceTypes = ["slides", "document", "worksheet", "link", "scripture_reference", "code_repository", "download", "other"] as const;
export const sessionAccessLevels = ["enrolled_students", "facilitators_only", "alumni_archive", "admin_only"] as const;
export const recordingProviders = ["zoom", "vimeo", "youtube_unlisted", "other"] as const;
export const recordingStatuses = ["processing", "available", "unavailable", "archived"] as const;

export function isOneOf<T extends readonly string[]>(values: T, value: unknown): value is T[number] {
  return typeof value === "string" && (values as readonly string[]).includes(value);
}

export function humanize(value: string | null | undefined) {
  if (!value) return "Not set";
  return value.replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

export function readText(value: unknown, maximum = 5000) {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed ? trimmed.slice(0, maximum) : null;
}

export function readNullableDate(value: unknown) {
  if (value === null || value === "") return null;
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value) || Number.isNaN(Date.parse(`${value}T00:00:00Z`))) return undefined;
  return value;
}

export function isUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

export function readNullableTimestamp(value: unknown) {
  if (value === null || value === "") return null;
  if (typeof value !== "string") return undefined;
  const parsed = new Date(value);
  return Number.isNaN(parsed.valueOf()) ? undefined : parsed.toISOString();
}

export function readHttpUrl(value: unknown) {
  const text = readText(value, 2048);
  if (!text) return null;
  try { const url = new URL(text); return url.protocol === "https:" || (process.env.NODE_ENV !== "production" && url.protocol === "http:") ? url.toString() : undefined; }
  catch { return undefined; }
}

export function readStringList(value: unknown, maximumItems = 100) {
  if (Array.isArray(value)) return value.filter((item): item is string => typeof item === "string").map((item) => item.trim()).filter(Boolean).slice(0, maximumItems);
  if (typeof value === "string") return value.split(/\r?\n/).map((item) => item.trim()).filter(Boolean).slice(0, maximumItems);
  return [];
}
