import { NextResponse, type NextRequest } from "next/server";

import { verifyPaystackTransaction } from "@/lib/paystack";
import { hasExpectedPaystackRegistrationSource, reconcileRegistrationPayment } from "@/lib/paymentReconciliation";
import { consumePublicRateLimits, publicRequestSource } from "@/lib/publicRateLimit.server";
import { PUBLIC_RATE_LIMIT_MESSAGE } from "@/lib/publicRateLimitPolicy";
import { sendRegistrationEmailsIfNeeded, type RegistrationEmailStatus } from "@/lib/registrationEmails";
import { PaymentRegistrationConflictError, recordUnconfirmedRegistrationPayment, resolvePaystackRegistration, saveVerifiedRegistrationFromPaystack, type RegistrationSaveResult } from "@/lib/saveRegistration";

const unmatchedPaymentMessage = "We could not match this payment to your registration. Please contact REALMS Institute with your payment reference.";
const underpaymentMessage = "The amount received was below the required registration fee. Please contact REALMS Institute with your payment reference.";
const currencyMismatchMessage = "We could not verify this payment in the required currency. Please contact REALMS Institute with your payment reference.";

function formatPaymentAmount(amount: number, currency: string) {
  try {
    return new Intl.NumberFormat("en", { style: "currency", currency }).format(amount);
  } catch {
    return `${currency} ${amount.toLocaleString("en")}`;
  }
}

export async function GET(request: NextRequest) {
  const reference = request.nextUrl.searchParams.get("reference")?.trim() ?? "";
  console.info("Paystack verification reference received", { reference: reference || null });
  if (!reference || reference.length > 160 || !/^[A-Za-z0-9._-]+$/.test(reference)) return NextResponse.json({ success: false, message: "A valid payment reference is required." }, { status: 400 });
  if (!process.env.PAYSTACK_SECRET_KEY) return NextResponse.json({ success: false, message: "Payment configuration is missing." }, { status: 500 });

  const rateLimit = await consumePublicRateLimits([
    { policy: "paystack_verify_source", identifier: publicRequestSource(request.headers) },
    { policy: "paystack_verify_reference", identifier: reference },
  ]);
  if (rateLimit.status === "blocked") return NextResponse.json({ success: false, message: PUBLIC_RATE_LIMIT_MESSAGE }, { status: 429, headers: { "Retry-After": String(rateLimit.retryAfterSeconds) } });
  // Verification deliberately fails open when the limiter store is unavailable:
  // a confirmed payment must remain recoverable from a later redirect/reload.

  try {
    const transaction = await verifyPaystackTransaction(reference);
    console.info("Paystack verification result", { status: transaction.status, reference: transaction.reference });
    if (transaction.status !== "success") return NextResponse.json({ success: false, status: transaction.status, reference, message: "Payment was not successful or is still pending." });
    if (transaction.reference !== reference) {
      console.error("Paystack transaction reference mismatch", { reference, verifiedReference: transaction.reference });
      return NextResponse.json({ success: false, message: unmatchedPaymentMessage }, { status: 409 });
    }

    const metadata = transaction.metadata ?? {};
    if (!hasExpectedPaystackRegistrationSource(metadata)) {
      console.error("Paystack registration metadata source mismatch", { reference });
      return NextResponse.json({ success: false, message: unmatchedPaymentMessage }, { status: 409 });
    }

    const normalized = await resolvePaystackRegistration(metadata, reference);
    if (!normalized.isValid || !normalized.applicationId || !normalized.calculatedFee) {
      console.error("Paystack registration application unmatched", { reference });
      return NextResponse.json({ success: false, message: unmatchedPaymentMessage }, { status: 409 });
    }

    const reconciliation = reconcileRegistrationPayment({
      expectedKobo: normalized.calculatedFee.amount * 100,
      receivedKobo: transaction.amount,
      expectedCurrency: normalized.calculatedFee.currency,
      receivedCurrency: transaction.currency,
    });
    if (reconciliation.varianceType === "currency_mismatch") {
      console.error("Paystack currency mismatch", { reference, expectedCurrency: reconciliation.expectedCurrency, receivedCurrency: reconciliation.receivedCurrency });
      try { await recordUnconfirmedRegistrationPayment(transaction, normalized, reconciliation); } catch { console.error("Paystack currency mismatch could not be recorded", { reference }); }
      return NextResponse.json({ success: false, message: currencyMismatchMessage }, { status: 409 });
    }
    if (reconciliation.varianceType === "underpayment") {
      console.error("Paystack payment underpaid", { reference, expectedKobo: reconciliation.expectedKobo, receivedKobo: reconciliation.receivedKobo, shortfallKobo: reconciliation.shortfallKobo, currency: reconciliation.receivedCurrency });
      try { await recordUnconfirmedRegistrationPayment(transaction, normalized, reconciliation); } catch { console.error("Paystack underpayment could not be recorded", { reference }); }
      return NextResponse.json({ success: false, message: underpaymentMessage }, { status: 409 });
    }
    if (reconciliation.varianceType === "overpayment") console.info("Paystack payment verified with excess amount", { reference, expectedKobo: reconciliation.expectedKobo, receivedKobo: reconciliation.receivedKobo, excessKobo: reconciliation.excessKobo, currency: reconciliation.receivedCurrency });
    else console.info("Paystack payment verified exact", { reference, expectedKobo: reconciliation.expectedKobo, receivedKobo: reconciliation.receivedKobo, currency: reconciliation.receivedCurrency });

    let registrationSave: RegistrationSaveResult;
    try {
      registrationSave = await saveVerifiedRegistrationFromPaystack(transaction, normalized, reconciliation);
    } catch (saveError) {
      if (saveError instanceof PaymentRegistrationConflictError) {
        console.error("Paystack transaction already assigned inconsistently", { reference });
        return NextResponse.json({ success: false, message: unmatchedPaymentMessage }, { status: 409 });
      }
      throw saveError;
    }
    if (!registrationSave.saved) {
      console.error("Paystack registration payment could not be finalized", { reference });
      return NextResponse.json({ success: false, message: unmatchedPaymentMessage }, { status: 409 });
    }
    if (registrationSave.paymentVerificationAuditStatus === "pending") {
      console.error("Paystack payment is confirmed but its verification audit is pending repair");
    }

    const emailStatus: RegistrationEmailStatus = await sendRegistrationEmailsIfNeeded(registrationSave.registration);
    const paidAmount = reconciliation.receivedKobo / 100;
    const requiredAmount = reconciliation.expectedKobo / 100;
    const paidCurrency = reconciliation.receivedCurrency;
    return NextResponse.json({
      success: true,
      status: "success",
      paymentConfirmed: true,
      paymentStatus: "confirmed",
      reference,
      amount: paidAmount,
      currency: paidCurrency,
      display: formatPaymentAmount(paidAmount, paidCurrency),
      requiredAmount,
      requiredDisplay: formatPaymentAmount(requiredAmount, paidCurrency),
      publicFeeDisplay: normalized.calculatedFee.publicDisplay ?? formatPaymentAmount(requiredAmount, paidCurrency),
      variance: {
        type: reconciliation.varianceType,
        amount: reconciliation.varianceKobo / 100,
        display: formatPaymentAmount(reconciliation.varianceKobo / 100, paidCurrency),
      },
      paidAt: transaction.paid_at ?? transaction.paidAt ?? null,
      metadata: {
        registration: {
          fullName: normalized.registration.fullName,
          email: normalized.registration.email,
          whatsapp: normalized.registration.whatsapp,
          learningMode: normalized.registration.learningMode,
          skillPathway: normalized.registration.skillPathway,
          requestedDiscipleshipRoute: normalized.registration.requestedDiscipleshipRoute,
          screeningStatus: normalized.registration.screeningStatus,
        },
      },
      registrationMatched: true,
      registrationSave: { saved: true as const, id: registrationSave.id },
      emailStatus,
    });
  } catch (error) {
    console.error("Paystack verification failed", error);
    return NextResponse.json({ success: false, message: "Unable to verify payment. Please try again or contact REALMS Institute with your payment reference." }, { status: 502 });
  }
}
