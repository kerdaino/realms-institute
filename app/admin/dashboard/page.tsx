import Link from "next/link";

import { AdminShell } from "@/components/admin/AdminShell";
import { DashboardStats } from "@/components/admin/DashboardStats";
import { requireAdmin } from "@/lib/adminAuth";

export default async function AdminDashboardPage() {
  await requireAdmin();
  return <AdminShell title="Dashboard" description="A concise operational view of applications, provisioned students, onboarding, cohorts, courses, facilitators, and pending review work."><DashboardStats /><div className="mt-8 flex flex-wrap gap-3"><Link href="/admin/registrations" className="inline-flex rounded-xl bg-[#071327] px-5 py-3 text-sm font-semibold text-white hover:bg-[#102344]">View applications</Link><Link href="/admin/students" className="inline-flex rounded-xl border border-slate-300 bg-white px-5 py-3 text-sm font-semibold text-[#071327]">View students</Link><Link href="/admin/at-risk" className="inline-flex rounded-xl border border-amber-400 bg-amber-50 px-5 py-3 text-sm font-semibold text-amber-950">Review student engagement</Link></div></AdminShell>;
}
