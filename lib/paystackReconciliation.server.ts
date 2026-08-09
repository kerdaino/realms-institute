import "server-only";

import { verifyPaystackTransaction, type PaystackVerificationData } from "@/lib/paystack";
import {
  hasExpectedPaystackRegistrationSource,
  isScholarshipPaystackRegistrationSource,
  paymentReferenceMatchesApplication,
  reconcileRegistrationPayment,
  type PaymentReconciliation,
} from "@/lib/paymentReconciliation";
import {
  recordUnconfirmedRegistrationPayment,
  resolvePaystackRegistration,
  saveVerifiedRegistrationFromPaystack,
  savedRegistrationSelect,
  type NormalizedPaystackRegistrationMetadata,
  type PaymentPersistenceContext,
  type RegistrationSaveResult,
  type SavedRegistration,
} from "@/lib/saveRegistration";
import {
  recordUnconfirmedScholarshipPayment,
  resolveScholarshipPaymentFromPaystack,
  saveVerifiedScholarshipPayment,
  type ScholarshipPaymentResolution,
} from "@/lib/scholarshipPayment.server";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";

export const paystackReferencePattern = /^[A-Za-z0-9._-]+$/;

export type PaystackReconciliationSource = PaymentPersistenceContext["source"];
export type PaystackReconciliationReason =
  | "ready"
  | "already_reconciled"
  | "transaction_not_successful"
  | "reference_mismatch"
  | "untrusted_metadata"
  | "wrong_application"
  | "application_binding_mismatch"
  | "customer_email_mismatch"
  | "currency_mismatch"
  | "underpayment"
  | "transaction_already_assigned"
  | "application_already_paid_differently";

export type PaystackReconciliationPreview = {
  outcome: "ready" | "already_reconciled" | "rejected";
  reason: PaystackReconciliationReason;
  message: string;
  canApply: boolean;
  reference: string;
  transactionStatus: string;
  transactionId: string | null;
  amountReceived: number;
  currency: string;
  paidAt: string | null;
  customerEmail: string | null;
  paymentChannel: string | null;
  gatewayStatus: string | null;
  currentRealmsAmountDue: number | null;
  excessAmount: number;
  shortfallAmount: number;
  applicationReference: string | null;
  applicationEmail: string | null;
  scholarshipStatus: string | null;
  admissionStatus: string | null;
  financialRequirementStatus: string | null;
  binding: "Paystack metadata application ID and stored payment reference" | "Stored REALMS payment reference" | null;
};

type MatchedInspection = {
  preview: PaystackReconciliationPreview;
  transaction: PaystackVerificationData;
  registration: SavedRegistration | null;
  reconciliation: PaymentReconciliation | null;
  normalized: NormalizedPaystackRegistrationMetadata | null;
  scholarshipResolution: ScholarshipPaymentResolution | null;
};

export type PaystackReconciliationInspection = MatchedInspection;

export type PaystackReconciliationApplyResult = {
  preview: PaystackReconciliationPreview;
  newlyReconciled: boolean;
  registration: SavedRegistration | null;
  save: RegistrationSaveResult | null;
};

function metadataRecord(metadata: unknown) {
  return metadata && typeof metadata === "object" && !Array.isArray(metadata) ? metadata as Record<string, unknown> : null;
}

function metadataApplicationId(metadata: unknown) {
  const source = metadataRecord(metadata);
  if (!source) return null;
  for (const key of ["registration_id", "application_id", "applicationId", "application_reference", "applicationReference"]) {
    const value = source[key];
    if (typeof value === "string" && /^[0-9a-f-]{36}$/i.test(value.trim())) return value.trim();
  }
  return null;
}

function customerEmail(transaction: PaystackVerificationData) {
  if (!transaction.customer || typeof transaction.customer !== "object" || Array.isArray(transaction.customer)) return null;
  const email = (transaction.customer as Record<string, unknown>).email;
  return typeof email === "string" && email.trim() ? email.trim() : null;
}

function sameEmail(left: string, right: string) {
  return left.trim().toLowerCase() === right.trim().toLowerCase();
}

function basePreview(transaction: PaystackVerificationData, reference: string): PaystackReconciliationPreview {
  return {
    outcome: "rejected",
    reason: "application_binding_mismatch",
    message: "Paystack verification could not be bound safely to this REALMS application.",
    canApply: false,
    reference,
    transactionStatus: transaction.status,
    transactionId: transaction.id === undefined || transaction.id === null ? null : String(transaction.id),
    amountReceived: Number.isFinite(transaction.amount) ? transaction.amount / 100 : 0,
    currency: typeof transaction.currency === "string" ? transaction.currency.toUpperCase() : "",
    paidAt: transaction.paid_at ?? transaction.paidAt ?? null,
    customerEmail: customerEmail(transaction),
    paymentChannel: transaction.channel ?? null,
    gatewayStatus: transaction.gateway_response ?? transaction.status,
    currentRealmsAmountDue: null,
    excessAmount: 0,
    shortfallAmount: 0,
    applicationReference: metadataApplicationId(transaction.metadata),
    applicationEmail: null,
    scholarshipStatus: null,
    admissionStatus: null,
    financialRequirementStatus: null,
    binding: null,
  };
}

function reject(preview: PaystackReconciliationPreview, reason: PaystackReconciliationReason, message: string) {
  return { ...preview, outcome: "rejected" as const, reason, message, canApply: false };
}

async function transactionAssignedElsewhere(transaction: PaystackVerificationData, applicationId: string) {
  const supabase = getSupabaseAdmin();
  if (!supabase) throw new Error("SUPABASE_NOT_CONFIGURED");
  const byReference = await supabase.from("registrations").select("id").eq("payment_reference", transaction.reference).neq("id", applicationId).limit(1).maybeSingle();
  if (byReference.error) throw new Error("PAYMENT_REFERENCE_OWNERSHIP_CHECK_FAILED");
  if (byReference.data) return true;
  if (transaction.id === undefined || transaction.id === null) return false;
  const byTransaction = await supabase.from("registrations").select("id").eq("paystack_raw->>id", String(transaction.id)).neq("id", applicationId).limit(1).maybeSingle();
  if (byTransaction.error) throw new Error("PAYSTACK_TRANSACTION_OWNERSHIP_CHECK_FAILED");
  return Boolean(byTransaction.data);
}

export async function inspectPaystackReconciliation(reference: string, expectedApplicationId?: string): Promise<PaystackReconciliationInspection> {
  const transaction = await verifyPaystackTransaction(reference);
  let preview = basePreview(transaction, reference);
  if (transaction.reference !== reference) {
    return { preview: reject(preview, "reference_mismatch", "Paystack returned a different transaction reference."), transaction, registration: null, reconciliation: null, normalized: null, scholarshipResolution: null };
  }
  if (!hasExpectedPaystackRegistrationSource(transaction.metadata)) {
    return { preview: reject(preview, "untrusted_metadata", "Paystack confirms the reference, but its metadata is not from the REALMS registration flow."), transaction, registration: null, reconciliation: null, normalized: null, scholarshipResolution: null };
  }

  const immutableApplicationId = metadataApplicationId(transaction.metadata);
  if (expectedApplicationId && !immutableApplicationId) {
    return { preview: reject(preview, "application_binding_mismatch", "Paystack confirms the reference, but the transaction metadata does not contain the immutable REALMS application ID required for administrative reconciliation."), transaction, registration: null, reconciliation: null, normalized: null, scholarshipResolution: null };
  }
  if (expectedApplicationId && immutableApplicationId && immutableApplicationId !== expectedApplicationId) {
    return { preview: reject(preview, "wrong_application", "Paystack confirms this transaction, but it belongs to another application."), transaction, registration: null, reconciliation: null, normalized: null, scholarshipResolution: null };
  }

  const scholarshipPayment = isScholarshipPaystackRegistrationSource(transaction.metadata);
  const scholarshipResolution = scholarshipPayment ? await resolveScholarshipPaymentFromPaystack(transaction.metadata, reference) : null;
  const normalized = scholarshipPayment ? null : await resolvePaystackRegistration(transaction.metadata, reference);
  const applicationId = scholarshipResolution?.applicationId || normalized?.applicationId || null;
  if (!applicationId || (scholarshipPayment ? !scholarshipResolution : !normalized?.isValid || !normalized.calculatedFee)) {
    return { preview: reject(preview, "application_binding_mismatch", "The Paystack transaction does not match the application’s stored payment reference and current payment arrangement."), transaction, registration: null, reconciliation: null, normalized, scholarshipResolution };
  }
  if (expectedApplicationId && applicationId !== expectedApplicationId) {
    return { preview: reject(preview, "wrong_application", "Paystack confirms this transaction, but it belongs to another application."), transaction, registration: null, reconciliation: null, normalized, scholarshipResolution };
  }

  const supabase = getSupabaseAdmin();
  if (!supabase) throw new Error("SUPABASE_NOT_CONFIGURED");
  const current = await supabase.from("registrations").select(savedRegistrationSelect).eq("id", applicationId).maybeSingle();
  if (current.error) throw new Error("APPLICATION_RECONCILIATION_LOOKUP_FAILED");
  if (!current.data || !paymentReferenceMatchesApplication(current.data.payment_reference, reference)) {
    return { preview: reject(preview, "application_binding_mismatch", "The Paystack transaction does not match the application’s stored payment reference."), transaction, registration: null, reconciliation: null, normalized, scholarshipResolution };
  }
  const registration = current.data as SavedRegistration;
  const calculatedFee = scholarshipResolution?.calculatedFee || normalized!.calculatedFee!;
  const reconciliation = reconcileRegistrationPayment({
    expectedKobo: calculatedFee.amount * 100,
    receivedKobo: transaction.amount,
    expectedCurrency: calculatedFee.currency,
    receivedCurrency: transaction.currency,
  });
  preview = {
    ...preview,
    currentRealmsAmountDue: reconciliation.expectedKobo / 100,
    excessAmount: reconciliation.excessKobo / 100,
    shortfallAmount: reconciliation.shortfallKobo / 100,
    applicationReference: applicationId,
    applicationEmail: registration.email,
    scholarshipStatus: registration.scholarship_status,
    admissionStatus: registration.application_status,
    financialRequirementStatus: registration.financial_requirement_status,
    binding: immutableApplicationId ? "Paystack metadata application ID and stored payment reference" : "Stored REALMS payment reference",
  };

  if (await transactionAssignedElsewhere(transaction, applicationId)) {
    return { preview: reject(preview, "transaction_already_assigned", "This Paystack transaction is already attached to another REALMS application."), transaction, registration, reconciliation, normalized, scholarshipResolution };
  }
  const verifiedCustomerEmail = customerEmail(transaction);
  if (verifiedCustomerEmail && !sameEmail(verifiedCustomerEmail, registration.email)) {
    return { preview: reject(preview, "customer_email_mismatch", "The immutable application binding matches, but the Paystack customer email is materially inconsistent. Review this payment outside the automatic workflow."), transaction, registration, reconciliation, normalized, scholarshipResolution };
  }
  if (transaction.status !== "success") {
    return { preview: reject(preview, "transaction_not_successful", `Paystack reports this transaction as ${transaction.status || "not successful"}.`), transaction, registration, reconciliation, normalized, scholarshipResolution };
  }
  if (reconciliation.varianceType === "currency_mismatch") {
    return { preview: reject(preview, "currency_mismatch", `Paystack confirms this transaction, but ${reconciliation.receivedCurrency || "an unknown currency"} was received instead of ${reconciliation.expectedCurrency}.`), transaction, registration, reconciliation, normalized, scholarshipResolution };
  }
  if (reconciliation.varianceType === "underpayment") {
    return { preview: reject(preview, "underpayment", `Successful payment found, but ${reconciliation.receivedCurrency} ${(reconciliation.receivedKobo / 100).toLocaleString("en")} was received against a current required amount of ${reconciliation.expectedCurrency} ${(reconciliation.expectedKobo / 100).toLocaleString("en")}.`), transaction, registration, reconciliation, normalized, scholarshipResolution };
  }
  if (registration.payment_status === "success" || registration.financial_requirement_status === "satisfied_by_payment") {
    const sameRecordedPayment = registration.payment_reference === reference
      && Number(registration.amount_paid) === transaction.amount / 100
      && registration.currency.toUpperCase() === transaction.currency.toUpperCase();
    if (!sameRecordedPayment) {
      return { preview: reject(preview, "application_already_paid_differently", "This application is already financially satisfied by a different recorded payment. No reconciliation was applied."), transaction, registration, reconciliation, normalized, scholarshipResolution };
    }
    return { preview: { ...preview, outcome: "already_reconciled", reason: "already_reconciled", message: "Payment already reconciled.", canApply: false }, transaction, registration, reconciliation, normalized, scholarshipResolution };
  }
  return { preview: { ...preview, outcome: "ready", reason: "ready", message: reconciliation.varianceType === "overpayment" ? "Verified successful payment is safely bound to this application. The excess will be recorded separately in the payment audit." : "Verified successful payment is safely bound to this application and is ready to reconcile.", canApply: true }, transaction, registration, reconciliation, normalized, scholarshipResolution };
}

export async function applyPaystackReconciliation(reference: string, expectedApplicationId: string | undefined, source: PaystackReconciliationSource): Promise<PaystackReconciliationApplyResult> {
  const inspected = await inspectPaystackReconciliation(reference, expectedApplicationId);
  if (inspected.preview.outcome !== "ready") {
    if (inspected.preview.outcome === "already_reconciled" && inspected.registration && inspected.reconciliation) {
      const context: PaymentPersistenceContext = {
        source,
        actor: source === "manual_admin_gateway_verification" ? "REALMS Admin" : source === "paystack_webhook" ? "Paystack webhook" : "Paystack verification",
        reconciledAt: new Date().toISOString(),
      };
      const save = inspected.scholarshipResolution
        ? await saveVerifiedScholarshipPayment(inspected.transaction, inspected.scholarshipResolution, inspected.reconciliation, context)
        : await saveVerifiedRegistrationFromPaystack(inspected.transaction, inspected.normalized ?? undefined, inspected.reconciliation, context);
      if (!save.saved) throw new Error(`PAYMENT_RECONCILIATION_AUDIT_REPAIR_FAILED:${save.reason}`);
      return { preview: inspected.preview, newlyReconciled: false, registration: save.registration, save };
    }
    if (source === "paystack_webhook" && inspected.reconciliation) {
      if (inspected.preview.reason === "underpayment") {
        if (inspected.scholarshipResolution) await recordUnconfirmedScholarshipPayment(inspected.transaction, inspected.scholarshipResolution, inspected.reconciliation);
        else if (inspected.normalized) await recordUnconfirmedRegistrationPayment(inspected.transaction, inspected.normalized, inspected.reconciliation);
      }
      if (inspected.preview.reason === "currency_mismatch") {
        if (inspected.scholarshipResolution) await recordUnconfirmedScholarshipPayment(inspected.transaction, inspected.scholarshipResolution, inspected.reconciliation);
        else if (inspected.normalized) await recordUnconfirmedRegistrationPayment(inspected.transaction, inspected.normalized, inspected.reconciliation);
      }
    }
    return { preview: inspected.preview, newlyReconciled: false, registration: inspected.registration, save: null };
  }

  if (!inspected.registration || !inspected.reconciliation) throw new Error("PAYMENT_RECONCILIATION_INSPECTION_INCOMPLETE");
  const context: PaymentPersistenceContext = {
    source,
    actor: source === "manual_admin_gateway_verification" ? "REALMS Admin" : source === "paystack_webhook" ? "Paystack webhook" : "Paystack verification",
    reconciledAt: new Date().toISOString(),
  };
  const save: RegistrationSaveResult = inspected.scholarshipResolution
    ? await saveVerifiedScholarshipPayment(inspected.transaction, inspected.scholarshipResolution, inspected.reconciliation, context)
    : await saveVerifiedRegistrationFromPaystack(inspected.transaction, inspected.normalized ?? undefined, inspected.reconciliation, context);
  if (!save.saved) throw new Error(`PAYMENT_RECONCILIATION_SAVE_FAILED:${save.reason}`);
  return {
    preview: { ...inspected.preview, outcome: "already_reconciled", reason: "already_reconciled", canApply: false, message: "Payment reconciled from independent Paystack verification." },
    newlyReconciled: true,
    registration: save.registration,
    save,
  };
}
