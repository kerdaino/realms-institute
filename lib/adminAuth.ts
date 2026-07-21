import "server-only";

import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";

export const ADMIN_SESSION_COOKIE = "realms_admin_session";
export const ADMIN_SIGNATURE_COOKIE = "realms_admin_session_signature";
export const ADMIN_SESSION_MAX_AGE = 60 * 60 * 24;
const ADMIN_LOGIN_WINDOW_MS = 15 * 60 * 1000;
const ADMIN_LOGIN_MAX_FAILURES = 5;
const adminLoginFailures = new Map<string, { failures: number; resetAt: number }>();

function signature(password: string) {
  return createHmac("sha256", password).update("realms_admin_session=true").digest("hex");
}

export function passwordsMatch(submitted: string, configured: string) {
  const submittedBuffer = Buffer.from(submitted);
  const configuredBuffer = Buffer.from(configured);
  return submittedBuffer.length === configuredBuffer.length && timingSafeEqual(submittedBuffer, configuredBuffer);
}

export function adminLoginRequestKey(headers: Headers) {
  const forwardedFor = headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
  const userAgent = headers.get("user-agent") || "unknown";
  return createHash("sha256").update(`${forwardedFor}|${userAgent}`).digest("hex");
}

export function adminLoginAllowed(key: string, timestamp = Date.now()) {
  const current = adminLoginFailures.get(key);
  if (!current || current.resetAt <= timestamp) {
    if (current) adminLoginFailures.delete(key);
    return true;
  }
  return current.failures < ADMIN_LOGIN_MAX_FAILURES;
}

export function recordAdminLoginFailure(key: string, timestamp = Date.now()) {
  const current = adminLoginFailures.get(key);
  if (!current || current.resetAt <= timestamp) {
    if (adminLoginFailures.size >= 10_000) {
      for (const [candidate, value] of adminLoginFailures) if (value.resetAt <= timestamp) adminLoginFailures.delete(candidate);
      if (adminLoginFailures.size >= 10_000) adminLoginFailures.delete(adminLoginFailures.keys().next().value as string);
    }
    adminLoginFailures.set(key, { failures: 1, resetAt: timestamp + ADMIN_LOGIN_WINDOW_MS });
    return;
  }
  current.failures += 1;
}

export function clearAdminLoginFailures(key: string) {
  adminLoginFailures.delete(key);
}

export function adminSessionSignature() {
  const password = process.env.REALMS_ADMIN_PASSWORD;
  return password ? signature(password) : null;
}

export async function isAdminAuthenticated() {
  const cookieStore = await cookies();
  const expected = adminSessionSignature();
  if (!expected) return false;
  const session = cookieStore.get(ADMIN_SESSION_COOKIE)?.value;
  const supplied = cookieStore.get(ADMIN_SIGNATURE_COOKIE)?.value ?? "";
  const expectedBuffer = Buffer.from(expected);
  const suppliedBuffer = Buffer.from(supplied);
  return session === "true" && suppliedBuffer.length === expectedBuffer.length && timingSafeEqual(suppliedBuffer, expectedBuffer);
}

export async function requireAdmin() {
  if (!(await isAdminAuthenticated())) redirect("/admin");
}
