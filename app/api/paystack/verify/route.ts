import { NextResponse } from "next/server";

import { calculateCohortFee, validateRegistration } from "@/lib/registration";

export async function GET(request: Request) {
  const secretKey = process.env.PAYSTACK_SECRET_KEY;
  if (!secretKey) return NextResponse.json({ error: "Payment service is not configured." }, { status: 503 });
  const reference = new URL(request.url).searchParams.get("reference")?.trim();
  if (!reference || reference.length > 160 || !/^[A-Za-z0-9._-]+$/.test(reference)) {
    return NextResponse.json({ error: "A valid payment reference is required." }, { status: 400 });
  }
  try {
    const response = await fetch(`https://api.paystack.co/transaction/verify/${encodeURIComponent(reference)}`, {
      headers: { Authorization: `Bearer ${secretKey}` }, cache: "no-store",
    });
    const result = await response.json();
    if (!response.ok || !result.status) return NextResponse.json({ status: "failed", reference, message: result.message || "Payment was not confirmed." }, { status: 200 });
    const registration = validateRegistration(result.data?.metadata?.registration);
    const expectedFee = registration
      ? calculateCohortFee(registration.country, registration.learningMode)
      : null;
    const paid = result.data?.status === "success"
      && expectedFee !== null
      && result.data?.amount === expectedFee.amount * 100
      && result.data?.currency === expectedFee.currency;
    return NextResponse.json({
      status: paid ? "success" : "failed",
      reference,
      metadata: paid ? result.data.metadata ?? null : null,
      payment: paid ? {
        amount: expectedFee.amount,
        currency: expectedFee.currency,
        display: expectedFee.display,
      } : null,
    });
  } catch {
    return NextResponse.json({ error: "Payment verification is temporarily unavailable." }, { status: 502 });
  }
}
