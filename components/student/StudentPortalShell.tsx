import Link from "next/link";
import type { ReactNode } from "react";

import { StudentDesktopNav, StudentMobileNav } from "@/components/student/StudentNav";
import { BrandLogo } from "@/components/ui/BrandLogo";
import type { StudentDashboardData } from "@/lib/lms/studentDashboard";

export function StudentPortalShell({ data, children, handbookAcknowledged = true }: { data: StudentDashboardData; children: ReactNode; handbookAcknowledged?: boolean }) {
  return (
    <div className="min-h-dvh bg-[#f5f2ea] text-slate-950">
      <a href="#student-content" className="sr-only z-50 rounded bg-white px-4 py-2 text-[#071327] focus:not-sr-only focus:fixed focus:left-4 focus:top-4">Skip to student content</a>
      <header className="border-b border-white/10 bg-[#071b35] text-white">
        <div className="mx-auto flex max-w-[1480px] flex-wrap items-center justify-between gap-4 px-5 py-4 lg:px-8">
          <Link href="/student" aria-label="REALMS student dashboard" className="flex items-center gap-3 rounded-lg focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[var(--realm-gold)]">
            <BrandLogo className="size-11" sizes="44px" priority />
            <span><span className="block font-semibold tracking-[0.1em]">REALMS</span><span className="block text-xs text-white/65">Student Portal</span></span>
          </Link>
          <div className="min-w-0 text-right">
            <p className="truncate text-sm font-semibold">{data.displayName}</p>
            <p className="text-xs text-white/65">{data.student?.student_number ?? "Activation pending"}</p>
          </div>
        </div>
      </header>
      <StudentMobileNav handbookAcknowledged={handbookAcknowledged} />
      <div className="mx-auto grid max-w-[1480px] lg:min-h-[calc(100dvh-77px)] lg:grid-cols-[260px_minmax(0,1fr)]">
        <aside className="hidden border-r border-white/10 bg-[#0b2547] p-6 text-white lg:block">
          <nav aria-label="Student portal"><StudentDesktopNav handbookAcknowledged={handbookAcknowledged} /></nav>
          <div className="mt-8 border-t border-white/10 pt-6">
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[var(--realm-gold-soft)]">Programme Status</p>
            <ul className="mt-3 space-y-2 text-sm text-white/65"><li>Results appear only after publication</li><li>Completion eligibility is not graduation</li><li>Awards require separate graduation, template, review and issuance approval</li></ul>
          </div>
          <form action="/auth/signout" method="post" className="mt-8">
            <button type="submit" className="min-h-11 w-full rounded-xl border border-white/15 px-4 py-2 text-sm font-semibold text-white hover:bg-white/10 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--realm-gold)]">Sign Out</button>
          </form>
        </aside>
        <main id="student-content" className="min-w-0 px-5 py-8 md:px-8 lg:px-10 lg:py-10">
          {children}
          <form action="/auth/signout" method="post" className="mt-10 lg:hidden">
            <button type="submit" className="min-h-11 rounded-xl border border-slate-300 bg-white px-5 py-2 text-sm font-semibold text-[#071327] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--realm-gold)]">Sign Out</button>
          </form>
        </main>
      </div>
    </div>
  );
}
