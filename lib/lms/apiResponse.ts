import { NextResponse } from "next/server";

import { LmsAdminDataError } from "@/lib/lms/adminData";

export function lmsApiError(error: unknown, fallback: string) {
  if (error instanceof LmsAdminDataError) return NextResponse.json({ message: error.message }, { status: error.status });
  console.error(fallback, error instanceof Error ? { name: error.name, message: error.message } : { name: "UnknownError" });
  return NextResponse.json({ message: fallback }, { status: 500 });
}

export async function readJsonObject(request: Request) {
  const body = await request.json().catch(() => null);
  return body && typeof body === "object" && !Array.isArray(body) ? body as Record<string, unknown> : null;
}
