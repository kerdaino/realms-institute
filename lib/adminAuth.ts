import "server-only";

import { createHmac, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";

export const ADMIN_SESSION_COOKIE = "realms_admin_session";
export const ADMIN_SIGNATURE_COOKIE = "realms_admin_session_signature";
export const ADMIN_SESSION_MAX_AGE = 60 * 60 * 24;

function signature(password: string) {
  return createHmac("sha256", password).update("realms_admin_session=true").digest("hex");
}

export function passwordsMatch(submitted: string, configured: string) {
  const submittedBuffer = Buffer.from(submitted);
  const configuredBuffer = Buffer.from(configured);
  return submittedBuffer.length === configuredBuffer.length && timingSafeEqual(submittedBuffer, configuredBuffer);
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
