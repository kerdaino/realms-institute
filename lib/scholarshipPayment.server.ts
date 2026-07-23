import "server-only";

import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";

import { initializePaystackTransaction, type PaystackVerificationData } from "@/lib/paystack";
import { paymentReferenceMatchesApplication, scholarshipPaystackMetadataSource, type PaymentReconciliation } from "@/lib/paymentReconciliation";
import { recordPaymentVerificationEvent } from "@/lib/paymentVerificationAudit";
import { generatePaymentReference } from "@/lib/registration";
import { buildVerifiedPaymentColumns, PaymentRegistrationConflictError, savedRegistrationSelect, type RegistrationSaveResult, type SavedRegistration } from "@/lib/saveRegistration";
import { scholarshipFinancialSummary, type ScholarshipFinancialSummary } from "@/lib/scholarshipFinance";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";

const tokenLifetimeMs = 30 * 24 * 60 * 60 * 1000;
const tokenVersion = "v1";
const scholarshipPaymentSelect = `${savedRegistrationSelect}, financial_requirement_status, payment_expected_amount, payment_authorization_url, payment_initialized_at, scholarship_reviewed_at`;

type ScholarshipPaymentRow = SavedRegistration & {
  financial_requirement_status: string;
  payment_expected_amount: number | null;
  payment_authorization_url: string | null;
  payment_initialized_at: string | null;
  scholarship_reviewed_at: string | null;
};

type TokenPayload = { registrationId: string; expiresAt: number; scope: "scholarship_payment" };

export type ScholarshipPaymentPageState =
  | { kind: "invalid"; message: string }
  | { kind: "not_required"; applicantName: string; message: string }
  | { kind: "completed"; applicantName: string; amountPaid: number; currency: string; message: string }
  | { kind: "manual_review"; applicantName: string; message: string }
  | { kind: "payable"; applicantName: string; amountDue: number; currency: string; scholarshipStatus: "approved_partial" | "declined" };

export type ScholarshipPaymentResolution = {
  applicationId: string;
  registration: ScholarshipPaymentRow;
  calculatedFee: { amount: number; currency: string; display: string; publicDisplay: string };
  financials: ScholarshipFinancialSummary;
};

function tokenKey() {
  const secret = process.env.SCHOLARSHIP_PAYMENT_TOKEN_SECRET?.trim() || process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!secret) throw new Error("Scholarship payment links are not configured.");
  return createHash("sha256").update(`realms-scholarship-payment:${secret}`).digest();
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
    if (raw.scope !== "scholarship_payment" || typeof raw.registrationId !== "string" || !/^[0-9a-f-]{36}$/i.test(raw.registrationId)) return null;
    if (typeof raw.expiresAt !== "number" || raw.expiresAt <= Date.now()) return null;
    return { registrationId: raw.registrationId, expiresAt: raw.expiresAt, scope: "scholarship_payment" };
  } catch {
    return null;
  }
}

function paymentUrl(token: string) {
  const base = process.env.NEXT_PUBLIC_SITE_URL?.trim();
  if (!base) throw new Error("The REALMS site URL is not configured.");
  const url = new URL("/register/scholarship-payment", base);
  url.searchParams.set("token", token);
  return url.toString();
}

function financials(row: ScholarshipPaymentRow) {
  return scholarshipFinancialSummary({
    normalFee: Number(row.amount),
    scholarshipStatus: row.scholarship_status,
    approvedScholarshipAmount: row.scholarship_approved_amount,
    amountPaid: row.amount_paid,
    paymentStatus: row.payment_status,
  });
}

async function loadRegistration(id: string) {
  const supabase = getSupabaseAdmin();
  if (!supabase) return null;
  const { data, error } = await supabase.from("registrations").select(scholarshipPaymentSelect).eq("id", id).eq("funding_route", "scholarship_request").maybeSingle();
  if (error) {
    console.error("Scholarship payment application lookup failed", { code: error.code });
    return null;
  }
  return data as ScholarshipPaymentRow | null;
}

export function createScholarshipPaymentLink(registrationId: string) {
  if (!/^[0-9a-f-]{36}$/i.test(registrationId)) throw new Error("A valid scholarship application is required.");
  return paymentUrl(encodeToken({ registrationId, expiresAt: Date.now() + tokenLifetimeMs, scope: "scholarship_payment" }));
}

export async function getScholarshipPaymentPageState(token: string): Promise<ScholarshipPaymentPageState> {
  const payload = decodeToken(token);
  if (!payload) return { kind: "invalid", message: "This scholarship payment link is invalid or has expired. Please contact REALMS Institute or ask the administrator to resend the decision email." };
  const row = await loadRegistration(payload.registrationId);
  if (!row) return { kind: "invalid", message: "This scholarship application could not be found." };
  const summary = financials(row);
  if (!summary.valid) return { kind: "manual_review", applicantName: row.full_name, message: "The saved scholarship arrangement needs administrative review before payment can continue." };
  if (summary.financialRequirementStatus === "satisfied_by_payment") {
    return { kind: "completed", applicantName: row.full_name, amountPaid: Number(row.amount_paid || 0), currency: row.currency, message: "The required registration payment has already been completed. No additional payment is requested." };
  }
  if (summary.financialRequirementStatus === "satisfied_by_scholarship" || summary.amountDue === 0) {
    return { kind: "not_required", applicantName: row.full_name, message: "Your registration fee is covered by the approved full scholarship. No registration payment is required." };
  }
  if (row.payment_status === "underpayment" || row.payment_status === "currency_mismatch") {
    return { kind: "manual_review", applicantName: row.full_name, message: "A previous payment attempt requires administrative reconciliation. Please contact REALMS Institute before making another payment." };
  }
  if ((row.scholarship_status === "approved_partial" || row.scholarship_status === "declined") && summary.amountDue) {
    return { kind: "payable", applicantName: row.full_name, amountDue: summary.amountDue, currency: row.currency, scholarshipStatus: row.scholarship_status };
  }
  return { kind: "not_required", applicantName: row.full_name, message: "Payment is not currently available for this scholarship decision." };
}

export async function initializeScholarshipPayment(token: string) {
  const payload = decodeToken(token);
  if (!payload) return { success: false as const, status: 401, message: "This scholarship payment link is invalid or has expired." };
  const row = await loadRegistration(payload.registrationId);
  if (!row) return { success: false as const, status: 404, message: "Scholarship application not found." };
  const summary = financials(row);
  if (!summary.valid) return { success: false as const, status: 409, message: "The saved scholarship arrangement requires administrative review." };
  if (summary.financialRequirementStatus === "satisfied_by_payment") return { success: true as const, completed: true as const, message: "Payment has already been completed." };
  if (summary.financialRequirementStatus === "satisfied_by_scholarship" || !summary.amountDue) return { success: false as const, status: 409, message: "No registration payment is required for the current scholarship decision." };
  if (row.scholarship_status !== "approved_partial" && row.scholarship_status !== "declined") {
    return { success: false as const, status: 409, message: "Payment is not available for the current scholarship decision." };
  }
  if (row.payment_status === "underpayment" || row.payment_status === "currency_mismatch") {
    return { success: false as const, status: 409, message: "A previous payment requires administrative reconciliation. Please contact REALMS Institute." };
  }

  const expectedAmount = Number(row.payment_expected_amount);
  if (
    row.payment_status === "pending"
    && row.payment_reference
    && row.payment_authorization_url
    && expectedAmount === summary.amountDue
  ) {
    return { success: true as const, completed: false as const, authorizationUrl: row.payment_authorization_url, reused: true };
  }
  if (
    row.payment_status === "pending"
    && row.payment_reference
    && !row.payment_authorization_url
    && expectedAmount === summary.amountDue
  ) {
    return { success: false as const, status: 409, message: "Secure payment initialization is already in progress. Please wait a moment and try again." };
  }

  const supabase = getSupabaseAdmin();
  if (!supabase) return { success: false as const, status: 503, message: "Payment is temporarily unavailable." };
  if (!process.env.PAYSTACK_SECRET_KEY || !process.env.NEXT_PUBLIC_SITE_URL) return { success: false as const, status: 503, message: "Payment configuration is unavailable." };

  const reference = generatePaymentReference();
  let claim = supabase
    .from("registrations")
    .update({
      payment_reference: reference,
      payment_status: "pending",
      payment_expected_amount: summary.amountDue,
      payment_authorization_url: null,
      payment_initialized_at: null,
      financial_requirement_status: "payment_required",
    })
    .eq("id", row.id)
    .eq("funding_route", "scholarship_request")
    .eq("scholarship_status", row.scholarship_status)
    .eq("payment_status", row.payment_status);
  claim = row.payment_reference ? claim.eq("payment_reference", row.payment_reference) : claim.is("payment_reference", null);
  const claimed = await claim.select("id").maybeSingle();
  if (claimed.error) {
    console.error("Scholarship payment initialization claim failed", { code: claimed.error.code });
    return { success: false as const, status: 503, message: "Payment could not be initialized safely." };
  }
  if (!claimed.data) {
    const refreshed = await loadRegistration(row.id);
    if (refreshed?.payment_status === "pending" && refreshed.payment_authorization_url && Number(refreshed.payment_expected_amount) === summary.amountDue) {
      return { success: true as const, completed: false as const, authorizationUrl: refreshed.payment_authorization_url, reused: true };
    }
    return { success: false as const, status: 409, message: "The scholarship decision or payment state changed. Please refresh and try again." };
  }

  const callbackUrl = new URL("/payment/verify", process.env.NEXT_PUBLIC_SITE_URL);
  callbackUrl.searchParams.set("reference", reference);
  let transaction: Awaited<ReturnType<typeof initializePaystackTransaction>>;
  try {
    transaction = await initializePaystackTransaction({
      email: row.email,
      fee: { amount: summary.amountDue, currency: row.currency },
      reference,
      callbackUrl: callbackUrl.toString(),
      metadata: {
        source: scholarshipPaystackMetadataSource,
        registration_id: row.id,
        payment_purpose: row.scholarship_status === "approved_partial" ? "partial_scholarship_contribution" : "registration_after_scholarship_decline",
      },
    });
  } catch (error) {
    console.error("Scholarship Paystack initialization failed", { name: error instanceof Error ? error.name : "UnknownError", applicationId: row.id });
    return { success: false as const, status: 502, message: "Unable to initialize payment. Please try again shortly or contact REALMS Institute." };
  }

  const initializedAt = new Date().toISOString();
  const stored = await supabase.from("registrations").update({
    payment_authorization_url: transaction.authorization_url,
    payment_initialized_at: initializedAt,
  }).eq("id", row.id).eq("payment_reference", reference).eq("payment_status", "pending").select("id").maybeSingle();
  if (stored.error || !stored.data) {
    console.error("Scholarship payment recovery URL could not be saved", { applicationId: row.id, reference });
  }
  return { success: true as const, completed: false as const, authorizationUrl: transaction.authorization_url, reused: false };
}

export async function resolveScholarshipPaymentFromPaystack(metadata: unknown, reference: string): Promise<ScholarshipPaymentResolution | null> {
  const source = metadata && typeof metadata === "object" && !Array.isArray(metadata) ? metadata as Record<string, unknown> : {};
  if (source.source !== scholarshipPaystackMetadataSource || typeof source.registration_id !== "string" || !/^[0-9a-f-]{36}$/i.test(source.registration_id)) return null;
  const row = await loadRegistration(source.registration_id);
  if (!row || !paymentReferenceMatchesApplication(row.payment_reference, reference)) return null;
  const summary = financials(row);
  if (!summary.valid || !summary.amountDue || (row.scholarship_status !== "approved_partial" && row.scholarship_status !== "declined")) return null;
  if (Number(row.payment_expected_amount) !== summary.amountDue) return null;
  return {
    applicationId: row.id,
    registration: row,
    financials: summary,
    calculatedFee: {
      amount: summary.amountDue,
      currency: row.currency,
      display: `${row.currency} ${summary.amountDue.toLocaleString("en")}`,
      publicDisplay: `${row.currency} ${summary.amountDue.toLocaleString("en")}`,
    },
  };
}

async function assertTransactionOwnership(paystackData: PaystackVerificationData, applicationId: string) {
  const supabase = getSupabaseAdmin();
  if (!supabase || paystackData.id === undefined || paystackData.id === null) return;
  const assigned = await supabase.from("registrations").select("id").eq("paystack_raw->>id", String(paystackData.id)).neq("id", applicationId).limit(1).maybeSingle();
  if (assigned.error) throw new Error("PAYSTACK_TRANSACTION_OWNERSHIP_CHECK_FAILED");
  if (assigned.data) throw new PaymentRegistrationConflictError();
}

export async function recordUnconfirmedScholarshipPayment(paystackData: PaystackVerificationData, resolved: ScholarshipPaymentResolution, reconciliation: PaymentReconciliation) {
  if (reconciliation.accepted) throw new PaymentRegistrationConflictError();
  const supabase = getSupabaseAdmin();
  if (!supabase) return;
  const current = await loadRegistration(resolved.applicationId);
  if (!current || !paymentReferenceMatchesApplication(current.payment_reference, paystackData.reference) || current.payment_status === "success") throw new PaymentRegistrationConflictError();
  await assertTransactionOwnership(paystackData, resolved.applicationId);
  const saved = await supabase.from("registrations").update({
    amount_paid: paystackData.amount / 100,
    payment_status: reconciliation.varianceType,
    financial_requirement_status: "payment_required",
    paystack_raw: {
      ...paystackData,
      realms_payment_reconciliation: {
        expected_amount_kobo: reconciliation.expectedKobo,
        amount_paid_kobo: reconciliation.receivedKobo,
        payment_variance_type: reconciliation.varianceType,
        payment_variance_kobo: reconciliation.varianceKobo,
        currency: reconciliation.receivedCurrency,
        payment_verified_at: null,
        reconciled_at: new Date().toISOString(),
      },
    },
    metadata: paystackData.metadata ?? {},
  }).eq("id", resolved.applicationId).eq("payment_reference", paystackData.reference).neq("payment_status", "success");
  if (saved.error) throw new Error("UNCONFIRMED_SCHOLARSHIP_PAYMENT_RECONCILIATION_FAILED");
}

export async function saveVerifiedScholarshipPayment(paystackData: PaystackVerificationData, resolved: ScholarshipPaymentResolution, reconciliation: PaymentReconciliation): Promise<RegistrationSaveResult> {
  const supabase = getSupabaseAdmin();
  if (!supabase) return { saved: false, reason: "Supabase is not configured." };
  const existing = await loadRegistration(resolved.applicationId);
  if (!existing || !paymentReferenceMatchesApplication(existing.payment_reference, paystackData.reference)) throw new PaymentRegistrationConflictError();
  await assertTransactionOwnership(paystackData, resolved.applicationId);
  if (existing.payment_status === "success") {
    if (Number(existing.amount_paid) !== paystackData.amount / 100 || existing.currency.toUpperCase() !== paystackData.currency.toUpperCase()) throw new PaymentRegistrationConflictError();
    const audit = await recordPaymentVerificationEvent(supabase, { registrationId: existing.id, reference: paystackData.reference, previousStatus: "success", reconciliation });
    return { saved: true, id: existing.id, registration: existing, paymentVerificationAuditStatus: audit };
  }
  const { data, error } = await supabase.from("registrations").update({
    ...buildVerifiedPaymentColumns(paystackData, reconciliation),
    financial_requirement_status: "satisfied_by_payment",
    payment_expected_amount: resolved.financials.amountDue,
  }).eq("id", resolved.applicationId).eq("funding_route", "scholarship_request").eq("payment_reference", paystackData.reference).neq("payment_status", "success").select(scholarshipPaymentSelect).maybeSingle();
  if (error) throw new Error(`SCHOLARSHIP_PAYMENT_SAVE_FAILED:${error.message}`);
  if (!data) {
    const concurrent = await loadRegistration(resolved.applicationId);
    if (!concurrent || concurrent.payment_status !== "success" || concurrent.payment_reference !== paystackData.reference || Number(concurrent.amount_paid) !== paystackData.amount / 100) throw new PaymentRegistrationConflictError();
    const audit = await recordPaymentVerificationEvent(supabase, { registrationId: concurrent.id, reference: paystackData.reference, previousStatus: "success", reconciliation });
    return { saved: true, id: concurrent.id, registration: concurrent, paymentVerificationAuditStatus: audit };
  }
  const registration = data as ScholarshipPaymentRow;
  const audit = await recordPaymentVerificationEvent(supabase, { registrationId: registration.id, reference: paystackData.reference, previousStatus: existing.payment_status, reconciliation });
  return { saved: true, id: registration.id, registration, paymentVerificationAuditStatus: audit };
}
