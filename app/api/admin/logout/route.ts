import { NextResponse } from "next/server";

import { ADMIN_SESSION_COOKIE, ADMIN_SIGNATURE_COOKIE } from "@/lib/adminAuth";

export async function POST(request: Request) {
  const response = NextResponse.redirect(new URL("/admin", request.url), 303);
  const options = { httpOnly: true, sameSite: "lax" as const, secure: process.env.NODE_ENV === "production", maxAge: 0, path: "/" };
  response.cookies.set(ADMIN_SESSION_COOKIE, "", options);
  response.cookies.set(ADMIN_SIGNATURE_COOKIE, "", options);
  return response;
}
