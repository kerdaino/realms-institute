import { NextResponse } from "next/server";

import { initializePaystackTransaction } from "@/lib/paystack";
import { calculateCohortFee, generatePaymentReference, validateRegistrationPayload } from "@/lib/registration";
import { createRegistrationApplication } from "@/lib/saveRegistration";

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ success: false, message: "Please submit a valid registration form.", errors: { form: "Invalid request body." } }, { status: 400 });
  }

  const validation = validateRegistrationPayload(body);
  if (!validation.success) return NextResponse.json({ success: false, message: validation.message, errors: validation.errors }, { status: 400 });
  if (validation.data.fundingRoute !== "self_pay") {
    return NextResponse.json({ success: false, message: "Scholarship requests must be submitted for review without starting Paystack." }, { status: 400 });
  }

  const fee = calculateCohortFee(validation.data);
  if (!fee) return NextResponse.json({ success: false, message: "The selected learning mode could not be priced.", errors: { learningMode: "Please select a valid learning mode." } }, { status: 400 });
  if (!process.env.PAYSTACK_SECRET_KEY || !process.env.NEXT_PUBLIC_SITE_URL) return NextResponse.json({ success: false, message: "Payment configuration is missing." }, { status: 500 });

  const reference = generatePaymentReference();
  const callbackUrl = new URL("/payment/verify", process.env.NEXT_PUBLIC_SITE_URL);
  callbackUrl.searchParams.set("reference", reference);
  const registration = validation.data;

  let application: { id: string; applicationReference: string };
  try {
    application = await createRegistrationApplication(registration, fee, reference);
  } catch (error) {
    console.error("Pre-payment application save failed", error);
    return NextResponse.json({ success: false, message: "Your application could not be saved safely, so payment was not started. Please try again or contact REALMS Institute." }, { status: 503 });
  }

  const calculatedFee = {
    amount: fee.amount,
    currency: fee.currency,
    display: fee.display,
    publicDisplay: "publicDisplay" in fee ? fee.publicDisplay : fee.display,
    exchangeRate: "exchangeRate" in fee ? fee.exchangeRate : undefined,
    exchangeNote: "exchangeNote" in fee ? fee.exchangeNote : undefined,
  };
  const metadata = {
    source: "realms_august_2026_registration",
    registration_id: application.id,
    application_reference: application.applicationReference,
    applicant_type: registration.applicantType,
    calculated_fee: calculatedFee,
  };

  console.log("Initializing REALMS payment:", { email: registration.email, reference, amount: fee.amount, currency: fee.currency, applicationId: application.id, source: metadata.source });
  try {
    const transaction = await initializePaystackTransaction({ email: registration.email, fee, reference, callbackUrl: callbackUrl.toString(), metadata });
    return NextResponse.json({ success: true, authorizationUrl: transaction.authorization_url, reference: transaction.reference, applicationId: application.id, applicationReference: application.applicationReference, fee });
  } catch (error) {
    console.error("Paystack initialization failed", error);
    return NextResponse.json({ success: false, message: "Unable to initialize payment. Please try again." }, { status: 502 });
  }
}
