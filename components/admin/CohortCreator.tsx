"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

import { cohortStatuses, humanize } from "@/lib/lms/adminConstants";

const field = "mt-1 block w-full rounded-xl border border-slate-300 bg-white px-3 py-2";

function lagosIsoTimestamp(value: FormDataEntryValue | null) {
  return typeof value === "string" && value ? new Date(`${value}:00+01:00`).toISOString() : null;
}

export function CohortCreator() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setMessage("");
    const form = new FormData(event.currentTarget);
    const body: Record<string, FormDataEntryValue | null> = Object.fromEntries(form);
    for (const name of ["orientationStartAt", "matriculationStartAt", "graduationStartAt"]) body[name] = lagosIsoTimestamp(form.get(name));
    const response = await fetch("/api/admin/cohorts", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const payload = await response.json(); setBusy(false);
    if (!response.ok) return setMessage(payload.message || "Cohort could not be created.");
    router.push(`/admin/cohorts/${payload.cohort.id}`);
  }

  if (!open) return <button type="button" onClick={() => setOpen(true)} className="mb-6 rounded-xl bg-[#071327] px-5 py-3 text-sm font-semibold text-white">Create Future Cohort</button>;
  return <section className="mb-6 rounded-2xl border border-amber-200 bg-amber-50 p-5">
    <div className="flex items-start justify-between gap-4"><div><h2 className="text-lg font-semibold text-[#071327]">Create Future Cohort</h2><p className="mt-1 text-sm text-slate-600">New cohorts begin with registration CLOSED and are not made public automatically. Calendar fields are reusable for any approved teaching duration.</p></div><button type="button" onClick={() => setOpen(false)} className="text-sm font-semibold">Cancel</button></div>
    <form onSubmit={submit} className="mt-5 grid gap-4 md:grid-cols-2 lg:grid-cols-4">
      <label className="text-sm font-medium">Code<input name="code" required placeholder="RSD-JAN-2027" className={`${field} uppercase`} /></label>
      <label className="text-sm font-medium">Name<input name="name" required placeholder="January 2027 Cohort" className={field} /></label>
      <label className="text-sm font-medium">School<input name="school" defaultValue="School of Discovery" className={field} /></label>
      <label className="text-sm font-medium">Programme<input name="programme" defaultValue="REALMS School of Discovery" className={field} /></label>
      <label className="text-sm font-medium">Operational status<select name="status" defaultValue="planned" className={field}>{cohortStatuses.map((status) => <option key={status} value={status}>{humanize(status)}</option>)}</select></label>
      <DateInput name="startDate" label="Programme start" />
      <DateInput name="endDate" label="Programme end" />
      <DateInput name="teachingStartDate" label="Teaching start" />
      <DateInput name="teachingEndDate" label="Teaching end" />
      <label className="text-sm font-medium">Teaching weeks <span className="font-normal text-slate-500">(optional)</span><input name="teachingWeekCount" type="number" min="1" max="52" className={field} /></label>
      <DateInput name="completionPeriodStartDate" label="Completion period starts" />
      <DateInput name="completionPeriodEndDate" label="Completion period ends" />
      <DateInput name="orientationDate" label="Orientation date" />
      <TimestampInput name="orientationStartAt" label="Orientation date & time" />
      <DateInput name="matriculationDate" label="Matriculation date" />
      <TimestampInput name="matriculationStartAt" label="Matriculation date & time" />
      <DateInput name="graduationDate" label="Graduation date" />
      <TimestampInput name="graduationStartAt" label="Graduation date & time" />
      <button disabled={busy} className="self-end rounded-xl bg-[#0b315c] px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-50 lg:col-span-4">{busy ? "Creating…" : "Create Cohort"}</button>
    </form>
    {message ? <p role="alert" className="mt-4 text-sm text-red-700">{message}</p> : null}
  </section>;
}

function DateInput({ name, label }: { name: string; label: string }) {
  return <label className="text-sm font-medium">{label} <span className="font-normal text-slate-500">(optional)</span><input name={name} type="date" className={field} /></label>;
}

function TimestampInput({ name, label }: { name: string; label: string }) {
  return <label className="text-sm font-medium">{label} <span className="font-normal text-slate-500">(optional, Africa/Lagos)</span><input name={name} type="datetime-local" className={field} /></label>;
}
