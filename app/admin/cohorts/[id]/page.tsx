import Link from "next/link";
import { notFound } from "next/navigation";

import { AdminShell } from "@/components/admin/AdminShell";
import { CohortRecord } from "@/components/admin/CohortRecord";
import { AdminPanel, StatusBadge, formatDate } from "@/components/admin/LmsUi";
import { requireAdmin } from "@/lib/adminAuth";
import { fetchAdminCohort, LmsAdminDataError, requireLmsAdminClient } from "@/lib/lms/adminData";

export default async function AdminCohortPage({ params }: { params: Promise<{ id: string }> }) {
  await requireAdmin();
  const { id } = await params;
  const record = await loadCohort(id);
  const upcoming = record.sessions.filter((item) => item.session_status === "scheduled" || item.session_status === "live").length;
  return <AdminShell title={record.cohort.name} description={`${record.cohort.code} · Cohort operations and assigned curriculum`}><div className="space-y-6"><CohortRecord initialRecord={record} /><AdminPanel title="Class sessions" description="Upcoming and recent academic delivery attached to this cohort's course offerings."><div className="mb-5 grid gap-3 sm:grid-cols-3"><Count label="Total sessions" value={record.sessions.length} /><Count label="Upcoming" value={upcoming} /><Count label="Completed" value={record.sessions.filter((item) => item.session_status === "completed").length} /></div><div className="mb-5 flex flex-wrap gap-3"><Link href={`/admin/sessions?cohort=${record.cohort.id}`} className="rounded-xl bg-[#071327] px-4 py-2 text-sm font-semibold text-white">View all sessions</Link><Link href="/admin/sessions" className="rounded-xl border border-slate-300 px-4 py-2 text-sm font-semibold">Create session</Link></div>{record.sessions.length === 0 ? <p className="text-sm text-slate-600">No class sessions have been created for this cohort yet.</p> : <div className="space-y-3">{record.sessions.slice(0, 10).map((item) => <Link key={item.id} href={`/admin/sessions/${item.id}`} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200 p-4 hover:border-amber-300"><div><strong>{item.title}</strong><p className="mt-1 text-sm text-slate-600">{courseCode(item.cohort_courses)} · {formatDate(item.scheduled_start_at, true)}</p></div><StatusBadge value={item.session_status} /></Link>)}</div>}</AdminPanel></div></AdminShell>;
}

function Count({ label, value }: { label: string; value: number }) { return <div className="rounded-xl bg-slate-50 p-4"><p className="text-xs font-semibold uppercase text-slate-500">{label}</p><p className="mt-1 text-2xl font-semibold text-[#071327]">{value}</p></div>; }
function courseCode(value: unknown) { const item = Array.isArray(value) ? value[0] : value; if (!item || typeof item !== "object") return "Course"; const courses = (item as { courses?: unknown }).courses; const course = Array.isArray(courses) ? courses[0] : courses; return course && typeof course === "object" && typeof (course as { code?: unknown }).code === "string" ? (course as { code: string }).code : "Course"; }
async function loadCohort(id: string) { try { return await fetchAdminCohort(requireLmsAdminClient(), id); } catch (error) { if (error instanceof LmsAdminDataError && error.status === 404) notFound(); throw error; } }
