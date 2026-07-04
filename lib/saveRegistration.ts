import "server-only";

import type { PaystackVerificationData } from "@/lib/paystack";
import { validateRegistrationPayload } from "@/lib/registration";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";

export type RegistrationSaveResult =
  | { saved: true; id: string }
  | { saved: false; reason: string };

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
    .select("id")
    .single();

  if (error || !data?.id) throw new Error(`Supabase registration save failed: ${error?.message || "No saved record was returned."}`);
  return { saved: true, id: String(data.id) };
}
