import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const publicKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const adminPassword = process.env.REALMS_ADMIN_PASSWORD;
const baseUrl = process.env.BUILD_7_BASE_URL || "http://localhost:3000";
if (!url || !publicKey || !serviceKey) throw new Error("Supabase environment variables are required.");
const admin = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });

const tables = ["recording_completion_policies", "session_recording_requirements", "recording_learning_assignments", "recording_progress", "recording_playback_sessions", "recording_watch_segments", "recording_checkpoints", "recording_checkpoint_questions", "recording_checkpoint_answer_keys", "recording_checkpoint_attempts", "recording_requirement_statuses", "learning_completion_change_events"];
const counts = {};
for (const table of tables) { const result = await admin.from(table).select("id", { count: "exact", head: true }); assert.equal(result.error, null, `${table} is unavailable`); counts[table] = result.count ?? 0; }
const snapshotColumn = await admin.from("recording_learning_assignments").select("requirement_snapshot").limit(1);
const policy = await admin.from("recording_completion_policies").select("min_watch_percentage, default_deadline_hours, default_required_checkpoints, min_quiz_score, max_quiz_attempts").eq("policy_status", "active").limit(1).maybeSingle();
assert.equal(policy.error, null); assert.ok(policy.data); assert.equal(Number(policy.data.min_watch_percentage), 85); assert.equal(policy.data.default_deadline_hours, 72); assert.equal(policy.data.default_required_checkpoints, 2); assert.equal(Number(policy.data.min_quiz_score), 70); assert.equal(policy.data.max_quiz_attempts, 2);

const fixture = await admin.from("students").select("id, profile_id, email").not("profile_id", "is", null).limit(1).maybeSingle();
assert.equal(fixture.error, null); assert.ok(fixture.data?.profile_id);
const link = await admin.auth.admin.generateLink({ type: "magiclink", email: fixture.data.email, options: { redirectTo: `${baseUrl}/auth/callback` } });
assert.equal(link.error, null); assert.ok(link.data.properties?.hashed_token);
const student = createClient(url, publicKey, { auth: { persistSession: false, autoRefreshToken: false } });
const verified = await student.auth.verifyOtp({ token_hash: link.data.properties.hashed_token, type: "email" });
assert.equal(verified.error, null); assert.ok(verified.data.session);

const ownAssignments = await student.from("recording_learning_assignments").select("id, purpose_code");
assert.equal(ownAssignments.error, null);
const allAssignments = await admin.from("recording_learning_assignments").select("id").limit(1000);
assert.equal(allAssignments.error, null);
const ownIds = new Set(ownAssignments.data.map((item) => item.id));
const anotherStudentAssignment = allAssignments.data.find((item) => !ownIds.has(item.id));
if (anotherStudentAssignment) {
  const forbiddenAssignment = await student.from("recording_learning_assignments").select("id").eq("id", anotherStudentAssignment.id);
  assert.equal(forbiddenAssignment.error, null); assert.equal(forbiddenAssignment.data.length, 0, "Another student's assignment must remain invisible");
}
const answerKeys = await student.from("recording_checkpoint_answer_keys").select("id, correct_answer");
assert.equal(answerKeys.error, null); assert.equal(answerKeys.data.length, 0, "Student must never receive answer keys");
const forbiddenWrite = await student.from("recording_progress").insert({ recording_assignment_id: randomUUID(), progress_status: "watch_complete", watch_percentage: 100, watch_requirement_met: true });
assert.ok(forbiddenWrite.error, "A direct student progress write must be denied by RLS");

const browserLink = await admin.auth.admin.generateLink({ type: "magiclink", email: fixture.data.email, options: { redirectTo: `${baseUrl}/auth/callback` } });
assert.equal(browserLink.error, null); assert.ok(browserLink.data.properties?.hashed_token);
const confirmation = await fetch(`${baseUrl}/auth/confirm?token_hash=${encodeURIComponent(browserLink.data.properties.hashed_token)}&type=magiclink`, { redirect: "manual" });
assert.equal(confirmation.status, 307); const cookie = confirmation.headers.getSetCookie().map((value) => value.split(";", 1)[0]).join("; "); assert.ok(cookie);
const studentPage = await fetch(`${baseUrl}/student/recordings`, { headers: { cookie }, redirect: "manual" }); const studentHtml = await studentPage.text(); assert.equal(studentPage.status, 200); assert.ok(studentHtml.includes("Recorded learning"));

assert.ok(adminPassword, "REALMS_ADMIN_PASSWORD is required for the admin runtime test");
const adminLogin = await fetch(`${baseUrl}/api/admin/login`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ password: adminPassword }) });
assert.equal(adminLogin.status, 200); const adminCookie = adminLogin.headers.getSetCookie().map((value) => value.split(";", 1)[0]).join("; "); assert.ok(adminCookie);
const adminPage = await fetch(`${baseUrl}/admin/recordings`, { headers: { cookie: adminCookie }, redirect: "manual" }); const adminHtml = await adminPage.text(); assert.equal(adminPage.status, 200); assert.ok(adminHtml.includes("Recorded Learning"));

const routes = {};
for (const path of ["/student/recordings", "/admin/recordings", "/facilitator/recordings"]) { const response = await fetch(`${baseUrl}${path}`, { redirect: "manual" }); routes[path] = { status: response.status, location: response.headers.get("location") }; assert.ok([302, 303, 307, 308].includes(response.status)); }

console.log(JSON.stringify({ tables: counts, updatedBuild7MigrationApplied: snapshotColumn.error === null, policy: policy.data, studentVisibleAssignments: ownAssignments.data.length, anotherStudentAssignmentDenied: anotherStudentAssignment ? true : "no cross-student fixture available", studentAnswerKeysVisible: answerKeys.data.length, directStudentDerivedWriteDenied: true, authenticatedStudentRecordingsStatus: studentPage.status, authenticatedAdminRecordingsStatus: adminPage.status, routeGuards: routes }, null, 2));
