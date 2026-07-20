import { NextResponse, type NextRequest } from "next/server";

import { verifyPaystackTransaction } from "@/lib/paystack";
import { sendRegistrationEmailsIfNeeded, type RegistrationEmailStatus } from "@/lib/registrationEmails";
import { resolvePaystackRegistration, saveVerifiedRegistrationFromPaystack, type RegistrationSaveResult } from "@/lib/saveRegistration";

function formatPaymentAmount(amount: number, currency: string) {
  try {
    return new Intl.NumberFormat("en", { style: "currency", currency }).format(amount);
  } catch {
    return `${currency} ${amount.toLocaleString("en")}`;
  }
}

export async function GET(request: NextRequest) {
  const reference = request.nextUrl.searchParams.get("reference")?.trim() ?? "";
  console.log("Verifying Paystack reference:", reference);
  if (!reference || reference.length > 160 || !/^[A-Za-z0-9._-]+$/.test(reference)) return NextResponse.json({ success: false, message: "A valid payment reference is required." }, { status: 400 });
  if (!process.env.PAYSTACK_SECRET_KEY) return NextResponse.json({ success: false, message: "Payment configuration is missing." }, { status: 500 });

  try {
    const transaction = await verifyPaystackTransaction(reference);
    console.log("Paystack verify result:", { status: transaction.status, reference: transaction.reference, metadataSource: transaction.metadata?.source });
    if (transaction.status !== "success") return NextResponse.json({ success: false, status: transaction.status, reference, message: "Payment was not successful or is still pending." });
    if (transaction.reference !== reference) return NextResponse.json({ success: false, message: "The verified payment reference did not match the requested reference." }, { status: 409 });

    const metadata = transaction.metadata ?? {};
    const normalized = await resolvePaystackRegistration(metadata, reference);
    const registrationMatched = normalized.isValid;
    if (normalized.isValid && normalized.calculatedFee) {
      const expectedKobo = Math.round(normalized.calculatedFee.amount * 100);
      if (transaction.amount !== expectedKobo || transaction.currency.toUpperCase() !== normalized.calculatedFee.currency.toUpperCase()) {
        console.error("Paystack amount or currency mismatch", { reference, expectedKobo, receivedKobo: transaction.amount, expectedCurrency: normalized.calculatedFee.currency, receivedCurrency: transaction.currency });
        return NextResponse.json({ success: false, message: "The payment amount could not be matched to this application. Please contact REALMS Institute with your payment reference." }, { status: 409 });
      }
    }

    const paidAmount = transaction.amount / 100;
    const paidCurrency = transaction.currency;
    const paidDisplay = formatPaymentAmount(paidAmount, paidCurrency);
    const publicFeeDisplay = normalized.calculatedFee?.publicDisplay ?? paidDisplay;
    let registrationSave: RegistrationSaveResult = { saved: false, reason: "Payment confirmed, but registration metadata was not found." };
    if (registrationMatched) {
      try {
        registrationSave = await saveVerifiedRegistrationFromPaystack(transaction, normalized);
      } catch (saveError) {
        console.error("Supabase registration save failed:", saveError);
        registrationSave = { saved: false, reason: "Your payment was confirmed. If your application record does not appear automatically, REALMS Institute can still trace your registration using your payment reference." };
      }
    } else if (metadata && Object.keys(metadata).length > 0) {
      registrationSave = { saved: false, reason: "Payment confirmed, but the saved application details could not be matched." };
    }

    let emailStatus: RegistrationEmailStatus = {
      applicant: { sent: false, reason: "Supabase is required to prevent duplicate emails." },
      admin: { sent: false, reason: "Supabase is required to prevent duplicate emails." },
    };
    if (registrationSave.saved) emailStatus = await sendRegistrationEmailsIfNeeded(registrationSave.registration);
    const publicRegistrationSave = registrationSave.saved ? { saved: true as const, id: registrationSave.id } : registrationSave;

    return NextResponse.json({
      success: true,
      status: "success",
      paymentConfirmed: true,
      reference: transaction.reference || reference,
      amount: paidAmount,
      currency: paidCurrency,
      display: paidDisplay,
      publicFeeDisplay,
      paidAt: transaction.paid_at ?? transaction.paidAt ?? null,
      customer: transaction.customer ?? null,
      metadata: normalized.isValid ? {
        source: metadata.source,
        registrationId: normalized.applicationId,
        applicationReference: normalized.applicationReference,
        registration: {
          fullName: normalized.registration.fullName,
          email: normalized.registration.email,
          whatsapp: normalized.registration.whatsapp,
          learningMode: normalized.registration.learningMode,
          skillPathway: normalized.registration.skillPathway,
          requestedDiscipleshipRoute: normalized.registration.requestedDiscipleshipRoute,
          screeningStatus: normalized.registration.screeningStatus,
        },
      } : { source: metadata.source },
      registrationMatched,
      registrationSave: publicRegistrationSave,
      emailStatus,
    });
  } catch (error) {
    console.error("Paystack verification failed", error);
    return NextResponse.json({ success: false, message: "Unable to verify payment. Please try again or contact REALMS Institute with your payment reference." }, { status: 502 });
  }
}
