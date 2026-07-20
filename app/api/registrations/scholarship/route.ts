import { NextResponse } from "next/server";

import { calculateCohortFee, validateRegistrationPayload } from "@/lib/registration";
import { sendScholarshipApplicationEmailsIfNeeded } from "@/lib/registrationEmails";
import { createRegistrationApplication } from "@/lib/saveRegistration";

export async function POST(request: Request) {
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

  try {
    const application = await createRegistrationApplication(validation.data, fee, null);
    const emailStatus = await sendScholarshipApplicationEmailsIfNeeded(application.id);
    return NextResponse.json({ success: true, applicationId: application.id, applicationReference: application.applicationReference, emailStatus, message: "Your application and scholarship request have been received." });
  } catch (error) {
    console.error("Scholarship application save failed", error);
    return NextResponse.json({ success: false, message: "Your scholarship request could not be saved. No payment was started. Please try again or contact REALMS Institute." }, { status: 503 });
  }
}
