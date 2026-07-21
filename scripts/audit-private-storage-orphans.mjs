import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !serviceKey) throw new Error("Supabase server credentials are required for the private-storage audit.");

const supabase = createClient(url, serviceKey, { auth: { autoRefreshToken: false, persistSession: false } });
const deleteRequested = process.argv.includes("--delete");
if (deleteRequested && process.env.PRIVATE_STORAGE_DELETE_ORPHANS !== "1") {
  throw new Error("Set PRIVATE_STORAGE_DELETE_ORPHANS=1 as well as --delete before removing reviewed orphan candidates.");
}

const minimumAgeMs = 24 * 60 * 60 * 1000;
const generatedPath = /^[0-9a-f-]{36}\/[0-9a-f-]{36}\/[0-9a-f-]{36}(?:-|\.)/i;
const areas = [
  { bucket: "assessment-submissions", table: "assignment_submission_artifacts", column: "storage_path" },
  { bucket: "absence-evidence", table: "absence_request_evidence", column: "storage_path" },
  { bucket: "institutional-awards", table: "institutional_awards", column: "document_storage_path" },
];

async function listObjects(bucket, prefix = "") {
  const found = [];
  for (let offset = 0; ; offset += 1_000) {
    const result = await supabase.storage.from(bucket).list(prefix, { limit: 1_000, offset, sortBy: { column: "name", order: "asc" } });
    if (result.error) {
      if (/not found/i.test(result.error.message)) return found;
      throw new Error(`Could not list ${bucket}.`);
    }
    for (const item of result.data ?? []) {
      const objectPath = prefix ? `${prefix}/${item.name}` : item.name;
      if (item.id) found.push({ path: objectPath, createdAt: item.created_at });
      else found.push(...await listObjects(bucket, objectPath));
    }
    if ((result.data?.length ?? 0) < 1_000) break;
  }
  return found;
}

async function referencedPaths(table, column) {
  const paths = new Set();
  for (let from = 0; ; from += 1_000) {
    const result = await supabase.from(table).select(column).not(column, "is", null).range(from, from + 999);
    if (result.error) throw new Error(`Could not inspect ${table}. Apply the NEXT 4 migration before running this audit.`);
    for (const row of result.data ?? []) if (typeof row[column] === "string") paths.add(row[column]);
    if ((result.data?.length ?? 0) < 1_000) break;
  }
  return paths;
}

const report = [];
for (const area of areas) {
  const [objects, references] = await Promise.all([listObjects(area.bucket), referencedPaths(area.table, area.column)]);
  const cutoff = Date.now() - minimumAgeMs;
  const candidates = objects.filter((object) => generatedPath.test(object.path) && !references.has(object.path) && (!object.createdAt || Date.parse(object.createdAt) < cutoff));
  if (deleteRequested && candidates.length) {
    for (let index = 0; index < candidates.length; index += 100) {
      const removed = await supabase.storage.from(area.bucket).remove(candidates.slice(index, index + 100).map((item) => item.path));
      if (removed.error) throw new Error(`Could not remove reviewed orphan candidates from ${area.bucket}.`);
    }
  }
  report.push({ bucket: area.bucket, objectCount: objects.length, linkedPathCount: references.size, orphanCandidatesOlderThan24Hours: candidates.map((item) => item.path), action: deleteRequested ? "deleted" : "dry-run" });
}

console.log(JSON.stringify(report, null, 2));
