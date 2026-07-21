import Link from "next/link";

import { AdminShell } from "@/components/admin/AdminShell";
import { StatusBadge } from "@/components/admin/LmsUi";
import { requireAdmin } from "@/lib/adminAuth";
import { requireLmsAdminClient } from "@/lib/lms/adminData";
import { recordingPurposeLabels } from "@/lib/lms/recording";
import { fetchAdminRecordingDashboard } from "@/lib/lms/recordingData";

const learningStates = ["not_started", "in_progress", "awaiting_checkpoint", "awaiting_quiz", "awaiting_practical", "awaiting_reflection", "under_review", "verified_complete", "late_complete", "incomplete", "integrity_review"];

export default async function AdminRecordingsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  await requireAdmin();
  const search = await searchParams;
  const value = (key: string) => typeof search[key] === "string" ? search[key] as string : undefined;
  const data = await fetchAdminRecordingDashboard(requireLmsAdminClient(), {
    cohort: value("cohort"), course: value("course"), purpose: value("purpose"), learningStatus: value("learning_status"), recordingStatus: value("recording_status"), student: value("student"), deadlineFrom: value("deadline_from"), deadlineTo: value("deadline_to"), overdue: value("overdue"), integrityStatus: value("integrity_status"),
  });
  return <AdminShell title="Recorded Learning" description="Verified playback evidence, separate learning completion, route purpose, deadlines, and neutral review states.">
    <form className="mb-6 grid gap-3 rounded-2xl border border-slate-200 bg-white p-4 md:grid-cols-2 xl:grid-cols-5">
      <input name="student" defaultValue={value("student")} placeholder="Student name or number" className="min-h-11 rounded-lg border border-slate-300 px-3" />
      <select name="cohort" defaultValue={value("cohort") ?? ""} className="min-h-11 rounded-lg border border-slate-300 px-3"><option value="">All cohorts</option>{data.options.cohorts.map((item) => <option key={item.id} value={item.id}>{item.code} · {item.name}</option>)}</select>
      <select name="course" defaultValue={value("course") ?? ""} className="min-h-11 rounded-lg border border-slate-300 px-3"><option value="">All courses</option>{data.options.courses.map((item) => <option key={item.id} value={item.id}>{item.code} · {item.title}</option>)}</select>
      <select name="purpose" defaultValue={value("purpose") ?? ""} className="min-h-11 rounded-lg border border-slate-300 px-3"><option value="">All purposes</option>{Object.entries(recordingPurposeLabels).map(([code, label]) => <option key={code} value={code}>{label}</option>)}</select>
      <select name="learning_status" defaultValue={value("learning_status") ?? ""} className="min-h-11 rounded-lg border border-slate-300 px-3"><option value="">All learning states</option>{learningStates.map((item) => <option key={item} value={item}>{item.replaceAll("_", " ")}</option>)}</select>
      <select name="recording_status" defaultValue={value("recording_status") ?? ""} className="min-h-11 rounded-lg border border-slate-300 px-3"><option value="">All recording states</option>{["draft", "processing", "available", "archived"].map((item) => <option key={item}>{item}</option>)}</select>
      <select name="integrity_status" defaultValue={value("integrity_status") ?? ""} className="min-h-11 rounded-lg border border-slate-300 px-3"><option value="">All integrity states</option><option value="clear">Clear</option><option value="review_required">Review required</option></select>
      <select name="overdue" defaultValue={value("overdue") ?? ""} className="min-h-11 rounded-lg border border-slate-300 px-3"><option value="">Any deadline state</option><option value="yes">Overdue only</option><option value="no">Not overdue</option></select>
      <input name="deadline_from" type="date" defaultValue={value("deadline_from")} aria-label="Deadline from" className="min-h-11 rounded-lg border border-slate-300 px-3" />
      <input name="deadline_to" type="date" defaultValue={value("deadline_to")} aria-label="Deadline to" className="min-h-11 rounded-lg border border-slate-300 px-3" />
      <button className="rounded-lg bg-[#0b315c] px-4 py-2 font-semibold text-white xl:col-span-5">Apply filters</button>
    </form>
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-6">{Object.entries(data.metrics).map(([label, count]) => <div key={label} className="rounded-2xl border border-slate-200 bg-white p-5"><p className="text-sm capitalize text-slate-600">{label.replaceAll(/([A-Z])/g, " $1")}</p><p className="mt-2 text-3xl font-semibold">{count}</p></div>)}</div>
    <div className="mt-6 overflow-x-auto rounded-2xl border border-slate-200 bg-white"><table className="min-w-full text-left text-sm"><thead className="bg-slate-50"><tr>{["Student", "Course / Session", "Purpose", "Watch", "Checkpoints", "Quiz", "Practical / Reflection", "Due", "Status", "Review"].map((label) => <th key={label} className="px-4 py-3">{label}</th>)}</tr></thead><tbody className="divide-y divide-slate-200">{data.rows.map((row) => <tr key={row.id}><td className="px-4 py-3"><strong>{row.student.name}</strong><span className="block text-xs text-slate-500">{row.student.number}</span></td><td className="px-4 py-3">{row.course.code}<span className="block text-xs text-slate-500">{row.session.title}</span></td><td className="px-4 py-3">{row.purposeLabel}</td><td className="px-4 py-3">{Math.floor(row.progress.watchPercentage)}%</td><td className="px-4 py-3"><StatusBadge value={row.requirementSummary.checkpoints} /></td><td className="px-4 py-3"><StatusBadge value={row.requirementSummary.quiz} /></td><td className="px-4 py-3"><StatusBadge value={row.requirementSummary.practical !== "not_required" ? row.requirementSummary.practical : row.requirementSummary.reflection} /></td><td className="px-4 py-3">{row.dueAt ? new Date(row.dueAt).toLocaleString("en-NG") : "—"}</td><td className="px-4 py-3"><StatusBadge value={row.displayStatus} /></td><td className="px-4 py-3"><Link href={`/admin/recordings/${row.id}`} className="font-semibold text-amber-800">Open evidence</Link></td></tr>)}</tbody></table>{!data.rows.length ? <p className="p-8 text-center text-slate-600">No recorded-learning assignments match these filters.</p> : null}</div>
  </AdminShell>;
}
