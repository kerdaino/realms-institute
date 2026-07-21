"use client";

import Link from "next/link";
import { useState } from "react";

import { AdminPanel, DataItem, StatusBadge, formatDate } from "@/components/admin/LmsUi";
import { humanize, onboardingStatuses, studentStatuses } from "@/lib/lms/adminConstants";
import type { fetchAdminStudent } from "@/lib/lms/adminData";
import { allowedDeliveryRoutes, deliveryRouteLabels, recordedAttendanceWarning, type DeliveryRoute } from "@/lib/lms/attendance";

type StudentRecordData = Awaited<ReturnType<typeof fetchAdminStudent>>;

function object(value: unknown) { return value && typeof value === "object" ? value as Record<string, unknown> : {}; }
function text(value: unknown) { return typeof value === "string" ? value : null; }

export function StudentRecord({ initialRecord }: { initialRecord: StudentRecordData }) {
  const [record, setRecord] = useState(initialRecord);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState("");
  const student = record.student;

  async function saveStudent(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setMessage("");
    const body: Record<string, unknown> = Object.fromEntries(new FormData(event.currentTarget));
    body.orientation_completed = body.orientation_completed === "on";
    body.matriculated = body.matriculated === "on";
    const response = await fetch(`/api/admin/students/${student.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const payload = await response.json(); setBusy(false);
    if (!response.ok) return setMessage(payload.message || "Student record could not be updated.");
    setRecord((current) => ({ ...current, student: payload.student })); setMessage("Student record updated.");
  }

  async function addNote(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (!note.trim()) return;
    setBusy(true); setMessage("");
    const response = await fetch(`/api/admin/students/${student.id}/notes`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ note, note_type: "general" }) });
    const payload = await response.json(); setBusy(false);
    if (!response.ok) return setMessage(payload.message || "Note could not be saved.");
    setRecord((current) => ({ ...current, notes: [payload.note, ...current.notes] })); setNote(""); setMessage("Internal note added.");
  }

  async function sendPortalAccess(mode: "activation" | "recovery" = "activation") {
    if (!window.confirm(`${mode === "recovery" ? "Send password reset / account recovery" : "Send portal activation or access reminder"} to ${student.email}?`)) return;
    setBusy(true); setMessage("");
    const response = await fetch(`/api/admin/students/${student.id}/portal-access`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ mode }) });
    const payload = await response.json(); setBusy(false);
    if (payload.portalAccount) setRecord((current) => ({ ...current, portalAccount: payload.portalAccount }));
    setMessage(response.ok ? payload.message || "Portal access email sent." : payload.message || "Portal access could not be sent.");
  }

  async function changeRoute(courseEnrollmentId: string, deliveryRoute: DeliveryRoute, reason: string) {
    setBusy(true); setMessage("");
    const response = await fetch(`/api/admin/course-enrollments/${courseEnrollmentId}/delivery-route`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ delivery_route: deliveryRoute, reason }) });
    const payload = await response.json(); setBusy(false);
    if (!response.ok) return setMessage(payload.message || "Delivery route could not be changed.");
    setRecord((current) => ({ ...current, courseEnrollments: current.courseEnrollments.map((item) => object(item).id === courseEnrollmentId ? { ...item, ...payload.courseEnrollment } : item) }));
    setMessage("Delivery route updated with an audit event.");
  }

  return <div className="space-y-6">{message ? <p role="status" className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-950">{message}</p> : null}
    <div className="grid gap-6 lg:grid-cols-2">
      <AdminPanel title="Identity"><dl className="grid gap-5 sm:grid-cols-2"><DataItem label="Student ID">{student.student_number}</DataItem><DataItem label="Legal name">{student.legal_name}</DataItem><DataItem label="Preferred name">{student.preferred_name}</DataItem><DataItem label="Email">{student.email}</DataItem><DataItem label="Phone">{student.phone}</DataItem><DataItem label="Location">{[student.city, student.country].filter(Boolean).join(", ")}</DataItem><DataItem label="Identity verification"><StatusBadge value={student.identity_verification_status} /></DataItem><DataItem label="Portal account"><StatusBadge value={record.portalAccount.label} /></DataItem><DataItem label="Last portal invitation">{record.portalAccount.lastPortalInvitationAt ? formatDate(record.portalAccount.lastPortalInvitationAt, true) : "Not sent"}</DataItem></dl><div className="mt-6 flex flex-wrap gap-3"><button disabled={busy} onClick={() => sendPortalAccess("activation")} className="rounded-xl bg-[#071327] px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-50">{record.portalAccount.status === "account_active" ? "Send Portal Access Reminder" : "Send / Resend Account Activation"}</button><button disabled={busy || record.portalAccount.status === "not_provisioned"} onClick={() => sendPortalAccess("recovery")} className="rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-sm font-semibold text-[#071327] disabled:opacity-50">Password Reset / Account Recovery</button></div></AdminPanel>
      <AdminPanel title="Academic and onboarding status" description="Status changes are administrative decisions and are recorded in the audit log."><form onSubmit={saveStudent} className="grid gap-4"><label className="text-sm font-medium">Student status<select name="student_status" defaultValue={student.student_status} className="mt-1 block w-full rounded-xl border border-slate-300 px-3 py-2">{studentStatuses.map((value) => <option key={value} value={value}>{humanize(value)}</option>)}</select></label><label className="text-sm font-medium">Onboarding status<select name="onboarding_status" defaultValue={student.onboarding_status} className="mt-1 block w-full rounded-xl border border-slate-300 px-3 py-2">{onboardingStatuses.map((value) => <option key={value} value={value}>{humanize(value)}</option>)}</select></label><label className="flex items-center gap-3 text-sm"><input name="orientation_completed" type="checkbox" defaultChecked={Boolean(student.orientation_completed_at)} disabled={Boolean(student.orientation_completed_at)} /> Orientation completed{student.orientation_completed_at ? " (recorded)" : ""}</label><label className="flex items-center gap-3 text-sm"><input name="matriculated" type="checkbox" defaultChecked={Boolean(student.matriculated_at)} disabled={Boolean(student.matriculated_at)} /> Matriculated{student.matriculated_at ? " (recorded)" : ""}</label><button disabled={busy} className="rounded-xl bg-[#071327] px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-50">Save student status</button></form></AdminPanel>
    </div>
    <AdminPanel title="Student Handbook acknowledgement" description="Versioned acknowledgement history is read-only and separate from general onboarding status.">{record.handbook.requiredDocument ? <dl className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4"><DataItem label="Current required handbook"><a href={record.handbook.requiredDocument.fileHref} target="_blank" rel="noopener noreferrer" className="font-semibold text-amber-800 hover:underline">{record.handbook.requiredDocument.cohortLabel} Student Handbook</a></DataItem><DataItem label="Status"><StatusBadge value={record.handbook.acknowledgement ? "acknowledged" : "pending"} /></DataItem><DataItem label="Version">{record.handbook.requiredDocument.version}</DataItem><DataItem label="Acknowledged date">{record.handbook.acknowledgement ? formatDate(record.handbook.acknowledgement.acknowledged_at, true) : record.handbook.storageAvailable ? "Pending" : "Migration pending"}</DataItem></dl> : <p className="text-sm text-slate-600">No handbook version is currently required for this student&apos;s latest cohort.</p>}</AdminPanel>
    <AdminPanel title="Academic enrolment">{record.enrollments.length === 0 ? <p className="text-sm text-slate-600">No cohort enrolment is linked to this student.</p> : <div className="space-y-4">{record.enrollments.map((raw) => { const enrollment = object(raw); const cohort = object(enrollment.cohorts); const enrollmentId = text(enrollment.id); return <div key={enrollmentId ?? "enrollment"} className="rounded-xl border border-slate-200 p-4"><div className="flex flex-wrap items-center justify-between gap-3"><strong>{text(cohort.name) ?? "Cohort"} ({text(cohort.code) ?? "—"})</strong><StatusBadge value={text(enrollment.enrolment_status)} /></div><p className="mt-2 text-sm capitalize text-slate-600">{humanize(text(enrollment.discipleship_route))} · {humanize(text(enrollment.skill_pathway))} · {humanize(text(enrollment.skill_learning_mode))}</p>{enrollmentId ? <Link href={`/admin/at-risk/${enrollmentId}`} className="mt-3 inline-block text-sm font-semibold text-amber-800">Manage engagement, standing and mentor →</Link> : null}</div>; })}</div>}</AdminPanel>
    <AdminPanel title="Course enrolments" description="Recorded routes require explicit administrative approval and preserved reasons.">{record.courseEnrollments.length === 0 ? <p className="text-sm text-slate-600">No course enrolments are linked to this student.</p> : <div className="overflow-x-auto"><table className="min-w-full text-left text-sm"><thead><tr className="border-b border-slate-200 text-xs uppercase text-slate-500"><th className="py-2">Course</th><th>Status</th><th>Cohort</th><th>Attendance route</th></tr></thead><tbody>{record.courseEnrollments.map((raw) => { const enrollment = object(raw); const offering = object(enrollment.cohort_courses); const course = object(offering.courses); const cohort = object(offering.cohorts); const enrollmentId = text(enrollment.id); return <tr key={enrollmentId ?? "course"} className="border-b border-slate-100 align-top"><td className="py-3 pr-4"><strong>{text(course.code)}</strong> · {text(course.title)}</td><td className="pr-4 pt-3"><StatusBadge value={text(enrollment.enrollment_status)} /></td><td className="pr-4 pt-3">{text(cohort.code)}</td><td className="min-w-72 py-3">{enrollmentId ? <DeliveryRouteControl enrollmentId={enrollmentId} category={text(course.course_category)} current={(text(enrollment.delivery_route) ?? (text(course.course_category) === "discipleship" ? "DL" : "PL")) as DeliveryRoute} busy={busy} onSave={changeRoute} /> : null}</td></tr>; })}</tbody></table></div>}</AdminPanel>
    <div className="grid gap-6 lg:grid-cols-2"><AdminPanel title="Registration source">{record.registration ? <dl className="grid gap-4 sm:grid-cols-2"><DataItem label="Applicant type">{humanize(record.registration.applicant_type)}</DataItem><DataItem label="Application status"><StatusBadge value={record.registration.application_status} /></DataItem><DataItem label="Payment"><StatusBadge value={record.registration.payment_status} /></DataItem><DataItem label="Funding route">{humanize(record.registration.funding_route)}</DataItem><DataItem label="Applied">{formatDate(record.registration.created_at)}</DataItem><DataItem label="Application"><Link href={`/admin/registrations/${record.registration.id}`} className="font-semibold text-amber-800 hover:underline">View source application</Link></DataItem></dl> : <p className="text-sm text-slate-600">This student was not linked from a registration record.</p>}</AdminPanel>
      <AdminPanel title="Internal notes" description="Record only necessary administrative context. Do not add sensitive pastoral, medical, or financial detail unless strictly required."><form onSubmit={addNote} className="space-y-3"><textarea value={note} onChange={(event) => setNote(event.target.value)} maxLength={5000} rows={4} className="w-full rounded-xl border border-slate-300 p-3 text-sm" placeholder="Add a concise internal note" /><button disabled={busy || !note.trim()} className="rounded-xl bg-[#071327] px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">Add note</button></form><div className="mt-5 space-y-3">{record.notes.map((raw) => { const item = object(raw); return <div key={text(item.id) ?? "note"} className="rounded-xl bg-slate-50 p-3 text-sm"><p className="whitespace-pre-wrap">{text(item.note)}</p><p className="mt-2 text-xs text-slate-500">{humanize(text(item.note_type))} · {formatDate(text(item.created_at), true)}</p></div>; })}</div></AdminPanel></div>
    <AdminPanel title="Audit history">{record.audits.length === 0 ? <p className="text-sm text-slate-600">No student audit events have been recorded yet.</p> : <ol className="space-y-3">{record.audits.map((raw) => { const item = object(raw); return <li key={text(item.id) ?? "audit"} className="flex flex-wrap justify-between gap-2 border-b border-slate-100 pb-3 text-sm"><span>{humanize(text(item.action))}</span><time className="text-slate-500">{formatDate(text(item.created_at), true)}</time></li>; })}</ol>}</AdminPanel>
  </div>;
}

function DeliveryRouteControl({ enrollmentId, category, current, busy, onSave }: { enrollmentId: string; category: string | null; current: DeliveryRoute; busy: boolean; onSave: (id: string, route: DeliveryRoute, reason: string) => Promise<void> }) {
  const [route, setRoute] = useState<DeliveryRoute>(current); const [reason, setReason] = useState(""); const options = allowedDeliveryRoutes(category);
  return <div><p className="font-semibold text-[#071327]">{current} · {deliveryRouteLabels[current]}</p><div className="mt-2 grid gap-2"><select value={route} onChange={(event) => setRoute(event.target.value as DeliveryRoute)} className="min-h-10 rounded-lg border border-slate-300 px-3">{options.map((option) => <option key={option} value={option}>{option} · {deliveryRouteLabels[option]}</option>)}</select><input value={reason} onChange={(event) => setReason(event.target.value)} placeholder="Mandatory reason for change" className="min-h-10 rounded-lg border border-slate-300 px-3" />{route === "RP" || route === "DR-E" ? <p className="rounded-lg bg-amber-50 p-2 text-xs leading-5 text-amber-950">{recordedAttendanceWarning}</p> : null}<button type="button" disabled={busy || route === current || !reason.trim()} onClick={() => onSave(enrollmentId, route, reason)} className="min-h-10 rounded-lg border border-amber-500 bg-amber-50 px-3 text-xs font-semibold text-amber-950 disabled:opacity-50">Approve route change</button></div></div>;
}
