import "server-only";

import { sendEmail, type EmailSendResult } from "@/lib/email";
import {
  createAdminNewApplicationEmail,
  createAdvancedEntryOutcomeEmail,
  createAlumniVerificationOutcomeEmail,
  createApplicantApplicationReceivedEmail,
  createApplicantStatusUpdateEmail,
  createScholarshipAdminEmail,
  createScholarshipApplicantEmail,
  createScholarshipOutcomeEmail,
  type AdvancedEntryOutcome,
  type AlumniVerificationOutcome,
  type EmailRegistration,
  type EmailTemplate,
  type ScholarshipOutcome,
} from "@/lib/emailTemplates";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";

export type RegistrationEmailStatus = { applicant: EmailSendResult; admin: EmailSendResult };
export type ScholarshipEmailStatus = { applicant: EmailSendResult; admin: EmailSendResult };
type RegistrationEmailOptions = { force?: boolean };
type PaidEmailKind = "applicant" | "admin" | "admission";
type ScholarshipEmailKind = "scholarship_applicant" | "scholarship_admin";

const paidEmailRegistrationSelect = "id, full_name, email, whatsapp, country, city, gender, age_range, church, learning_mode, skill_pathway, reason, referral_source, fee_policy_consent, computer_access_confirmed, amount, amount_paid, currency, public_fee_display, amount_display, payment_reference, payment_status, application_status, applicant_type, requested_discipleship_route, assigned_discipleship_route, advanced_entry_status, alumni_verification_status, screening_status, screening_objective_score, screening_objective_max, scholarship_status, paid_at, confirmation_email_sent, confirmation_email_sent_at, admin_email_sent, admin_email_sent_at, admission_email_sent, admission_email_sent_at";
const scholarshipEmailRegistrationSelect = `${paidEmailRegistrationSelect}, funding_route, scholarship_reason, scholarship_financial_situation, scholarship_can_contribute, scholarship_contribution_amount, scholarship_approved_amount, scholarship_confirmation_email_sent, scholarship_confirmation_email_sent_at, scholarship_admin_email_sent, scholarship_admin_email_sent_at`;

function paidColumns(kind: PaidEmailKind) {
  if (kind === "applicant") return { sentColumn: "confirmation_email_sent", sentAtColumn: "confirmation_email_sent_at" };
  if (kind === "admin") return { sentColumn: "admin_email_sent", sentAtColumn: "admin_email_sent_at" };
  return { sentColumn: "admission_email_sent", sentAtColumn: "admission_email_sent_at" };
}

function scholarshipColumns(kind: ScholarshipEmailKind) {
  if (kind === "scholarship_applicant") return { sentColumn: "scholarship_confirmation_email_sent", sentAtColumn: "scholarship_confirmation_email_sent_at" };
  return { sentColumn: "scholarship_admin_email_sent", sentAtColumn: "scholarship_admin_email_sent_at" };
}

function paidMessage(registration: EmailRegistration, kind: PaidEmailKind) {
  if (kind === "applicant") return { to: registration.email, template: createApplicantApplicationReceivedEmail(registration) };
  if (kind === "admin") return { to: adminEmail(), template: createAdminNewApplicationEmail(registration) };
  return { to: registration.email, template: createApplicantStatusUpdateEmail(registration) };
}

function scholarshipMessage(registration: EmailRegistration, kind: ScholarshipEmailKind) {
  if (kind === "scholarship_applicant") return { to: registration.email, template: createScholarshipApplicantEmail(registration) };
  return { to: adminEmail(), template: createScholarshipAdminEmail(registration) };
}

function adminEmail() {
  return process.env.REALMS_ADMIN_EMAIL?.trim() || "gloryrealm2025@gmail.com";
}

async function fetchPaidRegistration(id: string, fallback: EmailRegistration) {
  const supabase = getSupabaseAdmin();
  if (!supabase) return fallback;
  const { data, error } = await supabase.from("registrations").select(paidEmailRegistrationSelect).eq("id", id).maybeSingle();
  if (error) {
    console.error("Could not fetch registration before email send", error);
    return fallback;
  }
  return (data as EmailRegistration | null) || fallback;
}

async function fetchScholarshipRegistration(id: string) {
  const supabase = getSupabaseAdmin();
  if (!supabase) return { registration: null, reason: "Supabase is required to prevent duplicate emails." };
  const { data, error } = await supabase.from("registrations").select(scholarshipEmailRegistrationSelect).eq("id", id).eq("funding_route", "scholarship_request").maybeSingle();
  if (error) {
    console.error("Could not fetch scholarship application before email send", error);
    return { registration: null, reason: error.code === "42703" ? "Apply the latest Supabase email migration before sending scholarship emails." : "Scholarship application could not be loaded for email delivery." };
  }
  if (!data) return { registration: null, reason: "Scholarship application was not found." };
  return { registration: data as EmailRegistration, reason: null };
}

async function deliver(to: string, template: EmailTemplate) {
  return sendEmail({ to, subject: template.subject, html: template.html, text: template.text });
}

async function sendPaidOnce(registration: EmailRegistration, kind: PaidEmailKind, options: RegistrationEmailOptions = {}): Promise<EmailSendResult> {
  const supabase = getSupabaseAdmin();
  if (!supabase) return { sent: false, reason: "Supabase is required to prevent duplicate emails." };
  const { sentColumn, sentAtColumn } = paidColumns(kind);
  const currentRegistration = await fetchPaidRegistration(registration.id, registration);
  if (!options.force && Boolean((currentRegistration as unknown as Record<string, unknown>)[sentColumn])) return { sent: false, reason: "Already sent." };
  const { to, template } = paidMessage(currentRegistration, kind);
  const result = await deliver(to, template);
  if (result.sent) {
    const { error } = await supabase.from("registrations").update({ [sentColumn]: true, [sentAtColumn]: new Date().toISOString() }).eq("id", registration.id);
    if (error) console.error(`Could not finalize ${kind} registration email status`, error);
  }
  return result;
}

async function sendScholarshipOnce(registration: EmailRegistration, kind: ScholarshipEmailKind): Promise<EmailSendResult> {
  const supabase = getSupabaseAdmin();
  if (!supabase) return { sent: false, reason: "Supabase is required to prevent duplicate emails." };
  const { sentColumn, sentAtColumn } = scholarshipColumns(kind);
  if (Boolean((registration as unknown as Record<string, unknown>)[sentColumn])) return { sent: false, reason: "Already sent." };
  const { to, template } = scholarshipMessage(registration, kind);
  const result = await deliver(to, template);
  if (result.sent) {
    const { error } = await supabase.from("registrations").update({ [sentColumn]: true, [sentAtColumn]: new Date().toISOString() }).eq("id", registration.id).eq(sentColumn, false);
    if (error) console.error(`Could not finalize ${kind} email status`, error);
  }
  return result;
}

export async function sendRegistrationEmailsIfNeeded(registration: EmailRegistration, options: RegistrationEmailOptions = {}): Promise<RegistrationEmailStatus> {
  const applicant = await sendPaidOnce(registration, "applicant", options);
  const admin = await sendPaidOnce(registration, "admin", options);
  return { applicant, admin };
}

export async function sendScholarshipApplicationEmailsIfNeeded(applicationId: string): Promise<ScholarshipEmailStatus> {
  const fetched = await fetchScholarshipRegistration(applicationId);
  if (!fetched.registration) {
    const result = { sent: false as const, reason: fetched.reason || "Scholarship application could not be loaded." };
    return { applicant: result, admin: result };
  }
  const applicant = await sendScholarshipOnce(fetched.registration, "scholarship_applicant");
  const refreshed = await fetchScholarshipRegistration(applicationId);
  const admin = refreshed.registration ? await sendScholarshipOnce(refreshed.registration, "scholarship_admin") : { sent: false as const, reason: refreshed.reason || "Scholarship application could not be reloaded." };
  return { applicant, admin };
}

export async function sendApplicationStatusEmail(registration: EmailRegistration): Promise<EmailSendResult> {
  return sendPaidOnce(registration, "admission");
}

// These review-outcome utilities are intentionally not called by application or
// payment flows. A future authenticated admin action can invoke them explicitly.
export async function sendAlumniVerificationOutcomeEmail(registration: EmailRegistration, outcome: AlumniVerificationOutcome): Promise<EmailSendResult> {
  return deliver(registration.email, createAlumniVerificationOutcomeEmail(registration, outcome));
}

export async function sendAdvancedEntryOutcomeEmail(registration: EmailRegistration, outcome: AdvancedEntryOutcome): Promise<EmailSendResult> {
  return deliver(registration.email, createAdvancedEntryOutcomeEmail(registration, outcome));
}

export async function sendScholarshipOutcomeEmail(registration: EmailRegistration, outcome: ScholarshipOutcome): Promise<EmailSendResult> {
  return deliver(registration.email, createScholarshipOutcomeEmail(registration, outcome));
}
