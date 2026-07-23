import "server-only";

import { applicationStatusLabels, type ApplicationStatus } from "@/lib/applicationStatus";
import { whatsappChannelUrl } from "@/lib/constants";
import type { AdvancedEntryStatus, AlumniVerificationStatus, ApplicantType, RequestedDiscipleshipRoute, ScholarshipStatus } from "@/lib/registration";
import { scholarshipFinancialSummary } from "@/lib/scholarshipFinance";

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
  scholarship_applicant_message?: string | null;
  financial_requirement_status?: string;
  payment_expected_amount?: number | null;
  paid_at: string | null;
  confirmation_email_sent?: boolean;
  confirmation_email_sent_at?: string | null;
  admin_email_sent?: boolean;
  admin_email_sent_at?: string | null;
  scholarship_confirmation_email_sent?: boolean;
  scholarship_confirmation_email_sent_at?: string | null;
  scholarship_admin_email_sent?: boolean;
  scholarship_admin_email_sent_at?: string | null;
  scholarship_reviewed_at?: string | null;
  scholarship_decision_email_sent?: boolean;
  scholarship_decision_email_sent_at?: string | null;
  scholarship_decision_email_type?: string | null;
  scholarship_decision_email_error?: string | null;
  scholarship_decision_email_last_attempted_at?: string | null;
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
  return registration.amount_paid === null || registration.amount_paid === undefined
    ? "Not recorded"
    : formatMoney(registration.amount_paid, registration.currency);
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
  return createScholarshipDecisionEmail(registration, outcome);
}

const scholarshipSupportAddress = "admissions@mail.grccglobal.org";

function paymentButton(url: string) {
  return `<a href="${escapeHtml(url)}" style="display:inline-block;background:#d7aa45;color:#071327;text-decoration:none;font-weight:700;padding:13px 20px;border-radius:999px">Complete Registration Payment</a>`;
}

export function createScholarshipDecisionEmail(
  registration: EmailRegistration,
  outcome: ScholarshipOutcome,
  options: { paymentUrl?: string | null } = {},
): EmailTemplate {
  const summary = scholarshipFinancialSummary({
    normalFee: Number(registration.amount),
    scholarshipStatus: outcome,
    approvedScholarshipAmount: registration.scholarship_approved_amount,
    amountPaid: registration.amount_paid,
    paymentStatus: registration.payment_status,
  });
  const alreadyPaid = summary.financialRequirementStatus === "satisfied_by_payment";
  const hasPaymentUrl = Boolean(options.paymentUrl);
  const applicantMessage = registration.scholarship_applicant_message?.trim() || null;
  const admissionSeparation = "Scholarship and payment decisions are separate from admission. This decision does not admit or enrol you, and REALMS Institute will communicate any admission decision separately.";

  if (outcome === "approved_full") {
    const details: Array<[string, string | number | null]> = [
      ["Scholarship Decision", "Full Scholarship Approved"],
      ["Normal Registration Fee", normalFee(registration)],
      ["Scholarship Support / Fee Waiver", formatMoney(summary.approvedSupport, registration.currency)],
      ["Applicant Amount Due", formatMoney(0, registration.currency)],
    ];
    const text = `Dear ${registration.full_name},

Your application for scholarship support has been approved in full. Your registration fee for this cohort is fully covered and no registration payment is required.

${textLines(details)}

${admissionSeparation}

For support: ${scholarshipSupportAddress}

With joy in Christ,
REALMS Institute`;
    const html = layout("Full Scholarship Approved", `<p>Dear ${escapeHtml(registration.full_name)},</p><p>Your application for scholarship support has been approved in full. Your registration fee for this cohort is fully covered and no registration payment is required.</p><table style="border-collapse:collapse;width:100%;margin:20px 0">${rows(details)}</table><div style="border-left:4px solid #d7aa45;background:#fff8e6;padding:16px;margin:20px 0"><p style="margin:0">${escapeHtml(admissionSeparation)}</p></div><p style="color:#475569;font-size:14px">For support: <a href="mailto:${scholarshipSupportAddress}" style="color:#071327">${scholarshipSupportAddress}</a></p><p>With joy in Christ,<br><strong>REALMS Institute</strong></p>`);
    return { subject: "REALMS Institute — Full Scholarship Approved", html, text };
  }

  if (outcome === "approved_partial") {
    const details: Array<[string, string | number | null]> = [
      ["Scholarship Decision", "Partial Scholarship Approved"],
      ["Normal Registration Fee", normalFee(registration)],
      ["Scholarship Support / Fee Waiver", formatMoney(summary.approvedSupport, registration.currency)],
      ["Applicant Amount Due", formatMoney(summary.amountDue, registration.currency)],
      ["Payment Status", alreadyPaid ? "Payment completed" : "Payment required"],
    ];
    const paymentText = alreadyPaid
      ? "The required contribution has already been completed. No additional registration payment is requested."
      : hasPaymentUrl
        ? `Complete your registration payment securely using this link:\n${options.paymentUrl}`
        : `Please contact ${scholarshipSupportAddress} for your secure payment link.`;
    const paymentHtml = alreadyPaid
      ? "<p><strong>Payment completed.</strong> No additional registration payment is requested.</p>"
      : `<p>Your approved contribution toward the registration fee is <strong>${escapeHtml(formatMoney(summary.amountDue, registration.currency))}</strong>.</p>${hasPaymentUrl ? `<p style="margin:24px 0">${paymentButton(options.paymentUrl!)}</p>` : `<p>Please contact <a href="mailto:${scholarshipSupportAddress}">${scholarshipSupportAddress}</a> for your secure payment link.</p>`}`;
    const text = `Dear ${registration.full_name},

Congratulations. REALMS Institute has approved partial scholarship support for your registration fee.

${textLines(details)}

${paymentText}

Payment confirms the financial part of your application; it does not by itself mean that you have been admitted.

${admissionSeparation}

For support: ${scholarshipSupportAddress}

With joy in Christ,
REALMS Institute`;
    const html = layout("Partial Scholarship Approved", `<p>Dear ${escapeHtml(registration.full_name)},</p><p>Congratulations. REALMS Institute has approved partial scholarship support for your registration fee.</p><table style="border-collapse:collapse;width:100%;margin:20px 0">${rows(details)}</table>${paymentHtml}<div style="border-left:4px solid #d7aa45;background:#fff8e6;padding:16px;margin:20px 0"><p style="margin:0">Payment confirms the financial part of your application; it does not by itself mean that you have been admitted.</p></div><p>${escapeHtml(admissionSeparation)}</p><p style="color:#475569;font-size:14px">For support: <a href="mailto:${scholarshipSupportAddress}" style="color:#071327">${scholarshipSupportAddress}</a></p><p>With joy in Christ,<br><strong>REALMS Institute</strong></p>`);
    return { subject: "REALMS Institute — Partial Scholarship Approved", html, text };
  }

  if (outcome === "declined") {
    const details: Array<[string, string | number | null]> = [
      ["Scholarship Decision", "Scholarship Request Not Approved"],
      ["Normal Registration Fee", normalFee(registration)],
      ["Applicant Amount Due", formatMoney(summary.amountDue, registration.currency)],
      ["Payment Status", alreadyPaid ? "Payment completed" : "Payment required"],
    ];
    const paymentText = alreadyPaid
      ? "The required registration payment has already been completed. No additional payment is requested."
      : hasPaymentUrl
        ? `If you wish to continue your registration, use this secure payment link:\n${options.paymentUrl}`
        : `If you wish to continue your registration, contact ${scholarshipSupportAddress} for your secure payment link.`;
    const paymentHtml = alreadyPaid
      ? "<p><strong>Payment completed.</strong> No additional registration payment is requested.</p>"
      : `<p>If you wish to continue your registration, the normal registration fee remains due.</p>${hasPaymentUrl ? `<p style="margin:24px 0">${paymentButton(options.paymentUrl!)}</p>` : `<p>Please contact <a href="mailto:${scholarshipSupportAddress}">${scholarshipSupportAddress}</a> for your secure payment link.</p>`}`;
    const text = `Dear ${registration.full_name},

After review, REALMS Institute is unable to approve scholarship support for this application.

${textLines(details)}

${paymentText}

${admissionSeparation}

For support: ${scholarshipSupportAddress}

With joy in Christ,
REALMS Institute`;
    const html = layout("Scholarship Request Update", `<p>Dear ${escapeHtml(registration.full_name)},</p><p>After review, REALMS Institute is unable to approve scholarship support for this application.</p><table style="border-collapse:collapse;width:100%;margin:20px 0">${rows(details)}</table>${paymentHtml}<div style="border-left:4px solid #d7aa45;background:#fff8e6;padding:16px;margin:20px 0"><p style="margin:0">${escapeHtml(admissionSeparation)}</p></div><p style="color:#475569;font-size:14px">For support: <a href="mailto:${scholarshipSupportAddress}" style="color:#071327">${scholarshipSupportAddress}</a></p><p>With joy in Christ,<br><strong>REALMS Institute</strong></p>`);
    return { subject: "REALMS Institute — Scholarship Request Update", html, text };
  }

  const request = applicantMessage || "Please reply to this email with the additional information needed to support your scholarship review.";
  const text = `Dear ${registration.full_name},

REALMS Institute needs more information before completing the review of your scholarship request.

Requested information:
${request}

No scholarship or admission decision has been made by this message. Admission remains a separate review process.

For support: ${scholarshipSupportAddress}

With joy in Christ,
REALMS Institute`;
  const html = layout("More Information Required for Scholarship Review", `<p>Dear ${escapeHtml(registration.full_name)},</p><p>REALMS Institute needs more information before completing the review of your scholarship request.</p><div style="border-left:4px solid #d7aa45;background:#fff8e6;padding:16px;margin:20px 0"><p style="margin:0 0 8px;font-weight:700">Requested information</p><p style="margin:0;white-space:pre-wrap">${escapeHtml(request)}</p></div><p>No scholarship or admission decision has been made by this message. Admission remains a separate review process.</p><p style="color:#475569;font-size:14px">For support: <a href="mailto:${scholarshipSupportAddress}" style="color:#071327">${scholarshipSupportAddress}</a></p><p>With joy in Christ,<br><strong>REALMS Institute</strong></p>`);
  return { subject: "REALMS Institute — More Information Required for Scholarship Review", html, text };
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

type StudentPortalEmailInput = {
  name: string;
  studentNumber: string;
  cohortName: string;
  discipleshipRoute: string;
  skillPathway: string;
  actionUrl: string;
  mode: "activation" | "setup" | "reminder";
};

type FacilitatorPortalEmailInput = {
  name: string;
  cohortName: string;
  assignments: string[];
  actionUrl: string;
  mode: "activation" | "setup" | "reminder";
};

function portalButton(url: string, label: string) {
  return `<a href="${escapeHtml(url)}" style="display:inline-block;background:#d7aa45;color:#071327;text-decoration:none;font-weight:700;padding:13px 20px;border-radius:999px">${escapeHtml(label)}</a>`;
}

export function createStudentPortalActivationEmail(input: StudentPortalEmailInput): EmailTemplate {
  const activation = input.mode === "activation";
  const reminder = input.mode === "reminder";
  const subject = activation ? "Welcome to REALMS Institute — Activate Your Student Account" : reminder ? "REALMS Institute — Your Student Portal Is Ready" : "REALMS Institute — Complete Your Student Account Setup";
  const actionLabel = reminder ? "SIGN IN TO STUDENT PORTAL" : "ACTIVATE STUDENT ACCOUNT";
  const intro = reminder ? "Your existing REALMS account now has access to the Student Portal." : "Your REALMS Student Portal account is ready.";
  const nextStep = reminder ? "Sign in with your existing email address and password to continue your student onboarding." : "Use this secure activation process to create your password and complete your student onboarding.";
  const details = [["Student ID", input.studentNumber], ["Programme", "REALMS School of Discovery"], ["Cohort", input.cohortName], ["Discipleship Route", input.discipleshipRoute], ["Skill Pathway", input.skillPathway]] as Array<[string, string]>;
  const text = `Dear ${input.name},

Congratulations. Your admission into the REALMS School of Discovery — August 2026 Cohort has been confirmed.

${textLines(details)}

${intro}

${nextStep}

${input.actionUrl}

After activation, you will be required to review and acknowledge the August 2026 Student Handbook before beginning your academic activities.

For support:
${realmsEmailSupportAddress}

REALMS Institute
${motto}.`;
  const html = layout(activation ? "Activate Your Student Account" : reminder ? "Your Student Portal Is Ready" : "Complete Your Student Account Setup", `<p>Dear ${escapeHtml(input.name)},</p><p>Congratulations. Your admission into the REALMS School of Discovery — August 2026 Cohort has been confirmed.</p><table style="border-collapse:collapse;width:100%;margin:22px 0">${rows(details)}</table><p>${escapeHtml(intro)}</p><p>${escapeHtml(nextStep)}</p><p style="margin:24px 0">${portalButton(input.actionUrl, actionLabel)}</p><p>After activation, you will be required to review and acknowledge the August 2026 Student Handbook before beginning your academic activities.</p><p style="margin-top:22px;color:#475569;font-size:14px">For support: <a href="mailto:${realmsEmailSupportAddress}" style="color:#071327">${realmsEmailSupportAddress}</a></p><p style="margin-top:24px"><strong>REALMS Institute</strong><br>${escapeHtml(motto)}.</p>`);
  return { subject, html, text };
}

export function createFacilitatorPortalActivationEmail(input: FacilitatorPortalEmailInput): EmailTemplate {
  const activation = input.mode === "activation";
  const reminder = input.mode === "reminder";
  const subject = activation ? "REALMS Institute — Activate Your Facilitator Account" : reminder ? "REALMS Institute — Your Facilitator Portal Is Ready" : "REALMS Institute — Complete Your Facilitator Account Setup";
  const actionLabel = reminder ? "SIGN IN TO FACILITATOR PORTAL" : "ACTIVATE FACILITATOR ACCOUNT";
  const assignmentLines = input.assignments.length ? input.assignments.map((item) => `- ${item}`).join("\n") : "- No current course assignment has been published yet.";
  const assignmentHtml = input.assignments.length ? `<ul style="line-height:1.7;padding-left:20px">${input.assignments.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ul>` : "<p>No current course assignment has been published yet.</p>";
  const instruction = reminder ? "Sign in with your existing email address and password." : "Use this secure activation process to create your password.";
  const text = `Dear ${input.name},

Your REALMS Institute Facilitator Portal access has been prepared for the ${input.cohortName} School of Discovery cohort.

Your assigned course areas currently include:
${assignmentLines}

${instruction}

${input.actionUrl}

After activation you will be able to access only your assigned courses, sessions and authorised academic responsibilities through the Facilitator Portal.

For support:
${realmsEmailSupportAddress}

REALMS Institute`;
  const html = layout(activation ? "Activate Your Facilitator Account" : reminder ? "Your Facilitator Portal Is Ready" : "Complete Your Facilitator Account Setup", `<p>Dear ${escapeHtml(input.name)},</p><p>Your REALMS Institute Facilitator Portal access has been prepared for the ${escapeHtml(input.cohortName)} School of Discovery cohort.</p><h3 style="margin-top:24px;color:#071327">Your assigned course areas currently include</h3>${assignmentHtml}<p>${escapeHtml(instruction)}</p><p style="margin:24px 0">${portalButton(input.actionUrl, actionLabel)}</p><p>After activation you will be able to access only your assigned courses, sessions and authorised academic responsibilities through the Facilitator Portal.</p><p style="margin-top:22px;color:#475569;font-size:14px">For support: <a href="mailto:${realmsEmailSupportAddress}" style="color:#071327">${realmsEmailSupportAddress}</a></p><p style="margin-top:24px"><strong>REALMS Institute</strong></p>`);
  return { subject, html, text };
}

export function createPortalRecoveryEmail(input: { name: string; actionUrl: string }): EmailTemplate {
  const text = `Dear ${input.name},

We received a request to reset the password for your REALMS Institute Portal account.

Use the secure link below to create a new password:
${input.actionUrl}

If you did not request this, you can ignore this email. Do not share this link.

For support:
${realmsEmailSupportAddress}

REALMS Institute`;
  const html = layout("Reset Your Portal Password", `<p>Dear ${escapeHtml(input.name)},</p><p>We received a request to reset the password for your REALMS Institute Portal account.</p><p style="margin:24px 0">${portalButton(input.actionUrl, "RESET PORTAL PASSWORD")}</p><p style="color:#475569;font-size:14px">If you did not request this, you can ignore this email. Do not share this link.</p><p style="margin-top:22px;color:#475569;font-size:14px">For support: <a href="mailto:${realmsEmailSupportAddress}" style="color:#071327">${realmsEmailSupportAddress}</a></p><p style="margin-top:24px"><strong>REALMS Institute</strong></p>`);
  return { subject: "REALMS Institute — Reset Your Portal Password", html, text };
}

export function createPortalSignInLinkEmail(input: { name: string; actionUrl: string }): EmailTemplate {
  const text = `Dear ${input.name},

Use the secure link below to sign in to the REALMS Institute Portal:
${input.actionUrl}

If you did not request this link, you can ignore this email. Do not share this link.

REALMS Institute`;
  const html = layout("Secure Portal Sign-In", `<p>Dear ${escapeHtml(input.name)},</p><p>Use the secure link below to sign in to the REALMS Institute Portal.</p><p style="margin:24px 0">${portalButton(input.actionUrl, "SIGN IN TO REALMS PORTAL")}</p><p style="color:#475569;font-size:14px">If you did not request this link, you can ignore this email. Do not share this link.</p><p style="margin-top:24px"><strong>REALMS Institute</strong></p>`);
  return { subject: "REALMS Institute — Secure Portal Sign-In", html, text };
}

const realmsEmailSupportAddress = "gloryrealm2025@gmail.com";
