import Link from "next/link";

import { AdminShell } from "@/components/admin/AdminShell";
import { EmptyState, StatusBadge, formatDate } from "@/components/admin/LmsUi";
import { requireAdmin } from "@/lib/adminAuth";
import { onboardingStatuses, studentStatuses } from "@/lib/lms/adminConstants";
import { fetchAdminCohorts, fetchAdminStudents, requireLmsAdminClient } from "@/lib/lms/adminData";

function value(input: string | string[] | undefined) { return typeof input === "string" ? input.slice(0, 160) : undefined; }

export default async function AdminStudentsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  await requireAdmin();
  const params = await searchParams;
  const supabase = requireLmsAdminClient();
  const filters = { search: value(params.search), cohort: value(params.cohort), route: value(params.route), skill: value(params.skill), status: value(params.status), onboarding: value(params.onboarding) };
  const [students, cohorts] = await Promise.all([fetchAdminStudents(supabase, filters), fetchAdminCohorts(supabase)]);
  return <AdminShell title="Students" description="Search the student master record and manage onboarding and academic status without changing admission decisions.">
    <form className="mb-6 grid gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm md:grid-cols-3 xl:grid-cols-6">
      <input name="search" defaultValue={filters.search} placeholder="Name, email, ID or phone" className="rounded-xl border border-slate-300 px-3 py-2 text-sm xl:col-span-2" />
      <select name="cohort" defaultValue={filters.cohort ?? ""} className="rounded-xl border border-slate-300 px-3 py-2 text-sm"><option value="">All cohorts</option>{cohorts.map((item) => <option key={item.id} value={item.id}>{item.code}</option>)}</select>
      <select name="route" defaultValue={filters.route ?? ""} className="rounded-xl border border-slate-300 px-3 py-2 text-sm"><option value="">All routes</option><option value="foundational">Foundational</option><option value="advanced">Advanced</option></select>
      <select name="skill" defaultValue={filters.skill ?? ""} className="rounded-xl border border-slate-300 px-3 py-2 text-sm"><option value="">All skills</option><option value="web_development">Web Development</option><option value="cybersecurity_foundations">Cybersecurity Foundations</option></select>
      <select name="status" defaultValue={filters.status ?? ""} className="rounded-xl border border-slate-300 px-3 py-2 text-sm"><option value="">All student statuses</option>{studentStatuses.map((item) => <option key={item} value={item}>{item.replaceAll("_", " ")}</option>)}</select>
      <select name="onboarding" defaultValue={filters.onboarding ?? ""} className="rounded-xl border border-slate-300 px-3 py-2 text-sm"><option value="">All onboarding</option>{onboardingStatuses.map((item) => <option key={item} value={item}>{item.replaceAll("_", " ")}</option>)}</select>
      <div className="flex gap-2"><button className="rounded-xl bg-[#071327] px-4 py-2 text-sm font-semibold text-white">Apply</button><Link href="/admin/students" className="rounded-xl border border-slate-300 px-4 py-2 text-sm font-semibold">Clear</Link></div>
    </form>
    {students.length === 0 ? <EmptyState title="No students found" detail="Student records appear here after an admitted application is deliberately provisioned. Adjust the filters if students already exist." /> : <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white shadow-sm"><table className="min-w-full text-left text-sm"><thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500"><tr>{["Student ID", "Name", "Email", "Cohort", "Route", "Skill / mode", "Status", "Onboarding", "Created"].map((heading) => <th key={heading} className="px-4 py-3">{heading}</th>)}</tr></thead><tbody className="divide-y divide-slate-100">{students.map((student) => <tr key={student.id} className="align-top hover:bg-slate-50"><td className="px-4 py-4 font-semibold"><Link href={`/admin/students/${student.id}`} className="text-amber-800 hover:underline">{student.student_number}</Link></td><td className="px-4 py-4">{student.legal_name}</td><td className="px-4 py-4">{student.email}</td><td className="px-4 py-4">{student.enrollment?.cohorts?.code ?? "—"}</td><td className="px-4 py-4 capitalize">{student.enrollment?.discipleship_route ?? "—"}</td><td className="px-4 py-4">{student.enrollment?.skill_pathway?.replaceAll("_", " ") ?? "—"}<br /><span className="text-xs text-slate-500">{student.enrollment?.skill_learning_mode ?? ""}</span></td><td className="px-4 py-4"><StatusBadge value={student.student_status} /></td><td className="px-4 py-4"><StatusBadge value={student.onboarding_status} /></td><td className="px-4 py-4 text-slate-600">{formatDate(student.created_at)}</td></tr>)}</tbody></table></div>}
  </AdminShell>;
}
