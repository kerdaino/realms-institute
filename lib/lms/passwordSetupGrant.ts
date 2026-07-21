import "server-only";

import { createHmac, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";

import { normalizePortalSetupContext, type PortalSetupContext } from "@/lib/lms/portalAuthPolicy";

const grantCookie = "realms_password_setup_grant";
const grantLifetimeSeconds = 20 * 60;

type GrantPayload = { userId: string; context: PortalSetupContext; expiresAt: number };

function signingKey() {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!key) throw new Error("Password setup is not configured.");
  return key;
}

function sign(value: string) {
  return createHmac("sha256", signingKey()).update(value).digest("base64url");
}

function encodeGrant(payload: GrantPayload) {
  const value = Buffer.from(JSON.stringify(payload)).toString("base64url");
  return `${value}.${sign(value)}`;
}

function decodeGrant(value: string | undefined): GrantPayload | null {
  if (!value) return null;
  const [payloadValue, suppliedSignature, extra] = value.split(".");
  if (!payloadValue || !suppliedSignature || extra) return null;
  const expected = Buffer.from(sign(payloadValue));
  const supplied = Buffer.from(suppliedSignature);
  if (expected.length !== supplied.length || !timingSafeEqual(expected, supplied)) return null;
  try {
    const raw = JSON.parse(Buffer.from(payloadValue, "base64url").toString("utf8")) as Record<string, unknown>;
    if (typeof raw.userId !== "string" || typeof raw.expiresAt !== "number" || raw.expiresAt <= Date.now()) return null;
    return { userId: raw.userId, expiresAt: raw.expiresAt, context: normalizePortalSetupContext(raw.context) };
  } catch {
    return null;
  }
}

export async function issuePasswordSetupGrant(userId: string, context: PortalSetupContext) {
  const cookieStore = await cookies();
  cookieStore.set(grantCookie, encodeGrant({ userId, context, expiresAt: Date.now() + grantLifetimeSeconds * 1000 }), {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/auth/setup-password",
    maxAge: grantLifetimeSeconds,
  });
}

export async function readPasswordSetupGrant(userId: string) {
  const cookieStore = await cookies();
  const grant = decodeGrant(cookieStore.get(grantCookie)?.value);
  return grant?.userId === userId ? grant : null;
}

export async function clearPasswordSetupGrant() {
  const cookieStore = await cookies();
  cookieStore.set(grantCookie, "", { httpOnly: true, sameSite: "lax", path: "/auth/setup-password", maxAge: 0 });
}
