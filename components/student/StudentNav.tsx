"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const links = [
  { href: "/student", label: "Dashboard" },
  { href: "/student/courses", label: "My Courses" },
  { href: "/student/calendar", label: "Schedule" },
  { href: "/student/resources", label: "Resources" },
  { href: "/student/recordings", label: "Recordings" },
  { href: "/student/assignments", label: "Assignments" },
  { href: "/student/quizzes", label: "Quizzes" },
  { href: "/student/attendance", label: "Attendance" },
  { href: "/student/absences", label: "Absence & Make-Up" },
  { href: "/student/results", label: "Results" },
  { href: "/student/graduation", label: "Completion Tracker" },
  { href: "/student/profile", label: "My Profile" },
] as const;

function NavLinks({ onDark = false }: { onDark?: boolean }) {
  const pathname = usePathname();
  return (
    <ul className="space-y-1.5">
      {links.map((item) => {
        const active = item.href === "/student" ? pathname === item.href : pathname.startsWith(item.href);
        return (
          <li key={item.href}>
            <Link href={item.href} aria-current={active ? "page" : undefined} className={`block min-h-11 rounded-xl px-4 py-3 text-sm font-semibold transition focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--realm-gold)] ${active ? "bg-[var(--realm-gold)] text-[#071327]" : onDark ? "text-white/80 hover:bg-white/10 hover:text-white" : "text-slate-700 hover:bg-amber-50 hover:text-[#071327]"}`}>
              {item.label}
            </Link>
          </li>
        );
      })}
    </ul>
  );
}

export function StudentDesktopNav() {
  return <NavLinks onDark />;
}

export function StudentMobileNav() {
  return (
    <details className="group border-b border-slate-200 bg-white lg:hidden">
      <summary className="flex min-h-14 cursor-pointer list-none items-center justify-between px-5 py-3 font-semibold text-[#071327] focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-[var(--realm-gold)]">
        Student portal navigation
        <span aria-hidden="true" className="text-xl transition group-open:rotate-45">+</span>
      </summary>
      <nav aria-label="Student portal" className="border-t border-slate-100 px-4 py-4">
        <NavLinks />
      </nav>
    </details>
  );
}
