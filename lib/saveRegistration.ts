import "server-only";

import type { PaystackVerificationData } from "@/lib/paystack";
import { calculateCohortFee, type RegistrationPayload, validateRegistrationPayload } from "@/lib/registration";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";

export type RegistrationSaveResult =
  | { saved: true; id: string; registration: SavedRegistration }
  | { saved: false; reason: string };

export type SavedRegistration = {
  id: string;
  full_name: string;
  email: string;
  whatsapp: string;
  country: string;
  city: string;
  gender: string;
  age_range: string;
  church: string | null;
  learning_mode: string;
  skill_pathway: string;
  reason: string;
  referral_source: string;
  fee_policy_consent: boolean;
  computer_access_confirmed: boolean;
  amount: number;
  currency: string;
  public_fee_display: string | null;
  amount_display: string | null;
  exchange_note: string | null;
  payment_reference: string;
  application_status: string;
  admin_note: string | null;
  reviewed_at: string | null;
  reviewed_by: string | null;
  paid_at: string | null;
  confirmation_email_sent: boolean;
  confirmation_email_sent_at: string | null;
  admin_email_sent: boolean;
  admin_email_sent_at: string | null;
  admission_email_sent: boolean;
  admission_email_sent_at: string | null;
};

type CalculatedFeeMetadata = {
  amount: number;
  currency: string;
  display: string;
  publicDisplay?: string;
  exchangeRate?: number;
  exchangeNote?: string;
};

export type NormalizedPaystackRegistrationMetadata =
  | { isValid: true; registration: RegistrationPayload; calculatedFee: CalculatedFeeMetadata | null; missingFields: string[] }
  | { isValid: false; registration: null; calculatedFee: CalculatedFeeMetadata | null; missingFields: string[] };

function readNumber(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() && Number.isFinite(Number(value))) return Number(value);
  return null;
}

function readString(record: Record<string, unknown>, ...keys: string[]) {
  for (const key of keys) {
    const value = record[key];
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return "";
}

function readBoolean(record: Record<string, unknown>, ...keys: string[]) {
  for (const key of keys) {
    const value = record[key];
    if (value === true) return true;
    if (typeof value === "string" && value.trim().toLowerCase() === "true") return true;
  }
  return false;
}

function readCalculatedFee(value: unknown): CalculatedFeeMetadata | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const fee = value as Record<string, unknown>;
  const amount = readNumber(fee.amount);
  if (amount === null || amount <= 0) return null;
  if (typeof fee.currency !== "string" || !fee.currency.trim()) return null;
  if (typeof fee.display !== "string" || !fee.display.trim()) return null;
  const exchangeRate = readNumber(fee.exchangeRate ?? fee.exchange_rate);
  return {
    amount,
    currency: fee.currency.trim(),
    display: fee.display.trim(),
    publicDisplay: readString(fee, "publicDisplay", "public_display"),
    exchangeRate: exchangeRate ?? undefined,
    exchangeNote: readString(fee, "exchangeNote", "exchange_note") || undefined,
  };
}

function readCustomerEmail(customer: unknown) {
  if (!customer || typeof customer !== "object" || Array.isArray(customer)) return null;
  const email = (customer as Record<string, unknown>).email;
  return typeof email === "string" && email.trim() ? email.trim() : null;
}

function publicFeeDisplay(fee: CalculatedFeeMetadata | ReturnType<typeof calculateCohortFee>) {
  if (!fee) return null;
  return "publicDisplay" in fee ? fee.publicDisplay || fee.display : fee.display;
}

function exchangeNote(fee: CalculatedFeeMetadata | ReturnType<typeof calculateCohortFee>) {
  if (!fee) return null;
  return "exchangeNote" in fee ? fee.exchangeNote ?? null : null;
}

const savedRegistrationSelect = "id, full_name, email, whatsapp, country, city, gender, age_range, church, learning_mode, skill_pathway, reason, referral_source, fee_policy_consent, computer_access_confirmed, amount, currency, public_fee_display, amount_display, exchange_note, payment_reference, application_status, admin_note, reviewed_at, reviewed_by, paid_at, confirmation_email_sent, confirmation_email_sent_at, admin_email_sent, admin_email_sent_at, admission_email_sent, admission_email_sent_at";

export function normalizePaystackRegistrationMetadata(metadata: unknown): NormalizedPaystackRegistrationMetadata {
  const source = metadata && typeof metadata === "object" && !Array.isArray(metadata) ? metadata as Record<string, unknown> : {};
  const registrationSource = source.registration && typeof source.registration === "object" && !Array.isArray(source.registration)
    ? source.registration as Record<string, unknown>
    : source;
  const candidate = {
    fullName: readString(registrationSource, "fullName", "full_name", "name"),
    email: readString(registrationSource, "email"),
    whatsapp: readString(registrationSource, "whatsapp"),
    country: readString(registrationSource, "country"),
    city: readString(registrationSource, "city"),
    gender: readString(registrationSource, "gender"),
    ageRange: readString(registrationSource, "ageRange", "age_range"),
    church: readString(registrationSource, "church"),
    learningMode: readString(registrationSource, "learningMode", "learning_mode"),
    skillPathway: readString(registrationSource, "skillPathway", "skill_pathway"),
    reason: readString(registrationSource, "reason"),
    referralSource: readString(registrationSource, "referralSource", "referral_source"),
    consent: readBoolean(registrationSource, "consent"),
    feePolicyConsent: readBoolean(registrationSource, "feePolicyConsent", "fee_policy_consent"),
    computerAccessConfirmed: readBoolean(registrationSource, "computerAccessConfirmed", "computer_access_confirmed"),
  };
  const requiredFields: Array<keyof RegistrationPayload> = ["fullName", "email", "whatsapp", "country", "city", "gender", "ageRange", "learningMode", "skillPathway", "reason", "referralSource", "consent"];
  const missingFields = requiredFields.filter((field) => field === "consent" ? !candidate.consent : !candidate[field]);
  const calculatedFee = readCalculatedFee(source.calculatedFee ?? source.calculated_fee);
  if (missingFields.length > 0) return { isValid: false, registration: null, calculatedFee, missingFields };
  const validation = validateRegistrationPayload({ ...candidate, feePolicyConsent: true, computerAccessConfirmed: true });
  if (!validation.success) {
    return { isValid: false, registration: null, calculatedFee, missingFields: Object.keys(validation.errors) };
  }
  return { isValid: true, registration: { ...validation.data, feePolicyConsent: candidate.feePolicyConsent, computerAccessConfirmed: candidate.computerAccessConfirmed }, calculatedFee, missingFields: [] };
}

export async function saveVerifiedRegistrationFromPaystack(paystackData: PaystackVerificationData): Promise<RegistrationSaveResult> {
  const metadata = paystackData.metadata ?? {};
  if (!metadata || Object.keys(metadata).length === 0) {
    return { saved: false, reason: "Payment confirmed, but registration metadata was not found." };
  }

  const normalized = normalizePaystackRegistrationMetadata(metadata);
  if (!normalized.isValid) return { saved: false, reason: "Payment confirmed, but registration metadata was invalid." };
  if (!paystackData.reference) return { saved: false, reason: "Payment confirmed, but Paystack did not return a payment reference." };

  const supabase = getSupabaseAdmin();
  if (!supabase) return { saved: false, reason: "Supabase is not configured." };

  const registration = normalized.registration;
  const calculatedFee = normalized.calculatedFee ?? calculateCohortFee(registration);
  if (!calculatedFee) return { saved: false, reason: "Payment confirmed, but registration fee metadata was not found." };
  const { data, error } = await supabase
    .from("registrations")
    .insert({
      full_name: registration.fullName,
      email: registration.email,
      whatsapp: registration.whatsapp,
      country: registration.country,
      city: registration.city,
      gender: registration.gender,
      age_range: registration.ageRange,
      church: registration.church || null,
      learning_mode: registration.learningMode,
      skill_pathway: registration.skillPathway,
      reason: registration.reason,
      referral_source: registration.referralSource,
      consent: registration.consent,
      fee_policy_consent: registration.feePolicyConsent,
      computer_access_confirmed: registration.computerAccessConfirmed,
      amount: calculatedFee.amount,
      currency: calculatedFee.currency,
      public_fee_display: publicFeeDisplay(calculatedFee),
      amount_display: calculatedFee.display,
      exchange_note: exchangeNote(calculatedFee),
      payment_reference: paystackData.reference,
      payment_status: "success",
      application_status: "pending_review",
      paid_at: paystackData.paid_at ?? paystackData.paidAt ?? null,
      paystack_customer_email: readCustomerEmail(paystackData.customer),
      paystack_raw: paystackData,
      metadata,
    })
    .select(savedRegistrationSelect)
    .single();

  if (error?.code === "23505") {
    const { data: existing, error: existingError } = await supabase
      .from("registrations")
      .select(savedRegistrationSelect)
      .eq("payment_reference", paystackData.reference)
      .maybeSingle();

    if (existingError || !existing?.id) {
      console.error("Supabase registration save failed:", existingError);
      throw new Error(`Supabase registration lookup failed: ${existingError?.message || "No saved record was returned."}`);
    }
    return { saved: true, id: String(existing.id), registration: existing as SavedRegistration };
  }

  if (error || !data?.id) {
    console.error("Supabase registration save failed:", error);
    throw new Error(`Supabase registration save failed: ${error?.message || "No saved record was returned."}`);
  }
  return { saved: true, id: String(data.id), registration: data as SavedRegistration };
}
