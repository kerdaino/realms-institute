import type { Metadata } from "next";
import Link from "next/link";

import { InstitutionalAnnouncements } from "@/components/portal/InstitutionalAnnouncements";
import { PortalDetails, PortalShell } from "@/components/portal/PortalShell";
import { getCurrentProfile, requireRole } from "@/lib/lms/auth";
import { requireLmsAdminClient } from "@/lib/lms/adminData";
import { fetchFacilitatorInstitutionalAnnouncements } from "@/lib/lms/institutionalAnnouncementService.server";
import { getOwnFacilitatorSummary } from "@/lib/lms/portalData";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "REALMS Faculty Portal" };

const portalLinks = [
  ["/facilitator/sessions", "View Assigned Sessions"], ["/facilitator/gradebook", "Gradebook"], ["/facilitator/engagement", "Assigned-Course Engagement"], ["/facilitator/recordings", "View Recorded Learning"], ["/facilitator/makeup", "Make-Up Learning"], ["/facilitator/assignments", "Assignments"], ["/facilitator/quizzes", "Quiz Review"],
] as const;

export default async function FacilitatorPage() {
  const { user } = await requireRole("facilitator");
  const [profile, summary, announcements] = await Promise.all([
    getCurrentProfile(),
    getOwnFacilitatorSummary(user.id),
    fetchFacilitatorInstitutionalAnnouncements(requireLmsAdminClient(), user.id),
  ]);
  const name = summary?.facilitator.display_name || profile?.preferred_name || profile?.full_name || "Facilitator";
  return <PortalShell eyebrow="Faculty Portal" title="REALMS Faculty Portal" description={`Welcome, ${name}`}>
    <InstitutionalAnnouncements announcements={announcements} variant="dark" />
    <div className="mt-8"><PortalDetails items={[["Facilitator", name], ["Assigned Courses", String(summary?.assignedCourseCount ?? 0)], ["Access Scope", "Assigned courses and sessions only"]]} /></div>
    <div className="mt-8 flex flex-wrap gap-3">{portalLinks.map(([href, label], index) => <Link key={href} href={href} className={index === 0 ? "inline-flex rounded-full bg-[var(--realm-gold)] px-5 py-3 text-sm font-semibold text-[#071327]" : "inline-flex rounded-full border border-white/20 bg-white/[0.06] px-5 py-3 text-sm font-semibold text-white"}>{label}</Link>)}</div>
  </PortalShell>;
}
