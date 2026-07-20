import Link from "next/link";

import { AdminShell } from "@/components/admin/AdminShell";
import { DashboardStats } from "@/components/admin/DashboardStats";
import { requireAdmin } from "@/lib/adminAuth";

export default async function AdminDashboardPage() {
  await requireAdmin();
  return <AdminShell title="Dashboard" description="A concise view of applications, advanced-entry decisions, scholarship requests, admission status, and pathway distribution."><DashboardStats /><Link href="/admin/registrations" className="mt-8 inline-flex rounded-xl bg-[#071327] px-5 py-3 text-sm font-semibold text-white hover:bg-[#102344]">View applications</Link></AdminShell>;
}
