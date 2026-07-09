import "server-only";

import { sendEmail, type EmailSendResult } from "@/lib/email";
import { createAdminNewApplicationEmail, createApplicantApplicationReceivedEmail, createApplicantStatusUpdateEmail, type EmailRegistration } from "@/lib/emailTemplates";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";

export type RegistrationEmailStatus = { applicant: EmailSendResult; admin: EmailSendResult };
type RegistrationEmailOptions = { force?: boolean };
type EmailKind = "applicant" | "admin" | "admission";

const emailRegistrationSelect = "id, full_name, email, whatsapp, country, city, gender, age_range, church, learning_mode, skill_pathway, reason, referral_source, fee_policy_consent, computer_access_confirmed, amount, currency, public_fee_display, amount_display, payment_reference, application_status, paid_at, confirmation_email_sent, confirmation_email_sent_at, admin_email_sent, admin_email_sent_at, admission_email_sent, admission_email_sent_at";

function columnsFor(kind: EmailKind) {
  if (kind === "applicant") return { sentColumn: "confirmation_email_sent", sentAtColumn: "confirmation_email_sent_at" };
  if (kind === "admin") return { sentColumn: "admin_email_sent", sentAtColumn: "admin_email_sent_at" };
  return { sentColumn: "admission_email_sent", sentAtColumn: "admission_email_sent_at" };
}

function buildMessage(registration: EmailRegistration, kind: EmailKind) {
  if (kind === "applicant") return { to: registration.email, template: createApplicantApplicationReceivedEmail(registration) };
  if (kind === "admin") return { to: process.env.REALMS_ADMIN_EMAIL?.trim() || "gloryrealm2025@gmail.com", template: createAdminNewApplicationEmail(registration) };
  return { to: registration.email, template: createApplicantStatusUpdateEmail(registration) };
}

async function fetchRegistrationForEmail(id: string, fallback: EmailRegistration) {
  const supabase = getSupabaseAdmin();
  if (!supabase) return fallback;

  const { data, error } = await supabase
    .from("registrations")
    .select(emailRegistrationSelect)
    .eq("id", id)
    .maybeSingle();

  if (error) {
    console.error("Could not fetch registration before email send", error);
    return fallback;
  }

  return (data as EmailRegistration | null) || fallback;
}

async function sendOnce(registration: EmailRegistration, kind: EmailKind, options: RegistrationEmailOptions = {}): Promise<EmailSendResult> {
  const supabase = getSupabaseAdmin();
  if (!supabase) return { sent: false, reason: "Supabase is required to prevent duplicate emails." };

  const { sentColumn, sentAtColumn } = columnsFor(kind);
  const currentRegistration = await fetchRegistrationForEmail(registration.id, registration);
  if (!options.force && Boolean((currentRegistration as unknown as Record<string, unknown>)[sentColumn])) return { sent: false, reason: "Already sent." };

  const { to, template } = buildMessage(currentRegistration, kind);
  const result = await sendEmail({ to, subject: template.subject, html: template.html, text: template.text });

  if (result.sent) {
    const { error } = await supabase
      .from("registrations")
      .update({ [sentColumn]: true, [sentAtColumn]: new Date().toISOString() })
      .eq("id", registration.id);
    if (error) console.error(`Could not finalize ${kind} registration email status`, error);
  }
  return result;
}

export async function sendRegistrationEmailsIfNeeded(registration: EmailRegistration, options: RegistrationEmailOptions = {}): Promise<RegistrationEmailStatus> {
  console.log("sendRegistrationEmailsIfNeeded called for:", registration.email);
  console.log("Applicant email already sent:", registration.confirmation_email_sent);
  console.log("Admin email already sent:", registration.admin_email_sent);
  const applicant = await sendOnce(registration, "applicant", options);
  const admin = await sendOnce(registration, "admin", options);
  return { applicant, admin };
}

export async function sendApplicationStatusEmail(registration: EmailRegistration): Promise<EmailSendResult> {
  return sendOnce(registration, "admission");
}
