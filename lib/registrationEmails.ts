import "server-only";

import { sendAdminRegistrationNotification, sendApplicantConfirmationEmail, type EmailSendResult } from "@/lib/email";
import type { SavedRegistration } from "@/lib/saveRegistration";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";

export type RegistrationEmailStatus = { applicant: EmailSendResult; admin: EmailSendResult };
type EmailKind = "applicant" | "admin";

async function sendOnce(registration: SavedRegistration, kind: EmailKind): Promise<EmailSendResult> {
  const supabase = getSupabaseAdmin();
  if (!supabase) return { sent: false, reason: "Supabase is required to prevent duplicate emails." };

  const sentColumn = kind === "applicant" ? "confirmation_email_sent" : "admin_email_sent";
  const sentAtColumn = kind === "applicant" ? "confirmation_email_sent_at" : "admin_email_sent_at";
  if (registration[sentColumn]) return { sent: false, reason: "Already sent." };

  const claimedAt = new Date().toISOString();
  const { data: claim, error: claimError } = await supabase.from("registrations")
    .update({ [sentAtColumn]: claimedAt })
    .eq("id", registration.id).eq(sentColumn, false).is(sentAtColumn, null)
    .select("id").maybeSingle();
  if (claimError) {
    console.error(`Could not claim ${kind} registration email`, claimError);
    return { sent: false, reason: "Email delivery could not be started." };
  }
  if (!claim) return { sent: false, reason: "Already sent." };

  const result = kind === "applicant"
    ? await sendApplicantConfirmationEmail(registration)
    : await sendAdminRegistrationNotification(registration);

  if (result.sent) {
    const { error } = await supabase.from("registrations").update({ [sentColumn]: true, [sentAtColumn]: new Date().toISOString() }).eq("id", registration.id).eq(sentAtColumn, claimedAt);
    if (error) console.error(`Could not finalize ${kind} registration email status`, error);
  } else {
    const { error } = await supabase.from("registrations").update({ [sentAtColumn]: null }).eq("id", registration.id).eq(sentColumn, false).eq(sentAtColumn, claimedAt);
    if (error) console.error(`Could not release ${kind} registration email claim`, error);
  }
  return result;
}

export async function sendRegistrationEmailsIfNeeded(registration: SavedRegistration): Promise<RegistrationEmailStatus> {
  const [applicant, admin] = await Promise.all([sendOnce(registration, "applicant"), sendOnce(registration, "admin")]);
  return { applicant, admin };
}
