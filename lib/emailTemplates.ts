import "server-only";

import { applicationStatusLabels, type ApplicationStatus } from "@/lib/applicationStatus";
import { whatsappChannelUrl } from "@/lib/constants";

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
  currency: string;
  public_fee_display: string | null;
  amount_display: string | null;
  payment_reference: string;
  application_status: ApplicationStatus | string;
  paid_at: string | null;
  confirmation_email_sent?: boolean;
  confirmation_email_sent_at?: string | null;
  admin_email_sent?: boolean;
  admin_email_sent_at?: string | null;
  admission_email_sent?: boolean;
  admission_email_sent_at?: string | null;
};

type EmailTemplate = { subject: string; html: string; text: string };

const motto = "Bringing the Will of the Father into the Earth Realm";

function escapeHtml(value: string | number | boolean | null | undefined) {
  return String(value ?? "Not provided").replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character]!);
}

function amountPaid(registration: EmailRegistration) {
  return registration.amount_display || `${registration.currency} ${registration.amount}`;
}

function applicationStatus(registration: EmailRegistration) {
  return applicationStatusLabels[registration.application_status as ApplicationStatus] || "Pending Review";
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
  return `<div style="border:1px solid #d7aa45;background:#fff8e6;padding:18px;margin:22px 0;border-radius:8px"><h3 style="margin:0 0 10px;color:#071327">${escapeHtml(title)}</h3><p style="margin:0 0 14px;color:#0f172a">${escapeHtml(copy)}</p><p style="margin:0 0 16px">${whatsappButton()}</p><p style="margin:0;color:#475569;font-size:14px">${escapeHtml(note)}</p></div>`;
}

export function createApplicantApplicationReceivedEmail(registration: EmailRegistration): EmailTemplate {
  const summary: Array<[string, string | number | null]> = [
    ["Name", registration.full_name],
    ["Email", registration.email],
    ["WhatsApp", registration.whatsapp],
    ["Learning Mode", registration.learning_mode],
    ["Skill Pathway", registration.skill_pathway],
    ["Amount Paid", amountPaid(registration)],
    ["Payment Reference", registration.payment_reference],
    ["Application Status", "Pending Review"],
  ];
  const text = `Dear ${registration.full_name},

Your registration payment has been confirmed and your application for the next REALMS Institute cohort has been received.

Please note that payment does not mean automatic admission. REALMS Institute will review your application and contact you by email with your admission/onboarding status and next steps.

Application Summary:
${textLines(summary)}

Important Next Step: Join the WhatsApp Channel
Please join the REALMS Institute WhatsApp Channel so you do not miss cohort updates, announcements, onboarding reminders, and future program notices while your application is being reviewed.

${whatsappChannelUrl}

Joining the WhatsApp Channel does not confirm admission, but it helps you stay informed while your application is being reviewed.

Please save your payment reference for your records.

With joy in Christ,
REALMS Institute

Motto:
${motto}`;
  const html = layout("Application Received", `<p>Dear ${escapeHtml(registration.full_name)},</p><p>Your registration payment has been confirmed and your application for the next REALMS Institute cohort has been received.</p><p>Please note that payment does not mean automatic admission. REALMS Institute will review your application and contact you by email with your admission/onboarding status and next steps.</p><h3 style="margin-top:24px;color:#071327">Application Summary</h3><table style="border-collapse:collapse;width:100%;margin:12px 0 20px">${rows(summary)}</table>${whatsappCard("Important Next Step: Join the WhatsApp Channel", "Please join the REALMS Institute WhatsApp Channel so you do not miss cohort updates, announcements, onboarding reminders, and future program notices while your application is being reviewed.", "Joining the WhatsApp Channel does not confirm admission, but it helps you stay informed while your application is being reviewed.")}<p>Please save your payment reference for your records.</p><p>With joy in Christ,<br><strong>REALMS Institute</strong></p>`);
  return { subject: "REALMS Institute Application Received", html, text };
}

export function createAdminNewApplicationEmail(registration: EmailRegistration): EmailTemplate {
  const applicant: Array<[string, string | number | boolean | null]> = [
    ["Full Name", registration.full_name],
    ["Email", registration.email],
    ["WhatsApp", registration.whatsapp],
    ["Country", registration.country],
    ["State / City", registration.city],
    ["Gender", registration.gender],
    ["Age Range", registration.age_range],
    ["Church / Fellowship", registration.church],
  ];
  const cohort: Array<[string, string | number | boolean | null]> = [
    ["Learning Mode", registration.learning_mode],
    ["Skill Pathway", registration.skill_pathway],
    ["Computer Access Confirmed", registration.computer_access_confirmed ? "Yes" : "No"],
    ["Fee Policy Consent", registration.fee_policy_consent ? "Yes" : "No"],
    ["Reason for Joining", registration.reason],
    ["Referral Source", registration.referral_source],
    ["Application Status", "Pending Review"],
  ];
  const payment: Array<[string, string | number | boolean | null]> = [
    ["Public Fee", registration.public_fee_display],
    ["Amount Paid", amountPaid(registration)],
    ["Currency", registration.currency],
    ["Payment Reference", registration.payment_reference],
    ["Paid At", registration.paid_at],
  ];
  const dashboardUrl = `${process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000"}/admin/registrations`;
  const text = `A new REALMS Institute application has been received and payment has been confirmed.

Applicant Details:
${textLines(applicant)}

Cohort Details:
${textLines(cohort)}

Payment Details:
${textLines(payment)}

Admin Action:
Please review the applicant in the admin dashboard and update their admission/onboarding status.

Applicant has been instructed to join the REALMS Institute WhatsApp Channel for updates.

Admin Dashboard:
${dashboardUrl}`;
  const html = layout("New Application Received", `<p>A new REALMS Institute application has been received and payment has been confirmed.</p><h3 style="margin-top:24px;color:#071327">Applicant Details</h3><table style="border-collapse:collapse;width:100%">${rows(applicant)}</table><h3 style="margin-top:24px;color:#071327">Cohort Details</h3><table style="border-collapse:collapse;width:100%">${rows(cohort)}</table><h3 style="margin-top:24px;color:#071327">Payment Details</h3><table style="border-collapse:collapse;width:100%">${rows(payment)}</table><div style="border-left:4px solid #d7aa45;background:#fff8e6;padding:16px;margin-top:20px"><h3 style="margin:0 0 8px;color:#071327">Admin Action</h3><p>Please review the applicant in the admin dashboard and update their admission/onboarding status.</p><p>Applicant has been instructed to join the REALMS Institute WhatsApp Channel for updates.</p><p><a href="${escapeHtml(dashboardUrl)}" style="color:#071327;font-weight:700">Open Admin Dashboard</a></p></div>`);
  return { subject: `New REALMS Institute Application: ${registration.full_name}`, html, text };
}

function statusContent(status: string) {
  switch (status) {
    case "admitted":
      return {
        title: "Application Reviewed — Admission/Onboarding Approved",
        message: "Your application has been reviewed. REALMS Institute will send your onboarding instructions and cohort details. Please stay connected through the REALMS Institute WhatsApp Channel for cohort updates and onboarding reminders.",
      };
    case "waitlisted":
      return {
        title: "Application Reviewed — Waitlisted",
        message: "Your application has been reviewed and placed on the waitlist. REALMS Institute will contact you if a space becomes available or for future cohort opportunities. Please stay connected through the REALMS Institute WhatsApp Channel for future updates and cohort opportunities.",
      };
    case "not_admitted":
      return {
        title: "Application Reviewed",
        message: "Thank you for applying to REALMS Institute. After review, we are unable to place you in this cohort. You may still stay connected through the REALMS Institute WhatsApp Channel for future cohort updates and program notices.",
      };
    case "contacted":
      return {
        title: "Application Review Update",
        message: "REALMS Institute has reviewed your application and will contact you for follow-up. Please stay connected through the REALMS Institute WhatsApp Channel while REALMS Institute follows up with you.",
      };
    default:
      return {
        title: "Application Still Under Review",
        message: "Your application is still under review. REALMS Institute will contact you once your admission/onboarding status has been updated. Please stay connected through the REALMS Institute WhatsApp Channel for cohort updates, announcements, reminders, and future program notices.",
      };
  }
}

export function createApplicantStatusUpdateEmail(registration: EmailRegistration): EmailTemplate {
  const content = statusContent(registration.application_status);
  const text = `Dear ${registration.full_name},

${content.title}

${content.message}

Current Application Status: ${applicationStatus(registration)}

REALMS Institute WhatsApp Channel:
Join the REALMS WhatsApp Channel
${whatsappChannelUrl}

With joy in Christ,
REALMS Institute

Motto:
${motto}`;
  const html = layout(content.title, `<p>Dear ${escapeHtml(registration.full_name)},</p><p>${escapeHtml(content.message)}</p><table style="border-collapse:collapse;width:100%;margin:20px 0">${rows([["Current Application Status", applicationStatus(registration)]])}</table>${whatsappCard("REALMS Institute WhatsApp Channel", "Please use the channel to stay connected to cohort updates, announcements, reminders, and future program notices.", "Joining the WhatsApp Channel does not confirm admission, but it helps you stay informed.")}<p>With joy in Christ,<br><strong>REALMS Institute</strong></p>`);
  return { subject: "REALMS Institute Admission Status Update", html, text };
}
