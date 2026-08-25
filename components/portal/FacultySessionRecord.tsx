"use client";

import Link from "next/link";
import { useState } from "react";

import { FacilitatorResourceManager } from "@/components/portal/FacilitatorResourceManager";
import { recordingProviders } from "@/lib/lms/adminConstants";
import type { fetchFacilitatorSession } from "@/lib/lms/facilitatorSessions";
import { institutionalValueLabel } from "@/lib/lms/presentation";
import { formatRecordingTime, parseRecordingTime } from "@/lib/lms/recordingTime";

type RecordData = Awaited<ReturnType<typeof fetchFacilitatorSession>>;
type Row = Record<string, unknown>;

export function FacultySessionRecord({ initialRecord }: { initialRecord: RecordData }) {
  const [record] = useState(initialRecord);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const session = object(record.session);
  const offering = relation(session.cohort_courses);
  const course = relation(offering.courses);
  const cohort = relation(offering.cohorts);
  const summary = record.summary ? object(record.summary) : null;
  const summaryStatus = text(summary?.summary_status);
  const canEditSummary = !summary || summaryStatus === "draft" || summaryStatus === "changes_requested";

  async function send(endpoint: string, method: "POST" | "PATCH", body: Row, success: string) {
    setBusy(true); setMessage("");
    const response = await fetch(endpoint, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const payload = await response.json(); setBusy(false);
    if (!response.ok) return setMessage(payload.message || "The requested faculty update could not be saved.");
    setMessage(success); window.location.reload();
  }

  async function saveSummary(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await send(`/api/facilitator/sessions/${text(session.id)}/summary`, summary ? "PATCH" : "POST", Object.fromEntries(new FormData(event.currentTarget)), "Summary draft saved with its previous content version preserved.");
  }

  async function submitSummary() {
    if (!summary) return;
    if (!window.confirm("Submit this summary revision for administrator review? It will become read-only until a decision is made.")) return;
    await send(`/api/facilitator/sessions/${text(session.id)}/summary/submit`, "POST", { summary_id: summary.id, expected_version: summary.lock_version }, "Summary submitted for administrator review.");
  }

  async function saveLiveAccess(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await send(`/api/facilitator/sessions/${text(session.id)}`, "PATCH", Object.fromEntries(new FormData(event.currentTarget)), "Live class access saved for enrolled students.");
  }

  async function saveRecording(event: React.FormEvent<HTMLFormElement>, recordingId?: string) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const duration = parseRecordingTime(form.get("duration_time"));
    if (!duration.ok) return setMessage(duration.message);
    const body: Row = Object.fromEntries(form);
    delete body.duration_time;
    body.duration_seconds = duration.seconds;
    const endpoint = recordingId ? `/api/facilitator/sessions/${text(session.id)}/recordings/${recordingId}` : `/api/facilitator/sessions/${text(session.id)}/recordings`;
    await send(endpoint, recordingId ? "PATCH" : "POST", body, "Recording source submitted for administrator review. Publication and quality approval remain with administration.");
  }

  return <div className="space-y-6">
    <div className="flex flex-wrap gap-4"><Link href="/facilitator/sessions" className="text-sm font-semibold text-[var(--realm-gold-soft)]">Back to assigned sessions</Link><Link href={`/facilitator/sessions/${text(session.id)}/attendance`} className="text-sm font-semibold text-[var(--realm-gold-soft)]">Open attendance roster</Link></div>
    {message ? <p role="status" className="rounded-xl border border-amber-300/25 bg-amber-300/10 p-4 text-sm text-amber-100">{message}</p> : null}
    <section className="rounded-2xl border border-white/10 bg-white/[0.055] p-6"><p className="text-xs font-semibold uppercase tracking-wider text-[var(--realm-gold-soft)]">{text(course.code)} · {text(cohort.code)}</p><h2 className="mt-3 text-2xl font-semibold">{text(course.title)}</h2><dl className="mt-6 grid gap-4 sm:grid-cols-2"><Item label="Schedule" value={text(session.scheduled_start_at) ? new Date(text(session.scheduled_start_at)!).toLocaleString("en-NG", { dateStyle: "long", timeStyle: "short" }) : "Not scheduled"} /><Item label="Timezone" value={text(session.timezone) || "Africa/Lagos"} /><Item label="Delivery" value={humanize(text(session.delivery_mode))} /><Item label="Status" value={humanize(text(session.session_status))} /><Item label="Live class">{text(session.live_join_url) ? <a href={text(session.live_join_url)!} target="_blank" rel="noreferrer" className="text-[var(--realm-gold-soft)]">Open class link</a> : "Not set"}</Item><Item label="Location" value={text(session.physical_location) || "Not set"} /></dl></section>
    <section className="rounded-2xl border border-white/10 bg-white/[0.055] p-6"><h2 className="text-xl font-semibold">Live class access</h2><p className="mt-2 text-sm text-[var(--realm-muted)]">Only students enrolled in this course can use the protected Join Live Class route. The raw link is never published publicly.</p><form onSubmit={saveLiveAccess} className="mt-5 grid gap-4"><FacultyInput name="live_join_url" label="Secure class URL" type="url" value={text(session.live_join_url)} /><FacultyTextArea name="live_access_note" label="Access note (optional)" value={text(session.live_access_note)} rows={2} /><button disabled={busy} className="faculty-primary-control rounded-full bg-[var(--realm-gold)] px-5 py-3 text-sm font-semibold text-[#071327] disabled:opacity-70">Save live access</button></form></section>

    <section className="rounded-2xl border border-white/10 bg-white/[0.055] p-6"><div className="flex flex-wrap items-start justify-between gap-3"><div><h2 className="text-xl font-semibold">Class summary</h2><p className="mt-2 text-sm text-[var(--realm-muted)]">Create a preserved revision and submit it for review. Administrators approve and publish.</p></div><span className="rounded-full border border-white/15 px-3 py-1 text-xs font-semibold">{humanize(summaryStatus || "not_started")}</span></div>
      {summaryStatus === "changes_requested" && text(summary?.review_note) ? <p className="mt-5 rounded-xl border border-amber-300/30 bg-amber-100 p-4 text-sm text-amber-950"><strong>Administrator note:</strong> {text(summary?.review_note)}</p> : null}
      {canEditSummary ? <form onSubmit={saveSummary} className="mt-6 grid gap-4 md:grid-cols-2">{summary ? <><input type="hidden" name="summary_id" value={String(summary.id)} /><input type="hidden" name="expected_version" value={String(summary.lock_version)} /></> : null}<FacultyInput name="title" label="Summary title" value={summary ? text(summary.title) : text(session.title)} /><SummaryList name="learning_objectives" label="Learning objectives" value={summary?.learning_objectives} /><SummaryList name="key_teaching_points" label="Key teaching points" value={summary?.key_teaching_points} /><SummaryList name="key_scriptures_references" label="Key Scriptures / references" value={summary?.key_scriptures_references} /><SummaryList name="important_concepts" label="Important concepts" value={summary?.important_concepts} /><SummaryList name="practical_applications" label="Practical applications" value={summary?.practical_applications} /><SummaryList name="action_points" label="Assignments / action points" value={summary?.action_points} /><SummaryList name="recommended_resources" label="Recommended resources" value={summary?.recommended_resources} /><FacultyTextArea name="additional_notes" label="Additional notes" value={text(summary?.additional_notes)} rows={4} wide /><FacultyTextArea name="change_note" label="Revision note" value="" rows={2} wide /><button disabled={busy} className="faculty-primary-control rounded-full bg-[var(--realm-gold)] px-5 py-3 text-sm font-semibold text-[#071327] disabled:opacity-70 md:col-span-2">{busy ? "Saving…" : summary ? "Save draft revision" : "Create summary draft"}</button></form> : <SummaryReadOnly summary={summary!} />}
      {summary && (summaryStatus === "draft" || summaryStatus === "changes_requested") ? <button disabled={busy} onClick={() => void submitSummary()} className="mt-4 rounded-full border border-[var(--realm-gold)] px-5 py-3 text-sm font-semibold text-[var(--realm-gold-soft)] disabled:opacity-70">Submit current revision for review</button> : null}
      {record.summaryReviewEvents.length ? <details className="mt-5 border-t border-white/10 pt-4"><summary className="cursor-pointer text-sm font-semibold text-[var(--realm-gold-soft)]">Review history</summary><ol className="mt-3 space-y-2 text-sm text-[var(--realm-muted)]">{record.summaryReviewEvents.map((raw) => { const event = object(raw); return <li key={String(event.id)}>{humanize(text(event.event_type))} · {text(event.note) || "No note"}</li>; })}</ol></details> : null}
    </section>

    <div className="grid gap-6 lg:grid-cols-2"><FacilitatorResourceManager sessionId={text(session.id)!} resources={record.resources.map(object)} /><section className="rounded-2xl border border-white/10 bg-white/[0.055] p-6"><h2 className="text-xl font-semibold">Recording source</h2><p className="mt-2 text-sm text-[var(--realm-muted)]">Submit a controlled third-party URL for this assigned session. Administration retains quality approval, availability, and official recorded-attendance verification.</p><div className="mt-5 space-y-4">{record.recordings.map((raw) => { const recording = object(raw); const editable = ["draft", "processing"].includes(text(recording.recording_status) || "") && !recording.quality_checked; return <article key={String(recording.id)} className="rounded-xl border border-white/10 p-4"><div className="flex flex-wrap justify-between gap-3"><div><strong>{text(recording.title)}</strong><p className="mt-1 text-sm text-[var(--realm-muted)]">{humanize(text(recording.recording_status))} · {humanize(text(recording.provider))}</p></div><span className="rounded-full border border-white/15 px-3 py-1 text-xs font-semibold">{recording.recording_status === "available" ? "Available to students" : recording.quality_checked ? "Admin quality checked" : "Awaiting admin review"}</span></div>{editable ? <RecordingSourceForm recording={recording} busy={busy} onSubmit={(event) => saveRecording(event, String(recording.id))} /> : <p className="mt-3 text-xs text-[var(--realm-slate)]">This source is read-only after administrator review or availability control.</p>}</article>; })}</div><details className="mt-5 rounded-xl border border-white/10 p-4" open={!record.recordings.length}><summary className="cursor-pointer font-semibold text-[var(--realm-gold-soft)]">Add recording source for review</summary><RecordingSourceForm busy={busy} onSubmit={(event) => saveRecording(event)} /></details><p className="mt-4 text-xs text-[var(--realm-slate)]">Submitting recording metadata never verifies attendance or make-up completion.</p></section></div>
  </div>;
}

function RecordingSourceForm({ recording = {}, busy, onSubmit }: { recording?: Row; busy: boolean; onSubmit: (event: React.FormEvent<HTMLFormElement>) => void }) {
  return <form onSubmit={onSubmit} className="mt-4 grid gap-3"><FacultyInput name="title" label="Recording title" value={text(recording.title)} required /><label className="text-sm font-semibold">Provider / source<select name="provider" defaultValue={text(recording.provider) || "other"} className="faculty-field mt-2 block w-full rounded-xl border px-3 py-2">{recordingProviders.map((provider) => <option key={provider} value={provider}>{humanize(provider)}</option>)}</select></label><FacultyTextArea name="description" label="Description" value={text(recording.description)} rows={2} /><FacultyInput name="external_url" label="Secure external URL" type="url" value={text(recording.external_url)} /><FacultyInput name="embed_url" label="Secure embed URL" type="url" value={text(recording.embed_url)} /><FacultyInput name="external_recording_id" label="External recording ID" value={text(recording.external_recording_id)} /><FacultyInput name="duration_time" label="Recording duration (HH:MM:SS or MM:SS)" value={formatRecordingTime(recording.duration_seconds)} placeholder="01:35:00" inputMode="numeric" /><FacultyInput name="recording_date" label="Recording date" type="date" value={text(recording.recording_date)} /><FacultyTextArea name="facilitator_notes" label="Notes for administrator review" value={text(recording.facilitator_notes)} rows={2} /><button disabled={busy} className="faculty-primary-control rounded-full bg-[var(--realm-gold)] px-5 py-3 text-sm font-semibold text-[#071327] disabled:opacity-70">{recording.id ? "Update unreviewed source" : "Submit source for review"}</button></form>;
}

function SummaryReadOnly({ summary }: { summary: Row }) { return <div className="mt-5 rounded-xl border border-white/10 p-4"><p className="font-semibold">{text(summary.title)} · Content version {String(summary.version_number)}</p><p className="mt-2 text-sm text-[var(--realm-muted)]">This revision is read-only while it is {humanize(text(summary.summary_status)).toLowerCase()}. Published content cannot be edited in place.</p></div>; }
function Item({ label, value, children }: { label: string; value?: string; children?: React.ReactNode }) { return <div><dt className="text-xs font-semibold uppercase tracking-wider text-[var(--realm-gold-soft)]">{label}</dt><dd className="mt-2">{children || value}</dd></div>; }
function FacultyInput({ name, label, value, type = "text", required = false, placeholder, inputMode }: { name: string; label: string; value: string | null; type?: string; required?: boolean; placeholder?: string; inputMode?: React.HTMLAttributes<HTMLInputElement>["inputMode"] }) { return <label className="text-sm font-semibold">{label}<input name={name} type={type} defaultValue={value || ""} required={required} placeholder={placeholder} inputMode={inputMode} className="faculty-field mt-2 block w-full rounded-xl border px-3 py-2" /></label>; }
function FacultyTextArea({ name, label, value, rows, wide = false }: { name: string; label: string; value: string | null; rows: number; wide?: boolean }) { return <label className={`text-sm font-semibold ${wide ? "md:col-span-2" : ""}`}>{label}<textarea name={name} defaultValue={value || ""} rows={rows} className="faculty-field mt-2 block w-full rounded-xl border p-3" /></label>; }
function SummaryList({ name, label, value }: { name: string; label: string; value: unknown }) { return <label className="text-sm font-semibold">{label} <span className="font-normal text-[var(--realm-slate)]">(one per line)</span><textarea name={name} defaultValue={lines(value)} rows={5} className="faculty-field mt-2 block w-full rounded-xl border p-3" /></label>; }
function object(value: unknown): Row { return value && typeof value === "object" && !Array.isArray(value) ? value as Row : {}; }
function relation(value: unknown) { return Array.isArray(value) ? object(value[0]) : object(value); }
function text(value: unknown) { return typeof value === "string" ? value : null; }
function lines(value: unknown) { return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string").join("\n") : ""; }
function humanize(value: string | null) { return institutionalValueLabel(value, "Not Set"); }
