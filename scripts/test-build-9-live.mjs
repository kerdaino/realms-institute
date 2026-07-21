import assert from "node:assert/strict";
import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL; const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY; const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
assert.ok(url && serviceKey && anonKey, "Supabase environment variables are required.");
const admin = createClient(url, serviceKey, { auth: { persistSession: false } }); const anon = createClient(url, anonKey, { auth: { persistSession: false } });
const tables = ["absence_requests", "absence_request_evidence", "absence_request_events", "makeup_requirements", "makeup_requirement_events"];
for (const table of tables) { const result = await admin.from(table).select("*", { count: "exact", head: true }); assert.equal(result.error, null, `${table} must be available`); }
const extended = await Promise.all([
  admin.from("cohort_attendance_policies").select("require_makeup_for_excused_absence, allow_unapproved_makeup, absence_request_deadline_hours, supporting_evidence_required_by_default").limit(1),
  admin.from("session_attendance").select("absence_request_id").limit(1),
  admin.from("session_learning_completion").select("makeup_requirement_id, completion_method, required_action").limit(1),
]);
for (const result of extended) assert.equal(result.error, null, "Build 9 extension columns must be available");
const recordingSnapshot = await admin.from("recording_learning_assignments").select("requirement_snapshot").limit(1);
const anonymousReads = await Promise.all(tables.map((table) => anon.from(table).select("id").limit(1)));
const anonymousMutation = await anon.from("absence_requests").insert({ course_enrollment_id: "00000000-0000-0000-0000-000000000000", class_session_id: "00000000-0000-0000-0000-000000000000", reason_category: "other", explanation: "unauthorized" });
assert.ok(anonymousMutation.error, "Anonymous absence mutation must be denied");
const buckets = await admin.storage.listBuckets(); assert.equal(buckets.error, null); const privateEvidenceBucket = (buckets.data ?? []).find((bucket) => !bucket.public && /absence|evidence|makeup/i.test(bucket.name));
console.log(JSON.stringify({ tablesAvailable: tables.length, extensionColumnsAvailable: true, anonymousMutationDenied: true, anonymousReadResults: anonymousReads.map((result, index) => ({ table: tables[index], deniedOrEmpty: Boolean(result.error || !result.data?.length) })), build7RequirementSnapshotAvailable: !recordingSnapshot.error, build7RequirementSnapshotErrorCode: recordingSnapshot.error?.code ?? null, privateEvidenceBucket: privateEvidenceBucket?.name ?? null, evidenceFileUploadEnabled: Boolean(privateEvidenceBucket) }, null, 2));
