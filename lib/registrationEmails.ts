import "server-only";

import { sendEmail, type EmailSendResult } from "@/lib/email";
import {
  createAdminNewApplicationEmail,
  createAdvancedEntryOutcomeEmail,
  createAlumniVerificationOutcomeEmail,
  createApplicantApplicationReceivedEmail,
  createApplicantStatusUpdateEmail,
  createAdmissionCommunicationEmail,
  createScholarshipAdminEmail,
  createScholarshipApplicantEmail,
  createScholarshipDecisionEmail,
  type AdvancedEntryOutcome,
  type AdmissionCommunicationType,
  type AlumniVerificationOutcome,
  type EmailRegistration,
  type EmailTemplate,
  type ScholarshipOutcome,
} from "@/lib/emailTemplates";
import { scholarshipFinancialSummary } from "@/lib/scholarshipFinance";
import { createScholarshipPaymentLink } from "@/lib/scholarshipPayment.server";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";

export type RegistrationEmailStatus = { applicant: EmailSendResult; admin: EmailSendResult; admission?: EmailSendResult };
export type ScholarshipEmailStatus = { applicant: EmailSendResult; admin: EmailSendResult };
export type ScholarshipDecisionEmailStatus = EmailSendResult & { decision?: ScholarshipOutcome };
export type AdvancedEntryDecisionEmailStatus = EmailSendResult & { decision?: AdvancedEntryOutcome };
type RegistrationEmailOptions = { force?: boolean };
type PaidEmailKind = "applicant" | "admin" | "admission";
type ScholarshipEmailKind = "scholarship_applicant" | "scholarship_admin";

const paidEmailRegistrationSelect = "id, deleted_at, full_name, email, whatsapp, country, city, gender, age_range, church, learning_mode, skill_pathway, reason, referral_source, fee_policy_consent, computer_access_confirmed, amount, amount_paid, currency, public_fee_display, amount_display, payment_reference, payment_status, application_status, applicant_type, requested_discipleship_route, assigned_discipleship_route, advanced_entry_status, alumni_verification_status, screening_status, screening_objective_score, screening_objective_max, scholarship_status, paid_at, confirmation_email_sent, confirmation_email_sent_at, admin_email_sent, admin_email_sent_at, admission_email_sent, admission_email_sent_at";
const scholarshipEmailRegistrationSelect = `${paidEmailRegistrationSelect}, funding_route, scholarship_reason, scholarship_financial_situation, scholarship_can_contribute, scholarship_contribution_amount, scholarship_approved_amount, scholarship_applicant_message, financial_requirement_status, payment_expected_amount, scholarship_reviewed_at, scholarship_confirmation_email_sent, scholarship_confirmation_email_sent_at, scholarship_admin_email_sent, scholarship_admin_email_sent_at, scholarship_decision_email_sent, scholarship_decision_email_sent_at, scholarship_decision_email_type, scholarship_decision_email_error, scholarship_decision_email_last_attempted_at`;
const advancedEntryEmailRegistrationSelect = `${paidEmailRegistrationSelect}, advanced_entry_applicant_message, advanced_entry_decision_email_sent, advanced_entry_decision_email_sent_at, advanced_entry_decision_email_type, advanced_entry_decision_email_error, advanced_entry_decision_email_last_attempted_at, advanced_entry_decision_email_last_attempt_type`;
const admissionCommunicationRegistrationSelect = `${paidEmailRegistrationSelect}, funding_route, financial_requirement_status, payment_expected_amount, payment_authorization_url, scholarship_approved_amount, admission_offer_at, admission_payment_deadline, admission_outstanding_amount, admission_confirmed_at, admission_offer_lapsed_at, late_entry_required`;

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

async function fetchPaidRegistration(id: string) {
  const supabase = getSupabaseAdmin();
  if (!supabase) return { registration: null, reason: "Supabase is required to verify the application is active before email delivery." };
  const { data, error } = await supabase.from("registrations").select(paidEmailRegistrationSelect).eq("id", id).maybeSingle();
  if (error) {
    console.error("Could not fetch registration before email send", error);
    return { registration: null, reason: error.code === "42703" ? "Apply the application soft-delete migration before sending application emails." : "Application state could not be verified before email delivery." };
  }
  if (!data) return { registration: null, reason: "Application was not found before email delivery." };
  return { registration: data as EmailRegistration, reason: null };
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
  const fetched = await fetchPaidRegistration(registration.id);
  if (!fetched.registration) return { sent: false, reason: fetched.reason || "Application state could not be verified before email delivery." };
  const currentRegistration = fetched.registration;
  if (Boolean((currentRegistration as unknown as Record<string, unknown>).deleted_at)) return { sent: false, reason: "Deleted applications cannot receive new communications." };
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
  if (Boolean((registration as unknown as Record<string, unknown>).deleted_at)) return { sent: false, reason: "Deleted applications cannot receive new communications." };
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
  const confirmation = await sendAdmissionCommunication(registration.id, "admission_confirmed");
  const admission = confirmation.sent ? confirmation : await sendAdmissionCommunication(registration.id, "admission_offer_lapsed");
  return { applicant, admin, admission };
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

export async function sendAdmissionCommunication(
  applicationId: string,
  communicationType: AdmissionCommunicationType,
  options: { force?: boolean } = {},
): Promise<EmailSendResult> {
  const supabase = getSupabaseAdmin();
  if (!supabase) return { sent: false, reason: "Supabase is required for auditable admission email delivery." };
  const loaded = await supabase.from("registrations").select(admissionCommunicationRegistrationSelect).eq("id", applicationId).is("deleted_at", null).maybeSingle();
  if (loaded.error || !loaded.data) return { sent: false, reason: "The active application could not be loaded for admission email delivery." };
  const registration = loaded.data as EmailRegistration & { payment_authorization_url?: string | null };
  if (communicationType === "admission_confirmed" && (!registration.admission_offer_at || registration.application_status !== "admitted")) {
    return { sent: false, reason: "This payment did not confirm a conditional admission offer." };
  }
  if (communicationType === "admission_offer_lapsed" && registration.application_status !== "admission_offer_lapsed_payment_outstanding") {
    return { sent: false, reason: "The conditional admission offer has not lapsed." };
  }
  const deadline = registration.admission_payment_deadline || null;
  if (!options.force) {
    let prior = supabase.from("registration_communication_events").select("id").eq("registration_id", applicationId).eq("communication_type", communicationType).eq("delivery_status", "sent");
    if (deadline) prior = prior.contains("content_snapshot", { admission_payment_deadline: deadline });
    const existing = await prior.limit(1).maybeSingle();
    if (!existing.error && existing.data) return { sent: false, reason: "Already sent." };
  }

  let paymentUrl: string | null = null;
  if (communicationType === "conditional_admission_offer" || communicationType === "payment_deadline_extended") {
    try {
      if (registration.funding_route === "scholarship_request") paymentUrl = createScholarshipPaymentLink(applicationId);
      else if (registration.payment_authorization_url) {
        const parsed = new URL(registration.payment_authorization_url);
        if (parsed.protocol === "https:") paymentUrl = parsed.toString();
      }
    } catch {
      paymentUrl = null;
    }
    if (!paymentUrl) return { sent: false, reason: "A secure server-derived payment link is not available. Re-initialize the application payment before sending this offer." };
  }

  const template = createAdmissionCommunicationEmail(registration, communicationType, { paymentUrl });
  const attemptedAt = new Date().toISOString();
  const result = await deliver(
    registration.email,
    template,
    `realms-admission-${applicationId}-${communicationType}-${deadline || registration.admission_confirmed_at || registration.admission_offer_lapsed_at || "current"}`,
  );
  const event = await supabase.from("registration_communication_events").insert({
    registration_id: applicationId,
    communication_type: communicationType,
    recipient_email: registration.email,
    subject_snapshot: template.subject,
    content_snapshot: {
      application_status: registration.application_status,
      admission_payment_deadline: deadline,
      admission_outstanding_amount: registration.admission_outstanding_amount ?? null,
      assigned_discipleship_route: registration.assigned_discipleship_route ?? null,
      skill_pathway: registration.skill_pathway,
      learning_mode: registration.learning_mode,
    },
    delivery_status: result.sent ? "sent" : "failed",
    provider_message_id: result.sent ? result.id ?? null : null,
    provider_error: result.sent ? null : result.reason.slice(0, 1000),
    attempted_at: attemptedAt,
    sent_at: result.sent ? attemptedAt : null,
  });
  if (event.error) console.error("Admission communication audit insert failed", { applicationId, communicationType, code: event.error.code });
  if (result.sent && communicationType === "conditional_admission_offer") {
    await supabase.from("registrations").update({ admission_email_sent: true, admission_email_sent_at: attemptedAt }).eq("id", applicationId);
  }
  return result;
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
    .is("deleted_at", null)
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
    .is("deleted_at", null)
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
    .is("deleted_at", null)
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
