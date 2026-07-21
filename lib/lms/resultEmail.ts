import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { sendEmail, type EmailSendResult } from "@/lib/email";

function escapeHtml(value: string) { return value.replace(/[&<>'"]/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", "\"": "&quot;" })[character] ?? character); }

export async function sendResultPublishedEmail(supabase: SupabaseClient, studentEnrollmentId: string): Promise<EmailSendResult> {
  const enrollment = await supabase.from("student_enrollments").select("students(email, preferred_name, legal_name)").eq("id", studentEnrollmentId).maybeSingle();
  const student = Array.isArray(enrollment.data?.students) ? enrollment.data.students[0] : enrollment.data?.students;
  if (enrollment.error || !student?.email) return { sent: false, reason: "Student email is unavailable." };
  const name = student.preferred_name || student.legal_name || "Student";
  const baseUrl = process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, "");
  const portalUrl = baseUrl ? `${baseUrl}/student/results` : "/student/results";
  const message = "Your REALMS Institute programme result has been published. Sign in to the secure student portal to review the official result and programme completion eligibility tracker.";
  return sendEmail({
    to: student.email,
    subject: "REALMS Institute · Programme result published",
    text: `Hello ${name},\n\n${message}\n\nOpen the secure portal: ${portalUrl}\n\nREALMS Institute`,
    html: `<div style="font-family:Arial,sans-serif;line-height:1.65;color:#172033"><h1 style="font-size:22px;color:#071327">Your programme result is available</h1><p>Hello ${escapeHtml(name)},</p><p>${escapeHtml(message)}</p><p><a href="${escapeHtml(portalUrl)}" style="color:#8a5b08;font-weight:700">Open the secure student portal</a></p><p>REALMS Institute</p></div>`,
  });
}
