import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { sendEmail } from "@/lib/email";
import type { EmailSendResult } from "@/lib/email";

function escapeHtml(value: string) { return value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#039;"); }

async function recipientForEnrollment(supabase: SupabaseClient, studentEnrollmentId: string) { const result = await supabase.from("student_enrollments").select("students!inner(legal_name, preferred_name, email)").eq("id", studentEnrollmentId).maybeSingle(); const student = Array.isArray(result.data?.students) ? result.data?.students[0] : result.data?.students; return student?.email ? { email: student.email, name: student.preferred_name || student.legal_name || "REALMS learner" } : null; }

export async function sendBuild12PortalEmail(supabase: SupabaseClient, input: { studentEnrollmentId: string; kind: "graduation_confirmed" | "alumni_activated" | "certificate_issued" | "certificate_corrected" | "award_revoked" | "award_superseded"; entityId: string; version: string }) : Promise<EmailSendResult> {
  const recipient = await recipientForEnrollment(supabase, input.studentEnrollmentId); if (!recipient) return { sent: false, reason: "Recipient email is unavailable." };
  const content = {
    graduation_confirmed: ["Graduation confirmation recorded", "Your REALMS Institute graduation decision has been recorded. Sign in to the secure portal for the official status."],
    alumni_activated: ["Your REALMS alumni account is active", "Your alumni access has been activated. Your completed programme, published result and eligible archive materials are available in the secure alumni portal."],
    certificate_issued: ["Your REALMS institutional certificate is available", "An institutional certificate has been issued. Sign in to the secure alumni portal to view the award record and request a short-lived secure download."],
    certificate_corrected: ["Your corrected REALMS certificate is available", "A corrected institutional certificate has been issued and the previous award has been superseded. Sign in to the secure alumni portal for the current record."],
    award_revoked: ["Important update to your REALMS award", "An authorised decision has changed the validity of a REALMS award record. Sign in to the secure alumni portal and contact REALMS Institute if you need further information."],
    award_superseded: ["Your REALMS award record was superseded", "A previous REALMS award has been replaced through the controlled correction process. Sign in to the secure alumni portal for the current award."],
  } as const;
  const [subject, message] = content[input.kind]; const base = process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, "") ?? ""; const portal = `${base}/alumni`;
  return sendEmail({ to: recipient.email, subject: `REALMS Institute · ${subject}`, text: `Hello ${recipient.name},\n\n${message}\n\nOpen the secure portal: ${portal}\n\nREALMS Institute`, html: `<div style="font-family:Arial,sans-serif;line-height:1.65;color:#172033"><h1 style="font-size:22px;color:#071327">${escapeHtml(subject)}</h1><p>Hello ${escapeHtml(recipient.name)},</p><p>${escapeHtml(message)}</p><p><a href="${escapeHtml(portal)}" style="color:#8a5b08;font-weight:700">Open the secure REALMS portal</a></p><p>REALMS Institute</p></div>`, idempotencyKey: `build12/${input.kind}/${input.entityId}/${input.version}` });
}
