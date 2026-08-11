import Link from "next/link";

import { StudentPanel, formatStudentDate } from "@/components/student/StudentUi";
import { requireLmsAdminClient } from "@/lib/lms/adminData";
import { fetchStudentLateEntryCatchup } from "@/lib/lms/lateEntryService.server";
import { requireRole } from "@/lib/lms/auth";

function tone(status: string) {
  if (status === "Completed") return "border-emerald-200 bg-emerald-50 text-emerald-900";
  if (status === "Catch-Up Overdue" || status === "Alternative Required") return "border-amber-200 bg-amber-50 text-amber-950";
  return "border-slate-200 bg-slate-50 text-slate-800";
}

export default async function StudentCatchUpPage() {
  const { user } = await requireRole("student");
  const rows = await fetchStudentLateEntryCatchup(requireLmsAdminClient(), user.id);
  return <div className="space-y-6">
    <header className="rounded-3xl bg-[linear-gradient(135deg,#092648,#0e3a68)] p-6 text-white shadow-lg md:p-8">
      <p className="text-sm font-semibold text-[var(--realm-gold-soft)]">Late Entry Learning</p>
      <h1 className="mt-2 text-3xl font-semibold">Catch-Up Plan</h1>
      <p className="mt-3 max-w-3xl text-white/75">These are required sessions that took place before your effective enrolment. They are learning requirements, not unexcused absences. Complete each approved activity by its deadline.</p>
    </header>
    <div className="flex flex-wrap gap-4 text-sm"><Link href="/student" className="font-semibold text-amber-800">Student dashboard</Link><Link href="/student/courses" className="font-semibold text-amber-800">My courses</Link></div>
    {rows.length ? <div className="grid gap-5">{rows.map((item) => <StudentPanel key={item.id} title={`${item.courseCode} · ${item.sessionTitle}`} description={item.courseTitle} action={<span className={`rounded-full border px-3 py-1 text-xs font-semibold ${tone(item.status)}`}>{item.status}</span>}>
      <dl className="grid gap-3 text-sm sm:grid-cols-2"><div><dt className="text-slate-500">Session date</dt><dd className="font-medium">{item.sessionDate ? formatStudentDate(item.sessionDate) : "Date not published"}</dd></div><div><dt className="text-slate-500">Catch-up deadline</dt><dd className="font-medium">{item.dueAt ? formatStudentDate(item.dueAt, true) : "Awaiting authorised materials"}</dd></div></dl>
      <p className="mt-4 whitespace-pre-wrap text-sm leading-6 text-slate-700">{item.instructions}</p>
      <div className="mt-5 flex flex-wrap gap-3 text-sm">
        {item.recordingAssignmentId ? <Link href={`/student/recordings/${item.recordingAssignmentId}`} className="rounded-xl bg-[#0b315c] px-4 py-2 font-semibold text-white">Open recording</Link> : null}
        {item.hasPublishedSummary ? <Link href={`/student/sessions/${item.sessionId}#summary`} className="rounded-xl border border-slate-300 px-4 py-2 font-semibold text-slate-800">Class summary</Link> : null}
        {item.hasResources ? <Link href={`/student/sessions/${item.sessionId}#resources`} className="rounded-xl border border-slate-300 px-4 py-2 font-semibold text-slate-800">Session resources</Link> : null}
        {item.practicalAssignmentId ? <Link href={`/student/assignments/${item.practicalAssignmentId}`} className="rounded-xl border border-slate-300 px-4 py-2 font-semibold text-slate-800">Practical evidence</Link> : null}
        {item.reflectionAssignmentId ? <Link href={`/student/assignments/${item.reflectionAssignmentId}`} className="rounded-xl border border-slate-300 px-4 py-2 font-semibold text-slate-800">Reflection</Link> : null}
        {item.quizId ? <Link href={`/student/quizzes/${item.quizId}`} className="rounded-xl border border-slate-300 px-4 py-2 font-semibold text-slate-800">Quiz</Link> : null}
      </div>
      {item.status === "Alternative Required" ? <p className="mt-4 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-950">No approved recording or complete practical evidence is currently available. An authorised facilitator or administrator will provide an alternative activity here; no substitute content has been invented.</p> : null}
    </StudentPanel>)}</div> : <StudentPanel title="No late-entry catch-up required"><p className="text-sm text-slate-600">Your current record has no required class sessions from before your effective enrolment.</p></StudentPanel>}
  </div>;
}
