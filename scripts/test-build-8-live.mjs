import assert from "node:assert/strict";
import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
assert.ok(url && serviceKey && anonKey, "Supabase environment variables are required.");
const admin = createClient(url, serviceKey, { auth: { persistSession: false } });
const anon = createClient(url, anonKey, { auth: { persistSession: false } });
const tables = ["assignments", "assignment_rubric_criteria", "assignment_submissions", "assignment_submission_artifacts", "assignment_rubric_scores", "quizzes", "quiz_questions", "quiz_answer_keys", "quiz_attempts", "quiz_attempt_answers", "assessment_grade_change_events"];
for (const table of tables) { const result = await admin.from(table).select("*", { count: "exact", head: true }); assert.equal(result.error, null, `${table} must be available`); }
const links = await admin.from("session_recording_requirements").select("quiz_id, practical_assignment_id, reflection_assignment_id").limit(1);
assert.equal(links.error, null, "BUILD 7 assessment link columns must be available");
const buckets = await admin.storage.listBuckets(); assert.equal(buckets.error, null);
const privateSubmissionBucket = (buckets.data ?? []).find((bucket) => !bucket.public && /submission|assessment/i.test(bucket.name));
const blocked = await anon.from("assignments").insert({ cohort_course_id: "00000000-0000-0000-0000-000000000000", title: "Unauthorized", assessment_domain: "skill", assessment_category: "weekly_practical" });
assert.ok(blocked.error, "Anonymous assessment mutation must be denied");
const keyRead = await anon.from("quiz_answer_keys").select("*").limit(1);
assert.ok(keyRead.error || (keyRead.data?.length ?? 0) === 0, "Anonymous users must not receive answer keys");
console.log(JSON.stringify({ tablesAvailable: tables.length, recordingLinksAvailable: true, anonymousMutationDenied: true, anonymousAnswerKeysUnavailable: true, privateSubmissionBucket: privateSubmissionBucket?.name ?? null, fileUploadEnabled: Boolean(privateSubmissionBucket) }, null, 2));
