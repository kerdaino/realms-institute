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
  const registration = validation.data;
  const metadata = {
    source: "realms_next_cohort_registration",
    registration: {
      fullName: registration.fullName,
      email: registration.email,
      whatsapp: registration.whatsapp,
      country: registration.country,
      city: registration.city,
      gender: registration.gender,
      ageRange: registration.ageRange,
      church: registration.church,
      learningMode: registration.learningMode,
      skillPathway: registration.skillPathway,
      reason: registration.reason,
      referralSource: registration.referralSource,
      consent: registration.consent,
      feePolicyConsent: registration.feePolicyConsent,
      computerAccessConfirmed: registration.computerAccessConfirmed,
    },
    calculatedFee: {
      amount: fee.amount,
      currency: fee.currency,
      display: fee.display,
      publicDisplay: "publicDisplay" in fee ? fee.publicDisplay : fee.display,
      exchangeRate: "exchangeRate" in fee ? fee.exchangeRate : undefined,
      exchangeNote: "exchangeNote" in fee ? fee.exchangeNote : undefined,
    },
  };

  console.log("Initializing REALMS payment:", {
    email: registration.email,
    reference,
    amount: fee.amount,
    currency: fee.currency,
    hasRegistrationMetadata: Boolean(metadata.registration),
    source: metadata.source,
  });

  try {
    const transaction = await initializePaystackTransaction({
      email: registration.email,
      fee,
      reference,
      callbackUrl: callbackUrl.toString(),
      metadata,
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
