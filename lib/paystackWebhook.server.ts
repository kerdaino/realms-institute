import "server-only";

import { createHmac, timingSafeEqual } from "node:crypto";

export function validPaystackWebhookSignature(rawBody: string, suppliedSignature: string | null, secretKey: string) {
  if (!suppliedSignature || !/^[0-9a-f]{128}$/i.test(suppliedSignature)) return false;
  const expected = createHmac("sha512", secretKey).update(rawBody).digest("hex");
  const expectedBuffer = Buffer.from(expected, "hex");
  const suppliedBuffer = Buffer.from(suppliedSignature, "hex");
  return suppliedBuffer.length === expectedBuffer.length && timingSafeEqual(suppliedBuffer, expectedBuffer);
}
