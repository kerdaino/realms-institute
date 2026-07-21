import "server-only";

import { sendEmail, type EmailSendResult } from "@/lib/email";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";

function escapeHtml(value: string) {
  return value.replace(/[&<>'"]/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", "\"": "&quot;" })[character] || character);
}

function title(value: string) {
  return value.replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

export async function sendStudentPortalInvite(studentId: string): Promise<EmailSendResult> {
  const supabase = getSupabaseAdmin();
  if (!supabase) return { sent: false, reason: "Supabase administrative access is not configured." };

  const { data: student, error: studentError } = await supabase.from("students").select("id, student_number, legal_name, email").eq("id", studentId).maybeSingle();
  if (studentError || !student) return { sent: false, reason: "The student account could not be loaded." };
  const { data: enrollment, error: enrollmentError } = await supabase.from("student_enrollments").select("cohort_id, discipleship_route, skill_pathway").eq("student_id", studentId).order("enrolled_at", { ascending: false }).limit(1).maybeSingle();
  if (enrollmentError || !enrollment) return { sent: false, reason: "The student enrolment could not be loaded." };
  const { data: cohort, error: cohortError } = await supabase.from("cohorts").select("name").eq("id", enrollment.cohort_id).maybeSingle();
  if (cohortError || !cohort) return { sent: false, reason: "The student cohort could not be loaded." };

  const { data: linkData, error: linkError } = await supabase.auth.admin.generateLink({
    type: "magiclink",
    email: student.email,
  });
  if (linkError || !linkData.properties.hashed_token) return { sent: false, reason: "A secure portal access link could not be generated." };

  const siteUrl = (process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000").replace(/\/$/, "");
  const accessUrl = `${siteUrl}/auth/confirm?token_hash=${encodeURIComponent(linkData.properties.hashed_token)}&type=magiclink`;
  const route = title(enrollment.discipleship_route);
  const pathway = title(enrollment.skill_pathway);
  const text = `Dear ${student.legal_name},

Your REALMS Institute student account has been prepared.

Student ID:
${student.student_number}

Cohort:
${cohort.name}

Approved Discipleship Route:
${route}

Skill Pathway:
${pathway}

Use the secure access link below to access your REALMS Institute portal.

${accessUrl}

For your security, do not share your portal access link or account credentials.

With joy in Christ,
REALMS Institute`;
  const html = `<div style="background:#050d1c;padding:32px 16px;font-family:Arial,sans-serif;color:#0f172a"><div style="max-width:640px;margin:0 auto;background:#ffffff;border-radius:16px;overflow:hidden"><div style="background:#071327;padding:24px;color:#ffffff"><p style="margin:0;color:#f2d27a;font-size:12px;font-weight:700;letter-spacing:2px;text-transform:uppercase">REALMS Institute</p><h1 style="margin:10px 0 0;font-size:26px">Student Portal Access</h1></div><div style="padding:28px"><p>Dear ${escapeHtml(student.legal_name)},</p><p>Your REALMS Institute student account has been prepared.</p><table style="border-collapse:collapse;width:100%;margin:22px 0"><tbody><tr><td style="padding:9px 0;font-weight:700">Student ID</td><td style="padding:9px 0">${escapeHtml(student.student_number)}</td></tr><tr><td style="padding:9px 0;font-weight:700">Cohort</td><td style="padding:9px 0">${escapeHtml(cohort.name)}</td></tr><tr><td style="padding:9px 0;font-weight:700">Approved Discipleship Route</td><td style="padding:9px 0">${escapeHtml(route)}</td></tr><tr><td style="padding:9px 0;font-weight:700">Skill Pathway</td><td style="padding:9px 0">${escapeHtml(pathway)}</td></tr></tbody></table><p><a href="${escapeHtml(accessUrl)}" style="display:inline-block;background:#d7aa45;color:#071327;text-decoration:none;font-weight:700;padding:13px 20px;border-radius:999px">Access Student Portal</a></p><p style="margin-top:22px;color:#475569;font-size:14px">For your security, do not share your portal access link or account credentials.</p><p style="margin-top:24px">With joy in Christ,<br><strong>REALMS Institute</strong></p></div></div></div>`;

  return sendEmail({
    to: student.email,
    subject: "Your REALMS Institute Student Portal Access",
    html,
    text,
  });
}
