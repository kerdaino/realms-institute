"use client";

import { useState } from "react";

import { AdminPanel, DataItem, StatusBadge, formatDate } from "@/components/admin/LmsUi";
import { cohortStatuses, humanize } from "@/lib/lms/adminConstants";
import type { fetchAdminCohort } from "@/lib/lms/adminData";

type RecordData = Awaited<ReturnType<typeof fetchAdminCohort>>;
type Invite = RecordData["invites"][number];

function object(value: unknown) { return value && typeof value === "object" ? value as Record<string, unknown> : {}; }
function text(value: unknown) { return typeof value === "string" ? value : null; }
function localTimestamp(value: string | null | undefined) {
  if (!value) return "";
  const date = new Date(value);
  const offset = date.getTimezoneOffset() * 60_000;
  return new Date(date.valueOf() - offset).toISOString().slice(0, 16);
}
function defaultExpiry() {
  return localTimestamp(new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString());
}
function isoTimestamp(value: FormDataEntryValue | null) {
  return typeof value === "string" && value ? new Date(value).toISOString() : null;
}

export function CohortRecord({ initialRecord }: { initialRecord: RecordData }) {
  const [record, setRecord] = useState(initialRecord);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);

  async function save(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setMessage("");
    const body = Object.fromEntries(new FormData(event.currentTarget));
    const response = await fetch(`/api/admin/cohorts/${record.cohort.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const payload = await response.json(); setBusy(false);
    if (!response.ok) return setMessage(payload.message || "Cohort could not be updated.");
    setRecord((current) => ({ ...current, cohort: { ...current.cohort, ...payload.cohort } })); setMessage("Cohort updated.");
  }

  async function saveRegistrationControl(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const registrationStatus = String(form.get("registrationStatus"));
    if (!record.cohort.is_public_registration_cohort && form.get("makePublicRegistrationCohort") === "on" && !window.confirm(`Make ${record.cohort.name} the Public Registration Cohort?\n\nThe public /register page will stop using the previously selected cohort. Historical applications will remain attached to their original cohort.`)) return;
    if (registrationStatus === "closed" && !window.confirm(`Close registration for ${record.cohort.name}?\n\nNew public applications will stop immediately.\nExisting applications, payments, scholarship decisions and admission records will not be affected.`)) return;
    if (registrationStatus === "open" && record.cohort.registration_status !== "open" && !window.confirm(`Open registration for ${record.cohort.name}?\n\nNew public applications will be accepted immediately when this is the Public Registration Cohort and the optional registration window permits.`)) return;
    setBusy(true); setMessage("");
    const response = await fetch(`/api/admin/cohorts/${record.cohort.id}/registration`, {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ registrationStatus, registrationOpensAt: isoTimestamp(form.get("registrationOpensAt")), registrationClosesAt: isoTimestamp(form.get("registrationClosesAt")), makePublicRegistrationCohort: form.get("makePublicRegistrationCohort") === "on" }),
    });
    const payload = await response.json(); setBusy(false);
    if (!response.ok) return setMessage(payload.message || "Registration control could not be updated.");
    setRecord((current) => ({ ...current, cohort: { ...current.cohort, ...payload.cohort } }));
    setMessage(`Registration is ${payload.cohort.registration_status.toUpperCase()} for ${record.cohort.name}.`);
  }

  async function createInvite(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setMessage("");
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    const response = await fetch(`/api/admin/cohorts/${record.cohort.id}/late-registration-invites`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ applicantEmail: form.get("applicantEmail"), applicantName: form.get("applicantName"), expiresAt: isoTimestamp(form.get("expiresAt")) }) });
    const payload = await response.json(); setBusy(false);
    if (!response.ok) return setMessage(payload.message || "Invitation could not be created.");
    setRecord((current) => ({ ...current, invites: [payload.invite, ...current.invites] }));
    formElement.reset();
    const expiry = formElement.elements.namedItem("expiresAt") as HTMLInputElement | null;
    if (expiry) expiry.value = defaultExpiry();
    await navigator.clipboard.writeText(payload.inviteUrl).catch(() => undefined);
    setMessage("Private invitation created. Its link was copied to the clipboard where browser permission allowed.");
  }

  async function copyInvite(invite: Invite) {
    setBusy(true); setMessage("");
    const response = await fetch(`/api/admin/cohorts/${record.cohort.id}/late-registration-invites/${invite.id}/link`);
    const payload = await response.json(); setBusy(false);
    if (!response.ok) return setMessage(payload.message || "Invite link is unavailable.");
    await navigator.clipboard.writeText(payload.inviteUrl);
    setMessage(`Private invitation link copied for ${invite.applicant_email}.`);
  }

  async function revokeInvite(invite: Invite) {
    if (!window.confirm(`Revoke the private registration invitation for ${invite.applicant_email}?`)) return;
    setBusy(true); setMessage("");
    const response = await fetch(`/api/admin/cohorts/${record.cohort.id}/late-registration-invites/${invite.id}/revoke`, { method: "POST" });
    const payload = await response.json(); setBusy(false);
    if (!response.ok) return setMessage(payload.message || "Invitation could not be revoked.");
    setRecord((current) => ({ ...current, invites: current.invites.map((item) => item.id === invite.id ? { ...item, status: "revoked", revoked_at: new Date().toISOString() } : item) }));
    setMessage("Private invitation revoked.");
  }

  const groups = record.offerings.reduce<Record<string, typeof record.offerings>>((result, raw) => { const course = object(raw.courses); const category = text(course.discipleship_route) || text(course.skill_pathway) || text(course.course_category) || "Other"; (result[category] ||= []).push(raw); return result; }, {});

  return <div className="space-y-6">
    {message ? <p role="status" className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-950">{message}</p> : null}
    <div className="grid gap-6 lg:grid-cols-[1.4fr_0.6fr]">
      <AdminPanel title="Cohort operations">
        <form onSubmit={save} className="grid gap-4 md:grid-cols-2">
          <label className="text-sm font-medium">Name<input name="name" defaultValue={record.cohort.name} required className="mt-1 block w-full rounded-xl border border-slate-300 px-3 py-2" /></label>
          <label className="text-sm font-medium">Status<select name="status" defaultValue={record.cohort.status} className="mt-1 block w-full rounded-xl border border-slate-300 px-3 py-2">{cohortStatuses.map((item) => <option key={item} value={item}>{humanize(item)}</option>)}</select></label>
          <label className="text-sm font-medium">Academic year<input name="academic_year" defaultValue={record.cohort.academic_year ?? ""} className="mt-1 block w-full rounded-xl border border-slate-300 px-3 py-2" /></label>
          <label className="text-sm font-medium">Maximum capacity<input name="maximum_capacity" type="number" min="1" defaultValue={record.cohort.maximum_capacity ?? ""} className="mt-1 block w-full rounded-xl border border-slate-300 px-3 py-2" /></label>
          {[["start_date", "Start date"], ["end_date", "End date"], ["application_open_date", "Legacy applications open date"], ["application_close_date", "Legacy applications close date"], ["orientation_date", "Orientation"], ["matriculation_date", "Matriculation"], ["graduation_date", "Graduation"]].map(([name, label]) => <label key={name} className="text-sm font-medium">{label}<input name={name} type="date" defaultValue={(record.cohort as unknown as Record<string, string | null>)[name] ?? ""} className="mt-1 block w-full rounded-xl border border-slate-300 px-3 py-2" /></label>)}
          <label className="text-sm font-medium md:col-span-2">Description<textarea name="description" defaultValue={record.cohort.description ?? ""} rows={3} className="mt-1 block w-full rounded-xl border border-slate-300 p-3" /></label>
          <label className="text-sm font-medium md:col-span-2">Internal notes<textarea name="internal_notes" defaultValue={record.cohort.internal_notes ?? ""} rows={3} className="mt-1 block w-full rounded-xl border border-slate-300 p-3" /></label>
          <button disabled={busy} className="rounded-xl bg-[#071327] px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-50 md:col-span-2">Save cohort</button>
        </form>
      </AdminPanel>
      <AdminPanel title="Capacity"><dl className="space-y-5"><DataItem label="Current students">{record.studentCount}</DataItem><DataItem label="Applications">{record.applicationCount}</DataItem><DataItem label="Capacity ceiling">{record.cohort.maximum_capacity ?? "Not set"}</DataItem><DataItem label="Available places">{record.cohort.maximum_capacity == null ? "Not calculated" : Math.max(record.cohort.maximum_capacity - record.studentCount, 0)}</DataItem><DataItem label="Status"><StatusBadge value={record.cohort.status} /></DataItem></dl><p className="mt-5 text-xs leading-5 text-slate-500">Capacity is an operational ceiling, not a promise of admission or enrolment.</p></AdminPanel>
    </div>

    <AdminPanel title="Admissions & Registration" description="This controls new public application creation only. Existing applications, payments, decisions and provisioning continue independently.">
      <form onSubmit={saveRegistrationControl} className="grid gap-5 lg:grid-cols-2">
        <div className="rounded-2xl border border-slate-200 p-5"><p className="text-xs font-semibold uppercase tracking-wider text-slate-500">Registration Status</p><div className="mt-3"><StatusBadge value={record.cohort.registration_status} /></div><div className="mt-5 grid grid-cols-2 gap-3"><label className="cursor-pointer rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm font-semibold text-emerald-900"><input className="mr-2" type="radio" name="registrationStatus" value="open" defaultChecked={record.cohort.registration_status === "open"} />Open Registration</label><label className="cursor-pointer rounded-xl border border-slate-300 bg-slate-50 p-4 text-sm font-semibold text-slate-800"><input className="mr-2" type="radio" name="registrationStatus" value="closed" defaultChecked={record.cohort.registration_status !== "open"} />Close Registration</label></div></div>
        <div className="grid gap-4 rounded-2xl border border-slate-200 p-5"><label className="text-sm font-medium">Registration Opens <span className="font-normal text-slate-500">(optional)</span><input type="datetime-local" name="registrationOpensAt" defaultValue={localTimestamp(record.cohort.registration_opens_at)} className="mt-1 block w-full rounded-xl border border-slate-300 px-3 py-2" /></label><label className="text-sm font-medium">Registration Closes <span className="font-normal text-slate-500">(optional)</span><input type="datetime-local" name="registrationClosesAt" defaultValue={localTimestamp(record.cohort.registration_closes_at)} className="mt-1 block w-full rounded-xl border border-slate-300 px-3 py-2" /></label><label className="flex items-start gap-3 rounded-xl bg-slate-50 p-4 text-sm"><input type="checkbox" name="makePublicRegistrationCohort" defaultChecked={record.cohort.is_public_registration_cohort} disabled={record.cohort.is_public_registration_cohort} className="mt-1" /><span><strong>Public Registration Cohort: {record.cohort.is_public_registration_cohort ? "Yes" : "No"}</strong><span className="mt-1 block text-slate-600">Select to make this the single cohort used by /register. This does not automatically open registration.</span></span></label></div>
        <button disabled={busy} className="rounded-xl bg-[#071327] px-5 py-3 text-sm font-semibold text-white disabled:opacity-50 lg:col-span-2">Save Registration Control</button>
      </form>
    </AdminPanel>

    <AdminPanel title="Late Registration Invites" description="Create one-applicant, one-cohort private links without reopening public registration. Links are not emailed automatically.">
      <form onSubmit={createInvite} className="grid gap-4 rounded-2xl border border-slate-200 bg-slate-50 p-5 md:grid-cols-2 lg:grid-cols-4">
        <label className="text-sm font-medium">Applicant email<input name="applicantEmail" type="email" required className="mt-1 block w-full rounded-xl border border-slate-300 bg-white px-3 py-2" /></label>
        <label className="text-sm font-medium">Applicant name <span className="font-normal text-slate-500">(optional)</span><input name="applicantName" className="mt-1 block w-full rounded-xl border border-slate-300 bg-white px-3 py-2" /></label>
        <label className="text-sm font-medium">Expires at<input name="expiresAt" type="datetime-local" required defaultValue={defaultExpiry()} className="mt-1 block w-full rounded-xl border border-slate-300 bg-white px-3 py-2" /></label>
        <button disabled={busy} className="self-end rounded-xl bg-[#0b315c] px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-50">Create Late Registration Invite</button>
      </form>
      <div className="mt-5 overflow-x-auto"><table className="min-w-full text-left text-sm"><thead className="border-b border-slate-200 bg-slate-50"><tr>{["Applicant", "Email", "Created", "Expires", "Status", "Actions"].map((label) => <th key={label} className="px-4 py-3">{label}</th>)}</tr></thead><tbody className="divide-y divide-slate-100">{record.invites.map((invite) => <tr key={invite.id}><td className="px-4 py-3">{invite.applicant_name ?? "Not provided"}</td><td className="px-4 py-3">{invite.applicant_email}</td><td className="px-4 py-3">{formatDate(invite.created_at, true)}</td><td className="px-4 py-3">{formatDate(invite.expires_at, true)}</td><td className="px-4 py-3"><StatusBadge value={invite.status} /></td><td className="px-4 py-3"><div className="flex gap-2"><button type="button" disabled={busy || invite.status !== "active"} onClick={() => copyInvite(invite)} className="rounded-lg border border-slate-300 px-3 py-1.5 font-semibold disabled:opacity-40">Copy Invite Link</button><button type="button" disabled={busy || invite.status !== "active"} onClick={() => revokeInvite(invite)} className="rounded-lg border border-red-200 px-3 py-1.5 font-semibold text-red-700 disabled:opacity-40">Revoke</button></div></td></tr>)}</tbody></table>{record.invites.length === 0 ? <p className="p-6 text-center text-slate-600">No private late-registration invitations have been created for this cohort.</p> : null}</div>
    </AdminPanel>

    <AdminPanel title="Cohort courses" description="Offerings are grouped by approved discipleship route or skill pathway.">{record.offerings.length === 0 ? <p className="text-sm text-slate-600">No courses have been assigned to this cohort.</p> : <div className="space-y-6">{Object.entries(groups).map(([group, offerings]) => <div key={group}><h3 className="mb-3 text-sm font-semibold uppercase tracking-wider text-amber-800">{humanize(group)}</h3><div className="space-y-2">{offerings.map((raw) => { const offering = object(raw); const course = object(offering.courses); const assignments = Array.isArray(offering.facilitator_course_assignments) ? offering.facilitator_course_assignments : []; return <div key={text(offering.id) ?? "offering"} className="rounded-xl border border-slate-200 p-4"><div className="flex flex-wrap items-start justify-between gap-3"><div><strong>{text(course.code)}</strong> · {text(course.title)}<p className="mt-1 text-xs text-slate-500">{text(offering.schedule_text) || text(course.default_schedule_text) || "Schedule not set"}</p></div><StatusBadge value={text(offering.status)} /></div><p className="mt-2 text-sm text-slate-600">Facilitator: {assignments.length ? assignments.map((item) => text(object(item).assignment_role) + " — " + text(object(object(item).facilitators).display_name)).join(", ") : "Not assigned"}</p></div>; })}</div></div>)}</div>}</AdminPanel>
  </div>;
}
