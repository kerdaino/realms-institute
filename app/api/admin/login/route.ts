import { NextResponse } from "next/server";

import { ADMIN_SESSION_COOKIE, ADMIN_SESSION_MAX_AGE, ADMIN_SIGNATURE_COOKIE, adminSessionSignature, passwordsMatch } from "@/lib/adminAuth";
import { consumePublicRateLimits, publicRequestSource } from "@/lib/publicRateLimit.server";
import { PUBLIC_RATE_LIMIT_MESSAGE } from "@/lib/publicRateLimitPolicy";

export async function POST(request: Request) {
  const configured = process.env.REALMS_ADMIN_PASSWORD;
  if (!configured) return NextResponse.json({ success: false, message: "Admin access is not configured." }, { status: 503 });
  const limit = await consumePublicRateLimits([{ policy: "admin_login_source", identifier: publicRequestSource(request.headers) }]);
  if (limit.status === "blocked") return NextResponse.json({ success: false, message: PUBLIC_RATE_LIMIT_MESSAGE }, { status: 429, headers: { "Retry-After": String(limit.retryAfterSeconds) } });
  if (limit.status === "unavailable") return NextResponse.json({ success: false, message: "Admin sign-in is temporarily unavailable. Please wait a little and try again." }, { status: 503 });

  let password = "";
  try {
    const body = await request.json();
    password = typeof body?.password === "string" ? body.password : "";
  } catch {
    return NextResponse.json({ success: false, message: "A password is required." }, { status: 400 });
  }
  if (!passwordsMatch(password, configured)) {
    return NextResponse.json({ success: false, message: "Admin credentials could not be verified." }, { status: 401 });
  }

  const response = NextResponse.json({ success: true });
  const options = { httpOnly: true, sameSite: "lax" as const, secure: process.env.NODE_ENV === "production", maxAge: ADMIN_SESSION_MAX_AGE, path: "/" };
  response.cookies.set(ADMIN_SESSION_COOKIE, "true", options);
  response.cookies.set(ADMIN_SIGNATURE_COOKIE, adminSessionSignature()!, options);
  return response;
}
