import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

import { consumeWithSharedRateLimitStore, hmacPublicIdentifier } from "../lib/publicRateLimitCore.ts";

const root = process.cwd();
const read = (path) => readFile(resolve(root, path), "utf8");
const [policySource, serverSource, sql, repairSql, initialize, scholarship, verify, portalActions, portalInvite, certificateApi, certificatePage, certificateCodePage, form, saveRegistration] = await Promise.all([
  read("lib/publicRateLimitPolicy.ts"),
  read("lib/publicRateLimit.server.ts"),
  read("supabase/lms_build_13_public_abuse_protection.sql"),
  read("supabase/lms_build_13_public_rate_limit_repair.sql"),
  read("app/api/paystack/initialize/route.ts"),
  read("app/api/registrations/scholarship/route.ts"),
  read("app/api/paystack/verify/route.ts"),
  read("app/portal/login/actions.ts"),
  read("lib/lms/portalInvite.ts"),
  read("app/api/certificates/verify/route.ts"),
  read("app/verify-certificate/page.tsx"),
  read("app/verify-certificate/[verificationCode]/page.tsx"),
  read("components/registration/RegistrationForm.tsx"),
  read("lib/saveRegistration.ts"),
]);
const [adminAuth, adminLogin] = await Promise.all([read("lib/adminAuth.ts"), read("app/api/admin/login/route.ts")]);

let now = 1_000_000;
const buckets = new Map();
function sharedRpc() {
  return async ({ keyHash, limit, windowSeconds }) => {
    const current = buckets.get(keyHash);
    const fresh = !current || current.expiresAt <= now;
    const bucket = fresh ? { count: 1, expiresAt: now + windowSeconds * 1000 } : { ...current, count: current.count + 1 };
    buckets.set(keyHash, bucket);
    return { allowed: bucket.count <= limit, retryAfterSeconds: Math.max(0, Math.ceil((bucket.expiresAt - now) / 1000)) };
  };
}
const policies = { test: { limit: 2, windowSeconds: 60 } };
const consumeFromInstance = () => consumeWithSharedRateLimitStore({ entries: [{ policy: "test", identifier: "203.0.113.7" }], policies, secret: "test-secret", rpc: sharedRpc() });

const checks = [];
async function check(name, callback) { await callback(); checks.push(name); }

await check("HMAC keys are deterministic and do not contain the source", () => {
  const hash = hmacPublicIdentifier("secret", "namespace", "action", "person@example.com");
  assert.match(hash, /^[0-9a-f]{64}$/);
  assert.equal(hash.includes("person@example.com"), false);
});
await check("all requested actions have central policies", () => {
  for (const action of ["registration_source", "scholarship_source", "paystack_initialize_source", "paystack_verify_source", "forgot_password_source", "activation_resend_source", "magic_link_source", "certificate_source", "admin_login_source"]) assert.match(policySource, new RegExp(`${action}:`));
});
await check("the exact public 429 copy is centralized", () => assert.match(policySource, /Too many attempts were received\. Please wait a little and try again\./));
await check("normal shared-store request succeeds", async () => assert.equal((await consumeFromInstance()).allowed, true));
await check("normal retry succeeds", async () => assert.equal((await consumeFromInstance()).allowed, true));
await check("abuse reaches the shared limit", async () => assert.equal((await consumeFromInstance()).allowed, false));
await check("expired buckets reset", async () => { now += 61_000; assert.equal((await consumeFromInstance()).allowed, true); });
await check("switching app instances cannot bypass the shared bucket", async () => { await consumeFromInstance(); assert.equal((await consumeFromInstance()).allowed, false); });
await check("registration and Paystack initialization use source and email limits", () => { assert.match(initialize, /registration_source/); assert.match(initialize, /registration_email/); assert.match(initialize, /paystack_initialize_source/); assert.match(initialize, /paystack_initialize_email/); });
await check("registration retries have an opaque browser submission token", () => { assert.match(form, /crypto\.randomUUID\(\)/); assert.match(saveRegistration, /submission_key_hash/); });
await check("Paystack initialization revalidates saved application state and amount", () => { assert.match(initialize, /validateRegistrationApplicationForPayment/); assert.match(saveRegistration, /Number\(data\.amount\) === input\.amount/); });
await check("Paystack retries reuse a stored authorization URL/reference", () => { assert.match(initialize, /savedState\.authorizationUrl/); assert.match(saveRegistration, /payment_authorization_url/); });
await check("scholarship requests use tighter shared limits and no Paystack initialization", () => { assert.match(scholarship, /scholarship_source/); assert.match(scholarship, /scholarship_email/); assert.doesNotMatch(scholarship, /initializePaystackTransaction/); });
await check("payment verification has generous source/reference limits and fail-open recovery", () => { assert.match(verify, /paystack_verify_source/); assert.match(verify, /paystack_verify_reference/); assert.match(verify, /fails open/); });
await check("auth email requests use source and normalized-email limits with generic responses", () => { assert.match(portalActions, /If an account exists for this email/); assert.match(portalActions, /If an activated institutional account exists/); assert.match(portalInvite, /forgot_password_email/); assert.match(portalInvite, /magic_link_email/); assert.match(portalInvite, /normalizePortalEmail/); });
await check("certificate verification uses the shared limiter everywhere", () => { assert.match(certificateApi, /consumePublicRateLimits/); assert.match(certificatePage, /consumePublicRateLimits/); assert.match(certificateCodePage, /consumePublicRateLimits/); assert.doesNotMatch(certificateApi + certificatePage + certificateCodePage, /new Map|permitCertificateVerification/); });
await check("SQL is private, atomic, expiring, and cleans up", () => { assert.match(sql, /enable row level security/i); assert.match(sql, /revoke all[\s\S]+anon, authenticated/i); assert.match(sql, /on conflict \(key_hash\) do update/i); assert.match(sql, /expires_at <= v_now/i); assert.match(sql, /limit 200/i); });
await check("SQL avoids the PostgreSQL CURRENT_TIME keyword collision", () => { for (const source of [sql, repairSql]) { assert.match(source, /v_now timestamptz := clock_timestamp\(\)/i); assert.doesNotMatch(source, /\bcurrent_time\b/i); } });
await check("the live repair preserves the canonical RPC contract", () => { assert.match(repairSql, /create or replace function public\.consume_public_rate_limit\(\s*p_key_hash text,\s*p_action text,\s*p_limit integer,\s*p_window_seconds integer\s*\)\s*returns jsonb/i); });
await check("development RPC diagnostics are safe and production stays minimal", () => { for (const field of ["code", "message", "details", "hint"]) assert.match(serverSource, new RegExp(`errorField\\(error, \\"${field}\\"\\)`)); assert.match(serverSource, /process\.env\.NODE_ENV === "production"/); const diagnosticsSource = serverSource.slice(serverSource.indexOf("catch (error)")); assert.doesNotMatch(diagnosticsSource, /password|service.role|raw IP/i); });
await check("production and admin-login limiters use the shared RPC with no local counter", () => { assert.match(serverSource, /consume_public_rate_limit/); assert.match(adminLogin, /admin_login_source/); assert.doesNotMatch(serverSource + adminAuth, /new Map/); });

console.log(`Public abuse-protection checks passed (${checks.length}).`);
