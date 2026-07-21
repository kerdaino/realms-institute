import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { sendEmail, type EmailSendResult } from "@/lib/email";

function escapeHtml(value: string) { return value.replace(/[&<>'"]/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", "\"": "&quot;" })[character] ?? character); }

export type EngagementEmailKind = "mentor_assigned" | "recovery_plan_activated" | "review_case_opened" | "response_required" | "standing_changed" | "review_decision_published";

const eventCopy: Record<EngagementEmailKind, { subject: string; heading: string; message: string }> = {
  mentor_assigned: { subject: "Mentor support assigned", heading: "A REALMS mentor has been assigned", message: "Your current mentor information is available in the secure student portal." },
  recovery_plan_activated: { subject: "Recovery plan active", heading: "Your recovery plan is now active", message: "Please review the plan, concrete actions, and dates in the secure student portal." },
  review_case_opened: { subject: "Academic review opened", heading: "An academic review has been opened", message: "Please review the concern in substance, your response rights, and the response deadline in the secure student portal." },
  response_required: { subject: "Response required", heading: "Your response is requested", message: "A response opportunity and deadline are available in the secure student portal." },
  standing_changed: { subject: "Academic standing updated", heading: "Your academic standing has been updated", message: "Please sign in to review your current standing, the recorded reason, and any available support." },
  review_decision_published: { subject: "Review decision available", heading: "A review decision is available", message: "Please sign in to review the institutional decision and next steps. A recommendation alone does not silently change your enrolment outcome." },
};

export async function sendEngagementEventEmail(supabase: SupabaseClient, studentEnrollmentId: string, kind: EngagementEmailKind): Promise<EmailSendResult> {
  const enrollment = await supabase.from("student_enrollments").select("students(email, preferred_name, legal_name)").eq("id", studentEnrollmentId).maybeSingle();
  const student = Array.isArray(enrollment.data?.students) ? enrollment.data.students[0] : enrollment.data?.students;
  if (enrollment.error || !student?.email) return { sent: false, reason: "Student email is unavailable." };
  const copy = eventCopy[kind]; const name = student.preferred_name || student.legal_name || "Student"; const baseUrl = process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, ""); const portalUrl = baseUrl ? `${baseUrl}/student/standing` : "/student/standing";
  return sendEmail({ to: student.email, subject: `REALMS Institute · ${copy.subject}`, text: `Hello ${name},\n\n${copy.message}\n\nOpen the secure portal: ${portalUrl}\n\nREALMS Institute`, html: `<div style="font-family:Arial,sans-serif;line-height:1.65;color:#172033"><h1 style="font-size:22px;color:#071327">${escapeHtml(copy.heading)}</h1><p>Hello ${escapeHtml(name)},</p><p>${escapeHtml(copy.message)}</p><p><a href="${escapeHtml(portalUrl)}" style="color:#8a5b08;font-weight:700">Open the secure student portal</a></p><p>REALMS Institute</p></div>` });
}

export async function sendStandingNoticeEmail(supabase: SupabaseClient, warningNoticeId: string): Promise<EmailSendResult> {
  const prior = await supabase.from("student_notice_deliveries").select("id, delivery_status, provider_message_id").eq("warning_notice_id", warningNoticeId).eq("channel", "email").maybeSingle();
  if (prior.data?.delivery_status === "sent" || prior.data?.delivery_status === "delivered") return { sent: true, id: prior.data.provider_message_id ?? undefined };
  const result = await supabase.from("student_warning_notices").select("id, title, notice_type, reason_summary, required_action, response_due_at, student_enrollments(students(email, preferred_name, legal_name))").eq("id", warningNoticeId).maybeSingle();
  const enrollment = Array.isArray(result.data?.student_enrollments) ? result.data.student_enrollments[0] : result.data?.student_enrollments;
  const student = Array.isArray(enrollment?.students) ? enrollment.students[0] : enrollment?.students;
  if (result.error || !result.data || !student?.email) return { sent: false, reason: "Student email is unavailable." };
  const attemptedAt = new Date().toISOString();
  let deliveryId = prior.data?.id ?? null;
  if (!deliveryId) {
    const inserted = await supabase.from("student_notice_deliveries").insert({ warning_notice_id: warningNoticeId, channel: "email", delivery_status: "pending", attempted_at: attemptedAt }).select("id").single();
    deliveryId = inserted.data?.id ?? null;
  } else await supabase.from("student_notice_deliveries").update({ delivery_status: "pending", attempted_at: attemptedAt, failure_reason: null }).eq("id", deliveryId);
  const name = student.preferred_name || student.legal_name || "Student";
  const baseUrl = process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, ""); const portalUrl = baseUrl ? `${baseUrl}/student/standing` : "/student/standing";
  const due = result.data.response_due_at ? ` Please respond by ${new Date(result.data.response_due_at).toLocaleString("en-NG")}.` : "";
  const message = `A formal notice is available in your secure REALMS Institute portal.${due} Please use the portal to read the complete notice, required action, and support route.`;
  const sent = await sendEmail({ to: student.email, subject: `REALMS Institute · ${result.data.title}`, text: `Hello ${name},\n\n${message}\n\nOpen the secure portal: ${portalUrl}\n\nREALMS Institute`, html: `<div style="font-family:Arial,sans-serif;line-height:1.65;color:#172033"><h1 style="font-size:22px;color:#071327">${escapeHtml(result.data.title)}</h1><p>Hello ${escapeHtml(name)},</p><p>${escapeHtml(message)}</p><p><a href="${escapeHtml(portalUrl)}" style="color:#8a5b08;font-weight:700">Open the secure student portal</a></p><p>REALMS Institute</p></div>` });
  if (deliveryId) await supabase.from("student_notice_deliveries").update(sent.sent ? { delivery_status: "sent", provider_message_id: sent.id ?? null, delivered_at: new Date().toISOString(), failure_reason: null } : { delivery_status: "failed", failure_reason: sent.reason }).eq("id", deliveryId);
  return sent;
}
