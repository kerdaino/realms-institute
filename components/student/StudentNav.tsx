"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const links = [
  { href: "/student", label: "Dashboard", onboardingAllowed: false },
  { href: "/student/courses", label: "My Courses", onboardingAllowed: false },
  { href: "/student/calendar", label: "Schedule", onboardingAllowed: false },
  { href: "/student/resources", label: "Resources", onboardingAllowed: false },
  { href: "/student/recordings", label: "Recordings", onboardingAllowed: false },
  { href: "/student/assignments", label: "Assignments", onboardingAllowed: false },
  { href: "/student/quizzes", label: "Quizzes", onboardingAllowed: false },
  { href: "/student/attendance", label: "Attendance", onboardingAllowed: false },
  { href: "/student/absences", label: "Absence & Make-Up", onboardingAllowed: false },
  { href: "/student/results", label: "Results", onboardingAllowed: false },
  { href: "/student/graduation", label: "Completion Tracker", onboardingAllowed: false },
  { href: "/student/onboarding/handbook", label: "Student Handbook", onboardingAllowed: true },
  { href: "/student/standing", label: "Standing & Support", onboardingAllowed: true },
  { href: "/student/profile", label: "My Profile", onboardingAllowed: true },
  { href: "/contact", label: "Contact Support", onboardingAllowed: true },
] as const;

function NavLinks({ onDark = false, handbookAcknowledged }: { onDark?: boolean; handbookAcknowledged: boolean }) {
  const pathname = usePathname();
  const visibleLinks = handbookAcknowledged ? links : links.filter((item) => item.onboardingAllowed);
  return (
    <ul className="space-y-1.5">
      {visibleLinks.map((item) => {
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

export function StudentDesktopNav({ handbookAcknowledged }: { handbookAcknowledged: boolean }) {
  return <NavLinks onDark handbookAcknowledged={handbookAcknowledged} />;
}

export function StudentMobileNav({ handbookAcknowledged }: { handbookAcknowledged: boolean }) {
  return (
    <details className="group border-b border-slate-200 bg-white lg:hidden">
      <summary className="flex min-h-14 cursor-pointer list-none items-center justify-between px-5 py-3 font-semibold text-[#071327] focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-[var(--realm-gold)]">
        Student portal navigation
        <span aria-hidden="true" className="text-xl transition group-open:rotate-45">+</span>
      </summary>
      <nav aria-label="Student portal" className="border-t border-slate-100 px-4 py-4">
        <NavLinks handbookAcknowledged={handbookAcknowledged} />
      </nav>
    </details>
  );
}
