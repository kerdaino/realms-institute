"use client";

import Link from "next/link";
import { useCallback, useEffect, useState, type FormEvent, type ReactNode } from "react";

import { AdminMessage } from "@/components/admin/DashboardStats";
import { Badge } from "@/components/admin/RegistrationsManager";
import { applicationStatusLabels, applicationStatuses } from "@/lib/applicationStatus";
import type { AdminRegistration } from "@/lib/adminRegistrations";
import {
  advancedEntryStatusLabels,
  alumniVerificationStatusLabels,
  applicantTypeLabels,
  assignedRouteLabels,
  labelOrValue,
  paymentStatusLabels,
  requestedRouteLabels,
  scholarshipStatusLabels,
  type ReviewEvent,
} from "@/lib/registrationReview";

type ScreeningReview = {
  objective: Array<{ id: string; question: string; options: Array<{ value: string; label: string }>; applicantAnswer: string | null; correctAnswer: string; isCorrect: boolean }>;
  shortAnswers: Array<{ id: string; question: string; response: string }>;
};

type StudentProvisioning = { id: string; student_number: string; profile_id: string | null; student_status: string; onboarding_status: string };

export function RegistrationDetail({ id }: { id: string }) {
  const [registration, setRegistration] = useState<AdminRegistration | null>(null);
  const [screeningReview, setScreeningReview] = useState<ScreeningReview | null>(null);
  const [reviewEvents, setReviewEvents] = useState<ReviewEvent[]>([]);
  const [message, setMessage] = useState("");
  const [actionMessage, setActionMessage] = useState("");
  const [saving, setSaving] = useState("");
  const [resending, setResending] = useState(false);
  const [resendMessage, setResendMessage] = useState("");
  const [alumniNote, setAlumniNote] = useState("");
  const [screeningNote, setScreeningNote] = useState("");
  const [shortAnswer1Score, setShortAnswer1Score] = useState("0");
  const [shortAnswer2Score, setShortAnswer2Score] = useState("0");
  const [scholarshipNote, setScholarshipNote] = useState("");
  const [approvedAmount, setApprovedAmount] = useState("");
  const [adminNote, setAdminNote] = useState("");
  const [studentProvisioning, setStudentProvisioning] = useState<StudentProvisioning | null>(null);
  const [provisioning, setProvisioning] = useState(false);
  const [portalSending, setPortalSending] = useState(false);

  const loadRegistration = useCallback(async () => {
    const response = await fetch(`/api/admin/registrations/${encodeURIComponent(id)}`, { cache: "no-store" });
    const body = await response.json();
    if (!response.ok) throw new Error(body.message || "Registration could not be loaded.");
    const next = body.registration as AdminRegistration;
    setRegistration(next);
    setScreeningReview(body.screeningReview || null);
    setReviewEvents(body.reviewEvents || []);
    setStudentProvisioning(body.studentProvisioning || null);
    setAlumniNote(next.alumni_review_note || "");
    setScreeningNote(next.screening_review_note || "");
    setShortAnswer1Score(String(next.screening_short_answer_1_score ?? 0));
    setShortAnswer2Score(String(next.screening_short_answer_2_score ?? 0));
    setScholarshipNote(next.scholarship_review_note || "");
    setApprovedAmount(next.scholarship_approved_amount === null || next.scholarship_approved_amount === undefined ? "" : String(next.scholarship_approved_amount));
    setAdminNote(next.admin_note || "");
  }, [id]);

  useEffect(() => {
    let active = true;
    fetch(`/api/admin/registrations/${encodeURIComponent(id)}`, { cache: "no-store" })
      .then(async (response) => {
        const body = await response.json();
        if (!response.ok) throw new Error(body.message || "Registration could not be loaded.");
        return body;
      })
      .then((body) => {
        if (!active) return;
        const next = body.registration as AdminRegistration;
        setRegistration(next);
        setScreeningReview(body.screeningReview || null);
        setReviewEvents(body.reviewEvents || []);
        setStudentProvisioning(body.studentProvisioning || null);
        setAlumniNote(next.alumni_review_note || "");
        setScreeningNote(next.screening_review_note || "");
        setShortAnswer1Score(String(next.screening_short_answer_1_score ?? 0));
        setShortAnswer2Score(String(next.screening_short_answer_2_score ?? 0));
        setScholarshipNote(next.scholarship_review_note || "");
        setApprovedAmount(next.scholarship_approved_amount === null || next.scholarship_approved_amount === undefined ? "" : String(next.scholarship_approved_amount));
        setAdminNote(next.admin_note || "");
      })
      .catch((error) => { if (active) setMessage(error instanceof Error ? error.message : "Registration could not be loaded."); });
    return () => { active = false; };
  }, [id]);

  async function patchReview(endpoint: string, payload: Record<string, unknown>, key: string) {
    setSaving(key);
    setActionMessage("");
    try {
      const response = await fetch(`/api/admin/registrations/${encodeURIComponent(id)}/${endpoint}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
      const body = await response.json();
      if (!response.ok) throw new Error(body.message || "Review decision could not be saved.");
      await loadRegistration();
      setActionMessage(body.message || "Review decision saved.");
    } catch (error) {
      setActionMessage(error instanceof Error ? error.message : "Review decision could not be saved.");
    } finally {
      setSaving("");
    }
  }

  async function updateAdmissionStatus(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving("admission");
    setActionMessage("");
    const form = new FormData(event.currentTarget);
    try {
      const response = await fetch(`/api/admin/registrations/${encodeURIComponent(id)}/status`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ applicationStatus: form.get("applicationStatus"), sendEmail: form.get("sendEmail") === "on" }) });
      const body = await response.json();
      if (!response.ok) throw new Error(body.message || "Admission status could not be saved.");
      await loadRegistration();
      setActionMessage(body.emailStatus?.sent ? "Admission status saved and status update email sent." : "Admission status saved.");
    } catch (error) {
      setActionMessage(error instanceof Error ? error.message : "Admission status could not be saved.");
    } finally {
      setSaving("");
    }
  }

  async function saveAdminNote(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await patchReview("notes", { adminNote }, "note");
  }

  async function resendApplicationEmails() {
    setResending(true);
    setResendMessage("");
    try {
      const response = await fetch(`/api/admin/registrations/${encodeURIComponent(id)}/resend-emails`, { method: "POST" });
      const body = await response.json();
      if (!response.ok) throw new Error(body.message || "Application emails could not be resent.");
      await loadRegistration();
      const applicant = body.emailStatus?.applicant?.sent ? "applicant sent" : `applicant: ${body.emailStatus?.applicant?.reason || "not sent"}`;
      const admin = body.emailStatus?.admin?.sent ? "admin sent" : `admin: ${body.emailStatus?.admin?.reason || "not sent"}`;
      setResendMessage(`Resend attempted (${applicant}; ${admin}).`);
    } catch (error) {
      setResendMessage(error instanceof Error ? error.message : "Application emails could not be resent.");
    } finally {
      setResending(false);
    }
  }

  async function provisionStudent() {
    if (!window.confirm("Provision this admitted applicant as a student and create the approved cohort and course enrolments?")) return;
    setProvisioning(true);
    setActionMessage("");
    try {
      const response = await fetch(`/api/admin/registrations/${encodeURIComponent(id)}/provision-student`, { method: "POST" });
      const body = await response.json();
      if (!response.ok) throw new Error(body.message || "Student account could not be provisioned.");
      await loadRegistration();
      setActionMessage(`Student ${body.student_number} provisioned. Portal access remains a separate action.`);
    } catch (error) {
      setActionMessage(error instanceof Error ? error.message : "Student account could not be provisioned.");
    } finally {
      setProvisioning(false);
    }
  }

  async function sendPortalAccess() {
    if (!studentProvisioning || !window.confirm(`Send a secure portal access email for ${studentProvisioning.student_number}?`)) return;
    setPortalSending(true);
    setActionMessage("");
    try {
      const response = await fetch(`/api/admin/students/${studentProvisioning.id}/portal-access`, { method: "POST" });
      const body = await response.json();
      if (!response.ok) throw new Error(body.message || "Portal access could not be sent.");
      setActionMessage("Portal access email sent.");
    } catch (error) {
      setActionMessage(error instanceof Error ? error.message : "Portal access could not be sent.");
    } finally {
      setPortalSending(false);
    }
  }

  if (message) return <AdminMessage message={message} />;
  if (!registration) return <p className="text-slate-600">Loading registration...</p>;
  const liveShortScore = numericScore(shortAnswer1Score) + numericScore(shortAnswer2Score);
  const liveTotal = Number(registration.screening_objective_score || 0) + liveShortScore;

  return <div className="space-y-6">
    <Link href="/admin/registrations" className="text-sm font-semibold text-amber-800 hover:underline">Back to registrations</Link>
    {actionMessage ? <AdminMessage message={actionMessage} /> : null}

    <Section title="A. Applicant Information"><Details items={[["Full Name", registration.full_name], ["Email", registration.email], ["WhatsApp", registration.whatsapp], ["Country", registration.country], ["State / City", registration.city], ["Gender", registration.gender], ["Age Range", registration.age_range], ["Church / Fellowship", registration.church || "Not provided"], ["Applicant Type", applicantTypeLabels[registration.applicant_type]], ["Submitted", formatDate(registration.created_at)]]} /></Section>

    <Section title="B. Programme Selection"><Details items={[["Requested Discipleship Route", requestedRouteLabels[registration.requested_discipleship_route]], ["Assigned Discipleship Route", registration.assigned_discipleship_route ? assignedRouteLabels[registration.assigned_discipleship_route] : "Not Yet Assigned"], ["Skill Pathway", registration.skill_pathway], ["Skill Pathway Learning Mode", registration.learning_mode], ["Reason for Joining", registration.reason], ["Referral Source", registration.referral_source], ["Computer Access", registration.computer_access_confirmed ? "Confirmed" : "Not confirmed"]]} /><p className="mt-5 rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm leading-6 text-slate-700">Route approval and admission are separate decisions. An assigned discipleship route does not mark this applicant admitted.</p></Section>

    <Section title="C. Advanced Entry">
      <Details items={[["Advanced Entry Status", advancedEntryStatusLabels[registration.advanced_entry_status]], ["Alumni Verification Status", alumniVerificationStatusLabels[registration.alumni_verification_status]], ["Reviewed At", formatDate(registration.alumni_reviewed_at || null)], ["Reviewed By", registration.alumni_reviewed_by || "Not reviewed"]]} />
      {registration.applicant_type === "realms_alumnus" ? <div className="mt-6 border-t border-slate-200 pt-6"><h3 className="font-semibold text-[#071327]">Previous REALMS Participation</h3><Details items={[["Previous Cohort", registration.alumni_previous_cohort || "Not provided"], ["Previous Email", registration.alumni_previous_email || "Not provided"], ["Previous Phone", registration.alumni_previous_phone || "Not provided"], ["Previous Student ID", registration.alumni_student_id || "Not provided"]]} /><ReviewNote label="Alumni Review Note" value={alumniNote} onChange={setAlumniNote} /><div className="mt-4 flex flex-wrap gap-3"><ActionButton disabled={Boolean(saving)} onClick={() => void patchReview("alumni-review", { action: "verify_alumni", reviewNote: alumniNote }, "alumni")}>Verify Alumni</ActionButton><ActionButton tone="danger" disabled={Boolean(saving)} onClick={() => void patchReview("alumni-review", { action: "unable_to_verify", reviewNote: alumniNote }, "alumni")}>Unable to Verify</ActionButton><ActionButton tone="secondary" disabled={Boolean(saving)} onClick={() => void patchReview("alumni-review", { action: "request_more_information", reviewNote: alumniNote }, "alumni")}>Request More Information</ActionButton></div><SeparationNotice /></div> : null}
      {registration.applicant_type === "prior_theological_education" ? <div className="mt-6 border-t border-slate-200 pt-6"><h3 className="font-semibold text-[#071327]">Previous Theological Training</h3><Details items={[["Institution / Ministry", registration.theological_institution || "Not provided"], ["Programme / Course", registration.theological_programme || "Not provided"], ["Duration", registration.theological_duration || "Not provided"], ["Year Completed", registration.theological_year_completed || "Not provided"], ["Qualification", registration.theological_qualification || "Not provided"]]} /></div> : null}
      {registration.applicant_type === "new_student" ? <p className="mt-5 text-sm text-slate-600">Advanced-entry review is not applicable to this foundational-route application.</p> : null}
    </Section>

    <Section title="D. Foundational Screening">
      {registration.applicant_type !== "prior_theological_education" ? <p className="mt-4 text-sm text-slate-600">Foundational screening is not required for this applicant type.</p> : <><Details items={[["Screening Status", labelOrValue({}, registration.screening_status)], ["Objective Score", `${registration.screening_objective_score ?? 0} / ${registration.screening_objective_max ?? 50}`], ["Short Answer Score", registration.screening_short_answer_score === null || registration.screening_short_answer_score === undefined ? "Not scored" : `${registration.screening_short_answer_score} / 50`], ["Total Score", registration.screening_total_score === null || registration.screening_total_score === undefined ? "Not calculated" : `${registration.screening_total_score} / 100`], ["Percentage", registration.screening_percentage === null || registration.screening_percentage === undefined ? "Not calculated" : `${registration.screening_percentage}%`], ["Reviewed At", formatDate(registration.screening_reviewed_at || null)], ["Reviewed By", registration.screening_reviewed_by || "Not reviewed"]]} />
        <div className="mt-6 grid gap-4">{screeningReview?.objective.map((item, index) => { const selected = item.options.find((option) => option.value === item.applicantAnswer); const correct = item.options.find((option) => option.value === item.correctAnswer); return <article key={item.id} className={`rounded-xl border p-4 ${item.isCorrect ? "border-emerald-200 bg-emerald-50/50" : "border-red-200 bg-red-50/40"}`}><div className="flex flex-wrap items-start justify-between gap-3"><h3 className="max-w-3xl font-semibold leading-6 text-[#071327]">{index + 1}. {item.question}</h3><Badge tone={item.isCorrect ? "green" : "red"}>{item.isCorrect ? "Correct" : "Incorrect"}</Badge></div><p className="mt-3 text-sm text-slate-700"><strong>Applicant answer:</strong> {item.applicantAnswer || "No answer"}{selected ? ` — ${selected.label}` : ""}</p>{!item.isCorrect ? <p className="mt-2 text-sm text-emerald-800"><strong>Correct answer:</strong> {item.correctAnswer}{correct ? ` — ${correct.label}` : ""}</p> : null}</article>; })}</div>
        <div className="mt-6 grid gap-5">{screeningReview?.shortAnswers.map((item, index) => <article key={item.id} className="rounded-xl border border-slate-200 bg-slate-50 p-4"><h3 className="font-semibold leading-6 text-[#071327]">Short Answer {index + 1}: {item.question}</h3><p className="mt-3 whitespace-pre-wrap text-sm leading-7 text-slate-700">{item.response || "No response recorded."}</p></article>)}</div>
        <div className="mt-6 grid gap-4 rounded-xl border border-amber-200 bg-amber-50 p-5 sm:grid-cols-2"><ScoreField label="Short Answer 1 Score" value={shortAnswer1Score} onChange={setShortAnswer1Score} /><ScoreField label="Short Answer 2 Score" value={shortAnswer2Score} onChange={setShortAnswer2Score} /><div className="sm:col-span-2"><p className="text-sm text-amber-950">Calculated short-answer score: <strong>{liveShortScore} / 50</strong> · Total: <strong>{liveTotal} / 100</strong> · Percentage: <strong>{liveTotal}%</strong></p></div></div>
        <ReviewNote label="Screening Review Note (optional)" value={screeningNote} onChange={setScreeningNote} />
        <div className="mt-4 flex flex-wrap gap-3"><ActionButton disabled={Boolean(saving)} onClick={() => void patchReview("screening-review", { action: "approve_advanced", shortAnswer1Score, shortAnswer2Score, reviewNote: screeningNote }, "screening")}>Approve Advanced Entry</ActionButton><ActionButton tone="secondary" disabled={Boolean(saving)} onClick={() => void patchReview("screening-review", { action: "require_foundational", shortAnswer1Score, shortAnswer2Score, reviewNote: screeningNote }, "screening")}>Require Foundational Route</ActionButton><ActionButton tone="secondary" disabled={Boolean(saving)} onClick={() => void patchReview("screening-review", { action: "request_more_information", shortAnswer1Score, shortAnswer2Score, reviewNote: screeningNote }, "screening")}>Request More Information</ActionButton></div><SeparationNotice /></>}
    </Section>

    <Section title="E. Scholarship / Funding" id="scholarship-review">
      <Details items={[["Funding Route", registration.funding_route === "scholarship_request" ? "Scholarship Request" : "Self-Pay"], ["Scholarship Status", scholarshipStatusLabels[registration.scholarship_status]], ["Normal Application Fee", registration.public_fee_display || registration.amount_display || `${registration.currency} ${registration.amount}`], ["Approved Scholarship Amount", registration.scholarship_approved_amount === null || registration.scholarship_approved_amount === undefined ? "Not approved" : `${registration.currency} ${Number(registration.scholarship_approved_amount).toLocaleString("en")}`], ["Reviewed At", formatDate(registration.scholarship_reviewed_at || null)], ["Reviewed By", registration.scholarship_reviewed_by || "Not reviewed"]]} />
      {registration.funding_route === "scholarship_request" ? <><Details items={[["Reason", registration.scholarship_reason || "Not provided"], ["Financial Situation", registration.scholarship_financial_situation || "Not provided"], ["Can Contribute?", registration.scholarship_can_contribute === null || registration.scholarship_can_contribute === undefined ? "Not provided" : registration.scholarship_can_contribute ? "Yes" : "No"], ["Contribution Amount", registration.scholarship_contribution_amount === null || registration.scholarship_contribution_amount === undefined ? "None" : `${registration.currency} ${Number(registration.scholarship_contribution_amount).toLocaleString("en")}`]]} /><label className="mt-5 grid gap-2 text-sm font-semibold text-slate-800"><span>Approved Scholarship Amount (required for partial approval)</span><input type="number" min="1" max={Math.max(1, Number(registration.amount) - 1)} value={approvedAmount} onChange={(event) => setApprovedAmount(event.target.value)} className="min-h-12 rounded-xl border border-slate-300 px-4 font-normal" /></label><ReviewNote label="Scholarship Review Note (optional)" value={scholarshipNote} onChange={setScholarshipNote} /><div className="mt-4 flex flex-wrap gap-3"><ActionButton disabled={Boolean(saving)} onClick={() => void patchReview("scholarship-review", { action: "approve_full", reviewNote: scholarshipNote }, "scholarship")}>Approve Full Scholarship</ActionButton><ActionButton tone="secondary" disabled={Boolean(saving)} onClick={() => void patchReview("scholarship-review", { action: "approve_partial", approvedAmount, reviewNote: scholarshipNote }, "scholarship")}>Approve Partial Scholarship</ActionButton><ActionButton tone="danger" disabled={Boolean(saving)} onClick={() => void patchReview("scholarship-review", { action: "decline", reviewNote: scholarshipNote }, "scholarship")}>Decline Scholarship</ActionButton><ActionButton tone="secondary" disabled={Boolean(saving)} onClick={() => void patchReview("scholarship-review", { action: "request_more_information", reviewNote: scholarshipNote }, "scholarship")}>Request More Information</ActionButton></div><SeparationNotice /></> : <p className="mt-5 text-sm text-slate-600">This applicant did not request scholarship support.</p>}
    </Section>

    <Section title="F. Payment"><Details items={[["Expected Fee", registration.amount_display || registration.public_fee_display || `${registration.currency} ${registration.amount}`], ["Amount Paid", formatAmountPaid(registration)], ["Currency", registration.currency], ["Payment Reference", registration.payment_reference || "Not created"], ["Payment Status", labelOrValue(paymentStatusLabels, registration.payment_status)], ["Paid At", formatDate(registration.paid_at)]]} /></Section>

    <Section title="G. Admission Review"><Details items={[["Admission Status", applicationStatusLabels[registration.application_status]], ["Reviewed At", formatDate(registration.reviewed_at)], ["Reviewed By", registration.reviewed_by || "Not reviewed"]]} /><p className="mt-5 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm leading-6 text-amber-950">Admission remains separately controlled. Advanced-route or scholarship approval does not admit this applicant.</p><form onSubmit={updateAdmissionStatus} className="mt-6 grid gap-4"><label className="grid gap-2 text-sm font-semibold text-slate-800"><span>Admission Status</span><select name="applicationStatus" defaultValue={registration.application_status} className="min-h-12 rounded-xl border border-slate-300 bg-white px-4 text-sm font-normal text-slate-950">{applicationStatuses.map((status) => <option key={status} value={status}>{applicationStatusLabels[status]}</option>)}</select></label><label className="flex items-start gap-3 rounded-xl border border-slate-200 bg-[#f7f5ef] p-4 text-sm leading-6 text-slate-700"><input name="sendEmail" type="checkbox" className="mt-1 size-4 accent-[#a47720]" /><span>Send existing admission/status update email to applicant</span></label><ActionButton submit disabled={Boolean(saving)}>{saving === "admission" ? "Saving..." : "Save Admission Status"}</ActionButton></form></Section>

    <Section title="H. Student Account & Enrolment">{studentProvisioning ? <><Details items={[["Student ID", studentProvisioning.student_number], ["Student Status", labelOrValue({}, studentProvisioning.student_status)], ["Onboarding", labelOrValue({}, studentProvisioning.onboarding_status)], ["Portal Account", studentProvisioning.profile_id ? "Linked" : "Not linked"]]} /><div className="mt-5 flex flex-wrap gap-3"><Link href={`/admin/students/${studentProvisioning.id}`} className="rounded-lg bg-[#071327] px-5 py-3 text-sm font-semibold text-white">View student record</Link><ActionButton tone="secondary" disabled={portalSending || !studentProvisioning.profile_id} onClick={() => void sendPortalAccess()}>{portalSending ? "Sending..." : "Send / Resend Portal Access"}</ActionButton></div></> : registration.application_status === "admitted" && registration.assigned_discipleship_route && ["Web Development", "Cybersecurity Foundations"].includes(registration.skill_pathway) ? <><p className="text-sm leading-6 text-slate-700">This admitted application has an approved route and skill pathway and is eligible for deliberate student provisioning.</p><p className="mt-3 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm leading-6 text-amber-950">Confirm the admission decision and approved route before provisioning. This creates the institutional student record, Auth link, cohort enrolment, and required course enrolments. Portal email is sent separately.</p><div className="mt-5"><ActionButton disabled={provisioning} onClick={() => void provisionStudent()}>{provisioning ? "Provisioning..." : "Provision Student Account"}</ActionButton></div></> : <p className="text-sm leading-6 text-slate-600">Provisioning becomes available only after admission and an approved discipleship route and skill pathway are recorded.</p>}</Section>

    <Section title="I. Email Status"><Details items={[["Applicant Payment Confirmation", registration.confirmation_email_sent ? "Sent" : "Not sent"], ["Applicant Payment Confirmation Sent At", formatDate(registration.confirmation_email_sent_at)], ["Paid Application Admin Notification", registration.admin_email_sent ? "Sent" : "Not sent"], ["Paid Application Admin Notification Sent At", formatDate(registration.admin_email_sent_at)], ["Scholarship Applicant Confirmation", registration.scholarship_confirmation_email_sent ? "Sent" : "Not sent"], ["Scholarship Applicant Confirmation Sent At", formatDate(registration.scholarship_confirmation_email_sent_at || null)], ["Scholarship Admin Notification", registration.scholarship_admin_email_sent ? "Sent" : "Not sent"], ["Scholarship Admin Notification Sent At", formatDate(registration.scholarship_admin_email_sent_at || null)], ["Admission/Status Email", registration.admission_email_sent ? "Sent" : "Not sent"], ["Admission/Status Sent At", formatDate(registration.admission_email_sent_at)]]} /><button type="button" disabled={resending || registration.payment_status !== "success"} onClick={resendApplicationEmails} className="mt-5 rounded-lg border border-[#071327] px-5 py-3 text-sm font-semibold text-[#071327] hover:bg-[#071327] hover:text-white disabled:cursor-not-allowed disabled:opacity-60">{resending ? "Resending..." : "Resend Application Emails"}</button>{registration.payment_status !== "success" ? <p className="mt-3 text-sm text-slate-600">Payment-confirmation emails remain unavailable without verified successful payment.</p> : null}{resendMessage ? <p className="mt-4 text-sm font-semibold text-slate-700">{resendMessage}</p> : null}</Section>

    <Section title="I. Admin Notes"><form onSubmit={saveAdminNote} className="grid gap-4"><ReviewNote label="General Admin Note" value={adminNote} onChange={setAdminNote} /><ActionButton submit disabled={Boolean(saving)}>{saving === "note" ? "Saving..." : "Save Admin Note"}</ActionButton></form><Details items={[["Note Updated At", formatDate(registration.admin_note_updated_at || null)], ["Note Updated By", registration.admin_note_updated_by || "Not recorded"]]} /><div className="mt-7 border-t border-slate-200 pt-6"><h3 className="font-semibold text-[#071327]">Advanced Entry & Scholarship Review History</h3>{reviewEvents.length ? <div className="mt-4 grid gap-3">{reviewEvents.map((event) => <article key={event.id} className="rounded-xl border border-slate-200 bg-slate-50 p-4"><div className="flex flex-wrap items-center justify-between gap-3"><p className="font-semibold capitalize text-[#071327]">{event.event_type ? event.event_type.replaceAll("_", " ") : "Review event"}</p><span className="text-xs text-slate-500">{formatDate(event.created_at)}</span></div><p className="mt-2 text-sm text-slate-600">Reviewed by {event.actor || "REALMS Admin"}</p>{event.note ? <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-slate-700">{event.note}</p> : <p className="mt-2 text-sm text-slate-500">No review note recorded.</p>}</article>)}</div> : <p className="mt-3 text-sm text-slate-600">No advanced-entry or scholarship decisions have been recorded yet.</p>}</div></Section>
  </div>;
}

function Section({ title, children, id }: { title: string; children: ReactNode; id?: string }) { return <section id={id} className="scroll-mt-24 rounded-2xl border border-slate-200 bg-white p-5 sm:p-6"><h2 className="text-lg font-semibold text-[#071327]">{title}</h2>{children}</section>; }
function Details({ items }: { items: Array<[string, string]> }) { return <dl className="mt-5 grid gap-5 sm:grid-cols-2">{items.map(([label, value]) => <div key={label}><dt className="text-xs font-semibold uppercase tracking-wide text-slate-500">{label}</dt><dd className="mt-1 whitespace-pre-wrap break-words text-sm leading-6 text-slate-900">{value}</dd></div>)}</dl>; }
function ReviewNote({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) { return <label className="mt-5 grid gap-2 text-sm font-semibold text-slate-800"><span>{label}</span><textarea value={value} onChange={(event) => onChange(event.target.value)} rows={4} className="rounded-xl border border-slate-300 bg-white px-4 py-3 font-normal text-slate-950" /></label>; }
function ScoreField({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) { return <label className="grid gap-2 text-sm font-semibold text-amber-950"><span>{label} (0–25)</span><input required type="number" min="0" max="25" step="0.5" value={value} onChange={(event) => onChange(event.target.value)} className="min-h-12 rounded-xl border border-amber-300 bg-white px-4 font-normal text-slate-950" /></label>; }
function ActionButton({ children, onClick, disabled, tone = "primary", submit = false }: { children: ReactNode; onClick?: () => void; disabled?: boolean; tone?: "primary" | "secondary" | "danger"; submit?: boolean }) { const tones = { primary: "bg-[#071327] text-white hover:bg-[#102344]", secondary: "border border-slate-300 bg-white text-slate-800 hover:border-amber-500", danger: "border border-red-300 bg-red-50 text-red-800 hover:bg-red-100" }; return <button type={submit ? "submit" : "button"} onClick={onClick} disabled={disabled} className={`w-fit rounded-lg px-5 py-3 text-sm font-semibold disabled:cursor-not-allowed disabled:opacity-60 ${tones[tone]}`}>{children}</button>; }
function SeparationNotice() { return <p className="mt-4 rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm leading-6 text-slate-700">This decision only controls advanced-entry eligibility or scholarship support. It does not change admission status.</p>; }
function formatDate(value: string | null) { return value ? new Intl.DateTimeFormat("en", { dateStyle: "long", timeStyle: "short" }).format(new Date(value)) : "Not recorded"; }
function formatAmountPaid(registration: AdminRegistration) { const amountPaid = registration.amount_paid ?? (registration.payment_status === "success" ? Number(registration.amount) : null); return amountPaid === null ? "Not yet paid" : `${registration.currency} ${amountPaid.toLocaleString("en")}`; }
function numericScore(value: string) { const parsed = Number(value); return Number.isFinite(parsed) && parsed >= 0 && parsed <= 25 ? parsed : 0; }
