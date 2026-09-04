"use client";

import Link from "next/link";
import { useState } from "react";

import { AdminPanel, StatusBadge, formatDate } from "@/components/admin/LmsUi";
import { humanize } from "@/lib/lms/adminConstants";

type Row = Record<string, unknown>;

export function ClassSummaryWorkflowPanel({ sessionId, sessionTitle, summary, publishedSummary, versions, events }: {
  sessionId: string;
  sessionTitle: string;
  summary: Row | null;
  publishedSummary: Row | null;
  versions: unknown[];
  events: unknown[];
}) {
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const status = text(summary?.summary_status);
  const editable = !summary || status === "draft" || status === "changes_requested";
  const hasSeparatePublished = Boolean(publishedSummary && publishedSummary.id !== summary?.id);

  async function request(path: string, body: Row) {
    setBusy(true); setMessage("");
    const response = await fetch(path, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const payload = await response.json();
    setBusy(false);
    if (!response.ok) return setMessage(payload.message || "The class-summary action could not be completed.");
    setMessage("Class-summary workflow updated.");
    window.location.reload();
  }

  async function save(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await request(`/api/admin/sessions/${sessionId}/summary`, Object.fromEntries(new FormData(event.currentTarget)));
  }

  async function transition(action: string, note = "") {
    if (!summary) return;
    if (action === "submit" && !window.confirm("Submit this administrator-authored draft into the review workflow? It will become read-only until an administrator decision is recorded.")) return;
    if (action === "publish" && !window.confirm("Publish this approved summary to enrolled students? Any current publication will be preserved as superseded.")) return;
    if (action === "archive" && !window.confirm("Archive this published summary? Students will no longer see it as current content.")) return;
    await request(`/api/admin/class-summaries/${String(summary.id)}/transition`, { action, note, expected_version: summary.lock_version });
  }

  return <AdminPanel title="E. Class summary" description="Faculty submit preserved revisions for administrator review. Students can read only the published revision.">
    <div id="class-summary" className="scroll-mt-24">
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-3"><StatusBadge value={status || "No Summary"} />{summary ? <span className="text-sm text-slate-600">Content version {String(summary.version_number)} · Workflow lock {String(summary.lock_version)} · Updated {formatDate(text(summary.updated_at), true)}</span> : null}</div>
        <Link href="/admin/class-summaries" className="text-sm font-semibold text-amber-800">Open review queue</Link>
      </div>
      {hasSeparatePublished ? <p className="mb-5 rounded-xl border border-blue-200 bg-blue-50 p-4 text-sm text-blue-950">Students continue to see the previously published revision while this amendment moves through review.</p> : null}
      {status === "changes_requested" && text(summary?.review_note) ? <p className="mb-5 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-950"><strong>Changes requested:</strong> {text(summary?.review_note)}</p> : null}
      {message ? <p role="status" className="mb-5 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-950">{message}</p> : null}

      {editable ? <SummaryForm summary={summary} sessionTitle={sessionTitle} busy={busy} onSubmit={save} /> : <SummaryReadOnly summary={summary!} />}

      {status === "draft" || status === "changes_requested" ? <div className="mt-5 rounded-xl border border-blue-200 bg-blue-50 p-4"><p className="text-sm leading-6 text-blue-950">Next valid action: submit this non-empty revision for administrator review. Approval and publication remain separate decisions.</p><button disabled={busy} onClick={() => void transition("submit")} className="mt-3 rounded-xl bg-[#0b315c] px-5 py-2.5 text-sm font-semibold text-white disabled:opacity-60">Submit administrator draft for review</button></div> : null}
      {status === "submitted" ? <ReviewControls busy={busy} onAction={transition} /> : null}
      {status === "approved" ? <div className="mt-5"><button disabled={busy} onClick={() => void transition("publish")} className="rounded-xl bg-emerald-700 px-5 py-2.5 text-sm font-semibold text-white disabled:opacity-60">Publish approved revision</button></div> : null}
      {status === "published" ? <PublishedControls busy={busy} onAction={transition} /> : null}

      {versions.length ? <section className="mt-6 border-t border-slate-200 pt-5"><h3 className="font-semibold text-slate-950">Content version history</h3><ul className="mt-3 space-y-2 text-sm text-slate-600">{versions.map((raw) => { const item = row(raw); return <li key={String(item.id)}>Version {String(item.version_number)} preserved {formatDate(text(item.created_at), true)}{text(item.change_note) ? ` — ${text(item.change_note)}` : ""}</li>; })}</ul></section> : null}
      {events.length ? <section className="mt-6 border-t border-slate-200 pt-5"><h3 className="font-semibold text-slate-950">Review audit trail</h3><ol className="mt-3 space-y-3">{events.map((raw) => { const item = row(raw); return <li key={String(item.id)} className="text-sm text-slate-600"><strong className="text-slate-800">{humanize(text(item.event_type))}</strong> · {formatDate(text(item.created_at), true)} · {String(item.actor_identifier || "System")}{text(item.note) ? <span className="block">{text(item.note)}</span> : null}</li>; })}</ol></section> : null}
    </div>
  </AdminPanel>;
}

function SummaryForm({ summary, sessionTitle, busy, onSubmit }: { summary: Row | null; sessionTitle: string; busy: boolean; onSubmit: (event: React.FormEvent<HTMLFormElement>) => void }) {
  return <form onSubmit={onSubmit} className="grid gap-4 md:grid-cols-2">
    {summary ? <><input type="hidden" name="summary_id" value={String(summary.id)} /><input type="hidden" name="expected_version" value={String(summary.lock_version)} /></> : null}
    <Input name="title" label="Summary title" value={text(summary?.title) || sessionTitle} />
    <SummaryList name="learning_objectives" label="Learning objectives" value={summary?.learning_objectives} />
    <SummaryList name="key_teaching_points" label="Key teaching points" value={summary?.key_teaching_points} />
    <SummaryList name="key_scriptures_references" label="Key Scriptures / references" value={summary?.key_scriptures_references} />
    <SummaryList name="important_concepts" label="Important concepts" value={summary?.important_concepts} />
    <SummaryList name="practical_applications" label="Practical applications" value={summary?.practical_applications} />
    <SummaryList name="action_points" label="Assignments / action points" value={summary?.action_points} />
    <SummaryList name="recommended_resources" label="Recommended resources" value={summary?.recommended_resources} />
    <label className="text-sm font-medium text-slate-800 md:col-span-2">Additional notes<textarea name="additional_notes" defaultValue={text(summary?.additional_notes) || ""} rows={4} className="mt-1 block w-full rounded-xl border border-slate-300 bg-white p-3 text-slate-900" /></label>
    <label className="text-sm font-medium text-slate-800 md:col-span-2">Revision note<textarea name="change_note" rows={2} className="mt-1 block w-full rounded-xl border border-slate-300 bg-white p-3 text-slate-900" /></label>
    <button disabled={busy} className="rounded-xl bg-[#071327] px-5 py-3 text-sm font-semibold text-white disabled:opacity-60 md:col-span-2">{busy ? "Saving…" : summary ? "Save reviewable revision" : "Create summary draft"}</button>
  </form>;
}

function SummaryReadOnly({ summary }: { summary: Row }) {
  return <div><h3 className="mb-5 text-xl font-semibold text-slate-950">{text(summary.title) || "Untitled summary"}</h3><div className="grid gap-5 md:grid-cols-2"><ReadList label="Learning objectives" value={summary.learning_objectives} /><ReadList label="Key teaching points" value={summary.key_teaching_points} /><ReadList label="Key Scriptures / references" value={summary.key_scriptures_references} /><ReadList label="Important concepts" value={summary.important_concepts} /><ReadList label="Practical applications" value={summary.practical_applications} /><ReadList label="Assignments / action points" value={summary.action_points} /><ReadList label="Recommended resources" value={summary.recommended_resources} />{text(summary.additional_notes) ? <div className="md:col-span-2"><h3 className="text-sm font-semibold text-slate-800">Additional notes</h3><p className="mt-2 whitespace-pre-wrap text-sm text-slate-700">{text(summary.additional_notes)}</p></div> : null}</div></div>;
}

function ReviewControls({ busy, onAction }: { busy: boolean; onAction: (action: string, note?: string) => Promise<void> }) {
  const [note, setNote] = useState("");
  return <div className="mt-5 rounded-xl border border-slate-200 bg-slate-50 p-4"><label className="text-sm font-medium text-slate-800">Review note<textarea value={note} onChange={(event) => setNote(event.target.value)} rows={3} className="mt-1 block w-full rounded-xl border border-slate-300 bg-white p-3 text-slate-900" /></label><div className="mt-3 flex flex-wrap gap-3"><button disabled={busy || !note.trim()} onClick={() => void onAction("request_changes", note)} className="rounded-xl border border-amber-400 bg-white px-4 py-2 text-sm font-semibold text-amber-900 disabled:opacity-60">Request changes</button><button disabled={busy} onClick={() => void onAction("approve", note)} className="rounded-xl bg-emerald-700 px-4 py-2 text-sm font-semibold text-white disabled:opacity-60">Approve revision</button></div></div>;
}

function PublishedControls({ busy, onAction }: { busy: boolean; onAction: (action: string, note?: string) => Promise<void> }) {
  const [reason, setReason] = useState("");
  return <div className="mt-5 rounded-xl border border-slate-200 bg-slate-50 p-4"><label className="text-sm font-medium text-slate-800">Amendment or archive reason<textarea value={reason} onChange={(event) => setReason(event.target.value)} rows={2} className="mt-1 block w-full rounded-xl border border-slate-300 bg-white p-3 text-slate-900" /></label><div className="mt-3 flex flex-wrap gap-3"><button disabled={busy || !reason.trim()} onClick={() => void onAction("create_amendment", reason)} className="rounded-xl bg-[#071327] px-4 py-2 text-sm font-semibold text-white disabled:opacity-60">Create reviewable amendment</button><button disabled={busy || !reason.trim()} onClick={() => void onAction("archive", reason)} className="rounded-xl border border-rose-300 bg-white px-4 py-2 text-sm font-semibold text-rose-800 disabled:opacity-60">Archive publication</button></div></div>;
}

function Input({ name, label, value }: { name: string; label: string; value: string }) { return <label className="text-sm font-medium text-slate-800">{label}<input name={name} defaultValue={value} className="mt-1 block w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-slate-900" /></label>; }
function SummaryList({ name, label, value }: { name: string; label: string; value: unknown }) { return <label className="text-sm font-medium text-slate-800">{label} <span className="font-normal text-slate-500">(one per line)</span><textarea name={name} defaultValue={list(value).join("\n")} rows={5} className="mt-1 block w-full rounded-xl border border-slate-300 bg-white p-3 text-slate-900" /></label>; }
function ReadList({ label, value }: { label: string; value: unknown }) { const values = list(value); return <div><h3 className="text-sm font-semibold text-slate-800">{label}</h3>{values.length ? <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-slate-700">{values.map((item) => <li key={item}>{item}</li>)}</ul> : <p className="mt-2 text-sm text-slate-500">Not recorded.</p>}</div>; }
function list(value: unknown) { return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : []; }
function row(value: unknown): Row { return value && typeof value === "object" && !Array.isArray(value) ? value as Row : {}; }
function text(value: unknown) { return typeof value === "string" ? value : null; }
