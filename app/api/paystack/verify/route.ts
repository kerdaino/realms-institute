import { NextResponse, type NextRequest } from "next/server";

import { verifyPaystackTransaction } from "@/lib/paystack";
import { sendRegistrationEmailsIfNeeded, type RegistrationEmailStatus } from "@/lib/registrationEmails";
import { normalizePaystackRegistrationMetadata, saveVerifiedRegistrationFromPaystack, type RegistrationSaveResult } from "@/lib/saveRegistration";

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
  if (!reference || reference.length > 160 || !/^[A-Za-z0-9._-]+$/.test(reference)) {
    return NextResponse.json({ success: false, message: "A valid payment reference is required." }, { status: 400 });
  }

  if (!process.env.PAYSTACK_SECRET_KEY) {
    return NextResponse.json({ success: false, message: "Payment configuration is missing." }, { status: 500 });
  }

  try {
    const transaction = await verifyPaystackTransaction(reference);
    console.log("Paystack verify status:", transaction.status);
    console.log("Paystack verify reference:", transaction.reference);
    console.log("Paystack metadata keys:", transaction.metadata ? Object.keys(transaction.metadata) : null);
    console.log("Paystack metadata source:", transaction.metadata?.source);
    console.log("Paystack has registration metadata:", Boolean(transaction.metadata?.registration));

    if (transaction.status !== "success") {
      return NextResponse.json({ success: false, status: transaction.status, reference, message: "Payment was not successful or is still pending." });
    }

    const metadata = transaction.metadata ?? {};
    const normalized = normalizePaystackRegistrationMetadata(metadata);
    console.log("Normalized metadata valid:", normalized.isValid);
    console.log("Normalized metadata missing fields:", normalized.missingFields);
    console.log("Calculated fee display:", normalized.calculatedFee?.display);

    const registrationMatched = normalized.isValid;
    const paidAmount = normalized.calculatedFee?.amount ?? transaction.amount / 100;
    const paidCurrency = normalized.calculatedFee?.currency ?? transaction.currency;
    const paidDisplay = normalized.calculatedFee?.display ?? formatPaymentAmount(paidAmount, paidCurrency);
    const publicFeeDisplay = normalized.calculatedFee?.publicDisplay ?? paidDisplay;

    let registrationSave: RegistrationSaveResult = { saved: false, reason: "Payment confirmed, but registration metadata was not found." };
    if (registrationMatched) {
      try {
        registrationSave = await saveVerifiedRegistrationFromPaystack(transaction);
      } catch (saveError) {
        console.error("Supabase registration save failed:", saveError);
        registrationSave = { saved: false, reason: "Your payment was confirmed. If your application record does not appear automatically, REALMS Institute can still trace your registration using your payment reference." };
      }
    } else if (metadata && Object.keys(metadata).length > 0) {
      registrationSave = { saved: false, reason: "Payment confirmed, but registration metadata was invalid." };
    }
    console.log("Registration saved:", registrationSave);
    console.log("About to send registration emails:", Boolean(registrationSave?.saved && registrationSave.registration));
    console.log("Resend env present:", {
      hasApiKey: Boolean(process.env.RESEND_API_KEY),
      hasFromEmail: Boolean(process.env.RESEND_FROM_EMAIL),
      adminEmail: process.env.REALMS_ADMIN_EMAIL || "gloryrealm2025@gmail.com",
    });

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
      paymentConfirmed: true,
      reference: transaction.reference || reference,
      amount: paidAmount,
      currency: paidCurrency,
      display: paidDisplay,
      publicFeeDisplay,
      paidAt: transaction.paid_at ?? transaction.paidAt ?? null,
      customer: transaction.customer ?? null,
      metadata: normalized.isValid ? { ...metadata, registration: normalized.registration } : metadata,
      registrationMatched,
      registrationSave: publicRegistrationSave,
      emailStatus,
    });
  } catch (error) {
    console.error("Paystack verification failed", error);
    return NextResponse.json({ success: false, message: "Unable to verify payment. Please try again or contact REALMS Institute with your payment reference." }, { status: 502 });
  }
}
