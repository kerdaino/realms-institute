"use client";

import { useMemo, useState } from "react";

import { attendanceStatusLabels, deliveryRouteLabels, engagementCheckTypes, recordedAttendanceWarning, type AttendanceStatus, type DeliveryRoute } from "@/lib/lms/attendance";

type Row = Record<string, unknown> & { id: string; assigned_delivery_route: DeliveryRoute; attendance_status: AttendanceStatus; finalized_at: string | null };
type RecordData = { session: Record<string, unknown>; attendance: Row[]; engagementChecks: Array<Record<string, unknown>>; changes: Array<Record<string, unknown>> };

function object(value: unknown): Record<string, unknown> { return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {}; }
function relation(value: unknown) { return Array.isArray(value) ? object(value[0]) : object(value); }
function studentFor(row: Row) { return relation(relation(relation(row.course_enrollments).student_enrollments).students); }
function displayName(row: Row) { const student = studentFor(row); return String(student.preferred_name || student.legal_name || "Student"); }
function localDateTime(value: unknown) { if (typeof value !== "string" || !value) return ""; const date = new Date(value); return new Date(date.getTime() - date.getTimezoneOffset() * 60000).toISOString().slice(0, 16); }

async function jsonRequest(url: string, method: string, body?: Record<string, unknown>) {
  const response = await fetch(url, { method, headers: body ? { "content-type": "application/json" } : undefined, body: body ? JSON.stringify(body) : undefined });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(typeof payload.message === "string" ? payload.message : "The attendance request could not be completed.");
  return payload;
}

export function AttendanceRoster({ sessionId, initialRecord, scope }: { sessionId: string; initialRecord: RecordData; scope: "admin" | "facilitator" }) {
  const [record, setRecord] = useState(initialRecord);
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const base = scope === "admin" ? "/api/admin" : "/api/facilitator";
  const grouped = useMemo(() => Object.entries(record.attendance.reduce<Record<string, Row[]>>((groups, row) => { (groups[row.assigned_delivery_route] ??= []).push(row); return groups; }, {})), [record.attendance]);
  const summary = useMemo(() => ({ unfinalized: record.attendance.filter((row) => !row.finalized_at).length, recordedPending: record.attendance.filter((row) => row.attendance_status === "pending_recorded_verification").length, connectionIssues: record.attendance.filter((row) => row.connection_issue_reported).length, notVerified: record.attendance.filter((row) => row.attendance_status === "not_verified").length }), [record.attendance]);

  async function reload() {
    const fresh = await jsonRequest(`${base}/sessions/${sessionId}/attendance`, "GET");
    setRecord(fresh);
  }

  async function initialize() {
    setPending(true); setMessage(null);
    try { const payload = await jsonRequest(`${base}/sessions/${sessionId}/attendance`, "POST"); setRecord(payload.attendance); setMessage(`Roster ready: ${payload.result.eligible} eligible enrolment${payload.result.eligible === 1 ? "" : "s"}.`); }
    catch (error) { setMessage(error instanceof Error ? error.message : "Roster initialization failed."); }
    finally { setPending(false); }
  }

  async function mutate(row: Row, body: Record<string, unknown>) {
    setPending(true); setMessage(null);
    try { await jsonRequest(`${base}/attendance/${row.id}`, "PATCH", body); await reload(); setMessage("Attendance saved."); }
    catch (error) { setMessage(error instanceof Error ? error.message : "Attendance could not be saved."); }
    finally { setPending(false); }
  }

  async function finalize(row: Row) {
    setPending(true); setMessage(null);
    try { await jsonRequest(`${base}/attendance/${row.id}/finalize`, "POST", {}); await reload(); setMessage("Attendance finalized."); }
    catch (error) { setMessage(error instanceof Error ? error.message : "Attendance could not be finalized."); }
    finally { setPending(false); }
  }

  async function addCheck(row: Row, body: Record<string, unknown>) {
    setPending(true); setMessage(null);
    try { await jsonRequest(`${base}/attendance/${row.id}/engagement-checks`, "POST", body); await reload(); setMessage("Engagement evidence saved."); }
    catch (error) { setMessage(error instanceof Error ? error.message : "Engagement evidence could not be saved."); }
    finally { setPending(false); }
  }

  async function correct(row: Row, status: AttendanceStatus, reason: string) {
    setPending(true); setMessage(null);
    try { await jsonRequest(`/api/admin/attendance/${row.id}/correct`, "POST", { attendance_status: status, reason }); await reload(); setMessage("Attendance correction saved with history."); }
    catch (error) { setMessage(error instanceof Error ? error.message : "Attendance correction could not be saved."); }
    finally { setPending(false); }
  }

  return <div className="space-y-6">
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div><h2 className="text-lg font-semibold text-[#071327]">Attendance roster</h2><p className="mt-1 text-sm leading-6 text-slate-600">Required sessions create one idempotent attendance record and one learning-completion record per active course enrolment.</p></div>
      <button type="button" disabled={pending} onClick={initialize} className="min-h-11 rounded-xl bg-[#0b315c] px-5 py-2 text-sm font-semibold text-white disabled:opacity-60">{record.attendance.length ? "Refresh / initialize roster" : "Initialize roster"}</button>
    </div>
    {record.attendance.length ? <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">{[["Roster Records", record.attendance.length], ["Unfinalized", summary.unfinalized], ["Recorded Verification Pending", summary.recordedPending], ["Connection Issues / Not Verified", `${summary.connectionIssues} / ${summary.notVerified}`]].map(([label, value]) => <div key={String(label)} className="rounded-xl border border-slate-200 bg-white p-4"><p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{label}</p><p className="mt-2 text-2xl font-semibold text-[#071327]">{value}</p></div>)}</div> : null}
    {message ? <p role="status" className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950">{message}</p> : null}
    {!record.attendance.length ? <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-8 text-center text-sm text-slate-600">No attendance roster has been initialized for this session.</div> : grouped.map(([route, rows]) => rows ? <section key={route} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-3"><div><p className="text-xs font-semibold uppercase tracking-[0.14em] text-amber-700">{route}</p><h2 className="mt-1 text-xl font-semibold text-[#071327]">{deliveryRouteLabels[route as DeliveryRoute]}</h2></div><span className="rounded-full bg-slate-100 px-3 py-1 text-sm font-semibold text-slate-700">{rows.length} student{rows.length === 1 ? "" : "s"}</span></div>
      {(route === "RP" || route === "DR-E") ? <p className="mt-4 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm leading-6 text-amber-950">{recordedAttendanceWarning}</p> : null}
      <div className="mt-5 space-y-4">{rows.map((row) => <AttendanceRow key={row.id} row={row} checks={record.engagementChecks.filter((check) => check.session_attendance_id === row.id)} scope={scope} pending={pending} onMutate={mutate} onAddCheck={addCheck} onFinalize={finalize} onCorrect={correct} />)}</div>
    </section> : null)}
    {scope === "admin" && record.changes.length ? <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"><h2 className="text-lg font-semibold text-[#071327]">Correction history</h2><ul className="mt-4 divide-y divide-slate-200">{record.changes.map((change) => <li key={String(change.id)} className="py-3 text-sm text-slate-700"><p className="font-semibold text-[#071327]">{String(change.reason)}</p><p className="mt-1 text-slate-500">{new Date(String(change.created_at)).toLocaleString("en-NG")}</p></li>)}</ul></section> : null}
  </div>;
}

function AttendanceRow({ row, checks, scope, pending, onMutate, onAddCheck, onFinalize, onCorrect }: { row: Row; checks: Array<Record<string, unknown>>; scope: "admin" | "facilitator"; pending: boolean; onMutate: (row: Row, body: Record<string, unknown>) => Promise<void>; onAddCheck: (row: Row, body: Record<string, unknown>) => Promise<void>; onFinalize: (row: Row) => Promise<void>; onCorrect: (row: Row, status: AttendanceStatus, reason: string) => Promise<void> }) {
  const student = studentFor(row);
  const [first, setFirst] = useState(String(row.first_roll_call ?? ""));
  const [second, setSecond] = useState(String(row.second_roll_call ?? ""));
  const [status, setStatus] = useState<AttendanceStatus>(["present", "late", "partial", "absent", "not_verified"].includes(row.attendance_status) ? row.attendance_status : "present");
  const [correctionStatus, setCorrectionStatus] = useState<AttendanceStatus>(["present", "late", "partial", "absent", "excused_absence", "not_verified"].includes(row.attendance_status) ? row.attendance_status : "excused_absence");
  const [evidence, setEvidence] = useState(String(object(row.online_evidence).additional_evidence ?? ""));
  const [joinAt, setJoinAt] = useState(localDateTime(row.actual_joined_at));
  const [leaveAt, setLeaveAt] = useState(localDateTime(row.actual_left_at));
  const [duration, setDuration] = useState(String(row.online_duration_minutes ?? ""));
  const [percentage, setPercentage] = useState(String(row.attendance_percentage ?? ""));
  const [identity, setIdentity] = useState(row.identity_verified === true ? "true" : row.identity_verified === false ? "false" : "");
  const [checksExpected, setChecksExpected] = useState(String(row.engagement_checks_expected ?? ""));
  const [checksCompleted, setChecksCompleted] = useState(String(row.engagement_checks_completed ?? ""));
  const [connectionIssue, setConnectionIssue] = useState(Boolean(row.connection_issue_reported));
  const [checkType, setCheckType] = useState<(typeof engagementCheckTypes)[number]>("poll");
  const [checkExpected, setCheckExpected] = useState(true);
  const [checkCompleted, setCheckCompleted] = useState(false);
  const [reason, setReason] = useState("");
  const finalOptions: AttendanceStatus[] = ["present", "late", "partial", "absent", "not_verified"];
  const correctionOptions: AttendanceStatus[] = ["present", "late", "partial", "absent", "excused_absence", "not_verified"];
  return <article className="rounded-xl border border-slate-200 bg-slate-50 p-4">
    <div className="flex flex-wrap items-start justify-between gap-3"><div><h3 className="font-semibold text-[#071327]">{displayName(row)}</h3><p className="mt-1 text-xs font-medium text-slate-500">{String(student.student_number ?? "Student number unavailable")}</p></div><div className="text-right"><span className="rounded-full bg-white px-3 py-1 text-xs font-semibold text-slate-700">{attendanceStatusLabels[row.attendance_status]}</span><p className="mt-2 text-xs text-slate-500">Absence units: {Number(row.absence_weight ?? 0)}</p></div></div>
    {!row.finalized_at && row.assigned_delivery_route === "PL" ? <div className="mt-4 grid gap-3 lg:grid-cols-2"><p className="rounded-lg bg-white p-3 text-xs leading-5 text-slate-600 lg:col-span-2">Timing guidance: within 15 minutes may remain Present with lateness recorded; more than 15 minutes is Late; missing more than 25% is Partial; missing more than 50% is Absent where actual timing evidence exists.</p>
      <label className="text-sm font-semibold text-slate-700">First roll call<select value={first} onChange={(event) => setFirst(event.target.value)} className="mt-1 min-h-11 w-full rounded-lg border border-slate-300 bg-white px-3"><option value="">Choose result</option><option value="present">Present</option><option value="late">Late</option><option value="absent">Absent</option><option value="approved_absence">Approved Absence</option><option value="not_verified">Not Verified</option></select><button type="button" disabled={pending || !first} onClick={() => onMutate(row, { action: "roll_call", roll: "first", result: first })} className="mt-2 rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs disabled:opacity-50">Save first roll</button></label>
      <label className="text-sm font-semibold text-slate-700">Second roll call<select value={second} onChange={(event) => setSecond(event.target.value)} className="mt-1 min-h-11 w-full rounded-lg border border-slate-300 bg-white px-3"><option value="">Choose result</option><option value="present">Present</option><option value="absent">Absent</option><option value="approved_absence">Approved Absence</option><option value="not_verified">Not Verified</option></select><button type="button" disabled={pending || !second} onClick={() => onMutate(row, { action: "roll_call", roll: "second", result: second })} className="mt-2 rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs disabled:opacity-50">Save second roll</button></label>
    </div> : null}
    {!row.finalized_at && (row.assigned_delivery_route === "OL" || row.assigned_delivery_route === "DL") ? <div className="mt-4 grid gap-3 md:grid-cols-2 lg:grid-cols-4"><label className="text-sm font-semibold text-slate-700">Join time<input type="datetime-local" value={joinAt} onChange={(event) => setJoinAt(event.target.value)} className="mt-1 min-h-11 w-full rounded-lg border border-slate-300 bg-white px-3" /></label><label className="text-sm font-semibold text-slate-700">Leave time<input type="datetime-local" value={leaveAt} onChange={(event) => setLeaveAt(event.target.value)} className="mt-1 min-h-11 w-full rounded-lg border border-slate-300 bg-white px-3" /></label><label className="text-sm font-semibold text-slate-700">Duration (minutes)<input type="number" min="0" value={duration} onChange={(event) => setDuration(event.target.value)} className="mt-1 min-h-11 w-full rounded-lg border border-slate-300 bg-white px-3" /></label><label className="text-sm font-semibold text-slate-700">Attendance percentage<input type="number" min="0" max="100" step="0.01" value={percentage} onChange={(event) => setPercentage(event.target.value)} className="mt-1 min-h-11 w-full rounded-lg border border-slate-300 bg-white px-3" /></label><label className="text-sm font-semibold text-slate-700">Identity verified<select value={identity} onChange={(event) => setIdentity(event.target.value)} className="mt-1 min-h-11 w-full rounded-lg border border-slate-300 bg-white px-3"><option value="">Not recorded</option><option value="true">Yes</option><option value="false">No</option></select></label><label className="text-sm font-semibold text-slate-700">Checks expected<input type="number" min="0" value={checksExpected} onChange={(event) => setChecksExpected(event.target.value)} className="mt-1 min-h-11 w-full rounded-lg border border-slate-300 bg-white px-3" /></label><label className="text-sm font-semibold text-slate-700">Checks completed<input type="number" min="0" value={checksCompleted} onChange={(event) => setChecksCompleted(event.target.value)} className="mt-1 min-h-11 w-full rounded-lg border border-slate-300 bg-white px-3" /></label><label className="flex items-end gap-2 pb-3 text-sm font-semibold text-slate-700"><input type="checkbox" checked={connectionIssue} onChange={(event) => setConnectionIssue(event.target.checked)} /> Connection issue reported</label><div className="rounded-xl border border-slate-200 bg-white p-3 lg:col-span-4"><p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Engagement checks</p>{checks.length ? <ul className="mt-2 flex flex-wrap gap-2 text-xs">{checks.map((check) => { const result = String(check.result ?? "not_completed"); return <li key={String(check.id)} className="rounded-full bg-slate-100 px-3 py-1">{String(check.check_type).replaceAll("_", " ")} · {result.startsWith("optional") ? "optional" : "expected"} · {result.endsWith("completed") && !result.endsWith("not_completed") ? "completed" : "not completed"}</li>; })}</ul> : null}<div className="mt-3 grid gap-2 md:grid-cols-[1fr_auto_auto_auto]"><select value={checkType} onChange={(event) => setCheckType(event.target.value as typeof checkType)} className="min-h-10 rounded-lg border border-slate-300 px-3">{engagementCheckTypes.map((type) => <option key={type} value={type}>{type.replaceAll("_", " ")}</option>)}</select><label className="flex items-center gap-2 text-xs font-semibold"><input type="checkbox" checked={checkExpected} onChange={(event) => setCheckExpected(event.target.checked)} /> Expected</label><label className="flex items-center gap-2 text-xs font-semibold"><input type="checkbox" checked={checkCompleted} onChange={(event) => setCheckCompleted(event.target.checked)} /> Completed</label><button type="button" disabled={pending} onClick={() => onAddCheck(row, { check_type: checkType, expected: checkExpected, completed: checkCompleted })} className="min-h-10 rounded-lg border border-slate-300 px-3 text-xs font-semibold">Add check</button></div></div><label className="text-sm font-semibold text-slate-700 lg:col-span-2">Reviewed status<select value={status} onChange={(event) => setStatus(event.target.value as AttendanceStatus)} className="mt-1 min-h-11 w-full rounded-lg border border-slate-300 bg-white px-3">{finalOptions.map((option) => <option key={option} value={option}>{attendanceStatusLabels[option]}</option>)}</select></label><label className="text-sm font-semibold text-slate-700 lg:col-span-2">Additional online evidence<textarea value={evidence} onChange={(event) => setEvidence(event.target.value)} rows={2} className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2" placeholder="Relevant identity, engagement, connection, or contextual evidence" /></label><p className="text-xs leading-5 text-slate-500 lg:col-span-3">Evidence is presented for authorised human review. No automatic online pass threshold is applied.</p><button type="button" disabled={pending} onClick={() => onMutate(row, { action: "live_evidence", attendance_status: status, online_join_at: joinAt || null, online_leave_at: leaveAt || null, online_duration_minutes: duration || null, online_attendance_percentage: percentage || null, identity_verified: identity === "" ? null : identity === "true", engagement_checks_expected: checksExpected || null, engagement_checks_completed: checksCompleted || null, connection_issue_reported: connectionIssue, additional_evidence: evidence })} className="min-h-11 rounded-lg border border-slate-300 bg-white px-4 text-sm font-semibold disabled:opacity-50">Save reviewed evidence</button></div> : null}
    {!row.finalized_at && !["pending", "pending_recorded_verification"].includes(row.attendance_status) ? <button type="button" disabled={pending} onClick={() => onFinalize(row)} className="mt-4 min-h-11 rounded-lg bg-[#0b315c] px-4 text-sm font-semibold text-white disabled:opacity-50">Finalize attendance</button> : null}
    {!row.finalized_at && scope === "admin" ? <div className="mt-4 border-t border-slate-200 pt-4"><p className="text-xs font-semibold uppercase tracking-[0.12em] text-amber-700">Administrative correction / approved absence</p><div className="mt-3 grid gap-3 md:grid-cols-[200px_1fr_auto]"><select value={correctionStatus} onChange={(event) => setCorrectionStatus(event.target.value as AttendanceStatus)} className="min-h-11 rounded-lg border border-slate-300 bg-white px-3">{correctionOptions.map((option) => <option key={option} value={option}>{attendanceStatusLabels[option]}</option>)}</select><input value={reason} onChange={(event) => setReason(event.target.value)} placeholder="Mandatory reason or approval reference" className="min-h-11 rounded-lg border border-slate-300 bg-white px-3" /><button type="button" disabled={pending || !reason.trim()} onClick={() => onCorrect(row, correctionStatus, reason)} className="min-h-11 rounded-lg border border-amber-500 bg-amber-50 px-4 text-sm font-semibold text-amber-950 disabled:opacity-50">Apply with history</button></div></div> : null}
    {row.finalized_at ? <div className="mt-4 border-t border-slate-200 pt-4"><p className="text-xs font-semibold uppercase tracking-[0.12em] text-emerald-700">Finalized {new Date(row.finalized_at).toLocaleString("en-NG")}</p>{scope === "admin" ? <div className="mt-3 grid gap-3 md:grid-cols-[200px_1fr_auto]"><select value={correctionStatus} onChange={(event) => setCorrectionStatus(event.target.value as AttendanceStatus)} className="min-h-11 rounded-lg border border-slate-300 bg-white px-3">{correctionOptions.map((option) => <option key={option} value={option}>{attendanceStatusLabels[option]}</option>)}</select><input value={reason} onChange={(event) => setReason(event.target.value)} placeholder="Mandatory correction reason" className="min-h-11 rounded-lg border border-slate-300 bg-white px-3" /><button type="button" disabled={pending || !reason.trim()} onClick={() => onCorrect(row, correctionStatus, reason)} className="min-h-11 rounded-lg border border-amber-500 bg-amber-50 px-4 text-sm font-semibold text-amber-950 disabled:opacity-50">Save correction</button></div> : null}</div> : null}
  </article>;
}
