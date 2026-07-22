import type { Metadata } from "next";
import Link from "next/link";

import { EmptyState, formatStudentDate, formatStudentTime, humanizeStudentValue, PageHeading, StudentPanel } from "@/components/student/StudentUi";
import { requireRole } from "@/lib/lms/auth";
import { getStudentDashboardData, type StudentSession } from "@/lib/lms/studentDashboard";

export const metadata: Metadata = { title: "Schedule | REALMS Institute" };

function SessionList({ sessions, empty }: { sessions: StudentSession[]; empty: string }) {
  if (!sessions.length) return <EmptyState>{empty}</EmptyState>;
  return <ol className="space-y-4">{sessions.map((session) => { const content = <><div><p className="font-semibold text-[#071327]">{formatStudentDate(session.scheduledStartAt)}</p><p className="mt-1 text-sm text-slate-600">{formatStudentTime(session.scheduledStartAt)}</p></div><div><p className="text-xs font-semibold tracking-[0.12em] text-amber-700">{session.courseCode}</p><h3 className="mt-1 font-semibold text-[#071327]">{session.title}</h3><p className="mt-1 text-sm text-slate-600">{session.courseTitle}</p></div><div className="md:text-right"><p className="text-sm font-medium text-slate-800">{humanizeStudentValue(session.deliveryMode)}</p><p className="mt-1 text-xs text-slate-500">{humanizeStudentValue(session.status)}</p></div></>; const style = "grid gap-3 rounded-xl border border-slate-200 bg-slate-50 p-4 md:grid-cols-[180px_minmax(0,1fr)_auto]"; return <li key={`${session.kind}-${session.id}`}>{session.href ? <Link href={session.href} className={`${style} transition hover:border-amber-300 hover:bg-amber-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber-700`}>{content}</Link> : <article className={style}>{content}</article>}</li>; })}</ol>;
}

export default async function StudentCalendarPage() {
  const { user } = await requireRole("student");
  const data = await getStudentDashboardData(user.id);
  if (!data.student || !data.enrollment) return null;
  const upcoming = data.sessions.filter((session) => session.scheduledStartAt && !session.isPast).sort((a, b) => Date.parse(a.scheduledStartAt ?? "") - Date.parse(b.scheduledStartAt ?? ""));
  const unscheduled = data.sessions.filter((session) => !session.scheduledStartAt);
  return <><PageHeading eyebrow="Student Portal" title="Schedule" description="Required cohort activities and class sessions from your enrolled courses, shown in chronological order." /><div className="space-y-6"><StudentPanel title="Upcoming"><SessionList sessions={upcoming} empty="No upcoming activities have been published yet." /></StudentPanel><StudentPanel title="Past"><SessionList sessions={data.pastSessions} empty="No past activities are available yet." /></StudentPanel>{unscheduled.length ? <StudentPanel title="Schedule Pending" description="These enrolled class sessions do not yet have a published date."><SessionList sessions={unscheduled} empty="" /></StudentPanel> : null}</div></>;
}
