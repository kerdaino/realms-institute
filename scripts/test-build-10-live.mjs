import assert from "node:assert/strict";
import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL; const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY; const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
assert.ok(url && serviceKey && anonKey, "Supabase environment variables are required.");
const admin = createClient(url, serviceKey, { auth: { persistSession: false } }); const anon = createClient(url, anonKey, { auth: { persistSession: false } });
const tables = ["engagement_alert_rules", "student_engagement_alerts", "student_warning_notices", "student_warning_notice_alerts", "student_warning_notice_events", "student_notice_deliveries", "mentor_assignments", "mentor_followups", "student_recovery_plans", "recovery_plan_actions", "recovery_plan_events", "student_status_review_cases", "student_status_review_private_notes", "student_standing_change_events", "student_support_referrals"];
for (const table of tables) { const result = await admin.from(table).select("*", { count: "exact", head: true }); assert.equal(result.error, null, `${table} must be available`); }
const extension = await admin.from("student_enrollments").select("id, academic_standing, standing_review_required, last_meaningful_activity_at, last_engagement_evaluated_at").limit(1); assert.equal(extension.error, null, "BUILD 10 student-enrollment columns must be available");
const rules = await admin.from("engagement_alert_rules").select("rule_code, signal_type, threshold_value").eq("active", true); assert.equal(rules.error, null); assert.equal(rules.data?.length, 7, "The current cohort should have seven configured engagement rules");
const anonymousMutation = await anon.from("student_engagement_alerts").insert({ student_enrollment_id: "00000000-0000-4000-8000-000000000000", signal_type: "forged", severity: "high", alert_title: "forged", deduplication_key: "forged", context: {} }); assert.ok(anonymousMutation.error, "Anonymous engagement-alert mutation must be denied");
const anonymousReads = await Promise.all(tables.map((table) => anon.from(table).select("id").limit(1)));

let httpEvaluation = null;
const baseUrl = process.env.BUILD10_BASE_URL;
if (baseUrl && process.env.REALMS_ADMIN_PASSWORD && extension.data?.[0]?.id) {
  const login = await fetch(`${baseUrl.replace(/\/$/, "")}/api/admin/login`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ password: process.env.REALMS_ADMIN_PASSWORD }) }); assert.equal(login.status, 200, "Local admin login must succeed");
  const cookie = login.headers.getSetCookie().map((value) => value.split(";", 1)[0]).join("; ");
  const evaluate = async () => { const response = await fetch(`${baseUrl.replace(/\/$/, "")}/api/admin/engagement/evaluate`, { method: "POST", headers: { "content-type": "application/json", cookie }, body: JSON.stringify({ student_enrollment_id: extension.data[0].id }) }); const body = await response.json(); assert.equal(response.status, 200, body.message || "Engagement evaluation must succeed"); return body; };
  const first = await evaluate(); const second = await evaluate(); assert.equal(second.created, 0, "Repeated evaluation must not create duplicate alerts"); httpEvaluation = { first, second };
}

console.log(JSON.stringify({ tablesAvailable: tables.length, extensionColumnsAvailable: true, activeRules: rules.data?.length ?? 0, anonymousMutationDenied: true, anonymousReadResults: anonymousReads.map((result, index) => ({ table: tables[index], deniedOrEmpty: Boolean(result.error || !result.data?.length) })), httpEvaluation }, null, 2));
