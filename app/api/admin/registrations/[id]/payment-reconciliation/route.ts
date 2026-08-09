import { NextResponse } from "next/server";

import { isAdminAuthenticated } from "@/lib/adminAuth";
import { inspectPaystackReconciliation, applyPaystackReconciliation, paystackReferencePattern } from "@/lib/paystackReconciliation.server";
import { sendRegistrationEmailsIfNeeded } from "@/lib/registrationEmails";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!(await isAdminAuthenticated())) return NextResponse.json({ message: "Unauthorized." }, { status: 401 });
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) return NextResponse.json({ message: "Application not found." }, { status: 404 });
  const body = await request.json().catch(() => null) as Record<string, unknown> | null;
  const action = typeof body?.action === "string" ? body.action : "";
  const reference = typeof body?.reference === "string" ? body.reference.trim() : "";
  if (action !== "preview" && action !== "apply") return NextResponse.json({ message: "Choose whether to verify or apply the reconciliation." }, { status: 400 });
  if (!reference || reference.length > 160 || !paystackReferencePattern.test(reference)) return NextResponse.json({ message: "Enter a valid Paystack reference." }, { status: 400 });
  if (!process.env.PAYSTACK_SECRET_KEY) return NextResponse.json({ message: "Paystack verification is not configured." }, { status: 503 });

  try {
    if (action === "preview") {
      const inspected = await inspectPaystackReconciliation(reference, id);
      return NextResponse.json({ preview: inspected.preview });
    }

    const result = await applyPaystackReconciliation(reference, id, "manual_admin_gateway_verification");
    const emailStatus = result.newlyReconciled && result.registration
      ? await sendRegistrationEmailsIfNeeded(result.registration)
      : null;
    const auditPending = result.save?.saved && result.save.paymentVerificationAuditStatus === "pending";
    return NextResponse.json({
      preview: result.preview,
      reconciled: result.newlyReconciled,
      alreadyReconciled: !result.newlyReconciled && result.preview.outcome === "already_reconciled",
      paymentVerificationAuditStatus: result.save?.saved ? result.save.paymentVerificationAuditStatus : null,
      emailStatus,
      message: auditPending ? "The payment was recorded, but its financial audit entry is pending repair. Verify the same reference again after checking the audit-table migration." : result.preview.message,
    });
  } catch (error) {
    console.error("Admin Paystack reconciliation failed", { applicationId: id, name: error instanceof Error ? error.name : "UnknownError" });
    return NextResponse.json({ message: "Paystack verification could not be completed safely. No reconciliation was applied." }, { status: 502 });
  }
}
