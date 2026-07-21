import { notFound } from "next/navigation";

import { CheckpointForm, RecordingPlayer, UnsupportedRecordingAccess } from "@/components/student/RecordingPlayer";
import { DataCard, formatStudentDate, humanizeStudentValue, StudentPanel } from "@/components/student/StudentUi";
import { requireRole } from "@/lib/lms/auth";
import { requireLmsAdminClient } from "@/lib/lms/adminData";
import { getStudentRecordingAssignment } from "@/lib/lms/recordingData";
import { evaluateRecordedLearningAssignment, resolveStudentRecordingAssignment } from "@/lib/lms/recordingService";

export default async function StudentRecordingPage({ params }: { params: Promise<{ assignmentId: string }> }) {
  const { user } = await requireRole("student");
  const { assignmentId } = await params;
  const trustedClient = requireLmsAdminClient();
  try {
    await resolveStudentRecordingAssignment(trustedClient, user.id, assignmentId);
    await evaluateRecordedLearningAssignment(trustedClient, assignmentId, { actorLabel: "System", actorUserId: user.id });
  } catch { notFound(); }
  const detail = await getStudentRecordingAssignment(user.id, assignmentId);
  if (!detail) notFound();
  const watchRequired = Number(detail.effectiveRequirements.minWatchPercentage ?? 85);
  const required = detail.requirements.filter((item) => item.required);
  const playerCheckpoints = detail.checkpoints.map((checkpoint) => ({ id: String(checkpoint.id), title: String(checkpoint.title), position_seconds: checkpoint.position_seconds === null ? null : Number(checkpoint.position_seconds), position_percentage: checkpoint.position_percentage === null ? null : Number(checkpoint.position_percentage), is_required: Boolean(checkpoint.is_required) }));

  return <div className="space-y-6">
    <header className="rounded-3xl bg-[linear-gradient(135deg,#092648,#0e3a68)] p-6 text-white"><p className="text-xs font-semibold uppercase tracking-[0.15em] text-[var(--realm-gold-soft)]">{detail.course.code} · {detail.purposeLabel}</p><h1 className="mt-2 text-3xl font-semibold">{detail.recording.title}</h1><p className="mt-2 text-white/70">{detail.session.title}</p></header>
    <StudentPanel title="Recording">
      {detail.accessState === "upcoming" ? <div className="rounded-2xl border border-amber-200 bg-amber-50 p-5 text-amber-950">This recording becomes available {formatStudentDate(detail.availableAt, true)}.</div> : detail.accessState === "expired" ? <div className="rounded-2xl border border-amber-200 bg-amber-50 p-5 text-amber-950">This recording access window has expired. Your historical progress remains preserved.</div> : detail.recording.embedUrl ? <RecordingPlayer assignmentId={detail.id} embedUrl={detail.recording.embedUrl} durationSeconds={detail.recording.durationSeconds} checkpoints={playerCheckpoints} completedCheckpointIds={detail.completedCheckpointIds} /> : <div className="rounded-2xl border border-amber-200 bg-amber-50 p-5 text-amber-950"><h2 className="font-semibold">Progress requires staff review</h2><p className="mt-2 text-sm leading-6">Automated viewing progress is not available for this recording. Opening it does not fabricate a viewing percentage or attendance result.</p>{detail.recording.externalUrl ? <UnsupportedRecordingAccess assignmentId={detail.id} externalUrl={detail.recording.externalUrl} /> : null}</div>}
    </StudentPanel>
    {detail.progress.integrityStatus !== "clear" ? <p role="status" className="rounded-2xl border border-amber-200 bg-amber-50 p-5 text-sm leading-6 text-amber-950">Your learning activity is under review. REALMS may contact you for clarification.</p> : null}
    <StudentPanel title="My requirement status"><div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4"><DataCard label="Watch" value={`${Math.floor(detail.progress.watchPercentage)}% of required ${watchRequired}%`} /><DataCard label="Checkpoints" value={`${detail.progress.checkpointRequirementMet ? "Completed" : "Pending"} · ${Number(detail.effectiveRequirements.requiredCheckpointCount ?? 2)} required`} /><DataCard label="Learning state" value={humanizeStudentValue(detail.displayStatus)} /><DataCard label="Deadline" value={detail.dueAt ? formatStudentDate(detail.dueAt, true) : detail.purposeCode === "REV" ? "No academic deadline" : "No deadline"} /></div><ul className="mt-5 grid gap-3 sm:grid-cols-2">{required.map((item) => <li key={item.id} className="rounded-xl border border-slate-200 p-4"><span className="font-semibold text-[#071327]">{humanizeStudentValue(item.type)}</span><span className="mt-1 block text-sm text-slate-600">{humanizeStudentValue(item.status)}</span>{["quiz", "practical"].includes(item.type) && item.status !== "satisfied" ? <span className="mt-1 block text-xs text-slate-500">Not yet available in the portal; Build 8 will connect formal evidence.</span> : null}</li>)}</ul></StudentPanel>
    {detail.checkpoints.length ? <StudentPanel title="Required checkpoints" description="Long-form checkpoint responses remain for human review; they are not automatically scored."><div className="space-y-4">{detail.checkpoints.map((checkpoint) => <CheckpointForm key={checkpoint.id} assignmentId={detail.id} checkpoint={checkpoint as unknown as Record<string, unknown>} />)}</div></StudentPanel> : required.some((item) => item.type === "checkpoints") ? <p className="rounded-2xl border border-amber-200 bg-amber-50 p-5 text-sm text-amber-950">Recorded verification cannot complete because required checkpoints have not been configured. REALMS staff have been alerted by the requirement state.</p> : null}
    <StudentPanel title="Attendance and learning remain separate"><div className="grid gap-3 sm:grid-cols-2"><DataCard label="Attendance" value={detail.attendance ? humanizeStudentValue(detail.attendance.attendance_status) : "Pending"} /><DataCard label="Learning completion" value={humanizeStudentValue(detail.completionStatus ?? "not_started")} /></div>{detail.purposeCode === "REV" ? <p className="mt-4 text-sm leading-6 text-slate-600">Revision progress does not change your existing attendance, completion method, absence weight, or academic credit.</p> : null}</StudentPanel>
  </div>;
}
