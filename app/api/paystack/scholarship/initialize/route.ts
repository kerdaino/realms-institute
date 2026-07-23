import { NextResponse } from "next/server";

import { initializeScholarshipPayment } from "@/lib/scholarshipPayment.server";
import { consumePublicRateLimits, publicRequestSource } from "@/lib/publicRateLimit.server";
import { PUBLIC_RATE_LIMIT_MESSAGE } from "@/lib/publicRateLimitPolicy";

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const token = body && typeof body === "object" && !Array.isArray(body) && typeof (body as Record<string, unknown>).token === "string"
    ? (body as Record<string, string>).token.trim()
    : "";
  if (!token || token.length > 1024) return NextResponse.json({ success: false, message: "A valid scholarship payment link is required." }, { status: 400 });

  const rateLimit = await consumePublicRateLimits([
    { policy: "scholarship_payment_source", identifier: publicRequestSource(request.headers) },
    { policy: "scholarship_payment_token", identifier: token },
  ]);
  if (rateLimit.status === "blocked") return NextResponse.json({ success: false, message: PUBLIC_RATE_LIMIT_MESSAGE }, { status: 429, headers: { "Retry-After": String(rateLimit.retryAfterSeconds) } });
  if (rateLimit.status === "unavailable") return NextResponse.json({ success: false, message: "Secure payment initialization is temporarily unavailable. Please wait a little and try again." }, { status: 503 });

  const result = await initializeScholarshipPayment(token);
  if (!result.success) return NextResponse.json(result, { status: result.status });
  return NextResponse.json(result);
}
