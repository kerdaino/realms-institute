import Link from "next/link";

export function AdminNav() {
  return <header className="border-b border-slate-200 bg-[#071327] text-white"><div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-4 px-5 py-4 md:px-8"><Link href="/admin/dashboard" className="font-semibold tracking-wide text-[#f2d27a]">REALMS Admin</Link><nav aria-label="Admin navigation" className="flex flex-wrap items-center gap-4 text-sm"><Link href="/admin/dashboard" className="hover:text-[#f2d27a]">Dashboard</Link><Link href="/admin/registrations" className="hover:text-[#f2d27a]">Registrations</Link><Link href="/admin/scholarships" className="hover:text-[#f2d27a]">Scholarships</Link><Link href="/" className="hover:text-[#f2d27a]">Public Site</Link><form action="/api/admin/logout" method="post"><button type="submit" className="rounded-lg border border-white/25 px-3 py-1.5 hover:border-[#d7aa45] hover:text-[#f2d27a]">Logout</button></form></nav></div></header>;
}
