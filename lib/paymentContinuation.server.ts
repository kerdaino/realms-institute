import "server-only";

import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";

import { conditionalAdmissionStatus } from "@/lib/conditionalAdmission";
import { initializePaystackTransaction, verifyPaystackTransaction, type PaystackVerificationData } from "@/lib/paystack";
import {
  hasExpectedPaystackRegistrationSource,
  isScholarshipPaystackRegistrationSource,
  paystackRegistrationMetadataSource,
  scholarshipPaystackMetadataSource,
} from "@/lib/paymentReconciliation";
import { generatePaymentReference } from "@/lib/registration";
import { savedRegistrationSelect, type SavedRegistration } from "@/lib/saveRegistration";
import { registrationFinancialSummary, type ScholarshipFinancialSummary } from "@/lib/scholarshipFinance";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";

const tokenLifetimeMs = 30 * 24 * 60 * 60 * 1000;
const tokenVersion = "v1";
const continuationSelect = `${savedRegistrationSelect}, payment_authorization_url, payment_initialized_at, admission_offer_at, admission_payment_deadline, admission_outstanding_amount, admission_offer_lapsed_at`;

export type PaymentContinuationPurpose = "conditional_admission" | "scholarship_decision";

type TokenPayload = {
  registrationId: string;
  expiresAt: number;
  scope: "payment_continuation";
  purpose: PaymentContinuationPurpose;
};

type PaymentContinuationRow = SavedRegistration & {
  payment_authorization_url: string | null;
  payment_initialized_at: string | null;
  admission_offer_at: string | null;
  admission_payment_deadline: string | null;
  admission_outstanding_amount: number | null;
  admission_offer_lapsed_at: string | null;
};

export type PaymentContinuationPageState =
  | { kind: "invalid"; message: string }
  | { kind: "expired"; applicantName: string; message: string }
  | { kind: "not_required"; applicantName: string; message: string }
  | { kind: "completed"; applicantName: string; amountPaid: number; currency: string; message: string }
  | { kind: "manual_review"; applicantName: string; message: string }
  | {
      kind: "payable";
      applicantName: string;
      normalFee: number;
      amountPaid: number;
      amountDue: number;
      scholarshipSupport: number;
      currency: string;
      fundingRoute: string;
      scholarshipStatus: string;
      paymentDeadline: string | null;
    };

function tokenKey() {
  const secret = process.env.PAYMENT_CONTINUATION_TOKEN_SECRET?.trim()
    || process.env.SCHOLARSHIP_PAYMENT_TOKEN_SECRET?.trim()
    || process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!secret) throw new Error("Payment continuation links are not configured.");
  return createHash("sha256").update(`realms-payment-continuation:${secret}`).digest();
}

function encodeToken(payload: TokenPayload) {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", tokenKey(), iv);
  cipher.setAAD(Buffer.from(tokenVersion));
  const ciphertext = Buffer.concat([cipher.update(JSON.stringify(payload), "utf8"), cipher.final()]);
  return [tokenVersion, iv.toString("base64url"), ciphertext.toString("base64url"), cipher.getAuthTag().toString("base64url")].join(".");
}

function decodeToken(token: string): TokenPayload | null {
  if (!token || token.length > 1024) return null;
  const [version, ivValue, ciphertextValue, tagValue, extra] = token.split(".");
  if (version !== tokenVersion || !ivValue || !ciphertextValue || !tagValue || extra) return null;
  try {
    const decipher = createDecipheriv("aes-256-gcm", tokenKey(), Buffer.from(ivValue, "base64url"));
    decipher.setAAD(Buffer.from(tokenVersion));
    decipher.setAuthTag(Buffer.from(tagValue, "base64url"));
    const raw = JSON.parse(Buffer.concat([
      decipher.update(Buffer.from(ciphertextValue, "base64url")),
      decipher.final(),
    ]).toString("utf8")) as Record<string, unknown>;
    if (raw.scope !== "payment_continuation" || typeof raw.registrationId !== "string" || !/^[0-9a-f-]{36}$/i.test(raw.registrationId)) return null;
    if (raw.purpose !== "conditional_admission" && raw.purpose !== "scholarship_decision") return null;
    if (typeof raw.expiresAt !== "number" || raw.expiresAt <= Date.now()) return null;
    return { registrationId: raw.registrationId, expiresAt: raw.expiresAt, scope: "payment_continuation", purpose: raw.purpose };
  } catch {
    return null;
  }
}

function continuationUrl(token: string) {
  const base = process.env.NEXT_PUBLIC_SITE_URL?.trim();
  if (!base) throw new Error("The REALMS site URL is not configured.");
  return new URL(`/payment/continue/${encodeURIComponent(token)}`, base).toString();
}

export function createPaymentContinuationLink(registrationId: string, purpose: PaymentContinuationPurpose) {
  if (!/^[0-9a-f-]{36}$/i.test(registrationId)) throw new Error("A valid application is required.");
  return continuationUrl(encodeToken({ registrationId, expiresAt: Date.now() + tokenLifetimeMs, scope: "payment_continuation", purpose }));
}

function financials(row: PaymentContinuationRow) {
  return registrationFinancialSummary({
    normalFee: Number(row.amount),
    currency: row.currency,
    fundingRoute: row.funding_route,
    scholarshipStatus: row.scholarship_status,
    approvedScholarshipAmount: row.scholarship_approved_amount,
    amountPaid: row.amount_paid,
    paymentStatus: row.payment_status,
    financialRequirementStatus: row.financial_requirement_status,
  });
}

async function loadRegistration(id: string) {
  const supabase = getSupabaseAdmin();
  if (!supabase) return null;
  const { data, error } = await supabase.from("registrations").select(continuationSelect).eq("id", id).is("deleted_at", null).maybeSingle();
  if (error) {
    console.error("Payment continuation application lookup failed", { code: error.code });
    return null;
  }
  return data as PaymentContinuationRow | null;
}

function currentState(row: PaymentContinuationRow, purpose: PaymentContinuationPurpose): PaymentContinuationPageState {
  const summary = financials(row);
  if (!summary.valid) return { kind: "manual_review", applicantName: row.full_name, message: "The saved financial arrangement needs administrative review before payment can continue." };
  if (summary.financialRequirementStatus === "satisfied_by_payment") {
    return { kind: "completed", applicantName: row.full_name, amountPaid: Number(row.amount_paid || 0), currency: row.currency, message: "The required registration payment has already been verified. No additional payment is requested." };
  }
  if (summary.financialRequirementStatus === "satisfied_by_scholarship" || summary.remainingDue === 0) {
    return { kind: "not_required", applicantName: row.full_name, message: "Your registration fee is fully covered. No registration payment is required." };
  }
  if (summary.requiresManualPaymentReview || row.payment_status === "underpayment" || row.payment_status === "currency_mismatch") {
    return { kind: "manual_review", applicantName: row.full_name, message: "A previous payment requires administrative reconciliation. Please contact REALMS Institute before making another payment." };
  }
  if (purpose === "conditional_admission") {
    const deadlineValue = row.admission_payment_deadline ? Date.parse(row.admission_payment_deadline) : Number.NaN;
    if (!Number.isFinite(deadlineValue)) {
      return { kind: "manual_review", applicantName: row.full_name, message: "The conditional admission payment deadline is not available. Please contact REALMS Admissions for assistance." };
    }
    if (deadlineValue <= Date.now()) {
      return { kind: "expired", applicantName: row.full_name, message: "Your conditional admission payment deadline has passed. Please contact REALMS Admissions for assistance." };
    }
    if (row.application_status !== conditionalAdmissionStatus) {
      return { kind: "expired", applicantName: row.full_name, message: "This conditional admission offer is not currently active. Please contact REALMS Admissions if an extension or reactivation was approved." };
    }
    if (!row.admission_offer_at || Number(row.admission_outstanding_amount) !== summary.remainingDue) {
      return { kind: "manual_review", applicantName: row.full_name, message: "The current amount due differs from the saved conditional offer. REALMS Admissions must review the offer before payment can continue." };
    }
  } else if (row.funding_route !== "scholarship_request" || (row.scholarship_status !== "approved_partial" && row.scholarship_status !== "declined")) {
    return { kind: "not_required", applicantName: row.full_name, message: "Payment is not currently available for this scholarship decision." };
  }
  if (row.funding_route !== "self_pay" && row.funding_route !== "scholarship_request") {
    return { kind: "manual_review", applicantName: row.full_name, message: "The application funding route requires administrative review." };
  }
  if (row.funding_route === "scholarship_request" && row.scholarship_status !== "approved_partial" && row.scholarship_status !== "declined") {
    return { kind: "not_required", applicantName: row.full_name, message: "No payment is required for the current scholarship decision." };
  }
  return {
    kind: "payable",
    applicantName: row.full_name,
    normalFee: summary.normalFee,
    amountPaid: summary.verifiedAmountPaid,
    amountDue: summary.remainingDue ?? 0,
    scholarshipSupport: summary.approvedSupport ?? 0,
    currency: row.currency,
    fundingRoute: row.funding_route,
    scholarshipStatus: row.scholarship_status,
    paymentDeadline: purpose === "conditional_admission" ? row.admission_payment_deadline : null,
  };
}

export async function getPaymentContinuationPageState(token: string): Promise<PaymentContinuationPageState> {
  const payload = decodeToken(token);
  if (!payload) return { kind: "invalid", message: "This payment link is invalid or has expired. Please ask REALMS Institute to resend the current email." };
  const row = await loadRegistration(payload.registrationId);
  if (!row) return { kind: "invalid", message: "This active application could not be found." };
  return currentState(row, payload.purpose);
}

function metadataApplicationId(metadata: unknown) {
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) return null;
  const record = metadata as Record<string, unknown>;
  for (const key of ["registration_id", "application_id", "applicationId", "application_reference", "applicationReference"]) {
    const value = record[key];
    if (typeof value === "string" && /^[0-9a-f-]{36}$/i.test(value.trim())) return value.trim();
  }
  return null;
}

function customerEmail(transaction: PaystackVerificationData) {
  if (!transaction.customer || typeof transaction.customer !== "object" || Array.isArray(transaction.customer)) return null;
  const email = (transaction.customer as Record<string, unknown>).email;
  return typeof email === "string" && email.trim() ? email.trim().toLowerCase() : null;
}

function safeHttpsUrl(value: string | null) {
  if (!value) return null;
  try {
    const url = new URL(value);
    return url.protocol === "https:" ? url.toString() : null;
  } catch {
    return null;
  }
}

function initializationRecentlyStarted(value: string | null) {
  if (!value) return false;
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) && Date.now() - timestamp < 60_000;
}

async function existingReferenceState(row: PaymentContinuationRow, summary: ScholarshipFinancialSummary) {
  const amountDue = summary.remainingDue;
  if (amountDue === null || amountDue <= 0) return { kind: "manual" as const, message: "The current amount due could not be established safely." };
  const reference = row.payment_reference?.trim();
  if (!reference) return { kind: "fresh" as const };
  let transaction: PaystackVerificationData;
  try {
    transaction = await verifyPaystackTransaction(reference);
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    if (!row.payment_authorization_url && /not found|invalid reference/i.test(message)) {
      if (initializationRecentlyStarted(row.payment_initialized_at)) return { kind: "in_progress" as const, message: "Secure payment initialization is already in progress. Please wait a moment and try again." };
      return { kind: "fresh" as const };
    }
    console.error("Payment continuation could not verify stored Paystack reference", { applicationId: row.id, name: error instanceof Error ? error.name : "UnknownError" });
    return { kind: "unavailable" as const, message: "Paystack verification is temporarily unavailable. No new payment was created. Please wait a little and try again." };
  }
  if (
    transaction.reference !== reference
    || !hasExpectedPaystackRegistrationSource(transaction.metadata)
    || metadataApplicationId(transaction.metadata) !== row.id
    || isScholarshipPaystackRegistrationSource(transaction.metadata) !== (row.funding_route === "scholarship_request")
  ) {
    return { kind: "manual" as const, message: "The stored payment reference could not be bound safely to this application. Please contact REALMS Institute." };
  }
  if (await transactionAssignedElsewhere(transaction.id, row.id)) {
    return { kind: "manual" as const, message: "The stored Paystack transaction is already assigned elsewhere and requires administrative review." };
  }
  const verifiedEmail = customerEmail(transaction);
  if (verifiedEmail && verifiedEmail !== row.email.trim().toLowerCase()) {
    return { kind: "manual" as const, message: "The stored payment reference requires identity review. Please contact REALMS Institute." };
  }
  const receivedAmount = transaction.amount / 100;
  if (transaction.currency.toUpperCase() !== row.currency.toUpperCase() || receivedAmount < amountDue) {
    return { kind: "manual" as const, message: "The stored payment reference does not match the current amount and currency due. Please contact REALMS Institute." };
  }
  if (transaction.status === "success") {
    return { kind: "successful" as const, redirectUrl: `/payment/verify?reference=${encodeURIComponent(reference)}` };
  }
  if (receivedAmount !== amountDue) {
    return { kind: "manual" as const, message: "The pending payment reference does not match the exact current amount due. Please contact REALMS Institute." };
  }
  const authorizationUrl = safeHttpsUrl(row.payment_authorization_url);
  if (authorizationUrl && ["pending", "ongoing", "processing", "abandoned"].includes(transaction.status)) {
    return { kind: "reusable" as const, redirectUrl: authorizationUrl };
  }
  if (!authorizationUrl && initializationRecentlyStarted(row.payment_initialized_at)) {
    return { kind: "in_progress" as const, message: "Secure payment initialization is already in progress. Please wait a moment and try again." };
  }
  return { kind: "fresh" as const };
}

async function transactionAssignedElsewhere(transactionId: string | number | undefined, applicationId: string) {
  if (transactionId === undefined || transactionId === null) return false;
  const supabase = getSupabaseAdmin();
  if (!supabase) return true;
  const result = await supabase.from("registrations").select("id").eq("paystack_raw->>id", String(transactionId)).neq("id", applicationId).limit(1).maybeSingle();
  return Boolean(result.error || result.data);
}

export async function initializePaymentContinuation(token: string) {
  const payload = decodeToken(token);
  if (!payload) return { success: false as const, status: 401, message: "This payment link is invalid or has expired." };
  const row = await loadRegistration(payload.registrationId);
  if (!row) return { success: false as const, status: 404, message: "Active application not found." };
  const state = currentState(row, payload.purpose);
  if (state.kind === "completed") return { success: true as const, completed: true as const, message: state.message };
  if (state.kind !== "payable") {
    const status = state.kind === "expired" ? 410 : state.kind === "invalid" ? 404 : 409;
    return { success: false as const, status, message: state.message };
  }
  const summary = financials(row);
  if (!summary.valid || !summary.remainingDue) return { success: false as const, status: 409, message: "The current amount due could not be established safely." };

  const referenceState = await existingReferenceState(row, summary);
  if (referenceState.kind === "successful" || referenceState.kind === "reusable") {
    return { success: true as const, completed: false as const, redirectUrl: referenceState.redirectUrl, reused: true };
  }
  if (referenceState.kind === "manual" || referenceState.kind === "unavailable" || referenceState.kind === "in_progress") {
    return { success: false as const, status: referenceState.kind === "unavailable" ? 502 : 409, message: referenceState.message };
  }

  const supabase = getSupabaseAdmin();
  if (!supabase) return { success: false as const, status: 503, message: "Payment is temporarily unavailable." };
  if (!process.env.PAYSTACK_SECRET_KEY || !process.env.NEXT_PUBLIC_SITE_URL) return { success: false as const, status: 503, message: "Payment configuration is unavailable." };

  const previousReference = row.payment_reference;
  const reference = generatePaymentReference();
  const claimStartedAt = new Date().toISOString();
  let claim = supabase.from("registrations").update({
    payment_reference: reference,
    payment_status: "pending",
    payment_expected_amount: summary.remainingDue,
    payment_authorization_url: null,
    payment_initialized_at: claimStartedAt,
    financial_requirement_status: "payment_required",
  }).eq("id", row.id).eq("funding_route", row.funding_route).eq("payment_status", row.payment_status).is("deleted_at", null);
  claim = previousReference ? claim.eq("payment_reference", previousReference) : claim.is("payment_reference", null);
  if (payload.purpose === "conditional_admission") {
    claim = claim.eq("application_status", conditionalAdmissionStatus).eq("admission_payment_deadline", row.admission_payment_deadline!);
  }
  if (row.funding_route === "scholarship_request") claim = claim.eq("scholarship_status", row.scholarship_status);
  const claimed = await claim.select("id").maybeSingle();
  if (claimed.error) {
    console.error("Payment continuation initialization claim failed", { code: claimed.error.code });
    return { success: false as const, status: 503, message: "Payment could not be initialized safely." };
  }
  if (!claimed.data) return { success: false as const, status: 409, message: "The application, offer, or payment state changed. Please refresh and try again." };

  const referenceAudit = await supabase.from("registration_review_events").insert({
    registration_id: row.id,
    event_type: "payment_reference_reinitialized",
    previous_state: { payment_reference: previousReference, payment_status: row.payment_status, payment_expected_amount: row.payment_expected_amount },
    new_state: { payment_reference: reference, payment_status: "pending", payment_expected_amount: summary.remainingDue, payment_initialization_started_at: claimStartedAt },
    note: previousReference ? "A fresh Paystack reference was created after server-side verification found no successful reusable transaction." : "A fresh Paystack reference was created by the secure payment continuation flow.",
    actor: "Applicant secure payment continuation",
  });
  if (referenceAudit.error) {
    console.error("Payment reference reinitialization audit failed", { applicationId: row.id, code: referenceAudit.error.code });
    const restored = await supabase.from("registrations").update({
      payment_reference: previousReference,
      payment_status: row.payment_status,
      payment_expected_amount: row.payment_expected_amount,
      payment_authorization_url: row.payment_authorization_url,
      payment_initialized_at: row.payment_initialized_at,
      financial_requirement_status: row.financial_requirement_status,
    }).eq("id", row.id).eq("payment_reference", reference).eq("payment_status", "pending").is("deleted_at", null).select("id").maybeSingle();
    if (restored.error || !restored.data) console.error("Payment reference rollback after audit failure could not be confirmed", { applicationId: row.id, reference });
    return { success: false as const, status: 503, message: "Payment could not be initialized because its reference history could not be preserved safely." };
  }

  const callbackUrl = new URL("/payment/verify", process.env.NEXT_PUBLIC_SITE_URL);
  callbackUrl.searchParams.set("reference", reference);
  const metadata = {
    source: row.funding_route === "scholarship_request" ? scholarshipPaystackMetadataSource : paystackRegistrationMetadataSource,
    registration_id: row.id,
    application_reference: row.id,
    payment_purpose: payload.purpose,
  };
  let transaction: Awaited<ReturnType<typeof initializePaystackTransaction>>;
  try {
    transaction = await initializePaystackTransaction({
      email: row.email,
      fee: { amount: summary.remainingDue, currency: row.currency },
      reference,
      callbackUrl: callbackUrl.toString(),
      metadata,
    });
  } catch (error) {
    console.error("Payment continuation Paystack initialization failed", { applicationId: row.id, name: error instanceof Error ? error.name : "UnknownError" });
    return { success: false as const, status: 502, message: "Unable to initialize payment. No admission or scholarship decision was changed. Please try again shortly." };
  }

  const initializedAt = new Date().toISOString();
  const stored = await supabase.from("registrations").update({
    payment_authorization_url: transaction.authorization_url,
    payment_initialized_at: initializedAt,
  }).eq("id", row.id).eq("payment_reference", reference).eq("payment_status", "pending").is("deleted_at", null).select("id").maybeSingle();
  if (stored.error || !stored.data) console.error("Payment continuation recovery URL could not be saved", { applicationId: row.id, reference });
  return { success: true as const, completed: false as const, redirectUrl: transaction.authorization_url, reused: false };
}
