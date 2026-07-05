import "server-only";

import { Resend } from "resend";

import type { SavedRegistration } from "@/lib/saveRegistration";

export type EmailSendResult = { sent: true } | { sent: false; reason: string };

function emailConfig() {
  const apiKey = process.env.RESEND_API_KEY?.trim();
  const from = process.env.RESEND_FROM_EMAIL?.trim();
  const admin = process.env.REALMS_ADMIN_EMAIL?.trim();
  return apiKey && from ? { apiKey, from, admin } : null;
}

function escapeHtml(value: string | number | null) {
  return String(value ?? "Not provided").replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character]!);
}

function rows(items: Array<[string, string | number | null]>) {
  return items.map(([label, value]) => `<tr><td style="padding:6px 16px 6px 0;color:#475569;font-weight:600;vertical-align:top">${escapeHtml(label)}</td><td style="padding:6px 0;color:#0f172a">${escapeHtml(value)}</td></tr>`).join("");
}

async function send(to: string, subject: string, html: string, text: string): Promise<EmailSendResult> {
  const config = emailConfig();
  if (!config) return { sent: false, reason: "Email is not configured." };

  try {
    const { error } = await new Resend(config.apiKey).emails.send({ from: config.from, to, subject, html, text });
    if (error) {
      console.error("Resend email delivery failed", error);
      return { sent: false, reason: "Email delivery failed." };
    }
    return { sent: true };
  } catch (error) {
    console.error("Resend email delivery failed", error);
    return { sent: false, reason: "Email delivery failed." };
  }
}

export function sendApplicantConfirmationEmail(registration: SavedRegistration) {
  const details: Array<[string, string | number | null]> = [
    ["Name", registration.full_name], ["Email", registration.email], ["WhatsApp", registration.whatsapp],
    ["Learning Mode", registration.learning_mode], ["Skill Pathway", registration.skill_pathway],
    ["Amount Paid", registration.amount_display || `${registration.currency} ${registration.amount}`], ["Payment Reference", registration.payment_reference],
  ];
  const text = `Dear ${registration.full_name},\n\nYour registration payment for the next REALMS Institute cohort has been confirmed.\n\n${details.map(([label, value]) => `${label}: ${value ?? "Not provided"}`).join("\n")}\n\nREALMS Institute will contact you with onboarding details, class schedule, and student instructions.\n\nPlease keep your payment reference for your records.\n\nWith joy in Christ,\nREALMS Institute\n\nBringing the Will of the Father into the Earth Realm`;
  const html = `<div style="font-family:Arial,sans-serif;max-width:640px;margin:auto;color:#0f172a;line-height:1.6"><p>Dear ${escapeHtml(registration.full_name)},</p><p>Your registration payment for the next REALMS Institute cohort has been confirmed.</p><table style="border-collapse:collapse;width:100%;margin:20px 0">${rows(details)}</table><p>REALMS Institute will contact you with onboarding details, class schedule, and student instructions.</p><p>Please keep your payment reference for your records.</p><p>With joy in Christ,<br><strong>REALMS Institute</strong></p><p style="color:#475569;font-size:14px">Bringing the Will of the Father into the Earth Realm</p></div>`;
  return send(registration.email, "REALMS Institute Registration Confirmed", html, text);
}

export function sendAdminRegistrationNotification(registration: SavedRegistration) {
  const config = emailConfig();
  if (!config?.admin) return Promise.resolve<EmailSendResult>({ sent: false, reason: "Email is not configured." });
  const details: Array<[string, string | number | null]> = [
    ["Full name", registration.full_name], ["Email", registration.email], ["WhatsApp", registration.whatsapp],
    ["Country", registration.country], ["State / City", registration.city], ["Gender", registration.gender],
    ["Age range", registration.age_range], ["Church / fellowship", registration.church], ["Learning mode", registration.learning_mode],
    ["Skill pathway", registration.skill_pathway], ["Reason for joining", registration.reason], ["Referral source", registration.referral_source],
    ["Amount paid", registration.amount_display || `${registration.currency} ${registration.amount}`], ["Currency", registration.currency],
    ["Payment reference", registration.payment_reference], ["Paid at", registration.paid_at],
  ];
  const text = `A new registration payment has been confirmed.\n\n${details.map(([label, value]) => `${label}: ${value ?? "Not provided"}`).join("\n")}`;
  const html = `<div style="font-family:Arial,sans-serif;max-width:720px;margin:auto;color:#0f172a;line-height:1.5"><h2>New confirmed registration</h2><p>A new registration payment has been confirmed.</p><table style="border-collapse:collapse;width:100%">${rows(details)}</table></div>`;
  return send(config.admin, `New REALMS Institute Registration: ${registration.full_name}`, html, text);
}
