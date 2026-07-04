import { NextResponse } from "next/server";

import { initializePaystackTransaction } from "@/lib/paystack";
import { calculateCohortFee, generatePaymentReference, validateRegistrationPayload } from "@/lib/registration";

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ success: false, message: "Please submit a valid registration form.", errors: { form: "Invalid request body." } }, { status: 400 });
  }

  const validation = validateRegistrationPayload(body);
  if (!validation.success) {
    return NextResponse.json({ success: false, message: validation.message, errors: validation.errors }, { status: 400 });
  }

  const fee = calculateCohortFee(validation.data);
  if (!fee) {
    return NextResponse.json({ success: false, message: "The selected learning mode could not be priced.", errors: { learningMode: "Please select a valid learning mode." } }, { status: 400 });
  }

  if (!process.env.PAYSTACK_SECRET_KEY || !process.env.NEXT_PUBLIC_SITE_URL) {
    return NextResponse.json({ success: false, message: "Payment configuration is missing." }, { status: 500 });
  }

  const reference = generatePaymentReference();
  const callbackUrl = new URL("/payment/verify", process.env.NEXT_PUBLIC_SITE_URL);
  callbackUrl.searchParams.set("reference", reference);

  try {
    const transaction = await initializePaystackTransaction({
      email: validation.data.email,
      fee,
      reference,
      callbackUrl: callbackUrl.toString(),
      registration: validation.data,
    });

    return NextResponse.json({
      success: true,
      authorizationUrl: transaction.authorization_url,
      reference: transaction.reference,
      fee,
    });
  } catch (error) {
    console.error("Paystack initialization failed", error);
    return NextResponse.json({ success: false, message: "Unable to initialize payment. Please try again." }, { status: 502 });
  }
}
