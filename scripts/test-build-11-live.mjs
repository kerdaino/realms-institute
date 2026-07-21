import assert from "node:assert/strict";
import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
assert.ok(url && serviceKey && anonKey, "Supabase live-test environment is required.");
const admin = createClient(url, serviceKey, { auth: { persistSession: false } });
const anon = createClient(url, anonKey, { auth: { persistSession: false } });

const tables = ["programme_scoring_policies", "programme_score_categories", "assessment_weightings", "student_engagement_component_evaluations", "capstone_defences", "student_component_scores", "student_programme_results", "graduation_requirement_definitions", "student_graduation_requirements", "academic_result_batches", "academic_result_batch_items", "programme_result_change_events", "graduation_requirement_events"];
for (const table of tables) {
  const result = await admin.from(table).select("id", { count: "exact", head: true });
  assert.equal(result.error, null, `${table} must be reachable through the trusted server client`);
}

const policies = await admin.from("programme_scoring_policies").select("*").eq("policy_status", "active");
assert.equal(policies.error, null);
assert.ok(policies.data.length > 0, "An active scoring policy is required");
for (const policy of policies.data) {
  assert.equal(Number(policy.discipleship_max_points), 40);
  assert.equal(Number(policy.skill_max_points), 45);
  assert.equal(Number(policy.engagement_max_points), 15);
  assert.equal(Number(policy.overall_pass_points), 60);
  assert.equal(Number(policy.discipleship_gate_points), 20);
  assert.equal(Number(policy.skill_gate_points), 23);
  assert.equal(Number(policy.engagement_gate_points), 8);
  const categories = await admin.from("programme_score_categories").select("score_domain, max_points, category_code").eq("scoring_policy_id", policy.id).eq("active", true);
  assert.equal(categories.error, null);
  const sum = (domain) => categories.data.filter((item) => item.score_domain === domain).reduce((total, item) => total + Number(item.max_points), 0);
  assert.equal(sum("discipleship"), 40);
  assert.equal(sum("skill"), 45);
  assert.equal(sum("engagement"), 15);
  assert.equal(categories.data.length, 14);
  const requirements = await admin.from("graduation_requirement_definitions").select("requirement_code").eq("scoring_policy_id", policy.id).eq("active", true);
  assert.equal(requirements.error, null);
  assert.equal(requirements.data.length, 10);
}

const directWrite = await anon.from("student_programme_results").insert({ student_enrollment_id: "00000000-0000-0000-0000-000000000000", scoring_policy_id: "00000000-0000-0000-0000-000000000000" });
assert.ok(directWrite.error, "Anonymous result writes must be denied");
console.log("Build 11 live checks passed (13 tables, approved 40/45/15 policy, category sums, 10 gates, and denied anonymous result write).");
