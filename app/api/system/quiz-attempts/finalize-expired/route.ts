import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";

import { lmsApiError } from "@/lib/lms/apiResponse";
import { finalizeExpiredQuizAttempts } from "@/lib/lms/assessmentService";
import { requireLmsAdminClient } from "@/lib/lms/adminData";

function secretsMatch(supplied: string, expected: string) {
  const suppliedBuffer = Buffer.from(supplied);
  const expectedBuffer = Buffer.from(expected);
  return suppliedBuffer.length === expectedBuffer.length && timingSafeEqual(suppliedBuffer, expectedBuffer);
}

export async function POST(request: Request) {
  const expected = process.env.QUIZ_EXPIRY_CRON_SECRET;
  if (!expected) return NextResponse.json({ message: "Quiz expiry finalisation is not configured." }, { status: 503 });
  const supplied = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ?? "";
  if (!secretsMatch(supplied, expected)) return NextResponse.json({ message: "Unauthorized." }, { status: 401 });
  try {
    return NextResponse.json(await finalizeExpiredQuizAttempts(requireLmsAdminClient()));
  } catch (error) {
    return lmsApiError(error, "Expired quiz attempts could not be finalised.");
  }
}

export const GET = POST;
