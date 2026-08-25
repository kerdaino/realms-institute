"use client";

import { useState } from "react";

import { formatRecordingTime, formatRequiredCheckpoints, formatRequirementHours, parseRecordingTime } from "@/lib/lms/recordingTime";

type RequirementConfig = {
  min_watch_percentage?: number | null;
  deadline_hours?: number | null;
  required_checkpoint_count?: number | null;
  requires_checkpoints?: boolean | null;
  requires_quiz?: boolean | null;
  requires_practical?: boolean | null;
  requires_reflection?: boolean | null;
  requires_oral_verification?: boolean | null;
  allow_late_completion?: boolean | null;
  quiz_id?: string | null;
  practical_assignment_id?: string | null;
  reflection_assignment_id?: string | null;
};

type Policy = {
  min_watch_percentage?: number | null;
  default_deadline_hours?: number | null;
  default_required_checkpoints?: number | null;
  min_quiz_score?: number | null;
  max_quiz_attempts?: number | null;
};

export function RecordedLearningAdminPanel({ sessionId, recordings, requirements, policy, courseCategory, assignmentCount, assessmentAssignments, assessmentQuizzes }: {
  sessionId: string;
  recordings: Array<{ id: string; title: string; durationSeconds: number | null }>;
  requirements: RequirementConfig | null;
  policy: Policy | null;
  courseCategory: string;
  assignmentCount: number;
  assessmentAssignments: Array<{ id: string; title: string; assignment_type: string }>;
  assessmentQuizzes: Array<{ id: string; title: string }>;
}) {
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const defaults = {
    minWatch: requirements?.min_watch_percentage ?? policy?.min_watch_percentage ?? 85,
    deadline: requirements?.deadline_hours ?? policy?.default_deadline_hours ?? 72,
    checkpoints: requirements?.required_checkpoint_count ?? policy?.default_required_checkpoints ?? 2,
    requiresCheckpoints: requirements?.requires_checkpoints ?? true,
    requiresQuiz: requirements?.requires_quiz ?? true,
    requiresPractical: requirements?.requires_practical ?? courseCategory === "skill",
    requiresReflection: requirements?.requires_reflection ?? courseCategory === "discipleship",
    requiresOral: requirements?.requires_oral_verification ?? false,
    allowLate: requirements?.allow_late_completion ?? true,
  };

  async function send(path: string, method: string, body?: Record<string, unknown>) {
    setBusy(true);
    setMessage("");
    const response = await fetch(path, { method, headers: body ? { "Content-Type": "application/json" } : undefined, body: body ? JSON.stringify(body) : undefined });
    const data = await response.json();
    setBusy(false);
    setMessage(response.ok ? "Recorded-learning configuration was saved." : data.message || "The change could not be saved.");
    if (response.ok) window.location.reload();
  }

  return <div className="space-y-5">
    <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm leading-6 text-slate-700">
      <p>These requirements apply to students using an approved recorded-learning route or make-up assignment.</p>
      <p className="mt-2 text-sm font-medium text-slate-700">{defaults.minWatch}% minimum unique watch · {formatRequirementHours(defaults.deadline)} · {formatRequiredCheckpoints(defaults.requiresCheckpoints ? defaults.checkpoints : 0)}</p>
      <p className="mt-1 text-xs text-slate-500">Quiz guidance: {policy?.min_quiz_score ?? 70}% recommended minimum, with {policy?.max_quiz_attempts ?? 2} initial attempts.</p>
    </div>
    {assignmentCount > 0 ? <p className="rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm leading-6 text-amber-950">{assignmentCount} assignment{assignmentCount === 1 ? " already exists" : "s already exist"}. Changing the session policy requires confirmation and an audit event. Completed evidence is not silently rewritten.</p> : null}
    {message ? <p role="status" className="rounded-xl bg-amber-50 p-3 text-sm text-amber-950">{message}</p> : null}
    <form onSubmit={(event) => {
      event.preventDefault();
      const form = new FormData(event.currentTarget);
      const body = {
        min_watch_percentage: form.get("min_watch_percentage"), deadline_hours: form.get("deadline_hours"), required_checkpoint_count: form.get("required_checkpoint_count"),
        requires_checkpoints: form.get("requires_checkpoints") === "on", requires_quiz: form.get("requires_quiz") === "on", requires_practical: form.get("requires_practical") === "on", requires_reflection: form.get("requires_reflection") === "on", requires_oral_verification: form.get("requires_oral_verification") === "on", allow_late_completion: form.get("allow_late_completion") === "on", confirm_existing_assignments: form.get("confirm_existing_assignments") === "on", quiz_id: form.get("quiz_id"), practical_assignment_id: form.get("practical_assignment_id"), reflection_assignment_id: form.get("reflection_assignment_id"),
      };
      if (body.requires_checkpoints && (!Number.isInteger(Number(body.required_checkpoint_count)) || Number(body.required_checkpoint_count) <= 0)) return setMessage("Required checkpoint count must be a whole number greater than zero when checkpoints are required.");
      if (body.requires_quiz && !body.quiz_id) return setMessage("Choose the linked quiz before saving a quiz requirement.");
      if (body.requires_practical && !body.practical_assignment_id) return setMessage("Choose the linked practical before saving a practical requirement.");
      if (body.requires_reflection && !body.reflection_assignment_id) return setMessage("Choose the linked reflection before saving a reflection requirement.");
      void send(`/api/admin/sessions/${sessionId}/recorded-learning`, "PATCH", body);
    }} className="grid gap-3 md:grid-cols-3">
      <label className="text-sm font-medium">Minimum watch percentage<input name="min_watch_percentage" type="number" min="1" max="100" step="0.01" defaultValue={defaults.minWatch} className="mt-1 block w-full rounded-lg border border-slate-300 px-3 py-2" /></label>
      <label className="text-sm font-medium">Complete within (hours)<input name="deadline_hours" type="number" min="1" defaultValue={defaults.deadline} className="mt-1 block w-full rounded-lg border border-slate-300 px-3 py-2" /></label>
      <label className="text-sm font-medium">Required checkpoint count<input name="required_checkpoint_count" type="number" min="0" step="1" defaultValue={defaults.checkpoints} className="mt-1 block w-full rounded-lg border border-slate-300 px-3 py-2" /></label>
      {[
        ["requires_checkpoints", "Requires checkpoints", defaults.requiresCheckpoints], ["requires_quiz", "Requires quiz", defaults.requiresQuiz], ["requires_practical", "Requires practical", defaults.requiresPractical], ["requires_reflection", "Requires reflection", defaults.requiresReflection], ["requires_oral_verification", "Requires oral verification", defaults.requiresOral], ["allow_late_completion", "Allow late completion", defaults.allowLate],
      ].map(([name, label, checked]) => <label key={String(name)} className="flex items-center gap-2 text-sm"><input name={String(name)} type="checkbox" defaultChecked={Boolean(checked)} />{String(label)}</label>)}
      <label className="text-sm font-medium">Linked quiz<select name="quiz_id" defaultValue={requirements?.quiz_id ?? ""} className="mt-1 block w-full rounded-lg border border-slate-300 px-3 py-2"><option value="">No linked quiz</option>{assessmentQuizzes.map((quiz) => <option key={quiz.id} value={quiz.id}>{quiz.title}</option>)}</select></label>
      <label className="text-sm font-medium">Linked practical<select name="practical_assignment_id" defaultValue={requirements?.practical_assignment_id ?? ""} className="mt-1 block w-full rounded-lg border border-slate-300 px-3 py-2"><option value="">No linked practical</option>{assessmentAssignments.filter((item) => item.assignment_type !== "reflection").map((item) => <option key={item.id} value={item.id}>{item.title}</option>)}</select></label>
      <label className="text-sm font-medium">Linked reflection<select name="reflection_assignment_id" defaultValue={requirements?.reflection_assignment_id ?? ""} className="mt-1 block w-full rounded-lg border border-slate-300 px-3 py-2"><option value="">No linked reflection</option>{assessmentAssignments.filter((item) => item.assignment_type === "reflection").map((item) => <option key={item.id} value={item.id}>{item.title}</option>)}</select></label>
      {assignmentCount > 0 ? <label className="flex items-center gap-2 text-sm font-medium text-amber-950 md:col-span-3"><input name="confirm_existing_assignments" type="checkbox" />I confirm this policy change after reviewing its effect on existing assignments.</label> : null}
      <button disabled={busy} className="rounded-lg border border-slate-300 px-4 py-2 font-semibold md:col-span-3">Save session override</button>
    </form>
    <button disabled={busy} onClick={() => void send(`/api/admin/sessions/${sessionId}/recorded-learning`, "POST")} className="rounded-lg bg-[#0b315c] px-4 py-2 font-semibold text-white">Retry / reconcile eligible recorded-route assignments</button>
    {recordings.length ? <form onSubmit={(event) => {
      event.preventDefault();
      const form = new FormData(event.currentTarget);
      const recordingId = String(form.get("recording_id"));
      const time = parseRecordingTime(form.get("position_time"));
      if (!time.ok) return setMessage(time.message);
      const percentageValue = String(form.get("position_percentage") ?? "").trim();
      if (time.seconds === null && !percentageValue) return setMessage("Specify either Time in recording or Position percentage.");
      if (time.seconds !== null && percentageValue) return setMessage("Specify either Time in recording or Position percentage, not both.");
      const duration = recordings.find((recording) => recording.id === recordingId)?.durationSeconds ?? null;
      if (time.seconds !== null && duration !== null && time.seconds > duration) return setMessage("Time in recording cannot be later than the recording duration.");
      void send(`/api/admin/recordings/checkpoints/${recordingId}`, "POST", { title: form.get("title"), position_seconds: time.seconds, position_percentage: percentageValue || null, checkpoint_order: form.get("checkpoint_order"), is_required: form.get("is_required") === "on" });
    }} className="grid gap-3 rounded-xl border border-slate-200 p-4 md:grid-cols-2">
      <h3 className="font-semibold md:col-span-2">Add recording checkpoint</h3>
      <label className="text-sm font-medium">Recording<select name="recording_id" className="mt-1 block w-full rounded-lg border border-slate-300 px-3 py-2">{recordings.map((recording) => <option key={recording.id} value={recording.id}>{recording.title}{recording.durationSeconds === null ? "" : ` · ${formatRecordingTime(recording.durationSeconds)}`}</option>)}</select></label>
      <input name="title" required placeholder="Checkpoint title" className="rounded-lg border border-slate-300 px-3 py-2" />
      <label className="text-sm font-medium">Time in recording <span className="font-normal text-slate-500">(HH:MM:SS or MM:SS)</span><input name="position_time" inputMode="numeric" placeholder="45:00" className="mt-1 block w-full rounded-lg border border-slate-300 px-3 py-2" /></label>
      <label className="text-sm font-medium">Position percentage<input name="position_percentage" type="number" min="0" max="100" step="0.01" placeholder="For example 50" className="mt-1 block w-full rounded-lg border border-slate-300 px-3 py-2" /></label>
      <p className="text-xs leading-5 text-slate-600 md:col-span-2">Specify either Time in recording or Position percentage. You do not need both.</p>
      <input name="checkpoint_order" type="number" min="1" defaultValue="1" className="rounded-lg border border-slate-300 px-3 py-2" />
      <label className="flex items-center gap-2 text-sm"><input name="is_required" type="checkbox" defaultChecked />Required checkpoint</label>
      <button disabled={busy} className="rounded-lg bg-[#0b315c] px-4 py-2 font-semibold text-white md:col-span-2">Create checkpoint</button>
    </form> : null}
  </div>;
}
