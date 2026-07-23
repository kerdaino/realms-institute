import assert from "node:assert/strict";

import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const adminPassword = process.env.REALMS_ADMIN_PASSWORD;
const baseUrl = (process.env.SESSION_UI_BASE_URL || "http://127.0.0.1:3002").replace(/\/$/, "");
assert.ok(url && serviceKey && adminPassword, "Supabase and admin rehearsal environment variables are required.");

const admin = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
const sessions = await admin.from("class_sessions").select("id").limit(1000);
assert.equal(sessions.error, null, "Existing session records could not be inspected.");
const recordIds = (sessions.data ?? []).map((session) => session.id);
assert.equal(new Set(recordIds).size, recordIds.length, "The session query returned duplicate database identities.");

const login = await fetch(`${baseUrl}/api/admin/login`, {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({ password: adminPassword }),
});
assert.equal(login.status, 200, "Local admin login must succeed.");
const cookie = login.headers.getSetCookie().map((value) => value.split(";", 1)[0]).join("; ");
assert.ok(cookie, "Admin session cookies were not returned.");

const forbiddenRoadmapTerms = /\b(?:Build (?:[1-9]|1[0-3])|NEXT [1-6])\b/i;
async function load(path) {
  const response = await fetch(`${baseUrl}${path}`, { headers: { cookie }, redirect: "manual" });
  const html = await response.text();
  assert.equal(response.status, 200, `${path} should render for the authenticated administrator.`);
  assert.doesNotMatch(html, forbiddenRoadmapTerms, `${path} exposed development-roadmap terminology.`);
  return html;
}

const listHtml = await load("/admin/sessions");
const renderedSessionIds = [...listHtml.matchAll(/href="\/admin\/sessions\/([^"/?]+)"/g)].map((match) => match[1]);
assert.ok(renderedSessionIds.length > 0, "The admin sessions page did not render an existing session link.");
assert.equal(new Set(renderedSessionIds).size, renderedSessionIds.length, "The admin sessions page rendered a duplicate session record.");
await load(`/admin/sessions/${renderedSessionIds[0]}`);

console.log(JSON.stringify({
  authenticatedAdmin: true,
  databaseSessionRecordsChecked: recordIds.length,
  renderedSessionRecordsChecked: renderedSessionIds.length,
  duplicateDatabaseIds: 0,
  duplicateRenderedSessionLinks: 0,
  checkedPages: ["/admin/sessions", `/admin/sessions/${renderedSessionIds[0]}`],
  roadmapCopyViolations: 0,
  productionDataChanged: false,
}, null, 2));
