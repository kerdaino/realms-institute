import "server-only";

import { createHash } from "node:crypto";

const attempts = new Map<string, { count: number; resetAt: number }>();
const windowMs = 60_000;
const maximumAttempts = 20;

export function privacySafeRequestKey(input: string) { return createHash("sha256").update(input).digest("hex"); }
export function permitCertificateVerification(key: string, timestamp = Date.now()) { const current = attempts.get(key); if (!current || current.resetAt <= timestamp) { if (attempts.size >= 10_000) { for (const [candidate, value] of attempts) if (value.resetAt <= timestamp) attempts.delete(candidate); if (attempts.size >= 10_000) attempts.delete(attempts.keys().next().value as string); } attempts.set(key, { count: 1, resetAt: timestamp + windowMs }); return true; } if (current.count >= maximumAttempts) return false; current.count += 1; return true; }
