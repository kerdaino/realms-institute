import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { conditionalAdmissionStatus, lapsedConditionalAdmissionStatus, shouldFlagLateEntry } from "@/lib/conditionalAdmission";

export async function confirmConditionalAdmissionAfterPayment(
  supabase: SupabaseClient,
  registrationId: string,
  input: { actor: string; paidAt?: string | null },
) {
  const current = await supabase.from("registrations")
    .select("id, application_status, payment_status, financial_requirement_status, paid_at, admission_payment_deadline")
    .eq("id", registrationId)
    .maybeSingle();
  if (current.error || !current.data || current.data.application_status !== conditionalAdmissionStatus) return { transitioned: false as const };
  if (current.data.payment_status !== "success" && current.data.financial_requirement_status !== "satisfied_by_payment") return { transitioned: false as const };

  const paidAt = input.paidAt || current.data.paid_at || new Date().toISOString();
  if (current.data.admission_payment_deadline && Date.parse(paidAt) > Date.parse(current.data.admission_payment_deadline)) {
    const lapsedAt = new Date().toISOString();
    const lapsed = await supabase.from("registrations").update({ application_status: lapsedConditionalAdmissionStatus, admission_offer_lapsed_at: lapsedAt, reviewed_at: lapsedAt, reviewed_by: input.actor }).eq("id", registrationId).eq("application_status", conditionalAdmissionStatus).select("id").maybeSingle();
    if (lapsed.error) throw new Error("CONDITIONAL_ADMISSION_LATE_PAYMENT_REVIEW_FAILED");
    if (lapsed.data) await supabase.from("registration_review_events").insert({
      registration_id: registrationId,
      event_type: "conditional_admission_payment_received_after_deadline",
      previous_state: { application_status: conditionalAdmissionStatus, admission_payment_deadline: current.data.admission_payment_deadline },
      new_state: { application_status: lapsedConditionalAdmissionStatus, payment_status: current.data.payment_status, paid_at: paidAt },
      note: "Verified payment was received after the persisted offer deadline. Admission was not silently reactivated and requires administrative review.",
      actor: input.actor,
      created_at: lapsedAt,
    });
    return { transitioned: false as const, lapsedForLatePayment: Boolean(lapsed.data) };
  }
  const lateEntryRequired = shouldFlagLateEntry(paidAt);
  const confirmedAt = new Date().toISOString();
  const saved = await supabase.from("registrations").update({
    application_status: "admitted",
    admission_confirmed_at: confirmedAt,
    late_entry_required: lateEntryRequired,
    late_entry_flagged_at: lateEntryRequired ? confirmedAt : null,
    reviewed_at: confirmedAt,
    reviewed_by: input.actor,
  }).eq("id", registrationId).eq("application_status", conditionalAdmissionStatus).select("id").maybeSingle();
  if (saved.error) throw new Error("CONDITIONAL_ADMISSION_CONFIRMATION_FAILED");
  if (!saved.data) return { transitioned: false as const };
  await supabase.from("registration_review_events").insert({
    registration_id: registrationId,
    event_type: "conditional_admission_payment_satisfied",
    previous_state: { application_status: conditionalAdmissionStatus },
    new_state: { application_status: "admitted", admission_confirmed_at: confirmedAt, late_entry_required: lateEntryRequired },
    note: lateEntryRequired ? "Verified payment satisfied the offer after classes began. Late Entry / Catch-Up Required." : "Verified payment satisfied the conditional admission requirement.",
    actor: input.actor,
    created_at: confirmedAt,
  });
  return { transitioned: true as const, lateEntryRequired };
}

export async function lapseExpiredConditionalAdmissions(supabase: SupabaseClient, input: { actor: string; now?: Date; apply: boolean }) {
  const now = input.now ?? new Date();
  const result = await supabase.from("registrations")
    .select("id, full_name, email, application_status, admission_payment_deadline")
    .eq("application_status", conditionalAdmissionStatus)
    .is("deleted_at", null)
    .lt("admission_payment_deadline", now.toISOString())
    .order("admission_payment_deadline");
  if (result.error) throw new Error("Expired conditional admissions could not be loaded.");
  const candidates = result.data ?? [];
  if (!input.apply || !candidates.length) return { candidates, lapsed: [] as string[] };

  const lapsed: string[] = [];
  for (const candidate of candidates) {
    const changedAt = new Date().toISOString();
    const updated = await supabase.from("registrations").update({
      application_status: lapsedConditionalAdmissionStatus,
      admission_offer_lapsed_at: changedAt,
      reviewed_at: changedAt,
      reviewed_by: input.actor,
    }).eq("id", candidate.id).eq("application_status", conditionalAdmissionStatus).select("id").maybeSingle();
    if (updated.error) throw new Error(`Admission offer ${candidate.id} could not be lapsed.`);
    if (!updated.data) continue;
    lapsed.push(candidate.id);
    await supabase.from("registration_review_events").insert({
      registration_id: candidate.id,
      event_type: "conditional_admission_offer_lapsed",
      previous_state: { application_status: conditionalAdmissionStatus, admission_payment_deadline: candidate.admission_payment_deadline },
      new_state: { application_status: lapsedConditionalAdmissionStatus, admission_offer_lapsed_at: changedAt },
      note: "The persisted payment deadline passed without a verified payment satisfying the financial requirement.",
      actor: input.actor,
      created_at: changedAt,
    });
  }
  return { candidates, lapsed };
}
