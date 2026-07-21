import Link from "next/link";

import { AdminShell } from "@/components/admin/AdminShell";
import { EmptyState, StatusBadge, formatDate } from "@/components/admin/LmsUi";
import { requireAdmin } from "@/lib/adminAuth";
import { fetchAdminCohorts, requireLmsAdminClient } from "@/lib/lms/adminData";

export default async function AdminCohortsPage() {
  await requireAdmin();
  const cohorts = await fetchAdminCohorts(requireLmsAdminClient());
  return <AdminShell title="Cohorts" description="Manage programme cohorts, operational dates, capacity ceilings, and course offerings.">{cohorts.length === 0 ? <EmptyState title="No cohorts configured" detail="Create the first approved cohort in Supabase before managing its operations here." /> : <div className="grid gap-5 lg:grid-cols-2">{cohorts.map((cohort) => <Link key={cohort.id} href={`/admin/cohorts/${cohort.id}`} className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm transition hover:border-amber-300"><div className="flex items-start justify-between gap-3"><div><p className="text-xs font-semibold uppercase tracking-wider text-amber-800">{cohort.code}</p><h2 className="mt-2 text-xl font-semibold text-[#071327]">{cohort.name}</h2></div><StatusBadge value={cohort.status} /></div><dl className="mt-5 grid grid-cols-2 gap-4 text-sm"><div><dt className="text-slate-500">Academic year</dt><dd className="font-medium">{cohort.academic_year ?? "Not set"}</dd></div><div><dt className="text-slate-500">Programme dates</dt><dd className="font-medium">{formatDate(cohort.start_date)} – {formatDate(cohort.end_date)}</dd></div><div><dt className="text-slate-500">Students / capacity</dt><dd className="font-medium">{cohort.student_count} / {cohort.maximum_capacity ?? "No ceiling set"}</dd></div><div><dt className="text-slate-500">Course offerings</dt><dd className="font-medium">{cohort.course_count}</dd></div></dl></Link>)}</div>}</AdminShell>;
}
