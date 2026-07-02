import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";

import { calculateCohortFee, validateRegistration } from "@/lib/registration";

export async function POST(request: Request) {
  const secretKey = process.env.PAYSTACK_SECRET_KEY;
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL;
  if (!secretKey || !siteUrl) {
    return NextResponse.json({ error: "Payment service is not configured." }, { status: 503 });
  }

  let body: unknown;
  try { body = await request.json(); } catch { return NextResponse.json({ error: "Invalid request body." }, { status: 400 }); }
  const registration = validateRegistration(body);
  if (!registration) return NextResponse.json({ error: "Please complete every required field correctly." }, { status: 400 });
  const fee = calculateCohortFee(registration.country, registration.learningMode);
  if (!fee) return NextResponse.json({ error: "The selected learning mode could not be priced." }, { status: 400 });

  const reference = `REALMS-${Date.now()}-${randomUUID().slice(0, 8)}`;
  const callbackUrl = new URL("/payment/verify", siteUrl).toString();
  const payload: Record<string, unknown> = {
    email: registration.email,
    amount: fee.amount * 100,
    currency: fee.currency,
    reference,
    callback_url: callbackUrl,
    metadata: {
      registration,
      learningMode: registration.learningMode,
      skillPathway: registration.skillPathway,
      calculatedFee: fee.amount,
      currency: fee.currency,
    },
  };
  if (process.env.PAYSTACK_REALMS_SUBACCOUNT) payload.subaccount = process.env.PAYSTACK_REALMS_SUBACCOUNT;

  try {
    const response = await fetch("https://api.paystack.co/transaction/initialize", {
      method: "POST",
      headers: { Authorization: `Bearer ${secretKey}`, "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      cache: "no-store",
    });
    const result = await response.json();
    if (!response.ok || !result.status || !result.data?.authorization_url) {
      return NextResponse.json({ error: result.message || "Payment could not be initialized." }, { status: 502 });
    }
    return NextResponse.json({ authorization_url: result.data.authorization_url, reference });
  } catch {
    return NextResponse.json({ error: "Payment service is temporarily unavailable." }, { status: 502 });
  }
}
