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

type RecordingCheckpoint = {
  id: string;
  class_recording_id: string;
  title: string;
  checkpoint_order: number;
  is_required: boolean;
  position_seconds: number | null;
  position_percentage: number | null;
  recording_checkpoint_questions: Array<{ id: string; prompt: string; response_format: string | null; min_characters: number | null; max_characters: number | null; min_words: number | null; max_words: number | null; is_active: boolean }>;
};

export function RecordedLearningAdminPanel({ sessionId, recordings, checkpoints, requirements, policy, courseCategory, assignmentCount, assessmentAssignments, assessmentQuizzes, initialMessage }: {
  sessionId: string;
  recordings: Array<{ id: string; title: string; provider: string; durationSeconds: number | null }>;
  checkpoints: RecordingCheckpoint[];
  requirements: RequirementConfig | null;
  policy: Policy | null;
  courseCategory: string;
  assignmentCount: number;
  assessmentAssignments: Array<{ id: string; title: string; assignment_type: string }>;
  assessmentQuizzes: Array<{ id: string; title: string }>;
  initialMessage?: string;
}) {
  const [message, setMessage] = useState(initialMessage ?? "");
  const [busy, setBusy] = useState(false);
  const [editingCheckpointId, setEditingCheckpointId] = useState<string | null>(null);
  const [selectedRecordingId, setSelectedRecordingId] = useState(recordings[0]?.id ?? "");
  const selectedRecording = recordings.find((recording) => recording.id === selectedRecordingId) ?? recordings[0];
  const isZoomManual = selectedRecording?.provider.toLowerCase() === "zoom";
  const selectedCheckpoints = checkpoints.filter((checkpoint) => checkpoint.class_recording_id === selectedRecording?.id).sort((a, b) => a.checkpoint_order - b.checkpoint_order);
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
  const requiredConfigured = selectedCheckpoints.filter((checkpoint) => checkpoint.is_required && checkpoint.recording_checkpoint_questions.some((question) => question.is_active !== false)).length;
  const requiredByPolicy = defaults.requiresCheckpoints ? Number(defaults.checkpoints) : 0;
  const checkpointState = requiredConfigured < requiredByPolicy
    ? requiredConfigured === 0 ? "Incomplete" : `${requiredByPolicy - requiredConfigured} more checkpoint${requiredByPolicy - requiredConfigured === 1 ? "" : "s"} required`
    : requiredConfigured === requiredByPolicy ? "Ready" : "Warning: more required checkpoints configured than policy requires";

  async function send(path: string, method: string, body?: Record<string, unknown>) {
    setBusy(true);
    setMessage("");
    const response = await fetch(path, { method, headers: body ? { "Content-Type": "application/json" } : undefined, body: body ? JSON.stringify(body) : undefined });
    const data = await response.json();
    setBusy(false);
    setMessage(response.ok ? "Recorded-learning configuration was saved." : data.message || "The change could not be saved.");
    if (response.ok) window.location.reload();
  }

  async function removeCheckpoint(checkpointId: string) {
    if (!window.confirm("Remove this checkpoint?\n\nThis action is allowed only if no student learning evidence depends on it.")) return;
    setBusy(true); setMessage("");
    const response = await fetch(`/api/admin/recordings/checkpoints/${checkpointId}`, { method: "DELETE" });
    const data = await response.json();
    if (!response.ok) { setBusy(false); setMessage(data.message || "Checkpoint could not be removed."); return; }
    window.location.assign(`/admin/sessions/${sessionId}?checkpoint=removed#recorded-learning`);
  }

  async function editCheckpoint(event: React.FormEvent<HTMLFormElement>, checkpointId: string) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setBusy(true); setMessage("");
    const response = await fetch(`/api/admin/recordings/checkpoints/${checkpointId}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ title: form.get("title"), question: form.get("question"), response_format: form.get("response_format"), min_words: form.get("min_words"), max_words: form.get("max_words"), checkpoint_order: form.get("checkpoint_order"), is_required: form.get("is_required") === "on" }) });
    const data = await response.json();
    if (!response.ok) { setBusy(false); setMessage(data.message || "Checkpoint could not be updated."); return; }
    window.location.assign(`/admin/sessions/${sessionId}?checkpoint=updated#recorded-learning`);
  }

  return <div id="recorded-learning" className="scroll-mt-24 space-y-5">
    {!requirements ? <p className="rounded-xl border border-blue-200 bg-blue-50 p-4 text-sm leading-6 text-blue-950"><strong>No active session override is saved.</strong> The checked controls below show proposed policy defaults, not an enabled session configuration. Save valid links and checkpoint settings before official recorded-learning activation.</p> : null}
    <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm leading-6 text-slate-700">
      <p>These requirements apply to students using an approved recorded-learning route or make-up assignment.</p>
      <p className="mt-2 text-sm font-medium text-slate-700">{defaults.minWatch}% minimum unique watch · {formatRequirementHours(defaults.deadline)} · {formatRequiredCheckpoints(defaults.requiresCheckpoints ? defaults.checkpoints : 0)}</p>
      <p className="mt-1 text-xs text-slate-500">Quiz guidance: {policy?.min_quiz_score ?? 70}% recommended minimum, with {policy?.max_quiz_attempts ?? 2} initial attempts.</p>
    </div>
    <div className="grid gap-2 text-sm sm:grid-cols-3">
      <p className={`rounded-xl border p-3 ${defaults.requiresQuiz && !requirements?.quiz_id ? "border-rose-200 bg-rose-50 text-rose-900" : "border-slate-200 bg-white text-slate-700"}`}><strong className="block">Quiz requirement</strong>{defaults.requiresQuiz ? requirements?.quiz_id ? "Linked and configured" : "Blocked: choose a linked quiz" : "Not required"}</p>
      <p className={`rounded-xl border p-3 ${defaults.requiresPractical && !requirements?.practical_assignment_id ? "border-rose-200 bg-rose-50 text-rose-900" : "border-slate-200 bg-white text-slate-700"}`}><strong className="block">Practical requirement</strong>{defaults.requiresPractical ? requirements?.practical_assignment_id ? "Linked and configured" : "Blocked: choose a linked practical" : "Not required"}</p>
      <p className={`rounded-xl border p-3 ${defaults.requiresReflection && !requirements?.reflection_assignment_id ? "border-rose-200 bg-rose-50 text-rose-900" : "border-slate-200 bg-white text-slate-700"}`}><strong className="block">Reflection requirement</strong>{defaults.requiresReflection ? requirements?.reflection_assignment_id ? "Linked and configured" : "Blocked: choose a linked reflection" : "Not required"}</p>
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
    {recordings.length ? <section aria-labelledby="recording-checkpoints-heading" className="space-y-3 rounded-xl border border-slate-200 p-4">
      <div className="flex flex-wrap items-start justify-between gap-3"><div><h3 id="recording-checkpoints-heading" className="font-semibold">Recording checkpoints</h3><p className="mt-1 text-sm text-slate-600">{requiredConfigured} configured / {requiredByPolicy} required</p></div><span className={`rounded-full px-3 py-1 text-xs font-semibold ${requiredConfigured === requiredByPolicy ? "bg-emerald-100 text-emerald-900" : requiredConfigured > requiredByPolicy ? "bg-amber-100 text-amber-950" : "bg-rose-100 text-rose-900"}`}>{checkpointState}</span></div>
      <label className="block text-sm font-medium">Recording<select value={selectedRecordingId} onChange={(event) => setSelectedRecordingId(event.target.value)} className="mt-1 block w-full rounded-lg border border-slate-300 px-3 py-2">{recordings.map((recording) => <option key={recording.id} value={recording.id}>{recording.title}</option>)}</select></label>
      {selectedCheckpoints.length ? <ol className="space-y-3">{selectedCheckpoints.map((checkpoint) => {
        const question = checkpoint.recording_checkpoint_questions.filter((item) => item.is_active !== false).sort((a, b) => a.id.localeCompare(b.id))[0];
        const response = question?.response_format === "long_text" ? "Long text" : question?.response_format === "short_text" ? "Short text" : "Configured response";
        const guidance = question?.min_words || question?.max_words ? `${question.min_words ?? 0}–${question.max_words ?? "unlimited"} words` : question?.min_characters || question?.max_characters ? `${question.min_characters ?? 0}–${question.max_characters ?? "unlimited"} characters` : "No answer-length guidance";
        return <li key={checkpoint.id} className="rounded-lg border border-slate-200 bg-slate-50 p-4"><div className="flex flex-wrap items-center justify-between gap-3"><div className="flex flex-wrap items-center gap-2"><strong>Checkpoint {checkpoint.checkpoint_order} · {checkpoint.title}</strong><span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${checkpoint.is_required ? "bg-blue-100 text-blue-900" : "bg-slate-200 text-slate-700"}`}>{checkpoint.is_required ? "Required" : "Optional"}</span></div><div className="flex gap-3"><button type="button" disabled={busy} onClick={() => setEditingCheckpointId(editingCheckpointId === checkpoint.id ? null : checkpoint.id)} className="text-sm font-semibold text-amber-800">Edit</button><button type="button" disabled={busy} onClick={() => void removeCheckpoint(checkpoint.id)} className="text-sm font-semibold text-rose-700">Remove</button></div></div><p className="mt-3 text-xs font-semibold uppercase tracking-wide text-slate-500">Question</p><p className="mt-1 text-sm leading-6 text-slate-800">{question?.prompt ?? "No active question configured."}</p><p className="mt-3 text-sm text-slate-600"><strong>Response:</strong> {response} · {guidance}</p>{!isZoomManual ? <p className="mt-1 text-xs text-slate-500">Position: {checkpoint.position_seconds !== null ? formatRecordingTime(checkpoint.position_seconds) : checkpoint.position_percentage !== null ? `${checkpoint.position_percentage}%` : "Not configured"}</p> : null}{editingCheckpointId === checkpoint.id && question ? <form onSubmit={(event) => void editCheckpoint(event, checkpoint.id)} className="mt-4 grid gap-3 border-t border-slate-200 pt-4 md:grid-cols-2"><label className="text-sm font-medium">Title<input name="title" required defaultValue={checkpoint.title} className="mt-1 block w-full rounded-lg border border-slate-300 px-3 py-2" /></label><label className="text-sm font-medium">Checkpoint order<input name="checkpoint_order" required type="number" min="1" defaultValue={checkpoint.checkpoint_order} className="mt-1 block w-full rounded-lg border border-slate-300 px-3 py-2" /></label><label className="text-sm font-medium md:col-span-2">Question<textarea name="question" required rows={3} defaultValue={question.prompt} className="mt-1 block w-full rounded-lg border border-slate-300 p-3" /></label><label className="text-sm font-medium">Response size<select name="response_format" defaultValue={question.response_format ?? "long_text"} className="mt-1 block w-full rounded-lg border border-slate-300 px-3 py-2"><option value="short_text">Short text</option><option value="long_text">Long text</option></select></label><div className="grid grid-cols-2 gap-2"><label className="text-sm font-medium">Minimum words<input name="min_words" type="number" min="1" max="1000" defaultValue={question.min_words ?? ""} className="mt-1 block w-full rounded-lg border border-slate-300 px-3 py-2" /></label><label className="text-sm font-medium">Maximum words<input name="max_words" type="number" min="1" max="1000" defaultValue={question.max_words ?? ""} className="mt-1 block w-full rounded-lg border border-slate-300 px-3 py-2" /></label></div><label className="flex items-center gap-2 text-sm"><input name="is_required" type="checkbox" defaultChecked={checkpoint.is_required} />Required checkpoint</label><div className="flex gap-3 md:col-span-2"><button disabled={busy} className="rounded-lg bg-[#0b315c] px-4 py-2 font-semibold text-white">Save checkpoint</button><button type="button" onClick={() => setEditingCheckpointId(null)} className="rounded-lg border border-slate-300 px-4 py-2 font-semibold">Cancel</button></div></form> : null}</li>;
      })}</ol> : <p className="rounded-lg bg-slate-50 p-4 text-sm text-slate-600">No checkpoints have been configured for this recording.</p>}
    </section> : null}
    {recordings.length ? <form onSubmit={(event) => {
      event.preventDefault();
      const form = new FormData(event.currentTarget);
      const recordingId = String(form.get("recording_id"));
      const time = parseRecordingTime(form.get("position_time"));
      if (!time.ok) return setMessage(time.message);
      const percentageValue = String(form.get("position_percentage") ?? "").trim();
      const zoomManual = recordings.find((recording) => recording.id === recordingId)?.provider.toLowerCase() === "zoom";
      if (!zoomManual && time.seconds === null && !percentageValue) return setMessage("Specify either Time in recording or Position percentage.");
      if (!zoomManual && time.seconds !== null && percentageValue) return setMessage("Specify either Time in recording or Position percentage, not both.");
      const duration = recordings.find((recording) => recording.id === recordingId)?.durationSeconds ?? null;
      if (time.seconds !== null && duration !== null && time.seconds > duration) return setMessage("Time in recording cannot be later than the recording duration.");
      const title = String(form.get("title") ?? "").trim().replace(/\s+/gu, " ").toLocaleLowerCase();
      const question = String(form.get("question") ?? "").trim().replace(/\s+/gu, " ").toLocaleLowerCase();
      const duplicate = zoomManual && selectedCheckpoints.some((checkpoint) => checkpoint.title.trim().replace(/\s+/gu, " ").toLocaleLowerCase() === title && checkpoint.recording_checkpoint_questions.some((item) => item.is_active !== false && item.prompt.trim().replace(/\s+/gu, " ").toLocaleLowerCase() === question));
      if (duplicate) return setMessage("This checkpoint already exists for this recording.");
      setBusy(true); setMessage("");
      void fetch(`/api/admin/recordings/checkpoints/${recordingId}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ title: form.get("title"), question: zoomManual ? form.get("question") : null, response_format: zoomManual ? form.get("response_format") : null, min_words: zoomManual ? form.get("min_words") : null, max_words: zoomManual ? form.get("max_words") : null, position_seconds: zoomManual ? null : time.seconds, position_percentage: zoomManual ? null : percentageValue || null, checkpoint_order: form.get("checkpoint_order"), is_required: form.get("is_required") === "on" }) }).then(async (response) => { const data = await response.json(); if (!response.ok) { setBusy(false); setMessage(data.message || "Checkpoint could not be created."); return; } window.location.assign(`/admin/sessions/${sessionId}?checkpoint=created#recorded-learning`); }).catch(() => { setBusy(false); setMessage("Checkpoint could not be created."); });
    }} key={selectedRecordingId} className="grid gap-3 rounded-xl border border-slate-200 p-4 md:grid-cols-2">
      <h3 className="font-semibold md:col-span-2">Add recording checkpoint</h3>
      <label className="text-sm font-medium">Recording<select name="recording_id" value={selectedRecordingId} onChange={(event) => setSelectedRecordingId(event.target.value)} className="mt-1 block w-full rounded-lg border border-slate-300 px-3 py-2">{recordings.map((recording) => <option key={recording.id} value={recording.id}>{recording.title}{recording.durationSeconds === null ? "" : ` · ${formatRecordingTime(recording.durationSeconds)}`}</option>)}</select></label>
      <input name="title" required placeholder="Checkpoint title" className="rounded-lg border border-slate-300 px-3 py-2" />
      {isZoomManual ? <><p className="rounded-lg border border-blue-200 bg-blue-50 p-3 text-sm leading-6 text-blue-950 md:col-span-2">Use questions that require both understanding and evidence of engagement with this specific class. Prefer facilitator examples, explanations, Scripture applications, demonstrations, or instructions over generic knowledge questions.</p><label className="text-sm font-medium md:col-span-2">Question<textarea name="question" required rows={3} placeholder="Ask about the teaching content without revealing where the answer occurs." className="mt-1 block w-full rounded-lg border border-slate-300 p-3" /></label><label className="text-sm font-medium">Response size<select name="response_format" defaultValue="long_text" className="mt-1 block w-full rounded-lg border border-slate-300 px-3 py-2"><option value="short_text">Short text</option><option value="long_text">Long text</option></select></label><div className="grid grid-cols-2 gap-2"><label className="text-sm font-medium">Minimum words<input name="min_words" type="number" min="1" max="1000" defaultValue="80" className="mt-1 block w-full rounded-lg border border-slate-300 px-3 py-2" /></label><label className="text-sm font-medium">Maximum words<input name="max_words" type="number" min="1" max="1000" defaultValue="200" className="mt-1 block w-full rounded-lg border border-slate-300 px-3 py-2" /></label></div><p className="rounded-lg border border-blue-200 bg-blue-50 p-3 text-xs leading-5 text-blue-950 md:col-span-2">Zoom manual verification uses checkpoint order, not playback positions. No timestamp, percentage, or answer-location hint will be stored or shown to students.</p></> : <><label className="text-sm font-medium">Time in recording <span className="font-normal text-slate-500">(HH:MM:SS or MM:SS)</span><input name="position_time" inputMode="numeric" placeholder="45:00" className="mt-1 block w-full rounded-lg border border-slate-300 px-3 py-2" /></label><label className="text-sm font-medium">Position percentage<input name="position_percentage" type="number" min="0" max="100" step="0.01" placeholder="For example 50" className="mt-1 block w-full rounded-lg border border-slate-300 px-3 py-2" /></label><p className="text-xs leading-5 text-slate-600 md:col-span-2">Specify either Time in recording or Position percentage. You do not need both.</p></>}
      <input name="checkpoint_order" aria-label="Checkpoint order" type="number" min="1" defaultValue={Math.max(0, ...selectedCheckpoints.map((checkpoint) => checkpoint.checkpoint_order)) + 1} className="rounded-lg border border-slate-300 px-3 py-2" />
      <label className="flex items-center gap-2 text-sm"><input name="is_required" type="checkbox" defaultChecked />Required checkpoint</label>
      <button disabled={busy} className="rounded-lg bg-[#0b315c] px-4 py-2 font-semibold text-white md:col-span-2">Create checkpoint</button>
    </form> : null}
  </div>;
}
