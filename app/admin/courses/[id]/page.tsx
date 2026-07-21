import Link from "next/link";
import { notFound } from "next/navigation";

import { AdminShell } from "@/components/admin/AdminShell";
import { CourseRecord } from "@/components/admin/CourseRecord";
import { AdminPanel, StatusBadge, formatDate } from "@/components/admin/LmsUi";
import { requireAdmin } from "@/lib/adminAuth";
import { fetchAdminCourse, LmsAdminDataError, requireLmsAdminClient } from "@/lib/lms/adminData";

export default async function AdminCoursePage({ params }: { params: Promise<{ id: string }> }) {
  await requireAdmin();
  const { id } = await params;
  const record = await loadCourse(id);
  return <AdminShell title={record.course.title} description={`${record.course.code} · Course catalogue record`}><div className="space-y-6"><CourseRecord initialRecord={record} /><AdminPanel title="Class sessions" description="These are specific cohort deliveries of the permanent course catalogue record."><div className="mb-5 flex flex-wrap items-center justify-between gap-3"><p className="text-sm text-slate-600">{record.sessions.length} session{record.sessions.length === 1 ? "" : "s"}</p><Link href={`/admin/sessions?course=${record.course.id}`} className="rounded-xl bg-[#071327] px-4 py-2 text-sm font-semibold text-white">View sessions</Link></div>{record.sessions.length === 0 ? <p className="text-sm text-slate-600">No class sessions have been created for this course yet.</p> : <div className="space-y-3">{record.sessions.map((item) => <Link key={item.id} href={`/admin/sessions/${item.id}`} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200 p-4 hover:border-amber-300"><div><strong>{item.title}</strong><p className="mt-1 text-sm text-slate-600">{cohortCode(item.cohort_courses)} · {formatDate(item.scheduled_start_at, true)}</p></div><StatusBadge value={item.session_status} /></Link>)}</div>}</AdminPanel></div></AdminShell>;
}

function cohortCode(value: unknown) { const item = Array.isArray(value) ? value[0] : value; if (!item || typeof item !== "object") return "Cohort"; const cohorts = (item as { cohorts?: unknown }).cohorts; const cohort = Array.isArray(cohorts) ? cohorts[0] : cohorts; return cohort && typeof cohort === "object" && typeof (cohort as { code?: unknown }).code === "string" ? (cohort as { code: string }).code : "Cohort"; }
async function loadCourse(id: string) { try { return await fetchAdminCourse(requireLmsAdminClient(), id); } catch (error) { if (error instanceof LmsAdminDataError && error.status === 404) notFound(); throw error; } }
