import { redirect } from "next/navigation";

import { LoginForm } from "@/components/admin/LoginForm";
import { isAdminAuthenticated } from "@/lib/adminAuth";

export default async function AdminLoginPage() {
  if (await isAdminAuthenticated()) redirect("/admin/dashboard");
  return <main className="grid min-h-dvh place-items-center px-5 py-12"><section className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-7 shadow-xl shadow-slate-900/5 sm:p-9"><p className="text-xs font-semibold uppercase tracking-[0.2em] text-amber-700">REALMS Institute</p><h1 className="mt-3 text-3xl font-semibold tracking-tight text-[#071327]">Admin login</h1><p className="mt-3 text-sm leading-6 text-slate-600">Enter the temporary launch password to manage confirmed registrations.</p><LoginForm /></section></main>;
}
