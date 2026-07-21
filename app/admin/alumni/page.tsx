import Link from "next/link";

import { AdminShell } from "@/components/admin/AdminShell";
import { requireAdmin } from "@/lib/adminAuth";
import { requireLmsAdminClient } from "@/lib/lms/adminData";
import { fetchAdminAlumni } from "@/lib/lms/graduationData";
import { humanizeResult } from "@/lib/lms/results";

function relation(value: unknown) {
  return Array.isArray(value) ? value[0] ?? {} : value && typeof value === "object" ? value as Record<string, unknown> : {};
}

export default async function AdminAlumniPage() {
  await requireAdmin();
  const data = await fetchAdminAlumni(requireLmsAdminClient());
  const cards = [["Total Alumni", data.metrics.total], ["Active Alumni Accounts", data.metrics.active], ["Completed Programme Records", data.metrics.programmes], ["Archive Access Active", data.metrics.archiveAccess], ["Awards Issued", data.metrics.awardsIssued], ["Awards Pending", data.metrics.awardsPending]];
  const programmeGroups = new Map<string, number>();
  for (const alumni of data.rows) {
    for (const programme of alumni.programmes) {
      const key = `${String(programme.cohort_name_snapshot)} · ${humanizeResult(String(programme.discipleship_route))} · ${humanizeResult(String(programme.skill_pathway))}`;
      programmeGroups.set(key, (programmeGroups.get(key) ?? 0) + 1);
    }
  }

  return <AdminShell title="Alumni" description="Person-level alumni identities with separate completion records for every REALMS programme.">
    <div className="flex gap-3">
      <Link href="/admin/alumni/announcements" className="rounded-xl bg-[#071327] px-4 py-3 font-semibold text-white">Announcements</Link>
      <Link href="/admin/graduation" className="rounded-xl border border-slate-300 bg-white px-4 py-3 font-semibold">Graduation</Link>
    </div>
    <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{cards.map(([label, count]) => <article key={String(label)} className="rounded-xl border border-slate-200 bg-white p-4"><p className="text-sm text-slate-500">{label}</p><p className="mt-2 text-2xl font-semibold">{count}</p></article>)}</div>
    <section className="mt-6 rounded-2xl border border-slate-200 bg-white p-5">
      <h2 className="text-xl font-semibold">Completed Programmes by Cohort, Route and Pathway</h2>
      <div className="mt-4 grid gap-3 sm:grid-cols-2">{[...programmeGroups.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([label, count]) => <div key={label} className="flex items-center justify-between gap-4 rounded-xl bg-slate-50 p-4"><span className="text-sm">{label}</span><strong>{count}</strong></div>)}{!programmeGroups.size ? <p className="text-sm text-slate-600">No completed programme records are available.</p> : null}</div>
    </section>
    <div className="mt-6 grid gap-4">{data.rows.map((alumni) => {
      const student = relation(alumni.students);
      return <Link key={alumni.id} href={`/admin/alumni/${alumni.id}`} className="rounded-2xl border border-slate-200 bg-white p-5"><div className="flex flex-wrap justify-between gap-3"><div><p className="text-xs font-semibold uppercase tracking-wide text-amber-800">{alumni.alumni_number ?? "Number pending"}</p><h2 className="mt-1 text-xl font-semibold">{String(student.preferred_name || student.legal_name)}</h2><p className="mt-1 text-sm text-slate-600">{alumni.programmes.length} completed programme(s)</p></div><div className="text-right text-sm"><p>{humanizeResult(alumni.alumni_status)}</p><p className="mt-1 text-slate-500">Archive {alumni.learning_archive_access ? "active" : "restricted"}</p></div></div></Link>;
    })}{!data.rows.length ? <p className="rounded-2xl border border-slate-200 bg-white p-6">No graduate has been converted to alumni.</p> : null}</div>
    <section className="mt-6 rounded-2xl border border-slate-200 bg-white p-5"><h2 className="text-xl font-semibold">Recent Outcome Updates</h2><div className="mt-4 space-y-3">{data.outcomes.map((outcome) => <article key={outcome.id} className="rounded-xl bg-slate-50 p-4"><strong>{humanizeResult(outcome.outcome_type)}</strong><p className="mt-1 text-sm text-slate-600">{outcome.outcome_summary}</p></article>)}{!data.outcomes.length ? <p className="text-sm text-slate-600">No voluntary outcome update has been submitted.</p> : null}</div></section>
  </AdminShell>;
}
