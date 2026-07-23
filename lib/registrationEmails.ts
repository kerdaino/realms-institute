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
  createScholarshipDecisionEmail,
  type AdvancedEntryOutcome,
  type AlumniVerificationOutcome,
  type EmailRegistration,
  type EmailTemplate,
  type ScholarshipOutcome,
} from "@/lib/emailTemplates";
import { scholarshipFinancialSummary } from "@/lib/scholarshipFinance";
import { createScholarshipPaymentLink } from "@/lib/scholarshipPayment.server";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";

export type RegistrationEmailStatus = { applicant: EmailSendResult; admin: EmailSendResult };
export type ScholarshipEmailStatus = { applicant: EmailSendResult; admin: EmailSendResult };
export type ScholarshipDecisionEmailStatus = EmailSendResult & { decision?: ScholarshipOutcome };
export type AdvancedEntryDecisionEmailStatus = EmailSendResult & { decision?: AdvancedEntryOutcome };
type RegistrationEmailOptions = { force?: boolean };
type PaidEmailKind = "applicant" | "admin" | "admission";
type ScholarshipEmailKind = "scholarship_applicant" | "scholarship_admin";

const paidEmailRegistrationSelect = "id, full_name, email, whatsapp, country, city, gender, age_range, church, learning_mode, skill_pathway, reason, referral_source, fee_policy_consent, computer_access_confirmed, amount, amount_paid, currency, public_fee_display, amount_display, payment_reference, payment_status, application_status, applicant_type, requested_discipleship_route, assigned_discipleship_route, advanced_entry_status, alumni_verification_status, screening_status, screening_objective_score, screening_objective_max, scholarship_status, paid_at, confirmation_email_sent, confirmation_email_sent_at, admin_email_sent, admin_email_sent_at, admission_email_sent, admission_email_sent_at";
const scholarshipEmailRegistrationSelect = `${paidEmailRegistrationSelect}, funding_route, scholarship_reason, scholarship_financial_situation, scholarship_can_contribute, scholarship_contribution_amount, scholarship_approved_amount, scholarship_applicant_message, financial_requirement_status, payment_expected_amount, scholarship_reviewed_at, scholarship_confirmation_email_sent, scholarship_confirmation_email_sent_at, scholarship_admin_email_sent, scholarship_admin_email_sent_at, scholarship_decision_email_sent, scholarship_decision_email_sent_at, scholarship_decision_email_type, scholarship_decision_email_error, scholarship_decision_email_last_attempted_at`;
const advancedEntryEmailRegistrationSelect = `${paidEmailRegistrationSelect}, advanced_entry_applicant_message, advanced_entry_decision_email_sent, advanced_entry_decision_email_sent_at, advanced_entry_decision_email_type, advanced_entry_decision_email_error, advanced_entry_decision_email_last_attempted_at, advanced_entry_decision_email_last_attempt_type`;

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

async function deliver(to: string, template: EmailTemplate, idempotencyKey?: string) {
  return sendEmail({ to, subject: template.subject, html: template.html, text: template.text, idempotencyKey });
}

async function sendPaidOnce(registration: EmailRegistration, kind: PaidEmailKind, options: RegistrationEmailOptions = {}): Promise<EmailSendResult> {
  const supabase = getSupabaseAdmin();
  if (!supabase) return { sent: false, reason: "Supabase is required to prevent duplicate emails." };
  const { sentColumn, sentAtColumn } = paidColumns(kind);
  const currentRegistration = await fetchPaidRegistration(registration.id, registration);
  if (!options.force && Boolean((currentRegistration as unknown as Record<string, unknown>)[sentColumn])) return { sent: false, reason: "Already sent." };
  const { to, template } = paidMessage(currentRegistration, kind);
  const idempotencyKey = options.force ? undefined : `realms-registration-${registration.id}-${kind}`;
  const result = await deliver(to, template, idempotencyKey);
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
  if (outcome === "more_information_required" && !registration.advanced_entry_applicant_message?.trim()) {
    return { sent: false, reason: "Add an applicant-facing information request before sending this decision." };
  }
  return deliver(registration.email, createAdvancedEntryOutcomeEmail(registration, outcome));
}

export async function sendScholarshipOutcomeEmail(registration: EmailRegistration, outcome: ScholarshipOutcome): Promise<EmailSendResult> {
  const financials = scholarshipFinancialSummary({
    normalFee: Number(registration.amount),
    scholarshipStatus: outcome,
    approvedScholarshipAmount: registration.scholarship_approved_amount,
    amountPaid: registration.amount_paid,
    paymentStatus: registration.payment_status,
  });
  const paymentUrl = (outcome === "approved_partial" || outcome === "declined")
    && financials.financialRequirementStatus === "payment_required"
    ? createScholarshipPaymentLink(registration.id)
    : null;
  return deliver(registration.email, createScholarshipDecisionEmail(registration, outcome, { paymentUrl }));
}

const decisionOutcomes = ["approved_full", "approved_partial", "declined", "more_information_required"] as const;

function isDecisionOutcome(value: string): value is ScholarshipOutcome {
  return (decisionOutcomes as readonly string[]).includes(value);
}

export async function sendCurrentScholarshipDecisionEmail(applicationId: string): Promise<ScholarshipDecisionEmailStatus> {
  const supabase = getSupabaseAdmin();
  if (!supabase) return { sent: false, reason: "Supabase is required for auditable scholarship decision email delivery." };
  const now = new Date();
  const cutoff = new Date(now.valueOf() - 30_000).toISOString();
  const { data, error } = await supabase
    .from("registrations")
    .update({
      scholarship_decision_email_last_attempted_at: now.toISOString(),
      scholarship_decision_email_error: null,
    })
    .eq("id", applicationId)
    .eq("funding_route", "scholarship_request")
    .or(`scholarship_decision_email_last_attempted_at.is.null,scholarship_decision_email_last_attempted_at.lt.${cutoff}`)
    .select(scholarshipEmailRegistrationSelect)
    .maybeSingle();
  if (error) {
    console.error("Scholarship decision email attempt could not be claimed", { code: error.code });
    return { sent: false, reason: error.code === "42703" ? "Apply the scholarship decision email migration before sending notifications." : "Scholarship decision email delivery could not be started." };
  }
  if (!data) return { sent: false, reason: "Please wait at least 30 seconds before sending this scholarship decision email again." };
  const registration = data as EmailRegistration;
  const decision = registration.scholarship_status;
  if (!isDecisionOutcome(decision)) return { sent: false, reason: "Save a scholarship decision before sending its notification." };

  const summary = scholarshipFinancialSummary({
    normalFee: Number(registration.amount),
    scholarshipStatus: decision,
    approvedScholarshipAmount: registration.scholarship_approved_amount,
    amountPaid: registration.amount_paid,
    paymentStatus: registration.payment_status,
  });
  if (!summary.valid) {
    const reason = "The saved scholarship amount is inconsistent with the normal registration fee.";
    await supabase.from("registrations").update({ scholarship_decision_email_error: reason }).eq("id", applicationId);
    return { sent: false, reason, decision };
  }

  let paymentUrl: string | null = null;
  try {
    if (
      (decision === "approved_partial" || decision === "declined")
      && summary.financialRequirementStatus === "payment_required"
    ) {
      paymentUrl = createScholarshipPaymentLink(applicationId);
    }
  } catch (linkError) {
    const reason = linkError instanceof Error ? linkError.message : "The secure scholarship payment link could not be created.";
    await supabase.from("registrations").update({ scholarship_decision_email_error: reason.slice(0, 1000) }).eq("id", applicationId);
    return { sent: false, reason, decision };
  }

  const result = await deliver(
    registration.email,
    createScholarshipDecisionEmail(registration, decision, { paymentUrl }),
    `realms-scholarship-decision-${applicationId}-${decision}-${now.toISOString()}`,
  );
  const auditState = {
    scholarship_decision: decision,
    email_sent: result.sent,
    attempted_at: now.toISOString(),
    provider_email_id: result.sent ? result.id ?? null : null,
  };
  if (result.sent) {
    await supabase.from("registrations").update({
      scholarship_decision_email_sent: true,
      scholarship_decision_email_sent_at: now.toISOString(),
      scholarship_decision_email_type: decision,
      scholarship_decision_email_error: null,
    }).eq("id", applicationId);
  } else {
    await supabase.from("registrations").update({
      scholarship_decision_email_error: result.reason.slice(0, 1000),
    }).eq("id", applicationId);
  }
  const audit = await supabase.from("registration_review_events").insert({
    registration_id: applicationId,
    event_type: result.sent ? "scholarship_decision_email_sent" : "scholarship_decision_email_failed",
    previous_state: null,
    new_state: auditState,
    note: result.sent ? "Scholarship decision email delivered through the configured provider." : result.reason.slice(0, 1000),
    actor: "REALMS Admin",
    created_at: now.toISOString(),
  });
  if (audit.error) console.error("Scholarship decision email audit insert failed", { code: audit.error.code });
  return result.sent ? { ...result, decision } : { ...result, decision };
}

const advancedEntryDecisionOutcomes = ["advanced_approved", "foundation_required", "more_information_required"] as const;

function isAdvancedEntryDecisionOutcome(value: string): value is AdvancedEntryOutcome {
  return (advancedEntryDecisionOutcomes as readonly string[]).includes(value);
}

export async function sendCurrentAdvancedEntryDecisionEmail(applicationId: string): Promise<AdvancedEntryDecisionEmailStatus> {
  const supabase = getSupabaseAdmin();
  if (!supabase) return { sent: false, reason: "Supabase is required for auditable advanced-entry decision email delivery." };
  const { data: current, error: currentError } = await supabase
    .from("registrations")
    .select(advancedEntryEmailRegistrationSelect)
    .eq("id", applicationId)
    .maybeSingle();
  if (currentError) {
    console.error("Advanced-entry decision email registration could not be loaded", { code: currentError.code });
    return { sent: false, reason: currentError.code === "42703" ? "Apply the advanced-entry decision email migration before sending notifications." : "The application could not be loaded for email delivery." };
  }
  if (!current) return { sent: false, reason: "Application not found." };
  const registration = current as EmailRegistration;
  const decision = registration.advanced_entry_status;
  if (!isAdvancedEntryDecisionOutcome(decision)) return { sent: false, reason: "Save an advanced-entry decision before sending its notification." };
  if (decision === "more_information_required" && !registration.advanced_entry_applicant_message?.trim()) {
    return { sent: false, reason: "Add an applicant-facing information request before sending this decision.", decision };
  }

  const now = new Date();
  const cutoff = new Date(now.valueOf() - 30_000).toISOString();
  const { data: claimed, error: claimError } = await supabase
    .from("registrations")
    .update({
      advanced_entry_decision_email_last_attempted_at: now.toISOString(),
      advanced_entry_decision_email_last_attempt_type: decision,
      advanced_entry_decision_email_error: null,
    })
    .eq("id", applicationId)
    .eq("advanced_entry_status", decision)
    .or(`advanced_entry_decision_email_last_attempted_at.is.null,advanced_entry_decision_email_last_attempted_at.lt.${cutoff},advanced_entry_decision_email_last_attempt_type.is.null,advanced_entry_decision_email_last_attempt_type.neq.${decision}`)
    .select("id")
    .maybeSingle();
  if (claimError) {
    console.error("Advanced-entry decision email attempt could not be claimed", { code: claimError.code });
    return { sent: false, reason: claimError.code === "42703" ? "Apply the advanced-entry decision email migration before sending notifications." : "Advanced-entry decision email delivery could not be started.", decision };
  }
  if (!claimed) return { sent: false, reason: "Please wait at least 30 seconds before sending this advanced-entry decision email again.", decision };

  const result = await deliver(
    registration.email,
    createAdvancedEntryOutcomeEmail(registration, decision),
    `realms-advanced-entry-decision-${applicationId}-${decision}-${now.toISOString()}`,
  );
  const auditState = {
    advanced_entry_decision: decision,
    email_sent: result.sent,
    attempted_at: now.toISOString(),
    provider_email_id: result.sent ? result.id ?? null : null,
  };
  if (result.sent) {
    await supabase.from("registrations").update({
      advanced_entry_decision_email_sent: true,
      advanced_entry_decision_email_sent_at: now.toISOString(),
      advanced_entry_decision_email_type: decision,
      advanced_entry_decision_email_error: null,
    }).eq("id", applicationId);
  } else {
    await supabase.from("registrations").update({
      advanced_entry_decision_email_error: result.reason.slice(0, 1000),
    }).eq("id", applicationId);
  }
  const audit = await supabase.from("registration_review_events").insert({
    registration_id: applicationId,
    event_type: result.sent ? "advanced_entry_decision_email_sent" : "advanced_entry_decision_email_failed",
    previous_state: null,
    new_state: auditState,
    note: result.sent ? "Advanced-entry decision email delivered through the configured provider." : result.reason.slice(0, 1000),
    actor: "REALMS Admin",
    created_at: now.toISOString(),
  });
  if (audit.error) console.error("Advanced-entry decision email audit insert failed", { code: audit.error.code });
  return { ...result, decision };
}
