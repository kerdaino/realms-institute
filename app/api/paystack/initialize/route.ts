import { NextResponse } from "next/server";

import { initializePaystackTransaction } from "@/lib/paystack";
import { consumePublicRateLimits, hashPublicSubmissionIdentifier, publicRequestSource } from "@/lib/publicRateLimit.server";
import { PUBLIC_RATE_LIMIT_MESSAGE } from "@/lib/publicRateLimitPolicy";
import { calculateCohortFee, generatePaymentReference, validateRegistrationPayload } from "@/lib/registration";
import { createRegistrationApplication, recordRegistrationPaymentInitialization, validateRegistrationApplicationForPayment } from "@/lib/saveRegistration";

function limited(retryAfterSeconds: number) {
  return NextResponse.json({ success: false, message: PUBLIC_RATE_LIMIT_MESSAGE }, { status: 429, headers: { "Retry-After": String(retryAfterSeconds) } });
}

function limiterUnavailable() {
  return NextResponse.json({ success: false, message: "Registration is temporarily unavailable. Please wait a little and try again." }, { status: 503 });
}

export async function POST(request: Request) {
  const source = publicRequestSource(request.headers);
  const sourceLimit = await consumePublicRateLimits([
    { policy: "registration_source", identifier: source },
    { policy: "paystack_initialize_source", identifier: source },
  ]);
  if (sourceLimit.status === "blocked") return limited(sourceLimit.retryAfterSeconds);
  if (sourceLimit.status === "unavailable") return limiterUnavailable();

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

  const emailLimit = await consumePublicRateLimits([
    { policy: "registration_email", identifier: validation.data.email },
    { policy: "paystack_initialize_email", identifier: validation.data.email },
  ]);
  if (emailLimit.status === "blocked") return limited(emailLimit.retryAfterSeconds);
  if (emailLimit.status === "unavailable") return limiterUnavailable();

  const requestObject = body && typeof body === "object" && !Array.isArray(body) ? body as Record<string, unknown> : {};
  const submittedId = typeof requestObject.submissionId === "string" && /^[0-9a-f-]{36}$/i.test(requestObject.submissionId) ? requestObject.submissionId : null;
  const submissionKeyHash = submittedId
    ? hashPublicSubmissionIdentifier("registration", JSON.stringify({ submittedId, registration: validation.data, fee: { amount: fee.amount, currency: fee.currency } }))
    : null;
  const reference = generatePaymentReference();
  const callbackUrl = new URL("/payment/verify", process.env.NEXT_PUBLIC_SITE_URL);
  callbackUrl.searchParams.set("reference", reference);
  const registration = validation.data;

  let application: Awaited<ReturnType<typeof createRegistrationApplication>>;
  try {
    application = await createRegistrationApplication(registration, fee, reference, submissionKeyHash);
  } catch (error) {
    console.error("Pre-payment application save failed", error);
    return NextResponse.json({ success: false, message: "Your application could not be saved safely, so payment was not started. Please try again or contact REALMS Institute." }, { status: 503 });
  }

  const paymentReference = application.paymentReference || reference;
  try {
    const savedState = await validateRegistrationApplicationForPayment({ applicationId: application.id, paymentReference, email: registration.email, amount: fee.amount, currency: fee.currency });
    if (savedState.authorizationUrl) {
      return NextResponse.json({ success: true, authorizationUrl: savedState.authorizationUrl, reference: paymentReference, applicationId: application.id, applicationReference: application.applicationReference, fee, reused: true });
    }
  } catch (error) {
    console.error("Saved application is not eligible for payment initialization", { applicationId: application.id, name: error instanceof Error ? error.message : "UnknownError" });
    return NextResponse.json({ success: false, message: "The saved application is not eligible for payment initialization. Please contact REALMS Institute." }, { status: 409 });
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

  console.log("Initializing REALMS payment", { reference: paymentReference, amount: fee.amount, currency: fee.currency, applicationId: application.id, source: metadata.source });
  let transaction: Awaited<ReturnType<typeof initializePaystackTransaction>>;
  try {
    callbackUrl.searchParams.set("reference", paymentReference);
    transaction = await initializePaystackTransaction({ email: registration.email, fee, reference: paymentReference, callbackUrl: callbackUrl.toString(), metadata });
  } catch (error) {
    console.error("Paystack initialization failed", error);
    return NextResponse.json({ success: false, message: "Unable to initialize payment. Please try again." }, { status: 502 });
  }
  try {
    await recordRegistrationPaymentInitialization(application.id, paymentReference, transaction.authorization_url);
  } catch (error) {
    // The browser already has a valid Paystack URL. Do not make it repeat a
    // successful external initialization solely because local recovery data
    // could not be saved; reference-bound verification remains authoritative.
    console.error("Paystack initialization recovery URL could not be saved", { applicationId: application.id, name: error instanceof Error ? error.name : "UnknownError" });
  }
  return NextResponse.json({ success: true, authorizationUrl: transaction.authorization_url, reference: transaction.reference, applicationId: application.id, applicationReference: application.applicationReference, fee });
}
