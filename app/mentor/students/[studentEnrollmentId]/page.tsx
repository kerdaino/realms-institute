import Link from "next/link";
import { notFound } from "next/navigation";

import { CompleteRecoveryActionButton, MentorFollowupForm, SupportReferralForm } from "@/components/portal/StandingActions";
import { PortalShell } from "@/components/portal/PortalShell";
import { requireRole } from "@/lib/lms/auth";
import { isUuid } from "@/lib/lms/adminConstants";
import { requireLmsAdminClient } from "@/lib/lms/adminData";
import { humanizeEngagement } from "@/lib/lms/engagement";
import { fetchMentorStudentDetail } from "@/lib/lms/engagementData";

export const dynamic = "force-dynamic";

export default async function MentorStudentPage({ params }: { params: Promise<{ studentEnrollmentId: string }> }) {
  const { user } = await requireRole("mentor");
  const { studentEnrollmentId } = await params;
  if (!isUuid(studentEnrollmentId)) notFound();
  const data = await fetchMentorStudentDetail(requireLmsAdminClient(), user.id, studentEnrollmentId);
  const facts = [
    ["Standing", humanizeEngagement(String(data.studentEnrollment.academic_standing))],
    ["Attendance Units", String(data.metrics.unapprovedAbsenceUnits)],
    ["Overdue Recordings", String(data.metrics.overdueRecordedModules)],
    ["Overdue Make-Ups", String(data.metrics.overdueMakeups)],
    ["Missing Assignments", String(data.metrics.missingAssignments)],
    ["Quiz Concerns", String(data.metrics.quizzesWithAttemptsExhausted)],
    ["Open Academic Reviews", String(data.metrics.openIntegrityReviews)],
    ["Last Activity", data.metrics.lastMeaningfulActivityAt ? new Date(data.metrics.lastMeaningfulActivityAt).toLocaleDateString("en-NG") : "Not recorded"],
  ];
  return <PortalShell eyebrow="Assigned Student" title={String(data.student.preferred_name || data.student.legal_name)} description={`${String(data.student.student_number)} · ${String(data.cohort.name)} · limited mentor support view`}>
    <Link href="/mentor/students" className="font-semibold text-[var(--realm-gold-soft)]">← My students</Link>
    <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">{facts.map(([label, value]) => <div key={label} className="rounded-2xl border border-white/10 bg-white/[0.055] p-4"><p className="text-xs uppercase tracking-wide text-[var(--realm-gold-soft)]">{label}</p><p className="mt-2 font-semibold">{value}</p></div>)}</div>
    <section className="mt-8 grid gap-6 lg:grid-cols-2">
      <div><h2 className="text-2xl font-semibold">Engagement Indicators</h2><div className="mt-4 space-y-3">{data.alerts.map((alert) => <article key={alert.id} className="rounded-2xl border border-white/10 bg-white/[0.055] p-4"><strong>{alert.alert_title}</strong><p className="mt-2 text-sm text-white/65">{alert.alert_summary}</p></article>)}{!data.alerts.length ? <p className="text-white/65">No open engagement indicators.</p> : null}</div></div>
      <div><h2 className="text-2xl font-semibold">Record Follow-Up</h2><div className="mt-4 rounded-2xl border border-white/10 bg-white/[0.055] p-5"><MentorFollowupForm studentEnrollmentId={studentEnrollmentId} /></div></div>
    </section>
    <section className="mt-8"><h2 className="text-2xl font-semibold">Follow-Up History</h2><div className="mt-4 grid gap-3">{data.followups.map((item) => <article key={item.id} className="rounded-2xl border border-white/10 bg-white/[0.055] p-4"><strong>{humanizeEngagement(item.contact_status)} · {humanizeEngagement(item.contact_method)}</strong><p className="mt-2 text-sm text-white/65">{item.contact_summary || "No summary recorded"}</p><p className="mt-2 text-xs text-white/45">{new Date(item.contacted_at).toLocaleString("en-NG")}</p></article>)}</div></section>
    <section className="mt-8"><h2 className="text-2xl font-semibold">Recovery Actions</h2><div className="mt-4 grid gap-3">{data.recoveryActions.map((action) => <article key={action.id} className="rounded-2xl border border-white/10 bg-white/[0.055] p-4"><div className="flex flex-wrap items-start justify-between gap-3"><div><strong>{action.title}</strong><p className="mt-1 text-sm text-white/65">{action.description}</p><p className="mt-2 text-xs text-white/45">{humanizeEngagement(action.action_status)}{action.due_at ? ` · due ${new Date(action.due_at).toLocaleString("en-NG")}` : ""}</p></div>{action.action_status !== "completed" ? <CompleteRecoveryActionButton studentEnrollmentId={studentEnrollmentId} actionId={action.id} linked={Boolean(action.linked_entity_id)} /> : null}</div></article>)}{!data.recoveryActions.length ? <p className="text-white/65">No active recovery actions.</p> : null}</div></section>
    <section className="mt-8"><h2 className="text-2xl font-semibold">Support Referral</h2><div className="mt-4 max-w-2xl rounded-2xl border border-white/10 bg-white/[0.055] p-5"><SupportReferralForm studentEnrollmentId={studentEnrollmentId} /></div></section>
    <p className="mt-8 rounded-2xl border border-white/10 bg-white/[0.04] p-4 text-xs leading-6 text-white/55">This view excludes private evidence, financial information, assessment answers, answer keys, private review notes, and detailed support referral records.</p>
  </PortalShell>;
}
