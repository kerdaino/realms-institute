import type { Metadata } from "next";
import Link from "next/link";

import { PortalDetails, PortalShell } from "@/components/portal/PortalShell";
import { getCurrentProfile, requireRole } from "@/lib/lms/auth";
import { getOwnFacilitatorSummary } from "@/lib/lms/portalData";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "REALMS Faculty Portal" };

export default async function FacilitatorPage() {
  const { user } = await requireRole("facilitator");
  const [profile, summary] = await Promise.all([getCurrentProfile(), getOwnFacilitatorSummary(user.id)]);
  const name = summary?.facilitator.display_name || profile?.preferred_name || profile?.full_name || "Facilitator";
  return <PortalShell eyebrow="Faculty Portal" title="REALMS Faculty Portal" description={`Welcome, ${name}`}><PortalDetails items={[["Facilitator", name], ["Assigned Courses", String(summary?.assignedCourseCount ?? 0)], ["Access Scope", "Assigned courses and sessions only"]]} /><div className="mt-8 flex flex-wrap gap-3"><Link href="/facilitator/sessions" className="inline-flex rounded-full bg-[var(--realm-gold)] px-5 py-3 text-sm font-semibold text-[#071327]">View Assigned Sessions</Link><Link href="/facilitator/gradebook" className="inline-flex rounded-full border border-[var(--realm-gold)] px-5 py-3 text-sm font-semibold text-[var(--realm-gold-soft)]">Gradebook</Link><Link href="/facilitator/engagement" className="inline-flex rounded-full border border-[var(--realm-gold)] px-5 py-3 text-sm font-semibold text-[var(--realm-gold-soft)]">Assigned-Course Engagement</Link><Link href="/facilitator/recordings" className="inline-flex rounded-full border border-slate-300 bg-white px-5 py-3 text-sm font-semibold text-[#071327]">View Recorded Learning</Link><Link href="/facilitator/makeup" className="inline-flex rounded-full border border-slate-300 bg-white px-5 py-3 text-sm font-semibold text-[#071327]">Make-Up Learning</Link><Link href="/facilitator/assignments" className="inline-flex rounded-full border border-slate-300 bg-white px-5 py-3 text-sm font-semibold text-[#071327]">Assignments</Link><Link href="/facilitator/quizzes" className="inline-flex rounded-full border border-slate-300 bg-white px-5 py-3 text-sm font-semibold text-[#071327]">Quiz Review</Link></div></PortalShell>;
}
