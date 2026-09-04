import Link from "next/link";

import { AdminShell } from "@/components/admin/AdminShell";
import { ClassSummaryQueueAction } from "@/components/admin/ClassSummaryQueueAction";
import { StatusBadge, formatDate } from "@/components/admin/LmsUi";
import { requireAdmin } from "@/lib/adminAuth";
import { humanize } from "@/lib/lms/adminConstants";
import { requireLmsAdminClient } from "@/lib/lms/adminData";
import { classSummaryQueueLabels, fetchAdminClassSummaries } from "@/lib/lms/summaryData";

function value(input: string | string[] | undefined) {
  return typeof input === "string" ? input.slice(0, 200) : undefined;
}

export default async function AdminClassSummariesPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  await requireAdmin();
  const params = await searchParams;
  const filters = { cohort: value(params.cohort), course: value(params.course), facilitator: value(params.facilitator), session: value(params.session), status: value(params.status) };
  const data = await fetchAdminClassSummaries(requireLmsAdminClient(), filters);
  return <AdminShell title="Class Summaries" description="One review queue for facilitator drafts, administrator decisions, publication, and preserved revisions.">
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-7">
      {Object.entries(classSummaryQueueLabels).map(([status, label]) => <Link key={status} href={`/admin/class-summaries?status=${status}`} className={`rounded-2xl border p-4 ${filters.status === status ? "border-amber-500 bg-amber-50" : "border-slate-200 bg-white"}`}><p className="text-sm text-slate-600">{label}</p><p className="mt-2 text-2xl font-semibold text-slate-950">{data.metrics[status as keyof typeof data.metrics]}</p></Link>)}
    </div>
    <form className="mt-6 grid gap-3 rounded-2xl border border-slate-200 bg-white p-5 md:grid-cols-2 xl:grid-cols-6">
      <Filter name="cohort" label="Cohort" value={filters.cohort} options={data.options.cohorts.map((item) => [String(item.id), String(item.code || item.name)])} />
      <Filter name="course" label="Course" value={filters.course} options={data.options.courses.map((item) => [String(item.id), `${String(item.code)} · ${String(item.title)}`])} />
      <Filter name="facilitator" label="Facilitator" value={filters.facilitator} options={data.options.facilitators.map((item) => [item.id, item.display_name])} />
      <Filter name="session" label="Week / session" value={filters.session} options={data.options.sessions.map((item) => [String(item.id), `${item.session_number ? `Week ${String(item.session_number)} · ` : ""}${String(item.title)}`])} />
      <Filter name="status" label="Status" value={filters.status} options={Object.keys(classSummaryQueueLabels).map((status) => [status, humanize(status)])} />
      <div className="flex items-end gap-2"><button className="w-full rounded-xl bg-[#071327] px-4 py-2.5 text-sm font-semibold text-white">Apply filters</button><Link href="/admin/class-summaries" className="rounded-xl border border-slate-300 px-4 py-2.5 text-sm font-semibold text-slate-700">Clear</Link></div>
    </form>
    <div className="mt-6 overflow-x-auto rounded-2xl border border-slate-200 bg-white">
      <table className="min-w-full text-left text-sm"><thead className="bg-slate-50"><tr>{["Summary", "Cohort / course", "Week / session", "Facilitator", "Status", "Review timing", "Action"].map((label) => <th key={label} className="px-4 py-3 text-slate-700">{label}</th>)}</tr></thead><tbody className="divide-y divide-slate-200">{data.rows.map((row) => <tr key={String(row.summary.id)}><td className="px-4 py-3"><strong className="text-slate-950">{String(row.summary.title || row.session.title)}</strong><span className="block text-xs text-slate-500">Revision {String(row.summary.version_number)}</span></td><td className="px-4 py-3">{String(row.cohort.code || row.cohort.name)}<span className="block text-xs text-slate-500">{String(row.course.code)} · {String(row.course.title)}</span></td><td className="px-4 py-3">{row.session.session_number ? `Week ${String(row.session.session_number)} · ` : ""}{String(row.session.title)}<span className="block text-xs text-slate-500">{formatDate(row.session.scheduled_start_at as string, true)}</span></td><td className="px-4 py-3">{String(row.facilitator.display_name || "Course assignment")}</td><td className="px-4 py-3"><StatusBadge value={String(row.summary.summary_status)} /></td><td className="px-4 py-3">{row.summary.submitted_at ? `Submitted ${formatDate(String(row.summary.submitted_at), true)}` : `Updated ${formatDate(String(row.summary.updated_at), true)}`}</td><td className="px-4 py-3"><ClassSummaryQueueAction summaryId={String(row.summary.id)} sessionId={String(row.session.id)} status={String(row.summary.summary_status)} lockVersion={Number(row.summary.lock_version)} /></td></tr>)}</tbody></table>
      {!data.rows.length ? <p className="p-8 text-center text-slate-600">No class-summary revisions match these filters.</p> : null}
    </div>
  </AdminShell>;
}

function Filter({ name, label, value, options }: { name: string; label: string; value?: string; options: [string, string][] }) {
  return <label className="text-sm font-medium text-slate-800">{label}<select name={name} defaultValue={value || ""} className="mt-1 block w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-slate-900"><option value="">All</option>{options.map(([id, text]) => <option key={id} value={id}>{text}</option>)}</select></label>;
}
