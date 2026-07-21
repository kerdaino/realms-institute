import Link from "next/link";
import type { Metadata } from "next";

import { EmptyState, formatStudentDate, humanizeStudentValue, StudentPanel } from "@/components/student/StudentUi";
import { requireRole } from "@/lib/lms/auth";
import { getStudentRecordingAssignments, type StudentRecordingAssignment } from "@/lib/lms/recordingData";

export const metadata: Metadata = { title: "Recordings | REALMS Institute" };

function completed(item: StudentRecordingAssignment) {
  return item.purposeCode === "REV" ? item.progress.watchRequirementMet : ["verified_complete", "late_complete"].includes(item.completionStatus ?? "");
}

function AssignmentList({ items }: { items: StudentRecordingAssignment[] }) {
  if (!items.length) return <EmptyState>No recordings in this section.</EmptyState>;
  return <ul className="grid gap-4 lg:grid-cols-2">{items.map((item) => {
    const supportRequirement = item.requirementSummary.practical !== "not_required" ? ["Practical", item.requirementSummary.practical] : ["Reflection", item.requirementSummary.reflection];
    return <li key={item.id}><Link href={`/student/recordings/${item.id}`} className="block rounded-2xl border border-slate-200 bg-white p-5 shadow-sm transition hover:border-amber-300"><div className="flex flex-wrap items-start justify-between gap-3"><div><p className="text-xs font-semibold uppercase tracking-[0.12em] text-amber-700">{item.course.code} · {item.purposeLabel}</p><h2 className="mt-2 font-semibold text-[#071327]">{item.recording.title}</h2><p className="mt-1 text-sm text-slate-600">{item.session.title}</p></div><span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold">{humanizeStudentValue(item.displayStatus)}</span></div><div className="mt-4 h-2 overflow-hidden rounded-full bg-slate-100"><div className="h-full rounded-full bg-amber-600" style={{ width: `${Math.min(100, item.progress.watchPercentage)}%` }} /></div><p className="mt-2 text-xs text-slate-600">{Math.floor(item.progress.watchPercentage)}% of required {Number(item.effectiveRequirements.minWatchPercentage ?? 85)}% watch{item.dueAt ? ` · Due ${formatStudentDate(item.dueAt, true)}` : ""}</p><dl className="mt-4 grid grid-cols-2 gap-2 text-xs text-slate-600"><div><dt className="font-semibold text-slate-800">Checkpoints</dt><dd>{humanizeStudentValue(item.requirementSummary.checkpoints)}</dd></div><div><dt className="font-semibold text-slate-800">Quiz</dt><dd>{humanizeStudentValue(item.requirementSummary.quiz)}</dd></div><div><dt className="font-semibold text-slate-800">{supportRequirement[0]}</dt><dd>{humanizeStudentValue(supportRequirement[1])}</dd></div><div><dt className="font-semibold text-slate-800">Learning</dt><dd>{humanizeStudentValue(item.displayStatus)}</dd></div></dl></Link></li>;
  })}</ul>;
}

export default async function StudentRecordingsPage() {
  const { user } = await requireRole("student");
  const assignments = await getStudentRecordingAssignments(user.id);
  const finished = assignments.filter(completed);
  const revisions = assignments.filter((item) => item.purposeCode === "REV" && !completed(item));
  const continueLearning = assignments.filter((item) => item.purposeCode !== "REV" && !completed(item) && item.progress.status !== "not_started");
  const verificationRequired = assignments.filter((item) => item.purposeCode !== "REV" && !completed(item) && item.progress.status === "not_started");
  return <div className="space-y-6"><header><p className="text-sm font-semibold text-amber-800">Recorded learning</p><h1 className="mt-1 text-3xl font-semibold text-[#071327]">Recordings</h1><p className="mt-3 max-w-3xl leading-7 text-slate-600">Your assigned primary, approved exception, and revision recordings. Viewing progress and each required learning check are shown separately from attendance.</p></header><StudentPanel title="Continue Learning"><AssignmentList items={continueLearning} /></StudentPanel><StudentPanel title="Recorded Verification Required"><AssignmentList items={verificationRequired} /></StudentPanel><StudentPanel title="Revision Available" description="Revision viewing does not change official attendance or award extra academic credit."><AssignmentList items={revisions} /></StudentPanel><StudentPanel title="Completed Recorded Learning"><AssignmentList items={finished} /></StudentPanel></div>;
}
