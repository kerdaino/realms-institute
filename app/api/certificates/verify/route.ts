import { verifyPublicAward } from "@/lib/lms/awardService";
import { lmsApiError } from "@/lib/lms/apiResponse";
import { requireLmsAdminClient } from "@/lib/lms/adminData";
import { consumePublicRateLimits, publicRequestSource } from "@/lib/publicRateLimit.server";
import { PUBLIC_RATE_LIMIT_MESSAGE } from "@/lib/publicRateLimitPolicy";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const value = url.searchParams.get("code")?.trim();
  if (!value) return Response.json({ message: "Enter a verification code or award number." }, { status: 400 });
  const limit = await consumePublicRateLimits([{ policy: "certificate_source", identifier: publicRequestSource(request.headers) }]);
  if (limit.status === "blocked") return Response.json({ message: PUBLIC_RATE_LIMIT_MESSAGE }, { status: 429, headers: { "Retry-After": String(limit.retryAfterSeconds) } });
  // Public verification remains readable if the abuse store is temporarily down.
  try {
    return Response.json(await verifyPublicAward(requireLmsAdminClient(), value), { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return lmsApiError(error, "Certificate verification is temporarily unavailable.");
  }
}
