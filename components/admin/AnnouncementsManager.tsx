"use client";

import { useState, type FormEvent } from "react";

type Option = { id: string; name: string; email?: string; code?: string; status?: string };
type Recipient = { id: string; email_status: string; email_sent_at: string | null };
type Announcement = { id: string; title: string; message: string; audience: string; announcement_status: string; publish_to_portal: boolean; send_email: boolean; published_at: string | null; expires_at: string | null; created_at: string; institutional_announcement_recipients: Recipient[] };

const field = "min-h-12 rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm text-slate-950";

export function AnnouncementsManager({ initialAnnouncements, options }: { initialAnnouncements: Announcement[]; options: { cohorts: Option[]; students: Option[]; facilitators: Option[] } }) {
  const [announcements, setAnnouncements] = useState(initialAnnouncements);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState("");
  const [allActive, setAllActive] = useState(false);

  async function refresh() {
    const response = await fetch("/api/admin/announcements", { cache: "no-store" });
    const body = await response.json();
    if (!response.ok) throw new Error(body.message || "Announcements could not be refreshed.");
    setAnnouncements(body.announcements || []);
  }

  async function create(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy("create"); setMessage("");
    const form = new FormData(event.currentTarget);
    const values = Object.fromEntries(form);
    const payload = { ...values, all_active_cohorts: form.get("all_active_cohorts") === "on", publish_to_portal: form.get("publish_to_portal") === "on", send_email: form.get("send_email") === "on", cohort_id: form.get("all_active_cohorts") === "on" ? null : form.get("cohort_id"), student_discipleship_route: form.get("student_discipleship_route") || null, student_skill_pathway: form.get("student_skill_pathway") || null, student_learning_mode: form.get("student_learning_mode") || null, explicit_student_ids: form.getAll("explicit_student_ids"), explicit_facilitator_ids: form.getAll("explicit_facilitator_ids") };
    try {
      const response = await fetch("/api/admin/announcements", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
      const body = await response.json();
      if (!response.ok) throw new Error(body.message || "Announcement could not be saved.");
      event.currentTarget.reset(); setAllActive(false); await refresh();
      setMessage(`${body.message} ${body.recipientCount} portal recipient records prepared.${body.delivery ? ` Email: ${body.delivery.sent} sent, ${body.delivery.failed} failed.` : ""}`);
    } catch (error) { setMessage(error instanceof Error ? error.message : "Announcement could not be saved."); }
    finally { setBusy(""); }
  }

  async function action(id: string, operation: "publish" | "archive" | "retry") {
    setBusy(`${operation}:${id}`); setMessage("");
    try {
      const response = await fetch(`/api/admin/announcements/${id}/${operation}`, { method: "POST" });
      const body = await response.json();
      if (!response.ok) throw new Error(body.message || "Announcement action failed.");
      await refresh(); setMessage(`${body.message}${body.delivery ? ` ${body.delivery.sent} sent, ${body.delivery.failed} failed.` : ""}`);
    } catch (error) { setMessage(error instanceof Error ? error.message : "Announcement action failed."); }
    finally { setBusy(""); }
  }

  return <div className="space-y-8">
    {message ? <p className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm leading-6 text-amber-950">{message}</p> : null}
    <form onSubmit={create} className="grid gap-5 rounded-2xl border border-slate-200 bg-white p-5 sm:p-7">
      <div><h2 className="text-xl font-semibold text-[#071327]">Create Announcement</h2><p className="mt-2 text-sm leading-6 text-slate-600">Recipients are resolved from active REALMS records on the server. Drafts do not appear in portals or send email.</p></div>
      <label className="grid gap-2 text-sm font-semibold"><span>Title *</span><input name="title" required maxLength={240} className={field} /></label>
      <label className="grid gap-2 text-sm font-semibold"><span>Message *</span><textarea name="message" required rows={7} className={field} /></label>
      <div className="grid gap-4 md:grid-cols-2">
        <label className="grid gap-2 text-sm font-semibold"><span>Audience</span><select name="audience" className={field}><option value="students">Students</option><option value="facilitators">Facilitators</option><option value="students_facilitators">Students &amp; Facilitators</option></select></label>
        <label className="flex items-center gap-3 rounded-xl border border-slate-200 p-4 text-sm font-semibold"><input name="all_active_cohorts" type="checkbox" checked={allActive} onChange={(event) => setAllActive(event.target.checked)} />All applicable active cohorts</label>
        <label className="grid gap-2 text-sm font-semibold"><span>Specific Cohort</span><select name="cohort_id" required={!allActive} disabled={allActive} className={field}><option value="">Select cohort</option>{options.cohorts.map((cohort) => <option key={cohort.id} value={cohort.id}>{cohort.name} ({cohort.code}) — {cohort.status}</option>)}</select></label>
        <label className="grid gap-2 text-sm font-semibold"><span>Student Discipleship Route (optional)</span><select name="student_discipleship_route" className={field}><option value="">All routes</option><option value="foundational">Foundational</option><option value="advanced">Advanced</option></select></label>
        <label className="grid gap-2 text-sm font-semibold"><span>Student Skill Pathway (optional)</span><select name="student_skill_pathway" className={field}><option value="">All pathways</option><option value="web_development">Web Development</option><option value="cybersecurity_foundations">Cybersecurity Foundations</option></select></label>
        <label className="grid gap-2 text-sm font-semibold"><span>Student Learning Mode (optional)</span><select name="student_learning_mode" className={field}><option value="">All modes</option><option value="physical">Physical</option><option value="online">Online</option></select></label>
        <label className="grid gap-2 text-sm font-semibold"><span>Explicit Students (optional)</span><select name="explicit_student_ids" multiple className={`${field} min-h-36`}>{options.students.map((student) => <option key={student.id} value={student.id}>{student.name} — {student.email}</option>)}</select><span className="text-xs font-normal text-slate-500">When selected, only these eligible students receive the announcement.</span></label>
        <label className="grid gap-2 text-sm font-semibold"><span>Explicit Facilitators (optional)</span><select name="explicit_facilitator_ids" multiple className={`${field} min-h-36`}>{options.facilitators.map((facilitator) => <option key={facilitator.id} value={facilitator.id}>{facilitator.name} — {facilitator.email}</option>)}</select><span className="text-xs font-normal text-slate-500">When selected, only these eligible facilitators receive the announcement.</span></label>
        <label className="grid gap-2 text-sm font-semibold"><span>CTA Button Label (optional)</span><input name="call_to_action_label" maxLength={120} placeholder="Join Session / View Information" className={field} /></label>
        <label className="grid gap-2 text-sm font-semibold"><span>CTA URL (optional)</span><input name="call_to_action_url" placeholder="https://… or /portal/path" className={field} /></label>
        <label className="grid gap-2 text-sm font-semibold"><span>Pinned Until (optional)</span><input name="pinned_until" type="datetime-local" className={field} /></label>
        <label className="grid gap-2 text-sm font-semibold"><span>Expires At (optional)</span><input name="expires_at" type="datetime-local" className={field} /></label>
      </div>
      <div className="flex flex-wrap gap-4 rounded-xl bg-slate-50 p-4 text-sm font-semibold"><label className="flex items-center gap-2"><input name="publish_to_portal" type="checkbox" defaultChecked />Publish to portal</label><label className="flex items-center gap-2"><input name="send_email" type="checkbox" />Send email</label></div>
      <label className="grid gap-2 text-sm font-semibold"><span>Delivery State</span><select name="announcement_status" className={field}><option value="draft">Create Draft</option><option value="published">Publish Now</option></select></label>
      <button disabled={busy === "create"} className="w-fit rounded-lg bg-[#071327] px-5 py-3 text-sm font-semibold text-white disabled:opacity-60">{busy === "create" ? "Saving…" : "Save Announcement"}</button>
    </form>
    <section><h2 className="text-xl font-semibold text-[#071327]">Announcement History</h2><div className="mt-4 grid gap-4">{announcements.map((announcement) => { const recipients = announcement.institutional_announcement_recipients || []; const sent = recipients.filter((recipient) => recipient.email_status === "sent").length; const failed = recipients.filter((recipient) => recipient.email_status === "failed").length; return <article key={announcement.id} className="rounded-2xl border border-slate-200 bg-white p-5"><div className="flex flex-wrap items-start justify-between gap-4"><div><p className="text-xs font-semibold uppercase tracking-wide text-amber-800">{announcement.audience.replaceAll("_", " & ")} · {announcement.announcement_status}</p><h3 className="mt-2 text-lg font-semibold text-[#071327]">{announcement.title}</h3></div><span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold">{recipients.length} recipients</span></div><p className="mt-3 whitespace-pre-line text-sm leading-6 text-slate-600">{announcement.message}</p><p className="mt-3 text-xs text-slate-500">Portal: {announcement.publish_to_portal ? "Yes" : "No"} · Email requested: {announcement.send_email ? "Yes" : "No"} · Sent: {sent} · Failed: {failed}</p><div className="mt-4 flex flex-wrap gap-2">{announcement.announcement_status === "draft" ? <button disabled={Boolean(busy)} onClick={() => void action(announcement.id, "publish")} className="rounded-lg bg-[#071327] px-4 py-2 text-sm font-semibold text-white">Publish</button> : null}{failed ? <button disabled={Boolean(busy)} onClick={() => void action(announcement.id, "retry")} className="rounded-lg border border-amber-400 px-4 py-2 text-sm font-semibold text-amber-900">Resend Failed Emails</button> : null}{announcement.announcement_status !== "archived" ? <button disabled={Boolean(busy)} onClick={() => void action(announcement.id, "archive")} className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold">Archive</button> : null}</div></article>; })}{!announcements.length ? <p className="rounded-xl border border-slate-200 bg-white p-5 text-slate-600">No institutional announcements have been created.</p> : null}</div></section>
  </div>;
}
