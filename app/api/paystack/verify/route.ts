import { NextResponse } from "next/server";

import { verifyPaystackTransaction } from "@/lib/paystack";
import { calculateCohortFee, validateRegistrationPayload } from "@/lib/registration";
import { sendRegistrationEmailsIfNeeded, type RegistrationEmailStatus } from "@/lib/registrationEmails";
import { saveVerifiedRegistrationFromPaystack, type RegistrationSaveResult } from "@/lib/saveRegistration";

export async function GET(request: Request) {
  if (!process.env.PAYSTACK_SECRET_KEY) {
    return NextResponse.json({ success: false, message: "Payment configuration is missing." }, { status: 500 });
  }

  const reference = new URL(request.url).searchParams.get("reference")?.trim();
  if (!reference || reference.length > 160 || !/^[A-Za-z0-9._-]+$/.test(reference)) {
    return NextResponse.json({ success: false, message: "A valid payment reference is required." }, { status: 400 });
  }

  try {
    const transaction = await verifyPaystackTransaction(reference);
    if (transaction.status !== "success") {
      return NextResponse.json({ success: false, status: transaction.status, reference, message: "Payment was not successful or is still pending." });
    }

    const metadata = transaction.metadata ?? {};
    const validation = validateRegistrationPayload(metadata.registration);
    const expectedFee = validation.success ? calculateCohortFee(validation.data) : null;
    const amountMatches = expectedFee !== null
      && transaction.amount === expectedFee.amount * 100
      && transaction.currency === expectedFee.currency;

    if (!validation.success || !amountMatches) {
      return NextResponse.json({ success: false, status: "failed", reference, message: "Payment details could not be matched to a valid REALMS registration." });
    }

    let registrationSave: RegistrationSaveResult;
    try {
      registrationSave = await saveVerifiedRegistrationFromPaystack(transaction);
    } catch (saveError) {
      console.error("Supabase registration save failed after confirmed payment", saveError);
      registrationSave = { saved: false, reason: "Payment confirmed, but registration could not be saved automatically." };
    }

    let emailStatus: RegistrationEmailStatus = {
      applicant: { sent: false, reason: "Supabase is required to prevent duplicate emails." },
      admin: { sent: false, reason: "Supabase is required to prevent duplicate emails." },
    };
    if (registrationSave.saved) {
      emailStatus = await sendRegistrationEmailsIfNeeded(registrationSave.registration);
    }

    const publicRegistrationSave = registrationSave.saved
      ? { saved: true as const, id: registrationSave.id }
      : registrationSave;

    return NextResponse.json({
      success: true,
      status: "success",
      reference: transaction.reference || reference,
      amount: expectedFee.amount,
      currency: expectedFee.currency,
      display: expectedFee.display,
      paidAt: transaction.paid_at ?? transaction.paidAt ?? null,
      customer: transaction.customer ?? null,
      metadata,
      registrationSave: publicRegistrationSave,
      emailStatus,
    });
  } catch (error) {
    console.error("Paystack verification failed", error);
    return NextResponse.json({ success: false, message: "Unable to verify payment. Please try again or contact REALMS Institute with your payment reference." }, { status: 502 });
  }
}
