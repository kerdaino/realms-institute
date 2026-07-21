import { NextResponse } from "next/server";

import { consumePublicRateLimits, hashPublicSubmissionIdentifier, publicRequestSource } from "@/lib/publicRateLimit.server";
import { PUBLIC_RATE_LIMIT_MESSAGE } from "@/lib/publicRateLimitPolicy";
import { calculateCohortFee, validateRegistrationPayload } from "@/lib/registration";
import { sendScholarshipApplicationEmailsIfNeeded } from "@/lib/registrationEmails";
import { createRegistrationApplication } from "@/lib/saveRegistration";

export async function POST(request: Request) {
  const sourceLimit = await consumePublicRateLimits([
    { policy: "registration_source", identifier: publicRequestSource(request.headers) },
    { policy: "scholarship_source", identifier: publicRequestSource(request.headers) },
  ]);
  if (sourceLimit.status === "blocked") return NextResponse.json({ success: false, message: PUBLIC_RATE_LIMIT_MESSAGE }, { status: 429, headers: { "Retry-After": String(sourceLimit.retryAfterSeconds) } });
  if (sourceLimit.status === "unavailable") return NextResponse.json({ success: false, message: "Scholarship applications are temporarily unavailable. Please wait a little and try again." }, { status: 503 });

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ success: false, message: "Please submit a valid registration form." }, { status: 400 });
  }

  const validation = validateRegistrationPayload(body);
  if (!validation.success) {
    if (process.env.NODE_ENV !== "production") console.warn("Scholarship application validation failed", { fields: Object.keys(validation.errors) });
    return NextResponse.json({ success: false, message: validation.message, errors: validation.errors }, { status: 400 });
  }
  if (validation.data.fundingRoute !== "scholarship_request") return NextResponse.json({ success: false, message: "A scholarship support request is required for this submission route." }, { status: 400 });
  const fee = calculateCohortFee(validation.data);
  if (!fee) return NextResponse.json({ success: false, message: "The selected learning mode could not be priced." }, { status: 400 });
  if (validation.data.scholarshipContributionAmount !== null && validation.data.scholarshipContributionAmount > fee.amount) {
    return NextResponse.json({ success: false, message: "The contribution amount cannot be greater than the registration/application fee." }, { status: 400 });
  }

  const emailLimit = await consumePublicRateLimits([
    { policy: "registration_email", identifier: validation.data.email },
    { policy: "scholarship_email", identifier: validation.data.email },
  ]);
  if (emailLimit.status === "blocked") return NextResponse.json({ success: false, message: PUBLIC_RATE_LIMIT_MESSAGE }, { status: 429, headers: { "Retry-After": String(emailLimit.retryAfterSeconds) } });
  if (emailLimit.status === "unavailable") return NextResponse.json({ success: false, message: "Scholarship applications are temporarily unavailable. Please wait a little and try again." }, { status: 503 });

  const requestObject = body && typeof body === "object" && !Array.isArray(body) ? body as Record<string, unknown> : {};
  const submittedId = typeof requestObject.submissionId === "string" && /^[0-9a-f-]{36}$/i.test(requestObject.submissionId) ? requestObject.submissionId : null;
  const submissionKeyHash = submittedId
    ? hashPublicSubmissionIdentifier("scholarship", JSON.stringify({ submittedId, registration: validation.data, fee: { amount: fee.amount, currency: fee.currency } }))
    : null;

  try {
    const application = await createRegistrationApplication(validation.data, fee, null, submissionKeyHash);
    const emailStatus = await sendScholarshipApplicationEmailsIfNeeded(application.id);
    return NextResponse.json({ success: true, applicationId: application.id, applicationReference: application.applicationReference, emailStatus, reused: application.reused, message: "Your application and scholarship request have been received." });
  } catch (error) {
    console.error("Scholarship application save failed", error);
    return NextResponse.json({ success: false, message: "Your scholarship request could not be saved. No payment was started. Please try again or contact REALMS Institute." }, { status: 503 });
  }
}
