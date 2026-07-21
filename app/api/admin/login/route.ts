import { NextResponse } from "next/server";

import { ADMIN_SESSION_COOKIE, ADMIN_SESSION_MAX_AGE, ADMIN_SIGNATURE_COOKIE, adminLoginAllowed, adminLoginRequestKey, adminSessionSignature, clearAdminLoginFailures, passwordsMatch, recordAdminLoginFailure } from "@/lib/adminAuth";

export async function POST(request: Request) {
  const configured = process.env.REALMS_ADMIN_PASSWORD;
  if (!configured) return NextResponse.json({ success: false, message: "Admin access is not configured." }, { status: 503 });
  const requestKey = adminLoginRequestKey(request.headers);
  if (!adminLoginAllowed(requestKey)) return NextResponse.json({ success: false, message: "Too many unsuccessful sign-in attempts. Please wait before trying again." }, { status: 429, headers: { "Retry-After": "900" } });

  let password = "";
  try {
    const body = await request.json();
    password = typeof body?.password === "string" ? body.password : "";
  } catch {
    return NextResponse.json({ success: false, message: "A password is required." }, { status: 400 });
  }
  if (!passwordsMatch(password, configured)) {
    recordAdminLoginFailure(requestKey);
    return NextResponse.json({ success: false, message: "Admin credentials could not be verified." }, { status: 401 });
  }
  clearAdminLoginFailures(requestKey);

  const response = NextResponse.json({ success: true });
  const options = { httpOnly: true, sameSite: "lax" as const, secure: process.env.NODE_ENV === "production", maxAge: ADMIN_SESSION_MAX_AGE, path: "/" };
  response.cookies.set(ADMIN_SESSION_COOKIE, "true", options);
  response.cookies.set(ADMIN_SIGNATURE_COOKIE, adminSessionSignature()!, options);
  return response;
}
