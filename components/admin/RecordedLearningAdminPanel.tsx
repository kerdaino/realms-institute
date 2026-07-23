"use client";

import { useState } from "react";

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
  recordings: Array<{ id: string; title: string }>;
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
      <p className="mt-2 text-xs text-slate-500">Cohort policy: {policy?.min_watch_percentage ?? 85}% unique watch · {policy?.default_deadline_hours ?? 72} hours · {policy?.default_required_checkpoints ?? 2} checkpoints · {policy?.min_quiz_score ?? 70}% recommended quiz minimum · {policy?.max_quiz_attempts ?? 2} initial quiz attempts.</p>
    </div>
    {assignmentCount > 0 ? <p className="rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm leading-6 text-amber-950">{assignmentCount} assignment{assignmentCount === 1 ? " already exists" : "s already exist"}. Changing the session policy requires confirmation and an audit event. Completed evidence is not silently rewritten.</p> : null}
    {message ? <p role="status" className="rounded-xl bg-amber-50 p-3 text-sm text-amber-950">{message}</p> : null}
    <form onSubmit={(event) => {
      event.preventDefault();
      const form = new FormData(event.currentTarget);
      void send(`/api/admin/sessions/${sessionId}/recorded-learning`, "PATCH", {
        min_watch_percentage: form.get("min_watch_percentage"), deadline_hours: form.get("deadline_hours"), required_checkpoint_count: form.get("required_checkpoint_count"),
        requires_checkpoints: form.get("requires_checkpoints") === "on", requires_quiz: form.get("requires_quiz") === "on", requires_practical: form.get("requires_practical") === "on", requires_reflection: form.get("requires_reflection") === "on", requires_oral_verification: form.get("requires_oral_verification") === "on", allow_late_completion: form.get("allow_late_completion") === "on", confirm_existing_assignments: form.get("confirm_existing_assignments") === "on", quiz_id: form.get("quiz_id"), practical_assignment_id: form.get("practical_assignment_id"), reflection_assignment_id: form.get("reflection_assignment_id"),
      });
    }} className="grid gap-3 md:grid-cols-3">
      <label className="text-sm font-medium">Minimum watch percentage<input name="min_watch_percentage" type="number" min="1" max="100" step="0.01" defaultValue={defaults.minWatch} className="mt-1 block w-full rounded-lg border border-slate-300 px-3 py-2" /></label>
      <label className="text-sm font-medium">Deadline hours<input name="deadline_hours" type="number" min="1" defaultValue={defaults.deadline} className="mt-1 block w-full rounded-lg border border-slate-300 px-3 py-2" /></label>
      <label className="text-sm font-medium">Required checkpoint count<input name="required_checkpoint_count" type="number" min="0" defaultValue={defaults.checkpoints} className="mt-1 block w-full rounded-lg border border-slate-300 px-3 py-2" /></label>
      {[
        ["requires_checkpoints", "Requires checkpoints", defaults.requiresCheckpoints], ["requires_quiz", "Requires quiz", defaults.requiresQuiz], ["requires_practical", "Requires practical", defaults.requiresPractical], ["requires_reflection", "Requires reflection", defaults.requiresReflection], ["requires_oral_verification", "Requires oral verification", defaults.requiresOral], ["allow_late_completion", "Allow late completion", defaults.allowLate],
      ].map(([name, label, checked]) => <label key={String(name)} className="flex items-center gap-2 text-sm"><input name={String(name)} type="checkbox" defaultChecked={Boolean(checked)} />{String(label)}</label>)}
      <label className="text-sm font-medium">Linked quiz<select name="quiz_id" defaultValue={requirements?.quiz_id ?? ""} className="mt-1 block w-full rounded-lg border border-slate-300 px-3 py-2"><option value="">No linked quiz</option>{assessmentQuizzes.map((quiz) => <option key={quiz.id} value={quiz.id}>{quiz.title}</option>)}</select></label>
      <label className="text-sm font-medium">Linked practical<select name="practical_assignment_id" defaultValue={requirements?.practical_assignment_id ?? ""} className="mt-1 block w-full rounded-lg border border-slate-300 px-3 py-2"><option value="">No linked practical</option>{assessmentAssignments.filter((item) => item.assignment_type !== "reflection").map((item) => <option key={item.id} value={item.id}>{item.title}</option>)}</select></label>
      <label className="text-sm font-medium">Linked reflection<select name="reflection_assignment_id" defaultValue={requirements?.reflection_assignment_id ?? ""} className="mt-1 block w-full rounded-lg border border-slate-300 px-3 py-2"><option value="">No linked reflection</option>{assessmentAssignments.filter((item) => item.assignment_type === "reflection").map((item) => <option key={item.id} value={item.id}>{item.title}</option>)}</select></label>
      {assignmentCount > 0 ? <label className="flex items-center gap-2 text-sm font-medium text-amber-950 md:col-span-3"><input name="confirm_existing_assignments" type="checkbox" />I confirm this policy change after reviewing its effect on existing assignments.</label> : null}
      <button disabled={busy} className="rounded-lg border border-slate-300 px-4 py-2 font-semibold md:col-span-3">Save session override</button>
    </form>
    <button disabled={busy} onClick={() => void send(`/api/admin/sessions/${sessionId}/recorded-learning`, "POST")} className="rounded-lg bg-[#0b315c] px-4 py-2 font-semibold text-white">Initialize eligible RP / DR-E assignments</button>
    {recordings.length ? <form onSubmit={(event) => {
      event.preventDefault();
      const form = new FormData(event.currentTarget);
      void send(`/api/admin/recordings/checkpoints/${String(form.get("recording_id"))}`, "POST", { title: form.get("title"), position_seconds: form.get("position_seconds"), position_percentage: form.get("position_percentage"), checkpoint_order: form.get("checkpoint_order"), is_required: form.get("is_required") === "on" });
    }} className="grid gap-3 rounded-xl border border-slate-200 p-4 md:grid-cols-2">
      <h3 className="font-semibold md:col-span-2">Add recording checkpoint</h3>
      <select name="recording_id" className="rounded-lg border border-slate-300 px-3 py-2">{recordings.map((recording) => <option key={recording.id} value={recording.id}>{recording.title}</option>)}</select>
      <input name="title" required placeholder="Checkpoint title" className="rounded-lg border border-slate-300 px-3 py-2" />
      <input name="position_seconds" type="number" min="0" step="0.001" placeholder="Position in seconds (optional)" className="rounded-lg border border-slate-300 px-3 py-2" />
      <input name="position_percentage" type="number" min="0" max="100" step="0.01" placeholder="Position percentage (optional)" className="rounded-lg border border-slate-300 px-3 py-2" />
      <input name="checkpoint_order" type="number" min="1" defaultValue="1" className="rounded-lg border border-slate-300 px-3 py-2" />
      <label className="flex items-center gap-2 text-sm"><input name="is_required" type="checkbox" defaultChecked />Required checkpoint</label>
      <button disabled={busy} className="rounded-lg bg-[#0b315c] px-4 py-2 font-semibold text-white md:col-span-2">Create checkpoint</button>
    </form> : null}
  </div>;
}
