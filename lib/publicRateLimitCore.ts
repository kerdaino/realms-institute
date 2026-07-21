import { createHmac } from "node:crypto";

export type SharedRateLimitRpc = (input: {
  keyHash: string;
  action: string;
  limit: number;
  windowSeconds: number;
}) => Promise<{ allowed: boolean; retryAfterSeconds: number }>;

export function hmacPublicIdentifier(secret: string, namespace: string, action: string, identifier: string) {
  return createHmac("sha256", secret)
    .update(`${namespace}:v1:${action}:${identifier.trim().toLowerCase()}`)
    .digest("hex");
}

export function hmacOpaqueIdentifier(secret: string, namespace: string, action: string, identifier: string) {
  return createHmac("sha256", secret)
    .update(`${namespace}:v1:${action}:${identifier}`)
    .digest("hex");
}

export async function consumeWithSharedRateLimitStore(input: {
  entries: Array<{ policy: string; identifier: string }>;
  policies: Record<string, { limit: number; windowSeconds: number }>;
  secret: string;
  rpc: SharedRateLimitRpc;
}) {
  let longestRetry = 0;
  for (const entry of input.entries) {
    const policy = input.policies[entry.policy];
    if (!policy) throw new Error(`UNKNOWN_RATE_LIMIT_POLICY:${entry.policy}`);
    const result = await input.rpc({
      keyHash: hmacPublicIdentifier(input.secret, "realms-public-rate-limit", entry.policy, entry.identifier),
      action: entry.policy,
      limit: policy.limit,
      windowSeconds: policy.windowSeconds,
    });
    if (!result.allowed) longestRetry = Math.max(longestRetry, result.retryAfterSeconds || policy.windowSeconds);
  }
  return longestRetry > 0 ? { allowed: false, retryAfterSeconds: longestRetry } : { allowed: true, retryAfterSeconds: 0 };
}
