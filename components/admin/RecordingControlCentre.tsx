"use client";

import Link from "next/link";
import { useState } from "react";

import { StatusBadge } from "@/components/admin/LmsUi";
import { humanize, recordingProviders, recordingStatuses, sessionAccessLevels } from "@/lib/lms/adminConstants";
import { recordingPurposeLabels, type RecordingPurposeCode } from "@/lib/lms/recording";
import { formatRecordingTime, parseRecordingTime } from "@/lib/lms/recordingTime";

type SessionOption = { id: string; title: string; scheduledStartAt: string | null; courseCode: string; courseTitle: string; cohortCode: string };
type RecordingRow = Record<string, unknown> & { purposes?: string[]; assignment_count?: number; in_progress_count?: number; integrity_review_count?: number };

function text(value: unknown) { return typeof value === "string" ? value : ""; }
function localDateTime(value: unknown) { if (typeof value !== "string" || !value) return ""; const date = new Date(value); const offset = date.getTimezoneOffset(); return new Date(date.getTime() - offset * 60000).toISOString().slice(0, 16); }
function bodyFrom(form: HTMLFormElement) {
  const data = new FormData(form);
  const duration = parseRecordingTime(data.get("duration_time"));
  if (!duration.ok) return duration;
  const body: Record<string, unknown> = Object.fromEntries(data);
  delete body.duration_time;
  body.duration_seconds = duration.seconds;
  body.quality_checked = data.get("quality_checked") === "on";
  return { ok: true as const, body };
}

export function RecordingControlCentre({ sessions, recordings, initialSessionId }: { sessions: SessionOption[]; recordings: RecordingRow[]; initialSessionId?: string }) {
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const sessionById = new Map(sessions.map((session) => [session.id, session]));

  async function send(endpoint: string, method: "POST" | "PATCH", body: Record<string, unknown>) {
    setBusy(true); setMessage("");
    const response = await fetch(endpoint, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const payload = await response.json(); setBusy(false);
    if (!response.ok) return setMessage(payload.message || "Recording metadata could not be saved.");
    setMessage("Recording metadata saved. Eligible recorded-route and make-up assignments were initialized idempotently when the quality gate passed.");
    window.location.reload();
  }

  return <div className="space-y-6">
    {message ? <p role="status" className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-950">{message}</p> : null}
    <details className="rounded-2xl border border-slate-200 bg-white p-5" open={recordings.length === 0 || Boolean(initialSessionId)}>
      <summary className="cursor-pointer font-semibold text-slate-900">Create recording metadata for a class session</summary>
      <form onSubmit={(event) => { event.preventDefault(); const prepared = bodyFrom(event.currentTarget); if (!prepared.ok) return setMessage(prepared.message); const sessionId = String(prepared.body.class_session_id); delete prepared.body.class_session_id; void send(`/api/admin/sessions/${sessionId}/recordings`, "POST", prepared.body); }} className="mt-5 grid gap-4 md:grid-cols-2">
        <label className="text-sm font-medium md:col-span-2">Class session<select name="class_session_id" required defaultValue={initialSessionId || ""} className="field"><option value="">Choose session</option>{sessions.map((session) => <option key={session.id} value={session.id}>{session.courseCode} · {session.cohortCode} · {session.title}</option>)}</select></label>
        <RecordingFields />
        <button disabled={busy} className="rounded-xl bg-[#0b315c] px-5 py-3 text-sm font-semibold text-white disabled:bg-slate-500">Create draft recording</button>
      </form>
    </details>
    <div className="grid gap-4">
      {recordings.map((recording) => { const session = sessionById.get(text(recording.class_session_id)); const purposes = recording.purposes ?? []; return <details key={text(recording.id)} open={Boolean(initialSessionId && initialSessionId === recording.class_session_id)} className="rounded-2xl border border-slate-200 bg-white p-5">
        <summary className="cursor-pointer list-none"><div className="flex flex-wrap items-start justify-between gap-4"><div><p className="text-xs font-semibold uppercase tracking-wide text-amber-800">{session?.courseCode} · {session?.cohortCode}</p><h3 className="mt-1 font-semibold text-slate-900">{text(recording.title)}</h3><p className="mt-1 text-sm text-slate-600">{session?.title}</p></div><div className="flex flex-wrap gap-2"><StatusBadge value={text(recording.recording_status)} /><StatusBadge value={recording.quality_checked ? "quality_checked" : "quality_pending"} /></div></div><p className="mt-3 text-xs text-slate-600">Purposes: {purposes.length ? purposes.map((code) => recordingPurposeLabels[code as RecordingPurposeCode] ?? code).join(" · ") : "General replay only / no evidence assignment"} · {Number(recording.assignment_count ?? 0)} assignments · {Number(recording.in_progress_count ?? 0)} open · {Number(recording.integrity_review_count ?? 0)} integrity review</p></summary>
        <form onSubmit={(event) => { event.preventDefault(); const prepared = bodyFrom(event.currentTarget); if (!prepared.ok) return setMessage(prepared.message); void send(`/api/admin/sessions/${text(recording.class_session_id)}/recordings/${text(recording.id)}`, "PATCH", prepared.body); }} className="mt-5 grid gap-4 border-t border-slate-200 pt-5 md:grid-cols-2">
          <RecordingFields recording={recording} />
          <div className="flex flex-wrap gap-3 md:col-span-2"><button disabled={busy} className="rounded-xl bg-[#0b315c] px-5 py-3 text-sm font-semibold text-white disabled:bg-slate-500">Save recording controls</button>{session ? <Link href={`/admin/sessions/${session.id}`} className="rounded-xl border border-slate-300 px-5 py-3 text-sm font-semibold text-slate-800">Open session</Link> : null}</div>
        </form>
      </details>; })}
    </div>
  </div>;
}

function RecordingFields({ recording = {} }: { recording?: RecordingRow }) {
  return <>
    <Field name="title" label="Title" defaultValue={text(recording.title)} required />
    <label className="text-sm font-medium">Provider / source<select name="provider" defaultValue={text(recording.provider) || "other"} className="field">{recordingProviders.map((item) => <option key={item} value={item}>{humanize(item)}</option>)}</select></label>
    <label className="text-sm font-medium md:col-span-2">Description<textarea name="description" defaultValue={text(recording.description)} rows={3} className="field" /></label>
    <Field name="external_url" label="Secure external URL" type="url" defaultValue={text(recording.external_url)} />
    <Field name="embed_url" label="Secure embed URL" type="url" defaultValue={text(recording.embed_url)} />
    <Field name="external_recording_id" label="External recording ID" defaultValue={text(recording.external_recording_id)} />
    <Field name="duration_time" label="Recording duration (HH:MM:SS or MM:SS)" placeholder="01:35:00" inputMode="numeric" defaultValue={formatRecordingTime(recording.duration_seconds)} />
    <Field name="recording_date" label="Recording date" type="date" defaultValue={text(recording.recording_date)} />
    <label className="text-sm font-medium">Recording status<select name="recording_status" defaultValue={text(recording.recording_status) || "draft"} className="field">{recordingStatuses.map((item) => <option key={item} value={item}>{humanize(item)}</option>)}</select></label>
    <label className="text-sm font-medium">Access level<select name="access_level" defaultValue={text(recording.access_level) || "enrolled_students"} className="field">{sessionAccessLevels.map((item) => <option key={item} value={item}>{humanize(item)}</option>)}</select></label>
    <Field name="available_from" label="Available from" type="datetime-local" defaultValue={localDateTime(recording.available_from)} />
    <Field name="available_until" label="Available until" type="datetime-local" defaultValue={localDateTime(recording.available_until)} />
    <label className="text-sm font-medium md:col-span-2">Facilitator source notes<textarea name="facilitator_notes" defaultValue={text(recording.facilitator_notes)} rows={2} className="field" /></label>
    <label className="text-sm font-medium md:col-span-2">Private administrator notes<textarea name="admin_notes" defaultValue={text(recording.admin_notes)} rows={2} className="field" /></label>
    <label className="flex items-center gap-3 text-sm font-medium md:col-span-2"><input name="quality_checked" type="checkbox" defaultChecked={Boolean(recording.quality_checked)} className="size-4 accent-[#0b315c]" /> Quality checked for evidence-bearing use</label>
  </>;
}

function Field({ name, label, type = "text", defaultValue = "", required = false, placeholder, inputMode }: { name: string; label: string; type?: string; defaultValue?: string; required?: boolean; placeholder?: string; inputMode?: React.HTMLAttributes<HTMLInputElement>["inputMode"] }) {
  return <label className="text-sm font-medium">{label}<input name={name} type={type} defaultValue={defaultValue} required={required} placeholder={placeholder} inputMode={inputMode} className="field" /></label>;
}
