import "server-only";

import type { PaystackVerificationData } from "@/lib/paystack";
import { validateRegistrationPayload } from "@/lib/registration";
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
  amount: number;
  currency: string;
  amount_display: string | null;
  payment_reference: string;
  paid_at: string | null;
  confirmation_email_sent: boolean;
  confirmation_email_sent_at: string | null;
  admin_email_sent: boolean;
  admin_email_sent_at: string | null;
};

type CalculatedFeeMetadata = {
  amount: number;
  currency: string;
  display: string;
};

function readCalculatedFee(value: unknown): CalculatedFeeMetadata | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const fee = value as Record<string, unknown>;
  if (typeof fee.amount !== "number" || !Number.isFinite(fee.amount) || fee.amount <= 0) return null;
  if (typeof fee.currency !== "string" || !fee.currency.trim()) return null;
  if (typeof fee.display !== "string" || !fee.display.trim()) return null;
  return { amount: fee.amount, currency: fee.currency, display: fee.display };
}

function readCustomerEmail(customer: unknown) {
  if (!customer || typeof customer !== "object" || Array.isArray(customer)) return null;
  const email = (customer as Record<string, unknown>).email;
  return typeof email === "string" && email.trim() ? email.trim() : null;
}

export async function saveVerifiedRegistrationFromPaystack(paystackData: PaystackVerificationData): Promise<RegistrationSaveResult> {
  const supabase = getSupabaseAdmin();
  if (!supabase) return { saved: false, reason: "Supabase is not configured." };

  const metadata = paystackData.metadata ?? {};
  const validation = validateRegistrationPayload(metadata.registration);
  const calculatedFee = readCalculatedFee(metadata.calculatedFee);
  if (!validation.success || !calculatedFee || !paystackData.reference) {
    throw new Error("Verified Paystack data does not contain a valid REALMS registration.");
  }

  const registration = validation.data;
  const { data, error } = await supabase
    .from("registrations")
    .upsert({
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
      amount: calculatedFee.amount,
      currency: calculatedFee.currency,
      amount_display: calculatedFee.display,
      payment_reference: paystackData.reference,
      payment_status: "success",
      paid_at: paystackData.paid_at ?? paystackData.paidAt ?? null,
      paystack_customer_email: readCustomerEmail(paystackData.customer),
      paystack_raw: paystackData,
      metadata,
    }, { onConflict: "payment_reference" })
    .select("id, full_name, email, whatsapp, country, city, gender, age_range, church, learning_mode, skill_pathway, reason, referral_source, amount, currency, amount_display, payment_reference, paid_at, confirmation_email_sent, confirmation_email_sent_at, admin_email_sent, admin_email_sent_at")
    .single();

  if (error || !data?.id) throw new Error(`Supabase registration save failed: ${error?.message || "No saved record was returned."}`);
  return { saved: true, id: String(data.id), registration: data as SavedRegistration };
}
