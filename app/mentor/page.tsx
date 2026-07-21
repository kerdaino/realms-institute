import Link from "next/link";
import type { Metadata } from "next";

import { PortalDetails, PortalShell } from "@/components/portal/PortalShell";
import { getCurrentProfile, requireRole } from "@/lib/lms/auth";
import { requireLmsAdminClient } from "@/lib/lms/adminData";
import { fetchMentorStudents } from "@/lib/lms/engagementData";

export const dynamic = "force-dynamic"; export const metadata: Metadata = { title: "REALMS Mentor Portal" };
export default async function MentorPage() { const { user } = await requireRole("mentor"); const [profile, students] = await Promise.all([getCurrentProfile(), fetchMentorStudents(requireLmsAdminClient(), user.id)]); const name = profile?.preferred_name || profile?.full_name || "Mentor"; return <PortalShell eyebrow="Mentor Portal" title={`Welcome, ${name}`} description="A limited view of your active caseload for respectful follow-up and concrete learning recovery."><PortalDetails items={[["Active Caseload", String(students.length)], ["Students With Open Indicators", String(students.filter((item) => item.alerts.length).length)], ["Privacy", "Only assigned students; no evidence, finance, answer keys, or private review notes"]]} /><Link href="/mentor/students" className="mt-8 inline-block rounded-full bg-[var(--realm-gold)] px-5 py-3 font-semibold text-[#071327]">Open My Students</Link></PortalShell>; }
