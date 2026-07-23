import Link from "next/link";
import { notFound } from "next/navigation";

import { StudentAbsenceActions } from "@/components/student/AbsenceRequestForms";
import { DataCard, StudentPanel, formatStudentDate, humanizeStudentValue } from "@/components/student/StudentUi";
import { absenceRequestStatusLabels, makeupPurposeLabel } from "@/lib/lms/absence";
import { getStudentAbsenceRequest } from "@/lib/lms/absenceData";
import { attendanceStatusLabels } from "@/lib/lms/attendance";
import { requireRole } from "@/lib/lms/auth";

export default async function StudentAbsenceDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { user } = await requireRole("student");
  const request = await getStudentAbsenceRequest(user.id, id);
  if (!request) notFound();
  return <div className="space-y-6">
    <Link href="/student/absences" className="font-semibold text-amber-800">← Absence &amp; Make-Up</Link>
    <header className="rounded-3xl bg-[#0b315c] p-6 text-white">
      <p className="text-sm text-[var(--realm-gold-soft)]">{request.session.courseCode} · {formatStudentDate(request.session.scheduledStartAt)}</p>
      <h1 className="mt-2 text-3xl font-semibold">{request.session.title}</h1>
      <p className="mt-2 text-white/70">Request status: {absenceRequestStatusLabels[request.status as keyof typeof absenceRequestStatusLabels]}</p>
    </header>
    {request.status === "more_information_required" ? <div className="rounded-2xl border border-amber-300 bg-amber-50 p-5"><h2 className="font-semibold">Additional Information Required</h2><p className="mt-2 text-sm leading-6">{request.decisionNote}</p></div> : null}
    <div className="grid gap-6 lg:grid-cols-2">
      <StudentPanel title="Request"><div className="grid gap-3 sm:grid-cols-2"><DataCard label="Known in Advance" value={request.knownInAdvance ? "Yes" : "No"} /><DataCard label="Reason Category" value={humanizeStudentValue(request.reasonCategory)} /><DataCard label="Submitted" value={formatStudentDate(request.submittedAt, true)} /><DataCard label="Decision" value={request.decisionNote ?? "Pending review"} /></div><p className="mt-4 rounded-xl bg-slate-50 p-4 text-sm leading-6 text-slate-700">{request.explanation}</p></StudentPanel>
      <StudentPanel title="Attendance & Learning"><div className="grid gap-3"><DataCard label="Attendance Status" value={request.attendance ? attendanceStatusLabels[request.attendance.attendance_status as keyof typeof attendanceStatusLabels] : "Not Yet Recorded"} detail="Make-up learning never changes an absence to present." /><DataCard label="Learning Status" value={humanizeStudentValue(request.learning?.completion_status ?? "not_started")} /><DataCard label="Completion Method" value={humanizeStudentValue(request.learning?.completion_method)} /></div></StudentPanel>
    </div>
    {request.makeup ? <StudentPanel title={makeupPurposeLabel(request.makeup.purposeCode)} description="The original attendance classification remains unchanged."><div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4"><DataCard label="Status" value={humanizeStudentValue(request.makeup.status)} /><DataCard label="Deadline" value={request.makeup.dueAt ? formatStudentDate(request.makeup.dueAt, true) : "Waiting for materials"} /><DataCard label="Outcome" value={humanizeStudentValue(request.makeup.outcome)} /><DataCard label="Oral Verification" value={request.makeup.requiresOralVerification ? humanizeStudentValue(request.makeup.oralVerificationStatus ?? "required") : "Not required"} /></div><p className="mt-4 text-sm leading-6 text-slate-700">{request.makeup.instructions}</p><div className="mt-4 flex flex-wrap gap-3">{request.makeup.recordingAssignmentId ? <Link href={`/student/recordings/${request.makeup.recordingAssignmentId}`} className="rounded-xl bg-[#0b315c] px-4 py-2 font-semibold text-white">Continue Make-Up Recording</Link> : null}{request.makeup.quizId ? <Link href={`/student/quizzes/${request.makeup.quizId}`} className="rounded-xl border border-slate-300 px-4 py-2 font-semibold">Complete Make-Up Quiz</Link> : null}{request.makeup.practicalAssignmentId ? <Link href={`/student/assignments/${request.makeup.practicalAssignmentId}`} className="rounded-xl border border-slate-300 px-4 py-2 font-semibold">Submit Make-Up Practical</Link> : null}{request.makeup.reflectionAssignmentId ? <Link href={`/student/assignments/${request.makeup.reflectionAssignmentId}`} className="rounded-xl border border-slate-300 px-4 py-2 font-semibold">Submit Make-Up Reflection</Link> : null}</div></StudentPanel> : null}
    <StudentPanel title="Request Timeline"><ul className="space-y-3">{request.events.map((event) => <li key={event.id} className="border-l-2 border-amber-300 pl-4"><p className="font-semibold">{humanizeStudentValue(event.event_type)}</p><p className="text-sm text-slate-500">{formatStudentDate(event.created_at, true)}</p>{event.note ? <p className="mt-1 text-sm text-slate-700">{event.note}</p> : null}</li>)}</ul></StudentPanel>
    {request.evidence.length ? <StudentPanel title="Supporting Evidence"><ul className="space-y-2">{request.evidence.map((item) => <li key={item.id} className="rounded-xl bg-slate-50 p-3"><strong>{item.title}</strong><p className="text-sm text-slate-600">{item.description}</p>{item.downloadUrl ? <a href={item.downloadUrl} className="mt-2 inline-block font-semibold text-amber-800">Download my evidence file</a> : null}</li>)}</ul></StudentPanel> : null}
    <StudentAbsenceActions request={request} />
  </div>;
}
