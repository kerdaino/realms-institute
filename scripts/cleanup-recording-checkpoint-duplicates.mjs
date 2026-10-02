import { createHash } from "node:crypto";
import { createClient } from "@supabase/supabase-js";

const apply = process.argv.includes("--apply");
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) throw new Error("Supabase administrative environment is required.");

const supabase = createClient(url, key, { auth: { persistSession: false } });
const result = await supabase.from("recording_checkpoint_attempts").select("id, recording_assignment_id, checkpoint_id, question_id, submitted_answer, is_correct, attempt_number, answered_at, evaluated_at, evaluated_by, evaluator_note").order("answered_at", { ascending: true }).limit(10000);
if (result.error) throw result.error;

const serialized = (value) => JSON.stringify(value);
const responseHash = (value) => createHash("sha256").update(serialized(value)).digest("hex").slice(0, 12);
const candidates = (result.data ?? []).filter((row) => row.is_correct === null && row.evaluated_at === null && row.evaluated_by === null && row.evaluator_note === null);
const grouped = new Map();
for (const row of candidates) {
  const key = [row.recording_assignment_id, row.checkpoint_id, row.question_id, responseHash(row.submitted_answer)].join(":");
  grouped.set(key, [...(grouped.get(key) ?? []), row]);
}

const bursts = [];
for (const rows of grouped.values()) {
  let burst = [];
  const flush = () => { if (burst.length > 1 && Date.parse(burst.at(-1).answered_at) - Date.parse(burst[0].answered_at) <= 10_000) bursts.push(burst); burst = []; };
  for (const row of rows) {
    if (!burst.length || Date.parse(row.answered_at) - Date.parse(burst[0].answered_at) <= 10_000) burst.push(row);
    else { flush(); burst = [row]; }
  }
  flush();
}

const report = bursts.map((rows) => ({
  assignment_id: rows[0].recording_assignment_id,
  checkpoint_id: rows[0].checkpoint_id,
  question_id: rows[0].question_id,
  response_hash: responseHash(rows[0].submitted_answer),
  keep_attempt_id: rows[0].id,
  remove_attempt_ids: rows.slice(1).map((row) => row.id),
  attempt_numbers: rows.map((row) => row.attempt_number),
  answered_at: rows.map((row) => row.answered_at),
}));

console.log(JSON.stringify({ mode: apply ? "apply" : "dry-run", attempt_rows_scanned: result.data?.length ?? 0, accidental_duplicate_bursts: report }, null, 2));
if (!apply) {
  console.log("Dry run only. Review every group, then rerun with --apply to invoke the guarded atomic cleanup RPC.");
  process.exit(0);
}

for (const burst of report) {
  const cleaned = await supabase.rpc("cleanup_accidental_checkpoint_attempt_burst", { p_keep_id: burst.keep_attempt_id, p_remove_ids: burst.remove_attempt_ids, p_actor: "REALMS guarded duplicate cleanup" });
  if (cleaned.error) throw new Error(`Cleanup refused for ${burst.keep_attempt_id}: ${cleaned.error.message}`);
  console.log(`Kept ${burst.keep_attempt_id}; removed ${cleaned.data} guarded duplicate rows.`);
}
