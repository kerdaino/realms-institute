import assert from "node:assert/strict";
import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL; const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY; const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
assert.ok(url && anonKey && serviceKey, "Supabase test configuration is required.");
const admin = createClient(url, serviceKey, { auth: { persistSession: false } }); const anon = createClient(url, anonKey, { auth: { persistSession: false } });
const tables = ["graduation_confirmations", "graduation_confirmation_events", "alumni_programme_records", "certificate_templates", "institutional_awards", "award_issuance_events", "award_verification_events", "alumni_conversion_events", "alumni_course_archives", "alumni_summary_archive_items", "alumni_recording_access_grants", "alumni_announcements", "alumni_announcement_reads", "alumni_outcome_updates"];
for (const table of tables) { const result = await admin.from(table).select("*", { count: "exact", head: true }); assert.equal(result.error, null, `${table} must be reachable`); }
const schema = await fetch(`${url}/rest/v1/`, { headers: { apikey: serviceKey, Authorization: `Bearer ${serviceKey}` } }).then((response) => response.json()); const alumniColumns = Object.keys(schema.definitions?.alumni?.properties ?? {}); assert.ok(alumniColumns.includes("student_id")); assert.ok(alumniColumns.includes("alumni_number")); assert.ok(alumniColumns.includes("first_graduated_at")); assert.ok(alumniColumns.includes("learning_archive_access")); assert.equal(alumniColumns.includes("profile_id"), false); assert.equal(alumniColumns.includes("archive_access_status"), false);
const templates = await admin.from("certificate_templates").select("template_status, signature_configuration, award_claim_text"); assert.equal(templates.error, null); assert.equal(templates.data?.length, 1); assert.equal(templates.data?.[0].template_status, "draft"); assert.deepEqual(templates.data?.[0].signature_configuration, []);
const buckets = await admin.storage.listBuckets(); assert.equal(buckets.error, null); assert.equal((buckets.data ?? []).some((bucket) => bucket.name === "institutional-awards" && bucket.public === false), false);
const anonymousRead = await anon.from("institutional_awards").select("id").limit(1); assert.equal(anonymousRead.data?.length ?? 0, 0);
const anonymousWrite = await anon.from("institutional_awards").update({ award_status: "issued" }).eq("id", "00000000-0000-0000-0000-000000000000").select("id"); assert.equal(anonymousWrite.data?.length ?? 0, 0);
console.log("Build 12 live checks passed (14 tables, corrected alumni ownership columns, draft unsigned template, no public award read/write, and no private award bucket yet).");
