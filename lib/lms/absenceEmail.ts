import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { sendEmail, type EmailSendResult } from "@/lib/email";

export type AbsenceEmailKind = "received" | "information_required" | "approved" | "declined" | "makeup_assigned" | "makeup_completed";

const content: Record<AbsenceEmailKind, { subject: string; heading: string; message: string }> = {
  received: { subject: "Absence request received", heading: "Your absence request has been received", message: "REALMS Institute will review your request. You can follow its status in the secure student portal." },
  information_required: { subject: "More information required for your absence request", heading: "More information is required", message: "Please sign in to the secure student portal to review the request and provide the requested information." },
  approved: { subject: "Absence request approved", heading: "Your absence request has been approved", message: "Your attendance classification and any academic make-up requirements are available in the secure student portal." },
  declined: { subject: "Absence request decision available", heading: "A decision is available for your absence request", message: "Please sign in to the secure student portal to review the decision and any available learning-recovery requirements." },
  makeup_assigned: { subject: "Make-up learning assigned", heading: "Make-up learning has been assigned", message: "Please sign in to the secure student portal to review the requirements, materials, and deadline." },
  makeup_completed: { subject: "Make-up learning completed", heading: "Your make-up learning is complete", message: "Your learning-completion record has been updated. Your original attendance classification remains unchanged." },
};

function escapeHtml(value: string) {
  return value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#039;");
}

export async function sendAbsenceEmail(supabase: SupabaseClient, requestId: string, kind: AbsenceEmailKind): Promise<EmailSendResult> {
  const result = await supabase.from("absence_requests").select("id, course_enrollments(student_enrollments(students(email, preferred_name, legal_name)))").eq("id", requestId).maybeSingle();
  const courseEnrollment = Array.isArray(result.data?.course_enrollments) ? result.data.course_enrollments[0] : result.data?.course_enrollments;
  const studentEnrollment = Array.isArray(courseEnrollment?.student_enrollments) ? courseEnrollment.student_enrollments[0] : courseEnrollment?.student_enrollments;
  const student = Array.isArray(studentEnrollment?.students) ? studentEnrollment.students[0] : studentEnrollment?.students;
  if (result.error || !student?.email) return { sent: false, reason: "Student email is unavailable." };
  const name = student.preferred_name || student.legal_name || "Student";
  const template = content[kind];
  const portalPath = `/student/absences/${requestId}`;
  const baseUrl = process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, "");
  const portalUrl = baseUrl ? `${baseUrl}${portalPath}` : portalPath;
  const text = `${template.heading}\n\nHello ${name},\n\n${template.message}\n\nOpen the secure portal: ${portalUrl}\n\nREALMS Institute`;
  const html = `<div style="font-family:Arial,sans-serif;line-height:1.65;color:#172033"><h1 style="font-size:22px;color:#071327">${escapeHtml(template.heading)}</h1><p>Hello ${escapeHtml(name)},</p><p>${escapeHtml(template.message)}</p><p><a href="${escapeHtml(portalUrl)}" style="color:#8a5b08;font-weight:700">Open the secure student portal</a></p><p>REALMS Institute</p></div>`;
  return sendEmail({ to: student.email, subject: `REALMS Institute · ${template.subject}`, text, html });
}

export async function sendMakeupEmail(supabase: SupabaseClient, makeupId: string, kind: "makeup_assigned" | "makeup_completed"): Promise<EmailSendResult> {
  const result = await supabase.from("makeup_requirements").select("id, absence_request_id, course_enrollments(student_enrollments(students(email, preferred_name, legal_name)))").eq("id", makeupId).maybeSingle();
  if (result.data?.absence_request_id) return sendAbsenceEmail(supabase, result.data.absence_request_id, kind);
  const courseEnrollment = Array.isArray(result.data?.course_enrollments) ? result.data.course_enrollments[0] : result.data?.course_enrollments; const studentEnrollment = Array.isArray(courseEnrollment?.student_enrollments) ? courseEnrollment.student_enrollments[0] : courseEnrollment?.student_enrollments; const student = Array.isArray(studentEnrollment?.students) ? studentEnrollment.students[0] : studentEnrollment?.students;
  if (result.error || !student?.email) return { sent: false, reason: "Student email is unavailable." };
  const name = student.preferred_name || student.legal_name || "Student"; const template = content[kind]; const baseUrl = process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, ""); const portalUrl = baseUrl ? `${baseUrl}/student/absences` : "/student/absences";
  return sendEmail({ to: student.email, subject: `REALMS Institute · ${template.subject}`, text: `${template.heading}\n\nHello ${name},\n\n${template.message}\n\nOpen the secure portal: ${portalUrl}\n\nREALMS Institute`, html: `<div style="font-family:Arial,sans-serif;line-height:1.65;color:#172033"><h1 style="font-size:22px;color:#071327">${escapeHtml(template.heading)}</h1><p>Hello ${escapeHtml(name)},</p><p>${escapeHtml(template.message)}</p><p><a href="${escapeHtml(portalUrl)}" style="color:#8a5b08;font-weight:700">Open the secure student portal</a></p><p>REALMS Institute</p></div>` });
}
