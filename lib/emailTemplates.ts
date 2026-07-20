import "server-only";

import { applicationStatusLabels, type ApplicationStatus } from "@/lib/applicationStatus";
import { whatsappChannelUrl } from "@/lib/constants";
import type { AdvancedEntryStatus, AlumniVerificationStatus, ApplicantType, RequestedDiscipleshipRoute, ScholarshipStatus } from "@/lib/registration";

export type EmailRegistration = {
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
  amount_paid?: number | null;
  currency: string;
  public_fee_display: string | null;
  amount_display: string | null;
  payment_reference: string | null;
  payment_status?: string;
  application_status: ApplicationStatus | string;
  applicant_type: ApplicantType | string;
  requested_discipleship_route: RequestedDiscipleshipRoute | string;
  assigned_discipleship_route?: string | null;
  advanced_entry_status: AdvancedEntryStatus | string;
  alumni_verification_status?: AlumniVerificationStatus | string;
  screening_status?: string;
  screening_objective_score?: number | null;
  screening_objective_max?: number | null;
  funding_route?: string;
  scholarship_status: ScholarshipStatus | string;
  scholarship_reason?: string | null;
  scholarship_financial_situation?: string | null;
  scholarship_can_contribute?: boolean | null;
  scholarship_contribution_amount?: number | null;
  scholarship_approved_amount?: number | null;
  paid_at: string | null;
  confirmation_email_sent?: boolean;
  confirmation_email_sent_at?: string | null;
  admin_email_sent?: boolean;
  admin_email_sent_at?: string | null;
  scholarship_confirmation_email_sent?: boolean;
  scholarship_confirmation_email_sent_at?: string | null;
  scholarship_admin_email_sent?: boolean;
  scholarship_admin_email_sent_at?: string | null;
  admission_email_sent?: boolean;
  admission_email_sent_at?: string | null;
};

export type EmailTemplate = { subject: string; html: string; text: string };

export type AlumniVerificationOutcome = "verified" | "not_verified" | "more_information_required";
export type AdvancedEntryOutcome = "advanced_approved" | "foundation_required" | "more_information_required";
export type ScholarshipOutcome = "approved_full" | "approved_partial" | "declined" | "more_information_required";

const motto = "Bringing the Will of the Father into the Earth Realm";

const applicantTypeLabels: Record<ApplicantType, string> = {
  new_student: "New Student",
  realms_alumnus: "REALMS Alumnus",
  prior_theological_education: "Prior Theological / Discipleship Education",
};

const requestedRouteLabels: Record<RequestedDiscipleshipRoute, string> = {
  foundational: "Foundational Discipleship Programme",
  advanced: "Advanced Discipleship Programme",
};

function escapeHtml(value: string | number | boolean | null | undefined) {
  return String(value ?? "Not provided").replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character]!);
}

function applicantType(registration: EmailRegistration) {
  return applicantTypeLabels[registration.applicant_type as ApplicantType] || humanize(registration.applicant_type);
}

function requestedRoute(registration: EmailRegistration) {
  return requestedRouteLabels[registration.requested_discipleship_route as RequestedDiscipleshipRoute] || humanize(registration.requested_discipleship_route);
}

function formatMoney(amount: number | null | undefined, currency: string) {
  if (amount === null || amount === undefined || !Number.isFinite(Number(amount))) return "Not provided";
  try {
    return new Intl.NumberFormat("en", { style: "currency", currency, maximumFractionDigits: 2 }).format(Number(amount));
  } catch {
    return `${currency} ${Number(amount).toLocaleString("en")}`;
  }
}

function normalFee(registration: EmailRegistration) {
  return registration.public_fee_display || registration.amount_display || formatMoney(registration.amount, registration.currency);
}

function amountPaid(registration: EmailRegistration) {
  const paidAmount = registration.amount_paid ?? (registration.payment_status === "success" ? registration.amount : null);
  return formatMoney(paidAmount, registration.currency);
}

function applicationStatus(registration: EmailRegistration) {
  return applicationStatusLabels[registration.application_status as ApplicationStatus] || "Pending Review";
}

function humanize(value: string | null | undefined) {
  return value ? value.replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase()) : "Not provided";
}

function rows(items: Array<[string, string | number | boolean | null | undefined]>) {
  return items.map(([label, value]) => `<tr><td style="padding:8px 16px 8px 0;color:#475569;font-weight:700;vertical-align:top">${escapeHtml(label)}</td><td style="padding:8px 0;color:#0f172a">${escapeHtml(value)}</td></tr>`).join("");
}

function layout(title: string, body: string) {
  return `<div style="background:#f7f5ef;padding:24px 12px;font-family:Arial,sans-serif;color:#0f172a">
  <div style="max-width:680px;margin:0 auto;background:#ffffff;border:1px solid #e2e8f0">
    <div style="background:#071327;color:#ffffff;padding:24px">
      <div style="height:3px;width:64px;background:#d7aa45;margin-bottom:16px"></div>
      <h1 style="font-size:24px;line-height:1.25;margin:0">REALMS Institute</h1>
      <p style="margin:8px 0 0;color:#d7aa45;font-size:14px">${escapeHtml(motto)}</p>
    </div>
    <div style="padding:24px">
      <h2 style="font-size:20px;line-height:1.35;margin:0 0 16px;color:#071327">${escapeHtml(title)}</h2>
      ${body}
    </div>
  </div>
</div>`;
}

function textLines(items: Array<[string, string | number | boolean | null | undefined]>) {
  return items.map(([label, value]) => `- ${label}: ${value ?? "Not provided"}`).join("\n");
}

function whatsappButton() {
  return `<a href="${whatsappChannelUrl}" style="display:inline-block;background:#071327;color:#ffffff;text-decoration:none;font-weight:700;padding:12px 18px;border-radius:8px">Join the REALMS WhatsApp Channel</a>`;
}

function whatsappCard(title: string, copy: string, note: string) {
  return `<div style="border:1px solid #d7aa45;background:#fff8e6;padding:18px;margin:22px 0;border-radius:8px"><h3 style="margin:0 0 10px;color:#071327">${escapeHtml(title)}</h3><p style="margin:0 0 14px;color:#0f172a">${escapeHtml(copy)}</p><p style="margin:0 0 12px">${whatsappButton()}</p><p style="margin:0 0 16px;color:#071327;font-weight:700">${escapeHtml(whatsappChannelUrl)}</p><p style="margin:0;color:#475569;font-size:14px">${escapeHtml(note)}</p></div>`;
}

function routeNote(registration: EmailRegistration) {
  if (registration.advanced_entry_status === "advanced_approved") {
    return "REALMS Institute has approved your Advanced Discipleship route. This route decision remains separate from admission status.";
  }
  if (registration.applicant_type === "realms_alumnus") {
    return "You have requested the Advanced Discipleship Programme. REALMS Institute will verify your previous School of Discovery participation before confirming your approved discipleship route.";
  }
  if (registration.applicant_type === "prior_theological_education") {
    return "You have requested consideration for Advanced Discipleship entry. Your foundational knowledge screening has been submitted for review. REALMS Institute will confirm your approved discipleship route after review.";
  }
  return "Your requested discipleship route is the Foundational Discipleship Programme.";
}

function applicationSummary(registration: EmailRegistration) {
  return [
    ["Applicant Type", applicantType(registration)],
    ["Requested Discipleship Route", requestedRoute(registration)],
    ["Skill Pathway", registration.skill_pathway],
    ["Skill Pathway Learning Mode", registration.learning_mode],
  ] satisfies Array<[string, string | number | boolean | null | undefined]>;
}

function advancedEntryAdminRows(registration: EmailRegistration) {
  if (registration.applicant_type === "realms_alumnus") return [["Advanced Entry", "Pending Alumni Verification"]] as Array<[string, string | number | null]>;
  if (registration.applicant_type === "prior_theological_education") {
    return [
      ["Advanced Entry", "Foundational Screening Pending Review"],
      ["Objective Screening Score", registration.screening_objective_score === null || registration.screening_objective_score === undefined ? "Not available" : `${registration.screening_objective_score} / ${registration.screening_objective_max ?? 50}`],
    ] as Array<[string, string | number | null]>;
  }
  return [];
}

function applicantDetails(registration: EmailRegistration) {
  return [
    ["Full Name", registration.full_name],
    ["Email", registration.email],
    ["WhatsApp", registration.whatsapp],
    ["Country", registration.country],
    ["State / City", registration.city],
    ["Gender", registration.gender],
    ["Age Range", registration.age_range],
    ["Church / Fellowship", registration.church],
  ] satisfies Array<[string, string | number | boolean | null | undefined]>;
}

function dashboardUrl(registration: EmailRegistration) {
  const siteUrl = (process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000").replace(/\/$/, "");
  return `${siteUrl}/admin/registrations/${registration.id}`;
}

export function createApplicantApplicationReceivedEmail(registration: EmailRegistration): EmailTemplate {
  const summary = [
    ...applicationSummary(registration),
    ["Amount Paid", amountPaid(registration)],
    ["Payment Reference", registration.payment_reference],
  ] as Array<[string, string | number | boolean | null | undefined]>;
  const note = routeNote(registration);
  const text = `Dear ${registration.full_name},

Your registration payment has been confirmed and your application for the next REALMS Institute cohort has been received.

Payment does not mean automatic admission. REALMS Institute will review your application and confirm your admission status separately.

${note}

Application Summary:
${textLines(summary)}

Join the REALMS Institute WhatsApp Channel for cohort updates and review-related announcements:
${whatsappChannelUrl}

Joining the WhatsApp Channel does not confirm route approval or admission.

Please save your payment reference for your records.

With joy in Christ,
REALMS Institute

Motto:
${motto}`;
  const html = layout("Application Received", `<p>Dear ${escapeHtml(registration.full_name)},</p><p>Your registration payment has been confirmed and your application for the next REALMS Institute cohort has been received.</p><p>Payment does not mean automatic admission. REALMS Institute will review your application and confirm your admission status separately.</p><div style="border-left:4px solid #d7aa45;background:#fff8e6;padding:16px;margin:20px 0"><p style="margin:0">${escapeHtml(note)}</p></div><h3 style="margin-top:24px;color:#071327">Application Summary</h3><table style="border-collapse:collapse;width:100%;margin:12px 0 20px">${rows(summary)}</table>${whatsappCard("Stay Informed", "Join the REALMS Institute WhatsApp Channel for cohort updates and review-related announcements.", "Joining the WhatsApp Channel does not confirm route approval or admission.")}<p>Please save your payment reference for your records.</p><p>With joy in Christ,<br><strong>REALMS Institute</strong></p>`);
  return { subject: "REALMS Institute Application Received", html, text };
}

export function createAdminNewApplicationEmail(registration: EmailRegistration): EmailTemplate {
  const programme = [
    ...applicationSummary(registration),
    ...advancedEntryAdminRows(registration),
    ["Computer Access Confirmed", registration.computer_access_confirmed ? "Yes" : "No"],
    ["Fee Policy Consent", registration.fee_policy_consent ? "Yes" : "No"],
    ["Reason for Joining", registration.reason],
    ["Referral Source", registration.referral_source],
    ["Application Status", "Pending Review"],
  ] as Array<[string, string | number | boolean | null | undefined]>;
  const payment = [
    ["Public Fee", normalFee(registration)],
    ["Amount Paid", amountPaid(registration)],
    ["Currency", registration.currency],
    ["Payment Reference", registration.payment_reference],
    ["Paid At", registration.paid_at],
  ] satisfies Array<[string, string | number | boolean | null | undefined]>;
  const adminUrl = dashboardUrl(registration);
  const text = `A new REALMS Institute application has been received and payment has been confirmed.

Applicant Details:
${textLines(applicantDetails(registration))}

Programme Details:
${textLines(programme)}

Payment Details:
${textLines(payment)}

Please review the applicant. Route approval, scholarship support, payment and admission remain separate decisions.

Admin Dashboard:
${adminUrl}`;
  const html = layout("New Application Received", `<p>A new REALMS Institute application has been received and payment has been confirmed.</p><h3 style="margin-top:24px;color:#071327">Applicant Details</h3><table style="border-collapse:collapse;width:100%">${rows(applicantDetails(registration))}</table><h3 style="margin-top:24px;color:#071327">Programme Details</h3><table style="border-collapse:collapse;width:100%">${rows(programme)}</table><h3 style="margin-top:24px;color:#071327">Payment Details</h3><table style="border-collapse:collapse;width:100%">${rows(payment)}</table><div style="border-left:4px solid #d7aa45;background:#fff8e6;padding:16px;margin-top:20px"><p>Route approval, scholarship support, payment and admission remain separate decisions.</p><p><a href="${escapeHtml(adminUrl)}" style="color:#071327;font-weight:700">Open Application in Admin Dashboard</a></p></div>`);
  return { subject: `New REALMS Institute Application: ${registration.full_name}`, html, text };
}

export function createScholarshipApplicantEmail(registration: EmailRegistration): EmailTemplate {
  const summary = applicationSummary(registration);
  const text = `Dear ${registration.full_name},

Your application for the next REALMS Institute cohort and your request for scholarship support have been received.

REALMS Institute will review your scholarship request and contact you by email with the outcome and next steps.

Please note:
- Scholarship support is subject to review and availability.
- A scholarship request does not guarantee funding.
- Scholarship approval does not automatically guarantee admission.

Application Summary:
${textLines(summary)}

Join the REALMS Institute WhatsApp Channel:
${whatsappChannelUrl}

With joy in Christ,
REALMS Institute`;
  const html = layout("Application & Scholarship Request Received", `<p>Dear ${escapeHtml(registration.full_name)},</p><p>Your application for the next REALMS Institute cohort and your request for scholarship support have been received.</p><p>REALMS Institute will review your scholarship request and contact you by email with the outcome and next steps.</p><div style="border-left:4px solid #d7aa45;background:#fff8e6;padding:16px;margin:20px 0"><h3 style="margin:0 0 10px;color:#071327">Please note</h3><ul style="margin:0;padding-left:20px;line-height:1.7"><li>Scholarship support is subject to review and availability.</li><li>A scholarship request does not guarantee funding.</li><li>Scholarship approval does not automatically guarantee admission.</li></ul></div><h3 style="margin-top:24px;color:#071327">Application Summary</h3><table style="border-collapse:collapse;width:100%;margin:12px 0 20px">${rows(summary)}</table>${whatsappCard("Stay Connected", "Join the REALMS Institute WhatsApp Channel for programme updates and review-related announcements.", "Joining the channel does not confirm scholarship support, route approval or admission.")}<p>With joy in Christ,<br><strong>REALMS Institute</strong></p>`);
  return { subject: "REALMS Institute Application & Scholarship Request Received", html, text };
}

export function createScholarshipAdminEmail(registration: EmailRegistration): EmailTemplate {
  const programme = [...applicationSummary(registration), ...advancedEntryAdminRows(registration)];
  const scholarship = [
    ["Normal Registration Fee", normalFee(registration)],
    ["Scholarship Reason", registration.scholarship_reason],
    ["Financial Situation", registration.scholarship_financial_situation],
    ["Can Contribute?", registration.scholarship_can_contribute === null || registration.scholarship_can_contribute === undefined ? "Not provided" : registration.scholarship_can_contribute ? "Yes" : "No"],
    ["Contribution Amount", registration.scholarship_can_contribute ? formatMoney(registration.scholarship_contribution_amount, registration.currency) : "None"],
    ["Scholarship Status", humanize(registration.scholarship_status)],
  ] satisfies Array<[string, string | number | boolean | null | undefined]>;
  const adminUrl = `${dashboardUrl(registration)}#scholarship-review`;
  const text = `A new REALMS Institute scholarship request has been received.

Applicant Details:
${textLines(applicantDetails(registration))}

Programme Details:
${textLines(programme)}

Scholarship Request:
${textLines(scholarship)}

Scholarship approval does not automatically mean admission.

Admin Dashboard:
${adminUrl}`;
  const html = layout("New Scholarship Request", `<p>A new REALMS Institute scholarship request has been received.</p><h3 style="margin-top:24px;color:#071327">Applicant Details</h3><table style="border-collapse:collapse;width:100%">${rows(applicantDetails(registration))}</table><h3 style="margin-top:24px;color:#071327">Programme Details</h3><table style="border-collapse:collapse;width:100%">${rows(programme)}</table><h3 style="margin-top:24px;color:#071327">Scholarship Request</h3><table style="border-collapse:collapse;width:100%">${rows(scholarship)}</table><div style="border-left:4px solid #d7aa45;background:#fff8e6;padding:16px;margin-top:20px"><p>Scholarship approval does not automatically mean admission.</p><p><a href="${escapeHtml(adminUrl)}" style="color:#071327;font-weight:700">Review Scholarship Request</a></p></div>`);
  return { subject: `New REALMS Scholarship Request: ${registration.full_name}`, html, text };
}

function statusContent(status: string) {
  switch (status) {
    case "admitted": return { title: "Application Reviewed — Admission/Onboarding Approved", message: "Your application has been reviewed. REALMS Institute will send your onboarding instructions and cohort details. Please stay connected through the REALMS Institute WhatsApp Channel for cohort updates and onboarding reminders." };
    case "waitlisted": return { title: "Application Reviewed — Waitlisted", message: "Your application has been reviewed and placed on the waitlist. REALMS Institute will contact you if a space becomes available or for future cohort opportunities." };
    case "not_admitted": return { title: "Application Reviewed", message: "Thank you for applying to REALMS Institute. After review, we are unable to place you in this cohort." };
    case "contacted": return { title: "Application Review Update", message: "REALMS Institute has reviewed your application and will contact you for follow-up." };
    default: return { title: "Application Still Under Review", message: "Your application is still under review. REALMS Institute will contact you once your admission/onboarding status has been updated." };
  }
}

export function createApplicantStatusUpdateEmail(registration: EmailRegistration): EmailTemplate {
  const content = statusContent(registration.application_status);
  const text = `Dear ${registration.full_name},

${content.title}

${content.message}

Current Application Status: ${applicationStatus(registration)}

REALMS Institute WhatsApp Channel:
${whatsappChannelUrl}

With joy in Christ,
REALMS Institute`;
  const html = layout(content.title, `<p>Dear ${escapeHtml(registration.full_name)},</p><p>${escapeHtml(content.message)}</p><table style="border-collapse:collapse;width:100%;margin:20px 0">${rows([["Current Application Status", applicationStatus(registration)]])}</table>${whatsappCard("REALMS Institute WhatsApp Channel", "Please use the channel to stay connected to cohort updates, announcements, reminders, and future programme notices.", "Admission status is controlled separately from route and scholarship decisions.")}<p>With joy in Christ,<br><strong>REALMS Institute</strong></p>`);
  return { subject: "REALMS Institute Admission Status Update", html, text };
}

export function createAlumniVerificationOutcomeEmail(registration: EmailRegistration, outcome: AlumniVerificationOutcome): EmailTemplate {
  const content = {
    verified: ["Alumni Verification Completed", "REALMS Institute has verified your previous School of Discovery participation. Your advanced-entry decision and admission status remain separately controlled."],
    not_verified: ["Alumni Verification Update", "REALMS Institute was unable to verify your previous School of Discovery participation using the information provided. This message does not make an admission decision."],
    more_information_required: ["More Information Required for Alumni Verification", "REALMS Institute needs more information to complete verification of your previous School of Discovery participation."],
  }[outcome];
  return outcomeTemplate(registration, content[0], content[1], [["Alumni Verification Status", humanize(outcome)]], "REALMS Institute Alumni Verification Update");
}

export function createAdvancedEntryOutcomeEmail(registration: EmailRegistration, outcome: AdvancedEntryOutcome): EmailTemplate {
  const content = {
    advanced_approved: ["Advanced Entry Approved", "REALMS Institute has approved your entry into the Advanced Discipleship Programme. This route approval does not automatically mean admission."],
    foundation_required: ["Foundational Route Required", "Following review, REALMS Institute has assigned the Foundational Discipleship Programme as your approved discipleship route. This route decision remains separate from admission."],
    more_information_required: ["More Information Required for Advanced Entry", "REALMS Institute needs more information before confirming your approved discipleship route."],
  }[outcome];
  return outcomeTemplate(registration, content[0], content[1], [["Advanced Entry Outcome", humanize(outcome)]], "REALMS Institute Advanced Entry Update");
}

export function createScholarshipOutcomeEmail(registration: EmailRegistration, outcome: ScholarshipOutcome): EmailTemplate {
  const content = {
    approved_full: ["Full Scholarship Approved", "REALMS Institute has approved full scholarship support for your registration/application fee. Scholarship approval does not automatically guarantee admission."],
    approved_partial: ["Partial Scholarship Approved", "REALMS Institute has approved partial scholarship support for your registration/application fee. Scholarship approval does not automatically guarantee admission."],
    declined: ["Scholarship Request Update", "After review, REALMS Institute is unable to approve scholarship support for this application."],
    more_information_required: ["More Information Required for Scholarship Review", "REALMS Institute needs more information before completing the review of your scholarship request."],
  }[outcome];
  const details: Array<[string, string | number | null]> = [["Scholarship Outcome", humanize(outcome)]];
  if (outcome === "approved_full" || outcome === "approved_partial") details.push(["Approved Scholarship Amount", formatMoney(registration.scholarship_approved_amount, registration.currency)]);
  return outcomeTemplate(registration, content[0], content[1], details, "REALMS Institute Scholarship Request Update");
}

function outcomeTemplate(registration: EmailRegistration, title: string, message: string, details: Array<[string, string | number | null]>, subject: string): EmailTemplate {
  const text = `Dear ${registration.full_name},

${message}

${textLines(details)}

Admission status remains separately controlled.

REALMS Institute WhatsApp Channel:
${whatsappChannelUrl}

With joy in Christ,
REALMS Institute`;
  const html = layout(title, `<p>Dear ${escapeHtml(registration.full_name)},</p><p>${escapeHtml(message)}</p><table style="border-collapse:collapse;width:100%;margin:20px 0">${rows(details)}</table><p style="font-weight:700">Admission status remains separately controlled.</p>${whatsappCard("Stay Connected", "Join the REALMS Institute WhatsApp Channel for programme updates.", "Joining the channel does not change your admission status.")}<p>With joy in Christ,<br><strong>REALMS Institute</strong></p>`);
  return { subject, html, text };
}
