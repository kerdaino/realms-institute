export type ZoomEvidenceCsvRow = {
  viewerName: string | null;
  viewerEmail: string;
  viewedAt: string | null;
  reportedDurationSeconds: number | null;
  recordingIdentifier: string | null;
  raw: Record<string, string>;
};

export function normalizeViewerEmail(value: unknown) {
  return typeof value === "string" ? value.trim().toLowerCase() : "";
}

function parseCsvRows(source: string) {
  const rows: string[][] = []; let row: string[] = []; let field = ""; let quoted = false;
  for (let index = 0; index < source.length; index += 1) {
    const char = source[index];
    if (quoted && char === '"' && source[index + 1] === '"') { field += '"'; index += 1; }
    else if (char === '"') quoted = !quoted;
    else if (!quoted && char === ",") { row.push(field); field = ""; }
    else if (!quoted && (char === "\n" || char === "\r")) { if (char === "\r" && source[index + 1] === "\n") index += 1; row.push(field); if (row.some((value) => value.trim())) rows.push(row); row = []; field = ""; }
    else field += char;
  }
  row.push(field); if (row.some((value) => value.trim())) rows.push(row);
  if (quoted) throw new Error("The CSV contains an unclosed quoted field.");
  return rows;
}

function header(value: string) { return value.trim().toLowerCase().replaceAll(/[^a-z0-9]+/g, "_").replaceAll(/^_|_$/g, ""); }
function first(raw: Record<string, string>, names: string[]) { for (const name of names) if (raw[name]?.trim()) return raw[name].trim(); return ""; }
function durationSeconds(value: string) {
  if (!value) return null;
  if (/^\d+(?:\.\d+)?$/.test(value)) return Math.max(0, Math.round(Number(value)));
  const parts = value.split(":").map(Number); if (parts.some((part) => !Number.isFinite(part)) || parts.length < 2 || parts.length > 3) return null;
  return Math.round(parts.reverse().reduce((sum, part, index) => sum + part * (60 ** index), 0));
}

export function parseZoomEvidenceCsv(source: string): ZoomEvidenceCsvRow[] {
  const rows = parseCsvRows(source.replace(/^\uFEFF/, ""));
  if (rows.length < 2) throw new Error("The Zoom evidence CSV must contain a header and at least one viewer row.");
  const headers = rows[0].map(header);
  if (new Set(headers).size !== headers.length) throw new Error("The CSV contains duplicate column headings.");
  const parsed = rows.slice(1).map((values, rowIndex) => {
    const raw = Object.fromEntries(headers.map((key, index) => [key, values[index]?.trim() ?? ""]));
    const viewerEmail = normalizeViewerEmail(first(raw, ["viewer_email", "email", "email_address", "registrant_email"]));
    if (!viewerEmail || !/^\S+@\S+\.\S+$/.test(viewerEmail)) throw new Error(`Row ${rowIndex + 2} requires a valid viewer email.`);
    const viewed = first(raw, ["view_date_time", "viewed_at", "view_date", "date_time", "last_viewed"]);
    if (viewed && Number.isNaN(Date.parse(viewed))) throw new Error(`Row ${rowIndex + 2} has an invalid view date/time.`);
    const duration = first(raw, ["zoom_reported_view_duration", "view_duration", "duration", "viewing_duration"]);
    const reportedDurationSeconds = durationSeconds(duration);
    if (duration && reportedDurationSeconds === null) throw new Error(`Row ${rowIndex + 2} has an invalid Zoom reported view duration.`);
    return { viewerName: first(raw, ["viewer_name", "name", "registrant_name"]) || null, viewerEmail, viewedAt: viewed ? new Date(viewed).toISOString() : null, reportedDurationSeconds, recordingIdentifier: first(raw, ["recording_identifier", "recording_id", "meeting_id", "uuid"]) || null, raw };
  });
  if (parsed.length > 2000) throw new Error("Import no more than 2,000 Zoom evidence rows at once.");
  return parsed;
}

