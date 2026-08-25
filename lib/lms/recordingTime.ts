export type RecordingTimeParseResult =
  | { ok: true; seconds: number | null }
  | { ok: false; message: string };

/**
 * Parse staff-authored recording time without changing the database contract.
 * Blank values remain null; accepted non-blank forms are MM:SS and HH:MM:SS.
 */
export function parseRecordingTime(value: unknown): RecordingTimeParseResult {
  if (value === null || value === undefined) return { ok: true, seconds: null };
  const input = String(value).trim();
  if (!input) return { ok: true, seconds: null };
  if (!/^\d+:\d{2}(?::\d{2})?$/.test(input)) return { ok: false, message: "Use MM:SS or HH:MM:SS, for example 45:00 or 01:35:00." };

  const parts = input.split(":").map(Number);
  const [hours, minutes, seconds] = parts.length === 3 ? parts : [0, parts[0], parts[1]];
  if (!Number.isSafeInteger(hours) || !Number.isSafeInteger(minutes) || !Number.isSafeInteger(seconds) || hours < 0 || minutes < 0 || seconds < 0 || seconds > 59 || (parts.length === 3 && minutes > 59)) {
    return { ok: false, message: "Use a valid time. Minutes and seconds in HH:MM:SS must be between 00 and 59." };
  }

  const total = hours * 3600 + minutes * 60 + seconds;
  if (!Number.isSafeInteger(total)) return { ok: false, message: "The supplied recording time is too large." };
  return { ok: true, seconds: total };
}

export function formatRecordingTime(value: unknown) {
  const numeric = typeof value === "number" ? value : typeof value === "string" && value.trim() ? Number(value) : null;
  if (numeric === null || !Number.isSafeInteger(numeric) || numeric < 0) return "";
  const hours = Math.floor(numeric / 3600);
  const minutes = Math.floor((numeric % 3600) / 60);
  const seconds = numeric % 60;
  return [hours, minutes, seconds].map((part) => String(part).padStart(2, "0")).join(":");
}

export function formatRequirementHours(value: unknown) {
  const hours = Number(value);
  if (!Number.isFinite(hours) || hours <= 0) return "No completion window configured";
  return `Complete within ${hours} ${hours === 1 ? "hour" : "hours"}`;
}

export function formatRequiredCheckpoints(value: unknown) {
  const count = Number(value);
  if (!Number.isInteger(count) || count <= 0) return "No checkpoints required";
  return `${count} required checkpoint${count === 1 ? "" : "s"}`;
}
