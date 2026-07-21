import Link from "next/link";

import { PortalShell } from "@/components/portal/PortalShell";
import { requireRole } from "@/lib/lms/auth";
import { requireLmsAdminClient } from "@/lib/lms/adminData";
import { humanizeEngagement } from "@/lib/lms/engagement";
import { fetchMentorStudents } from "@/lib/lms/engagementData";

export const dynamic = "force-dynamic";
export default async function MentorStudentsPage() { const { user } = await requireRole("mentor"); const students = await fetchMentorStudents(requireLmsAdminClient(), user.id); return <PortalShell eyebrow="Mentor Portal" title="My Students" description="Only students in your active assigned caseload are shown."><Link href="/mentor" className="font-semibold text-[var(--realm-gold-soft)]">← Mentor home</Link><div className="mt-6 grid gap-4 md:grid-cols-2">{students.map((item) => <Link key={String(item.enrollment.id)} href={`/mentor/students/${String(item.enrollment.id)}`} className="rounded-2xl border border-white/10 bg-white/[0.055] p-5 transition hover:border-[var(--realm-gold)]/50"><p className="text-xs font-semibold uppercase tracking-wide text-[var(--realm-gold-soft)]">{String(item.cohort.code)} · {String(item.student.student_number)}</p><h2 className="mt-2 text-xl font-semibold">{String(item.student.preferred_name || item.student.legal_name)}</h2><p className="mt-2 text-sm text-white/65">Standing: {humanizeEngagement(String(item.enrollment.academic_standing))} · {item.alerts.length} open engagement indicator(s)</p></Link>)}{!students.length ? <p className="rounded-2xl border border-white/10 bg-white/[0.055] p-8 text-white/65">No active students are assigned to your mentor profile.</p> : null}</div></PortalShell>; }
