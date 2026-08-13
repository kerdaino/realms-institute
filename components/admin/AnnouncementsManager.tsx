"use client";

import { useRef, useState, type FormEvent } from "react";

type Option = { id: string; name: string; email?: string; code?: string; status?: string };
type Preview = { students: { confirmed: number; conditional: number; total: number }; facilitators: number; totalUniqueEmailRecipients: number; portalRecipients: number; emailOnlyRecipients: number };
type PreviewResult = { preview: Preview; previewToken: string };
type Recipient = { id: string; email_status: string; email_sent_at: string | null };
type Announcement = {
  id: string;
  title: string;
  message: string;
  audience: string;
  announcement_status: string;
  publish_to_portal: boolean;
  send_email: boolean;
  published_at: string | null;
  expires_at: string | null;
  created_at: string;
  institutional_announcement_recipients: Recipient[];
  recipient_summary?: Preview;
  delivery_summary?: { sent: number; failed: number };
};

const field = "min-h-12 rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm text-slate-950";

function PreviewCard({ preview }: { preview: Preview }) {
  return <div className="grid gap-3 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-950 sm:grid-cols-2 lg:grid-cols-5">
    <p><strong className="block text-lg">{preview.students.confirmed}</strong>confirmed / active students</p>
    <p><strong className="block text-lg">{preview.students.conditional}</strong>conditional admission</p>
    <p><strong className="block text-lg">{preview.facilitators}</strong>facilitators</p>
    <p><strong className="block text-lg">{preview.totalUniqueEmailRecipients}</strong>unique email recipients</p>
    <p><strong className="block text-lg">{preview.portalRecipients}</strong>portal-visible accounts</p>
  </div>;
}

function payloadFromForm(formElement: HTMLFormElement) {
  const form = new FormData(formElement);
  const values = Object.fromEntries(form);
  const cohortScope = String(form.get("cohort_scope") || "specific");
  return {
    ...values,
    announcement_status: String(form.get("announcement_status") || "draft"),
    cohort_scope: cohortScope,
    all_active_cohorts: cohortScope === "active",
    cohort_id: cohortScope === "specific" ? form.get("cohort_id") : null,
    publish_to_portal: form.get("publish_to_portal") === "on",
    send_email: form.get("send_email") === "on",
    student_discipleship_route: form.get("student_discipleship_route") || null,
    student_skill_pathway: form.get("student_skill_pathway") || null,
    student_learning_mode: form.get("student_learning_mode") || null,
    explicit_student_ids: form.getAll("explicit_student_ids"),
    explicit_facilitator_ids: form.getAll("explicit_facilitator_ids"),
  };
}

export function AnnouncementsManager({ initialAnnouncements, options }: { initialAnnouncements: Announcement[]; options: { cohorts: Option[]; students: Option[]; facilitators: Option[] } }) {
  const formRef = useRef<HTMLFormElement>(null);
  const [announcements, setAnnouncements] = useState(initialAnnouncements);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState("");
  const [cohortScope, setCohortScope] = useState("specific");
  const [preview, setPreview] = useState<PreviewResult | null>(null);
  const [draftPreviews, setDraftPreviews] = useState<Record<string, PreviewResult>>({});
  const [savedWithDeliveryFailure, setSavedWithDeliveryFailure] = useState(false);

  async function refresh() {
    const response = await fetch("/api/admin/announcements", { cache: "no-store" });
    const body = await response.json();
    if (!response.ok) throw new Error(body.message || "Announcements could not be refreshed.");
    setAnnouncements(body.announcements || []);
  }

  function invalidatePreview() {
    setPreview(null);
    setSavedWithDeliveryFailure(false);
  }

  async function previewNewRecipients() {
    const formElement = formRef.current;
    if (!formElement) return;
    setBusy("preview"); setMessage("");
    try {
      const response = await fetch("/api/admin/announcements/preview", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payloadFromForm(formElement)) });
      const body = await response.json();
      if (!response.ok) throw new Error(body.message || "Announcement recipients could not be previewed.");
      setPreview(body);
      setMessage("Recipient preview refreshed from current server records. Delivery will resolve and verify this set again.");
    } catch (error) { setMessage(error instanceof Error ? error.message : "Announcement recipients could not be previewed."); }
    finally { setBusy(""); }
  }

  async function create(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const submittedForm = event.currentTarget;
    const payload = payloadFromForm(submittedForm);
    if (payload.announcement_status === "published" && !preview) {
      setMessage("Preview recipients before publishing or sending this announcement.");
      return;
    }
    setBusy("create"); setMessage("");
    try {
      const response = await fetch("/api/admin/announcements", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...payload, recipient_preview_token: preview?.previewToken }) });
      const body = await response.json();
      if (!response.ok) throw new Error(body.message || "Announcement could not be saved.");
      await refresh();
      const deliveryFailed = Boolean(body.delivery?.failed);
      setSavedWithDeliveryFailure(deliveryFailed);
      setMessage(`${body.message}${body.recipientPreview ? ` ${body.recipientPreview.totalUniqueEmailRecipients} unique email recipients and ${body.recipientPreview.portalRecipients} portal-visible accounts resolved.` : " Draft targeting was saved without requiring recipients."}${body.delivery ? ` Email: ${body.delivery.sent} sent, ${body.delivery.failed} failed.${deliveryFailed ? " Use Resend Failed Emails in history; the form has been preserved." : ""}` : ""}`);
      if (!deliveryFailed) {
        submittedForm.reset();
        setCohortScope("specific");
        setPreview(null);
      }
    } catch (error) { setMessage(error instanceof Error ? error.message : "Announcement could not be saved."); }
    finally { setBusy(""); }
  }

  async function previewDraft(id: string) {
    setBusy(`preview:${id}`); setMessage("");
    try {
      const response = await fetch(`/api/admin/announcements/${id}/preview`, { method: "POST" });
      const body = await response.json();
      if (!response.ok) throw new Error(body.message || "Draft recipients could not be previewed.");
      setDraftPreviews((current) => ({ ...current, [id]: body }));
      setMessage("Draft recipient preview refreshed. Confirm publish below to re-verify and use this set.");
    } catch (error) { setMessage(error instanceof Error ? error.message : "Draft recipients could not be previewed."); }
    finally { setBusy(""); }
  }

  async function action(id: string, operation: "publish" | "archive" | "retry") {
    const draftPreview = draftPreviews[id];
    if (operation === "publish" && !draftPreview) { setMessage("Preview this draft's recipients before publishing."); return; }
    setBusy(`${operation}:${id}`); setMessage("");
    try {
      const response = await fetch(`/api/admin/announcements/${id}/${operation}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: operation === "publish" ? JSON.stringify({ recipient_preview_token: draftPreview.previewToken }) : undefined });
      const body = await response.json();
      if (!response.ok) throw new Error(body.message || "Announcement action failed.");
      await refresh();
      setDraftPreviews((current) => { const next = { ...current }; delete next[id]; return next; });
      setMessage(`${body.message}${body.recipientPreview ? ` ${body.recipientPreview.totalUniqueEmailRecipients} unique email recipients and ${body.recipientPreview.portalRecipients} portal-visible accounts resolved.` : ""}${body.delivery ? ` Email: ${body.delivery.sent} sent, ${body.delivery.failed} failed.` : ""}`);
    } catch (error) { setMessage(error instanceof Error ? error.message : "Announcement action failed."); }
    finally { setBusy(""); }
  }

  return <div className="space-y-8">
    {message ? <p className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm leading-6 text-amber-950" role="status">{message}</p> : null}
    <form ref={formRef} onSubmit={create} onChange={invalidatePreview} className="grid gap-5 rounded-2xl border border-slate-200 bg-white p-5 sm:p-7">
      <div><h2 className="text-xl font-semibold text-[#071327]">Create Announcement</h2><p className="mt-2 text-sm leading-6 text-slate-600">Recipients are resolved from eligible REALMS cohort, enrolment, admission, and facilitator records on the server. Drafts do not appear in portals or send email.</p></div>
      <label className="grid gap-2 text-sm font-semibold"><span>Title *</span><input name="title" required maxLength={240} className={field} /></label>
      <label className="grid gap-2 text-sm font-semibold"><span>Message *</span><textarea name="message" required rows={7} className={field} /></label>
      <div className="grid gap-4 md:grid-cols-2">
        <label className="grid gap-2 text-sm font-semibold"><span>Audience</span><select name="audience" className={field}><option value="students">Students</option><option value="facilitators">Facilitators</option><option value="students_facilitators">Students &amp; Facilitators</option></select></label>
        <label className="grid gap-2 text-sm font-semibold"><span>Cohort Scope</span><select name="cohort_scope" value={cohortScope} onChange={(event) => setCohortScope(event.target.value)} className={field}><option value="specific">Specific Cohort</option><option value="current_upcoming">All Current / Upcoming Cohorts</option><option value="active">All Active Cohorts</option></select></label>
        <label className="grid gap-2 text-sm font-semibold"><span>Specific Cohort</span><select name="cohort_id" required={cohortScope === "specific"} disabled={cohortScope !== "specific"} className={field}><option value="">Select cohort</option>{options.cohorts.map((cohort) => <option key={cohort.id} value={cohort.id}>{cohort.name} ({cohort.code}) — {cohort.status}</option>)}</select></label>
        <label className="grid gap-2 text-sm font-semibold"><span>Student Recipient Status</span><select name="student_recipient_status" defaultValue="confirmed_conditional" className={field}><option value="enrolled_active">Enrolled / Active Students</option><option value="confirmed_active">Enrolled + Admitted Students</option><option value="confirmed_conditional">Enrolled + Admitted + Conditional Admission</option></select><span className="text-xs font-normal text-slate-500">Pending review, waitlisted, not admitted, deleted, and lapsed offers are excluded.</span></label>
        <label className="grid gap-2 text-sm font-semibold"><span>Student Discipleship Route (optional)</span><select name="student_discipleship_route" className={field}><option value="">All routes</option><option value="foundational">Foundational</option><option value="advanced">Advanced</option></select></label>
        <label className="grid gap-2 text-sm font-semibold"><span>Student Skill Pathway (optional)</span><select name="student_skill_pathway" className={field}><option value="">All pathways</option><option value="web_development">Web Development</option><option value="cybersecurity_foundations">Cybersecurity Foundations</option></select></label>
        <label className="grid gap-2 text-sm font-semibold"><span>Student Learning Mode (optional)</span><select name="student_learning_mode" className={field}><option value="">All modes</option><option value="physical">Physical</option><option value="online">Online</option></select></label>
        <label className="grid gap-2 text-sm font-semibold"><span>Explicit Provisioned Students (optional)</span><select name="explicit_student_ids" multiple className={`${field} min-h-36`}>{options.students.map((student) => <option key={student.id} value={student.id}>{student.name} — {student.email}</option>)}</select><span className="text-xs font-normal text-slate-500">When selected, only these eligible provisioned students receive the student delivery; applicant records are not added.</span></label>
        <label className="grid gap-2 text-sm font-semibold"><span>Explicit Facilitators (optional)</span><select name="explicit_facilitator_ids" multiple className={`${field} min-h-36`}>{options.facilitators.map((facilitator) => <option key={facilitator.id} value={facilitator.id}>{facilitator.name} — {facilitator.email}</option>)}</select><span className="text-xs font-normal text-slate-500">Selected facilitators must still have a valid assignment in the selected cohort scope.</span></label>
        <label className="grid gap-2 text-sm font-semibold"><span>CTA Button Label (optional)</span><input name="call_to_action_label" maxLength={120} placeholder="Join Session / View Information" className={field} /></label>
        <label className="grid gap-2 text-sm font-semibold"><span>CTA URL (optional)</span><input name="call_to_action_url" placeholder="https://… or /portal/path" className={field} /></label>
        <label className="grid gap-2 text-sm font-semibold"><span>Pinned Until (optional)</span><input name="pinned_until" type="datetime-local" className={field} /></label>
        <label className="grid gap-2 text-sm font-semibold"><span>Expires At (optional)</span><input name="expires_at" type="datetime-local" className={field} /></label>
      </div>
      <div className="flex flex-wrap gap-4 rounded-xl bg-slate-50 p-4 text-sm font-semibold"><label className="flex items-center gap-2"><input name="publish_to_portal" type="checkbox" defaultChecked />Publish to portal where authorised accounts exist</label><label className="flex items-center gap-2"><input name="send_email" type="checkbox" />Send email</label></div>
      <label className="grid gap-2 text-sm font-semibold"><span>Delivery State</span><select name="announcement_status" className={field}><option value="draft">Create Draft</option><option value="published">Publish Now</option></select></label>
      {preview ? <PreviewCard preview={preview.preview} /> : null}
      <div className="flex flex-wrap gap-3"><button type="button" onClick={() => void previewNewRecipients()} disabled={Boolean(busy)} className="rounded-lg border border-amber-500 px-5 py-3 text-sm font-semibold text-amber-950 disabled:opacity-60">{busy === "preview" ? "Resolving…" : "Preview Recipients"}</button><button disabled={busy === "create" || savedWithDeliveryFailure} className="rounded-lg bg-[#071327] px-5 py-3 text-sm font-semibold text-white disabled:opacity-60">{busy === "create" ? "Saving…" : "Save Announcement"}</button></div>
    </form>
    <section><h2 className="text-xl font-semibold text-[#071327]">Announcement History</h2><div className="mt-4 grid gap-4">{announcements.map((announcement) => { const summary = announcement.recipient_summary; const draftPreview = draftPreviews[announcement.id]; return <article key={announcement.id} className="rounded-2xl border border-slate-200 bg-white p-5"><div className="flex flex-wrap items-start justify-between gap-4"><div><p className="text-xs font-semibold uppercase tracking-wide text-amber-800">{announcement.audience.replaceAll("_", " & ")} · {announcement.announcement_status}</p><h3 className="mt-2 text-lg font-semibold text-[#071327]">{announcement.title}</h3></div><span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold">{summary?.totalUniqueEmailRecipients ?? 0} unique email recipients</span></div><p className="mt-3 whitespace-pre-line text-sm leading-6 text-slate-600">{announcement.message}</p>{summary ? <p className="mt-3 text-xs text-slate-500">Confirmed: {summary.students.confirmed} · Conditional: {summary.students.conditional} · Facilitators: {summary.facilitators} · Portal-visible accounts: {summary.portalRecipients}</p> : null}<p className="mt-2 text-xs text-slate-500">Portal requested: {announcement.publish_to_portal ? "Yes" : "No"} · Email requested: {announcement.send_email ? "Yes" : "No"} · Sent: {announcement.delivery_summary?.sent ?? 0} · Failed: {announcement.delivery_summary?.failed ?? 0}</p>{draftPreview ? <div className="mt-4"><PreviewCard preview={draftPreview.preview} /></div> : null}<div className="mt-4 flex flex-wrap gap-2">{announcement.announcement_status === "draft" ? <><button disabled={Boolean(busy)} onClick={() => void previewDraft(announcement.id)} className="rounded-lg border border-amber-400 px-4 py-2 text-sm font-semibold text-amber-900">Preview Recipients</button>{draftPreview ? <button disabled={Boolean(busy)} onClick={() => void action(announcement.id, "publish")} className="rounded-lg bg-[#071327] px-4 py-2 text-sm font-semibold text-white">Confirm Publish</button> : null}</> : null}{(announcement.delivery_summary?.failed ?? 0) > 0 ? <button disabled={Boolean(busy)} onClick={() => void action(announcement.id, "retry")} className="rounded-lg border border-amber-400 px-4 py-2 text-sm font-semibold text-amber-900">Resend Failed Emails</button> : null}{announcement.announcement_status !== "archived" ? <button disabled={Boolean(busy)} onClick={() => void action(announcement.id, "archive")} className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold">Archive</button> : null}</div></article>; })}{!announcements.length ? <p className="rounded-xl border border-slate-200 bg-white p-5 text-slate-600">No institutional announcements have been created.</p> : null}</div></section>
  </div>;
}
