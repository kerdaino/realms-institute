import Link from "next/link";

const links = [
  ["/admin/dashboard", "Dashboard"], ["/admin/announcements", "Announcements"], ["/admin/registrations", "Applications"], ["/admin/students", "Students"], ["/admin/at-risk", "Student Engagement"], ["/admin/results", "Results"], ["/admin/graduation", "Graduation"], ["/admin/awards", "Awards"], ["/admin/alumni", "Alumni"], ["/admin/cohorts", "Cohorts"], ["/admin/courses", "Courses"], ["/admin/sessions", "Sessions"], ["/admin/class-summaries", "Class Summaries"], ["/admin/attendance", "Attendance"], ["/admin/absence-makeup", "Absence & Make-Up"], ["/admin/recordings", "Recordings"], ["/admin/assessments", "Assessments"], ["/admin/assignments", "Assignments"], ["/admin/quizzes", "Quizzes"], ["/admin/facilitators", "Facilitators"], ["/admin/scholarships", "Scholarships"], ["/", "Public Site"],
] as const;

export function AdminNav() {
  return <header className="border-b border-slate-200 bg-[#071327] text-white"><div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-4 px-5 py-4 md:px-8"><Link href="/admin/dashboard" className="font-semibold tracking-wide text-[#f2d27a]">REALMS Admin</Link><nav aria-label="Admin navigation" className="flex flex-wrap items-center gap-x-4 gap-y-2 text-sm">{links.map(([href, label]) => <Link key={href} href={href} className="hover:text-[#f2d27a]">{label}</Link>)}<form action="/api/admin/logout" method="post"><button type="submit" className="rounded-lg border border-white/25 px-3 py-1.5 hover:border-[#d7aa45] hover:text-[#f2d27a]">Logout</button></form></nav></div></header>;
}
