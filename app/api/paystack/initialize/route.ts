import { NextResponse } from "next/server";

import { duplicateApplicationMessage, DuplicateActiveApplicationError } from "@/lib/applicationLifecycle";
import { initializePaystackTransaction } from "@/lib/paystack";
import { paystackRegistrationMetadataSource } from "@/lib/paymentReconciliation";
import { consumePublicRateLimits, hashPublicSubmissionIdentifier, publicRequestSource } from "@/lib/publicRateLimit.server";
import { PUBLIC_RATE_LIMIT_MESSAGE } from "@/lib/publicRateLimitPolicy";
import { calculateCohortFee, generatePaymentReference, validateRegistrationPayload } from "@/lib/registration";
import { authorizeRegistrationRequest, RegistrationAccessError } from "@/lib/registrationControl.server";
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

  const requestObject = body && typeof body === "object" && !Array.isArray(body) ? body as Record<string, unknown> : {};
  const cohortId = typeof requestObject.cohortId === "string" ? requestObject.cohortId : "";
  const inviteToken = typeof requestObject.inviteToken === "string" && requestObject.inviteToken.trim() ? requestObject.inviteToken.trim() : null;
  let authorization: Awaited<ReturnType<typeof authorizeRegistrationRequest>>;
  try {
    authorization = await authorizeRegistrationRequest({ cohortId, inviteToken, applicantEmail: typeof requestObject.email === "string" ? requestObject.email : "" });
  } catch (error) {
    if (error instanceof RegistrationAccessError) return NextResponse.json({ success: false, message: error.message }, { status: error.status });
    console.error("Registration availability check failed", error);
    return limiterUnavailable();
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

  const submittedId = typeof requestObject.submissionId === "string" && /^[0-9a-f-]{36}$/i.test(requestObject.submissionId) ? requestObject.submissionId : null;
  const submissionKeyHash = submittedId
    ? hashPublicSubmissionIdentifier("registration", JSON.stringify({ submittedId, cohortId: authorization.cohort.id, inviteId: authorization.inviteId, registration: validation.data, fee: { amount: fee.amount, currency: fee.currency } }))
    : null;
  const reference = generatePaymentReference();
  const callbackUrl = new URL("/payment/verify", process.env.NEXT_PUBLIC_SITE_URL);
  callbackUrl.searchParams.set("reference", reference);
  const registration = validation.data;

  let application: Awaited<ReturnType<typeof createRegistrationApplication>>;
  try {
    application = await createRegistrationApplication(registration, fee, reference, {
      submissionKeyHash,
      cohort: { id: authorization.cohort.id, code: authorization.cohort.code, lateRegistrationInviteId: authorization.inviteId },
    });
  } catch (error) {
    if (error instanceof DuplicateActiveApplicationError) return NextResponse.json({ success: false, message: duplicateApplicationMessage }, { status: 409 });
    if (error instanceof Error && /REGISTRATION_CLOSED|REGISTRATION_COHORT_INVALID/.test(error.message)) return NextResponse.json({ success: false, message: "Registration for this cohort is currently closed." }, { status: 403 });
    if (error instanceof Error && /LATE_REGISTRATION_INVITE/.test(error.message)) return NextResponse.json({ success: false, message: "This private registration invitation is invalid, expired, revoked, or has already been used." }, { status: 403 });
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
    source: paystackRegistrationMetadataSource,
    registration_id: application.id,
    application_reference: application.applicationReference,
    cohort_id: authorization.cohort.id,
    cohort_code: authorization.cohort.code,
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
