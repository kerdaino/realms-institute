import assert from "node:assert/strict";

import { createClient } from "@supabase/supabase-js";

import { confirmPortalSession } from "./live-portal-session.mjs";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const baseUrl = process.env.FACILITATOR_BASE_URL || "http://127.0.0.1:3002";
if (!url || !serviceKey) throw new Error("Supabase environment variables are required.");

const admin = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
const facilitator = await admin
  .from("facilitators")
  .select("profile_id, email, profiles(email)")
  .eq("active", true)
  .not("profile_id", "is", null)
  .limit(1)
  .maybeSingle();
if (facilitator.error) throw new Error(`Facilitator fixture lookup failed: ${facilitator.error.message}`);
const profile = Array.isArray(facilitator.data?.profiles) ? facilitator.data.profiles[0] : facilitator.data?.profiles;
const facilitatorEmail = facilitator.data?.email || profile?.email;
if (!facilitatorEmail || !facilitator.data?.profile_id) {
  console.log(JSON.stringify({
    authenticatedFacilitator: false,
    checkedPages: 0,
    skipped: "No active facilitator is linked to a controlled portal identity.",
    productionDataChanged: false,
  }, null, 2));
} else {
  const roles = await admin.from("user_roles").select("roles(name)").eq("user_id", facilitator.data.profile_id);
  if (roles.error) throw new Error(`Facilitator role lookup failed: ${roles.error.message}`);
  const roleNames = (roles.data ?? []).map((row) => {
    const role = Array.isArray(row.roles) ? row.roles[0] : row.roles;
    return role?.name;
  }).filter(Boolean);
  const isDualRole = roleNames.includes("student") && roleNames.includes("facilitator");
  const link = await admin.auth.admin.generateLink({
    type: "magiclink",
    email: facilitatorEmail,
    options: { redirectTo: `${baseUrl}/auth/callback` },
  });
  if (link.error || !link.data.properties?.hashed_token) throw new Error(`Facilitator sign-in could not be generated: ${link.error?.message ?? "missing token"}`);
  const confirmation = await confirmPortalSession(baseUrl, link.data.properties.hashed_token);

  const paths = [
    "/facilitator",
    "/facilitator/sessions",
    "/facilitator/assignments",
    "/facilitator/quizzes",
    "/facilitator/recordings",
    "/facilitator/makeup",
    "/facilitator/engagement",
    "/facilitator/gradebook",
  ];
  const forbidden = [
    /\bBuild (?:[1-9]|1[0-3])\b/i,
    /\bNEXT [1-6]\b/i,
    /\bmigration\b/i,
    /\bfixture\b/i,
    /\bRLS\b/,
    /\bRPC\b/,
    /\bservice role\b/i,
  ];
  const statuses = {};
  let assignedSessionPath = null;
  for (const path of paths) {
    const response = await fetch(`${baseUrl}${path}`, { headers: { cookie: confirmation.cookie }, redirect: "manual" });
    const html = await response.text();
    assert.equal(response.status, 200, `${path} should render for the authenticated facilitator`);
    assert.ok(html.includes("REALMS"));
    for (const pattern of forbidden) assert.doesNotMatch(html, pattern, `${path} exposed internal terminology`);
    if (path === "/facilitator/sessions") {
      const assignedSession = html.match(/href="(\/facilitator\/sessions\/[^"/?]+)"/);
      assignedSessionPath = assignedSession?.[1] ?? null;
    }
    statuses[path] = response.status;
  }
  if (assignedSessionPath) {
    const response = await fetch(`${baseUrl}${assignedSessionPath}`, { headers: { cookie: confirmation.cookie }, redirect: "manual" });
    const html = await response.text();
    assert.equal(response.status, 200, `${assignedSessionPath} should render for the assigned facilitator`);
    for (const pattern of forbidden) assert.doesNotMatch(html, pattern, `${assignedSessionPath} exposed internal terminology`);
    statuses[assignedSessionPath] = response.status;
  }
  if (isDualRole) {
    const studentResponse = await fetch(`${baseUrl}/student`, { headers: { cookie: confirmation.cookie }, redirect: "manual" });
    assert.equal(studentResponse.status, 200, "The controlled dual-role identity should retain student portal access.");
  }

  console.log(JSON.stringify({
    authenticatedFacilitator: true,
    checkedPages: Object.keys(statuses).length,
    assignedSessionDetailChecked: Boolean(assignedSessionPath),
    roles: roleNames,
    dualRolePortalAccessVerified: isDualRole,
    internalCopyViolations: 0,
    pages: statuses,
    productionDataChanged: false,
  }, null, 2));
}
