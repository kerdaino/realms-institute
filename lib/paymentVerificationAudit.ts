import type { SupabaseClient } from "@supabase/supabase-js";

import type { PaymentReconciliation } from "@/lib/paymentReconciliation";

export type PaymentVerificationAuditStatus = "recorded" | "reused" | "pending";

export type PaymentVerificationAuditInput = {
  registrationId: string;
  reference: string;
  previousStatus: string;
  reconciliation: PaymentReconciliation;
};

type DatabaseError = {
  code?: string | null;
  message?: string | null;
  hint?: string | null;
  details?: string | null;
};

const uuidPattern = /\b[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\b/gi;

function safeDatabaseErrorField(value: unknown, privateValues: string[]) {
  if (typeof value !== "string" || !value) return null;
  let safeValue = value.replace(uuidPattern, "[uuid]");
  for (const privateValue of privateValues) {
    if (privateValue) safeValue = safeValue.replaceAll(privateValue, "[redacted]");
  }
  return safeValue.slice(0, 2_000);
}

export function databaseErrorForServerLog(error: DatabaseError, privateValues: string[] = []) {
  return {
    code: safeDatabaseErrorField(error.code, privateValues),
    message: safeDatabaseErrorField(error.message, privateValues),
    hint: safeDatabaseErrorField(error.hint, privateValues),
    details: safeDatabaseErrorField(error.details, privateValues),
  };
}

export function buildPaymentVerificationAuditPayload(input: PaymentVerificationAuditInput) {
  return {
    registration_id: input.registrationId,
    event_type: "payment_verified",
    previous_state: { payment_status: input.previousStatus },
    new_state: {
      payment_status: "success",
      payment_reference: input.reference,
      expected_amount_kobo: input.reconciliation.expectedKobo,
      amount_paid_kobo: input.reconciliation.receivedKobo,
      payment_variance_type: input.reconciliation.varianceType,
      payment_variance_kobo: input.reconciliation.varianceKobo,
      currency: input.reconciliation.receivedCurrency,
    },
    note: input.reconciliation.varianceType === "overpayment" ? "Excess payment recorded for reconciliation." : null,
    actor: "Paystack verification",
  };
}

async function findPaymentVerificationEvent(supabase: SupabaseClient, input: PaymentVerificationAuditInput) {
  return supabase
    .from("registration_review_events")
    .select("id")
    .eq("registration_id", input.registrationId)
    .eq("event_type", "payment_verified")
    .contains("new_state", { payment_reference: input.reference })
    .limit(1)
    .maybeSingle();
}

function logAuditDatabaseError(message: string, error: DatabaseError, input: PaymentVerificationAuditInput) {
  console.error(message, databaseErrorForServerLog(error, [input.registrationId, input.reference]));
}

export async function recordPaymentVerificationEvent(
  supabase: SupabaseClient,
  input: PaymentVerificationAuditInput,
): Promise<PaymentVerificationAuditStatus> {
  const prior = await findPaymentVerificationEvent(supabase, input);
  if (prior.error) {
    logAuditDatabaseError("Payment verification audit lookup failed", prior.error, input);
    return "pending";
  }
  if (prior.data) return "reused";

  const event = await supabase.from("registration_review_events").insert(buildPaymentVerificationAuditPayload(input));
  if (!event.error) return "recorded";

  if (event.error.code === "23505") {
    const concurrent = await findPaymentVerificationEvent(supabase, input);
    if (!concurrent.error && concurrent.data) return "reused";
    if (concurrent.error) logAuditDatabaseError("Payment verification audit recovery lookup failed", concurrent.error, input);
  }

  logAuditDatabaseError("Payment verification audit insert failed", event.error, input);
  return "pending";
}
