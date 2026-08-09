import { after, NextResponse } from "next/server";

import { applyPaystackReconciliation, paystackReferencePattern } from "@/lib/paystackReconciliation.server";
import { sendRegistrationEmailsIfNeeded } from "@/lib/registrationEmails";
import { validPaystackWebhookSignature } from "@/lib/paystackWebhook.server";

export const maxDuration = 30;

export async function POST(request: Request) {
  const secretKey = process.env.PAYSTACK_SECRET_KEY;
  if (!secretKey) return NextResponse.json({ received: false }, { status: 503 });
  const rawBody = await request.text();
  if (!validPaystackWebhookSignature(rawBody, request.headers.get("x-paystack-signature"), secretKey)) {
    return NextResponse.json({ received: false }, { status: 401 });
  }
  const event = JSON.parse(rawBody) as { event?: unknown; data?: { reference?: unknown } };
  if (event.event !== "charge.success") return NextResponse.json({ received: true });
  const reference = typeof event.data?.reference === "string" ? event.data.reference.trim() : "";
  if (!reference || reference.length > 160 || !paystackReferencePattern.test(reference)) return NextResponse.json({ received: true });

  try {
    // The signed webhook is still not trusted for financial values. REALMS
    // independently re-verifies this reference with Paystack before any write.
    const result = await applyPaystackReconciliation(reference, undefined, "paystack_webhook");
    if (result.preview.outcome === "rejected") {
      console.error("Paystack webhook payment was not reconcilable", { reference, reason: result.preview.reason });
      return NextResponse.json({ received: true });
    }
    if (result.save?.saved && result.save.paymentVerificationAuditStatus === "pending") {
      console.error("Paystack webhook payment audit is pending repair", { reference });
      return NextResponse.json({ received: false }, { status: 500 });
    }
    if (result.registration) {
      after(async () => {
        const emailStatus = await sendRegistrationEmailsIfNeeded(result.registration!);
        if (!emailStatus.applicant.sent && emailStatus.applicant.reason !== "Already sent.") console.error("Webhook applicant payment email was not sent", { reference, reason: emailStatus.applicant.reason });
        if (!emailStatus.admin.sent && emailStatus.admin.reason !== "Already sent.") console.error("Webhook admin payment email was not sent", { reference, reason: emailStatus.admin.reason });
      });
    }
    return NextResponse.json({ received: true });
  } catch (error) {
    console.error("Paystack webhook reconciliation failed", { reference, name: error instanceof Error ? error.name : "UnknownError" });
    // A non-2xx response asks Paystack to retry transient verification/database failures.
    return NextResponse.json({ received: false }, { status: 500 });
  }
}
