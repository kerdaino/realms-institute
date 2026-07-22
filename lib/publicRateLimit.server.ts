import "server-only";

import { consumeWithSharedRateLimitStore, hmacOpaqueIdentifier, hmacPublicIdentifier } from "@/lib/publicRateLimitCore";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";
import { publicRateLimitPolicies, type PublicRateLimitPolicy, type PublicRateLimitResult } from "@/lib/publicRateLimitPolicy";

type RateLimitEntry = { policy: PublicRateLimitPolicy; identifier: string };

function errorField(error: unknown, field: "code" | "message" | "details" | "hint") {
  if (!error || typeof error !== "object" || !(field in error)) return undefined;
  const value = (error as Record<string, unknown>)[field];
  return typeof value === "string" || value === null ? value : undefined;
}

function limiterSecret() {
  // A dedicated secret permits independent rotation. The existing service-role
  // key is a safe server-only fallback during deployment.
  return process.env.PUBLIC_RATE_LIMIT_SECRET || process.env.SUPABASE_SERVICE_ROLE_KEY || "";
}

export function publicRequestSource(headers: Headers) {
  const forwarded = headers.get("cf-connecting-ip")
    || headers.get("x-vercel-forwarded-for")
    || headers.get("x-forwarded-for")?.split(",")[0]
    || headers.get("x-real-ip")
    || "unknown";
  const source = forwarded.trim().slice(0, 128) || "unknown";
  if (source !== "unknown") return source;
  return `unknown:${(headers.get("user-agent") || "unknown").slice(0, 256)}`;
}

export function hashPublicRateLimitIdentifier(policy: PublicRateLimitPolicy, identifier: string) {
  const secret = limiterSecret();
  if (!secret) return null;
  return hmacPublicIdentifier(secret, "realms-public-rate-limit", policy, identifier);
}

export function hashPublicSubmissionIdentifier(kind: "registration" | "scholarship", identifier: string) {
  const secret = limiterSecret();
  if (!secret) return null;
  return hmacOpaqueIdentifier(secret, "realms-public-submission", kind, identifier);
}

export async function consumePublicRateLimits(entries: RateLimitEntry[]): Promise<PublicRateLimitResult> {
  const supabase = getSupabaseAdmin();
  if (!supabase || !limiterSecret()) return { status: "unavailable", retryAfterSeconds: 0 };

  try {
    const decision = await consumeWithSharedRateLimitStore({
      entries,
      policies: publicRateLimitPolicies,
      secret: limiterSecret(),
      rpc: async ({ keyHash, action, limit, windowSeconds }) => {
        const { data, error } = await supabase.rpc("consume_public_rate_limit", {
          p_key_hash: keyHash,
          p_action: action,
          p_limit: limit,
          p_window_seconds: windowSeconds,
        });
        if (error) throw error;
        if (!data || typeof data !== "object") throw Object.assign(new Error("RATE_LIMIT_RPC_INVALID_RESULT"), { code: "INVALID_RESULT" });
        const result = data as { allowed?: unknown; retry_after_seconds?: unknown };
        return { allowed: result.allowed === true, retryAfterSeconds: Number(result.retry_after_seconds) || 0 };
      },
    });
    return decision.allowed
      ? { status: "allowed", retryAfterSeconds: 0 }
      : { status: "blocked", retryAfterSeconds: Math.ceil(decision.retryAfterSeconds) };
  } catch (error) {
    const summary = {
      name: error instanceof Error ? error.name : "UnknownError",
      code: errorField(error, "code"),
    };
    console.error("Public rate-limit store unavailable", process.env.NODE_ENV === "production"
      ? summary
      : {
          ...summary,
          message: errorField(error, "message") ?? (error instanceof Error ? error.message : undefined),
          details: errorField(error, "details"),
          hint: errorField(error, "hint"),
        });
    return { status: "unavailable", retryAfterSeconds: 0 };
  }
}
