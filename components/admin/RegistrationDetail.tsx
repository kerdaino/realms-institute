"use client";

import Link from "next/link";
import { useCallback, useEffect, useState, type FormEvent, type ReactNode } from "react";

import { AdminMessage } from "@/components/admin/DashboardStats";
import { Badge } from "@/components/admin/RegistrationsManager";
import { applicationStatusLabels, applicationStatuses } from "@/lib/applicationStatus";
import { applicationDeletionReasonLabels, applicationDeletionReasons, type ApplicationDeletionReason } from "@/lib/applicationLifecycle";
import type { AdminRegistration } from "@/lib/adminRegistrations";
import { isFinancialRequirementSatisfied, scholarshipFinancialSummary } from "@/lib/scholarshipFinance";
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
type CanonicalCandidate = Pick<AdminRegistration, "id" | "full_name" | "email" | "created_at" | "payment_status" | "scholarship_status" | "advanced_entry_status" | "application_status">;
type SupersedingApplication = Pick<AdminRegistration, "id" | "full_name" | "email" | "created_at">;
type PaymentReconciliationPreview = {
  outcome: "ready" | "already_reconciled" | "rejected";
  message: string;
  canApply: boolean;
  reference: string;
  transactionStatus: string;
  transactionId: string | null;
  amountReceived: number;
  currency: string;
  paidAt: string | null;
  customerEmail: string | null;
  paymentChannel: string | null;
  gatewayStatus: string | null;
  currentRealmsAmountDue: number | null;
  excessAmount: number;
  shortfallAmount: number;
  applicationReference: string | null;
  binding: string | null;
};

const advancedEntryDecisionEmailLabels: Record<string, string> = {
  advanced_approved: "Approved Advanced",
  foundation_required: "Foundational Required",
  more_information_required: "More Information",
};

export function RegistrationDetail({ id }: { id: string }) {
  const [registration, setRegistration] = useState<AdminRegistration | null>(null);
  const [screeningReview, setScreeningReview] = useState<ScreeningReview | null>(null);
  const [reviewEvents, setReviewEvents] = useState<ReviewEvent[]>([]);
  const [message, setMessage] = useState("");
  const [actionMessage, setActionMessage] = useState("");
  const [saving, setSaving] = useState("");
  const [resending, setResending] = useState(false);
  const [resendMessage, setResendMessage] = useState("");
  const [resendingScholarship, setResendingScholarship] = useState(false);
  const [resendingAdvancedEntry, setResendingAdvancedEntry] = useState(false);
  const [paystackReference, setPaystackReference] = useState("");
  const [reconciliationPreview, setReconciliationPreview] = useState<PaymentReconciliationPreview | null>(null);
  const [reconcilingPayment, setReconcilingPayment] = useState<"preview" | "apply" | "">("");
  const [reconciliationMessage, setReconciliationMessage] = useState("");
  const [alumniNote, setAlumniNote] = useState("");
  const [screeningNote, setScreeningNote] = useState("");
  const [advancedEntryApplicantMessage, setAdvancedEntryApplicantMessage] = useState("");
  const [shortAnswer1Score, setShortAnswer1Score] = useState("0");
  const [shortAnswer2Score, setShortAnswer2Score] = useState("0");
  const [scholarshipNote, setScholarshipNote] = useState("");
  const [scholarshipApplicantMessage, setScholarshipApplicantMessage] = useState("");
  const [approvedAmount, setApprovedAmount] = useState("");
  const [adminNote, setAdminNote] = useState("");
  const [studentProvisioning, setStudentProvisioning] = useState<StudentProvisioning | null>(null);
  const [provisioning, setProvisioning] = useState(false);
  const [portalSending, setPortalSending] = useState(false);
  const [canonicalCandidates, setCanonicalCandidates] = useState<CanonicalCandidate[]>([]);
  const [supersedingApplication, setSupersedingApplication] = useState<SupersedingApplication | null>(null);
  const [showRemoval, setShowRemoval] = useState(false);
  const [deletionReason, setDeletionReason] = useState<ApplicationDeletionReason | "">("");
  const [deletionNote, setDeletionNote] = useState("");
  const [supersededByApplicationId, setSupersededByApplicationId] = useState("");
  const [deleteConfirmation, setDeleteConfirmation] = useState("");
  const [removing, setRemoving] = useState(false);
  const [showRestore, setShowRestore] = useState(false);
  const [restoreConfirmation, setRestoreConfirmation] = useState("");
  const [restoring, setRestoring] = useState(false);
  const [newPaymentDeadline, setNewPaymentDeadline] = useState("");
  const [paymentDeadlineReason, setPaymentDeadlineReason] = useState("");
  const [extendingDeadline, setExtendingDeadline] = useState(false);

  const loadRegistration = useCallback(async () => {
    const response = await fetch(`/api/admin/registrations/${encodeURIComponent(id)}`, { cache: "no-store" });
    const body = await response.json();
    if (!response.ok) throw new Error(body.message || "Registration could not be loaded.");
    const next = body.registration as AdminRegistration;
    setRegistration(next);
    setScreeningReview(body.screeningReview || null);
    setReviewEvents(body.reviewEvents || []);
    setStudentProvisioning(body.studentProvisioning || null);
    setCanonicalCandidates(body.canonicalCandidates || []);
    setSupersedingApplication(body.supersedingApplication || null);
    setAlumniNote(next.alumni_review_note || "");
    setScreeningNote(next.screening_review_note || "");
    setAdvancedEntryApplicantMessage(next.advanced_entry_applicant_message || "");
    setShortAnswer1Score(String(next.screening_short_answer_1_score ?? 0));
    setShortAnswer2Score(String(next.screening_short_answer_2_score ?? 0));
    setScholarshipNote(next.scholarship_review_note || "");
    setScholarshipApplicantMessage(next.scholarship_applicant_message || "");
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
        setCanonicalCandidates(body.canonicalCandidates || []);
        setSupersedingApplication(body.supersedingApplication || null);
        setAlumniNote(next.alumni_review_note || "");
        setScreeningNote(next.screening_review_note || "");
        setAdvancedEntryApplicantMessage(next.advanced_entry_applicant_message || "");
        setShortAnswer1Score(String(next.screening_short_answer_1_score ?? 0));
        setShortAnswer2Score(String(next.screening_short_answer_2_score ?? 0));
        setScholarshipNote(next.scholarship_review_note || "");
        setScholarshipApplicantMessage(next.scholarship_applicant_message || "");
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
      setActionMessage(body.emailStatus?.sent ? "Admission status saved and status update email sent." : body.emailStatus?.reason ? `Admission status saved, but email was not sent: ${body.emailStatus.reason}` : "Admission status saved.");
    } catch (error) {
      setActionMessage(error instanceof Error ? error.message : "Admission status could not be saved.");
    } finally {
      setSaving("");
    }
  }

  async function extendPaymentDeadline(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setExtendingDeadline(true);
    setActionMessage("");
    try {
      const parsed = new Date(newPaymentDeadline);
      if (!Number.isFinite(parsed.valueOf())) throw new Error("Enter a valid new payment deadline.");
      const response = await fetch(`/api/admin/registrations/${encodeURIComponent(id)}/payment-deadline`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ newDeadline: parsed.toISOString(), reason: paymentDeadlineReason, sendEmail: true }),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.message || "Payment deadline could not be extended.");
      await loadRegistration();
      setNewPaymentDeadline("");
      setPaymentDeadlineReason("");
      setActionMessage(body.emailStatus?.sent ? `${body.message} Applicant notified.` : body.emailStatus?.reason ? `${body.message} Email was not sent: ${body.emailStatus.reason}` : body.message);
    } catch (error) {
      setActionMessage(error instanceof Error ? error.message : "Payment deadline could not be extended.");
    } finally {
      setExtendingDeadline(false);
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

  async function resendScholarshipDecisionEmail() {
    setResendingScholarship(true);
    setResendMessage("");
    try {
      const response = await fetch(`/api/admin/registrations/${encodeURIComponent(id)}/scholarship-decision-email`, { method: "POST" });
      const body = await response.json();
      if (!response.ok) throw new Error(body.message || "Scholarship decision email could not be sent.");
      await loadRegistration();
      setResendMessage(body.message || "Scholarship decision email sent.");
    } catch (error) {
      setResendMessage(error instanceof Error ? error.message : "Scholarship decision email could not be sent.");
    } finally {
      setResendingScholarship(false);
    }
  }

  async function resendAdvancedEntryDecisionEmail() {
    setResendingAdvancedEntry(true);
    setResendMessage("");
    try {
      const response = await fetch(`/api/admin/registrations/${encodeURIComponent(id)}/advanced-entry-decision-email`, { method: "POST" });
      const body = await response.json();
      if (!response.ok) throw new Error(body.message || "Advanced-entry decision email could not be sent.");
      await loadRegistration();
      setResendMessage(body.message || "Advanced-entry decision email sent.");
    } catch (error) {
      setResendMessage(error instanceof Error ? error.message : "Advanced-entry decision email could not be sent.");
    } finally {
      setResendingAdvancedEntry(false);
    }
  }

  async function verifyPaymentForReconciliation(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setReconcilingPayment("preview");
    setReconciliationMessage("");
    setReconciliationPreview(null);
    try {
      const response = await fetch(`/api/admin/registrations/${encodeURIComponent(id)}/payment-reconciliation`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "preview", reference: paystackReference }),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.message || "The Paystack transaction could not be verified.");
      setReconciliationPreview(body.preview);
      setReconciliationMessage(body.preview?.message || "Paystack verification completed.");
    } catch (error) {
      setReconciliationMessage(error instanceof Error ? error.message : "The Paystack transaction could not be verified.");
    } finally {
      setReconcilingPayment("");
    }
  }

  async function applyPaymentReconciliation() {
    if (!reconciliationPreview?.canApply || !window.confirm("Apply this independently verified Paystack payment to this application? This will not change admission status or the scholarship decision.")) return;
    setReconcilingPayment("apply");
    setReconciliationMessage("");
    try {
      const response = await fetch(`/api/admin/registrations/${encodeURIComponent(id)}/payment-reconciliation`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "apply", reference: paystackReference }),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.message || "The payment reconciliation could not be applied.");
      setReconciliationPreview(body.preview);
      const applicantEmail = body.emailStatus?.applicant?.sent ? " Applicant confirmation sent." : body.emailStatus?.applicant?.reason === "Already sent." ? " Applicant confirmation was already sent." : "";
      setReconciliationMessage(`${body.message || "Payment reconciliation completed."}${applicantEmail}`);
      await loadRegistration();
    } catch (error) {
      setReconciliationMessage(error instanceof Error ? error.message : "The payment reconciliation could not be applied.");
    } finally {
      setReconcilingPayment("");
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
      setActionMessage(`Student ${body.student_number} provisioned. ${body.portal_access?.message || "Review the student record to confirm portal email delivery."}`);
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
      const response = await fetch(`/api/admin/students/${studentProvisioning.id}/portal-access`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ mode: "activation" }) });
      const body = await response.json();
      if (!response.ok) throw new Error(body.message || "Portal access could not be sent.");
      setActionMessage(body.message || "Portal access email sent.");
    } catch (error) {
      setActionMessage(error instanceof Error ? error.message : "Portal access could not be sent.");
    } finally {
      setPortalSending(false);
    }
  }

  async function removeApplication() {
    setRemoving(true);
    setActionMessage("");
    try {
      const response = await fetch(`/api/admin/registrations/${encodeURIComponent(id)}/removal`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          confirmation: deleteConfirmation,
          reason: deletionReason,
          note: deletionNote,
          supersededByApplicationId: supersededByApplicationId || null,
        }),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.message || "Application could not be removed safely.");
      setShowRemoval(false);
      setDeleteConfirmation("");
      await loadRegistration();
      setActionMessage(body.message);
    } catch (error) {
      setActionMessage(error instanceof Error ? error.message : "Application could not be removed safely.");
    } finally {
      setRemoving(false);
    }
  }

  async function restoreApplication() {
    setRestoring(true);
    setActionMessage("");
    try {
      const response = await fetch(`/api/admin/registrations/${encodeURIComponent(id)}/restore`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ confirmation: restoreConfirmation }),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.message || "Application could not be restored safely.");
      setShowRestore(false);
      setRestoreConfirmation("");
      await loadRegistration();
      setActionMessage(body.message);
    } catch (error) {
      setActionMessage(error instanceof Error ? error.message : "Application could not be restored safely.");
    } finally {
      setRestoring(false);
    }
  }

  if (message) return <AdminMessage message={message} />;
  if (!registration) return <p className="text-slate-600">Loading registration...</p>;
  const liveShortScore = numericScore(shortAnswer1Score) + numericScore(shortAnswer2Score);
  const liveTotal = Number(registration.screening_objective_score || 0) + liveShortScore;
  const scholarshipFinancials = scholarshipFinancialSummary({
    normalFee: Number(registration.amount),
    scholarshipStatus: registration.scholarship_status,
    approvedScholarshipAmount: registration.scholarship_approved_amount,
    amountPaid: registration.amount_paid,
    paymentStatus: registration.payment_status,
  });
  const financialSatisfied = isFinancialRequirementSatisfied(registration);
  const hasAdvancedEntryDecision = ["advanced_approved", "foundation_required", "more_information_required"].includes(registration.advanced_entry_status);
  const currentAdvancedEntryDecisionWasSent = Boolean(
    registration.advanced_entry_decision_email_sent
    && registration.advanced_entry_decision_email_type === registration.advanced_entry_status,
  );
  const currentAdvancedEntryAttemptFailed = Boolean(
    registration.advanced_entry_decision_email_last_attempt_type === registration.advanced_entry_status
    && registration.advanced_entry_decision_email_error,
  );
  const advancedEntryEmailStatus = currentAdvancedEntryDecisionWasSent ? "Sent" : currentAdvancedEntryAttemptFailed ? "Failed" : "Not sent";

  if (registration.deleted_at) {
    return <div className="space-y-6">
      <Link href="/admin/applications?recordScope=deleted" className="text-sm font-semibold text-amber-800 hover:underline">Back to deleted applications</Link>
      {actionMessage ? <AdminMessage message={actionMessage} /> : null}
      <section className="rounded-2xl border border-red-300 bg-red-50 p-5 sm:p-6">
        <div className="flex flex-wrap items-center gap-3"><h2 className="text-xl font-semibold text-red-950">Deleted application</h2><Badge tone="red">Deleted</Badge></div>
        <p className="mt-3 text-sm leading-6 text-red-900">This record is excluded from active admissions queues and communications. Its decisions, payment evidence, email history, audit events, and any provisioned student records remain intact.</p>
        <Details items={[["Deletion Reason", registration.deletion_reason ? applicationDeletionReasonLabels[registration.deletion_reason] : "Not recorded"], ["Deleted At", formatDate(registration.deleted_at)], ["Deleted By", registration.deleted_by || "Not recorded"], ["Administrative Note", registration.deletion_note || "Not provided"], ["Superseded By", supersedingApplication ? `${supersedingApplication.full_name} — ${formatDate(supersedingApplication.created_at)}` : "Not recorded"]]} />
        {supersedingApplication ? <Link href={`/admin/applications/${supersedingApplication.id}`} className="mt-4 inline-block text-sm font-semibold text-red-900 underline">Open application being kept</Link> : null}
      </section>
      <Section title="Applicant & Application"><Details items={[["Applicant", registration.full_name], ["Email", registration.email], ["Cohort", registration.cohort_code], ["Application Date", formatDate(registration.created_at)], ["Payment Status", labelOrValue(paymentStatusLabels, registration.payment_status)], ["Scholarship Status", scholarshipStatusLabels[registration.scholarship_status]], ["Advanced Entry Status", advancedEntryStatusLabels[registration.advanced_entry_status]], ["Admission Status", applicationStatusLabels[registration.application_status]]]} /></Section>
      <Section title="Preserved Financial & Communication History"><Details items={[["Amount Paid", formatAmountPaid(registration)], ["Payment Reference", registration.payment_reference || "Not created"], ["Paid At", formatDate(registration.paid_at)], ["Communication Recipient", registration.email], ["Scholarship Decision Email", registration.scholarship_decision_email_sent ? `Sent ${formatDate(registration.scholarship_decision_email_sent_at || null)}` : registration.scholarship_decision_email_error ? `Failed — ${registration.scholarship_decision_email_error}` : "Not sent"], ["Scholarship Email Type", registration.scholarship_decision_email_type ? labelOrValue(scholarshipStatusLabels, registration.scholarship_decision_email_type) : "Not recorded"], ["Advanced Entry Decision Email", registration.advanced_entry_decision_email_sent ? `Sent ${formatDate(registration.advanced_entry_decision_email_sent_at || null)}` : registration.advanced_entry_decision_email_error ? `Failed — ${registration.advanced_entry_decision_email_error}` : "Not sent"], ["Advanced Entry Email Type", registration.advanced_entry_decision_email_type ? labelOrValue(advancedEntryDecisionEmailLabels, registration.advanced_entry_decision_email_type) : "Not recorded"], ["Admission/Status Email", registration.admission_email_sent ? `Sent ${formatDate(registration.admission_email_sent_at)}` : "Not sent"]]} />{registration.payment_status === "success" || Number(registration.amount_paid || 0) > 0 ? <p className="mt-5 rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm leading-6 text-amber-950">This application contains payment history. Removing the application does not alter or refund the financial transaction.</p> : null}</Section>
      <Section title="Student Record">{studentProvisioning ? <><Details items={[["Student ID", studentProvisioning.student_number], ["Student Status", labelOrValue({}, studentProvisioning.student_status)], ["Onboarding", labelOrValue({}, studentProvisioning.onboarding_status)]]} /><p className="mt-5 rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm leading-6 text-amber-950">Deleting this application does not delete or withdraw the existing student record. Student withdrawal or de-enrolment remains a separate controlled process.</p><Link href={`/admin/students/${studentProvisioning.id}`} className="mt-4 inline-block text-sm font-semibold text-amber-900 underline">View preserved student record</Link></> : <p className="mt-4 text-sm text-slate-600">No provisioned student record is linked to this application.</p>}</Section>
      <Section title="Administrative Notes"><form onSubmit={saveAdminNote} className="grid gap-4"><ReviewNote label="General Admin Note" value={adminNote} onChange={setAdminNote} /><ActionButton submit disabled={Boolean(saving)}>{saving === "note" ? "Saving..." : "Save Admin Note"}</ActionButton></form></Section>
      <Section title="Audit History"><AuditHistory events={reviewEvents} /></Section>
      <section className="rounded-2xl border border-emerald-300 bg-emerald-50 p-5 sm:p-6"><h2 className="text-lg font-semibold text-emerald-950">Restore Application</h2><p className="mt-3 text-sm leading-6 text-emerald-900">Restoration returns this record to its current admissions queues. It does not resend old emails or repeat decisions.</p><div className="mt-5"><ActionButton onClick={() => setShowRestore(true)}>Restore Application</ActionButton></div></section>
      {showRestore ? <ConfirmationModal title="Restore Application" onClose={() => setShowRestore(false)}><p className="text-sm leading-6 text-slate-700">Restore <strong>{registration.full_name}</strong> to active admissions operations? Existing decisions and email history will remain unchanged.</p><label className="mt-5 grid gap-2 text-sm font-semibold text-slate-800"><span>Type RESTORE to confirm</span><input value={restoreConfirmation} onChange={(event) => setRestoreConfirmation(event.target.value)} className="min-h-12 rounded-xl border border-slate-300 px-4" /></label><div className="mt-5 flex gap-3"><ActionButton disabled={restoring || restoreConfirmation !== "RESTORE"} onClick={() => void restoreApplication()}>{restoring ? "Restoring..." : "Restore Application"}</ActionButton><ActionButton tone="secondary" disabled={restoring} onClick={() => setShowRestore(false)}>Cancel</ActionButton></div></ConfirmationModal> : null}
    </div>;
  }

  return <div className="space-y-6">
    <Link href="/admin/applications" className="text-sm font-semibold text-amber-800 hover:underline">Back to applications</Link>
    {actionMessage ? <AdminMessage message={actionMessage} /> : null}
    {canonicalCandidates.length ? <p className="rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm leading-6 text-amber-950"><strong>Potential duplicate:</strong> {canonicalCandidates.length + 1} active applications use {registration.email.trim().toLowerCase()} for {registration.cohort_code}. Review each record before deciding which one to retain.</p> : null}

    <Section title="A. Applicant Information"><Details items={[["Full Name", registration.full_name], ["Email", registration.email], ["WhatsApp", registration.whatsapp], ["Cohort", registration.cohort_code], ["Country", registration.country], ["State / City", registration.city], ["Gender", registration.gender], ["Age Range", registration.age_range], ["Church / Fellowship", registration.church || "Not provided"], ["Applicant Type", applicantTypeLabels[registration.applicant_type]], ["Submitted", formatDate(registration.created_at)]]} /></Section>

    <Section title="B. Programme Selection"><Details items={[["Requested Discipleship Route", requestedRouteLabels[registration.requested_discipleship_route]], ["Assigned Discipleship Route", registration.assigned_discipleship_route ? assignedRouteLabels[registration.assigned_discipleship_route] : "Not Yet Assigned"], ["Skill Pathway", registration.skill_pathway], ["Skill Pathway Learning Mode", registration.learning_mode], ["Reason for Joining", registration.reason], ["Referral Source", registration.referral_source], ["Computer Access", registration.computer_access_confirmed ? "Confirmed" : "Not confirmed"]]} /><p className="mt-5 rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm leading-6 text-slate-700">Route approval and admission are separate decisions. An assigned discipleship route does not mark this applicant admitted.</p></Section>

    <Section title="C. Advanced Entry">
      <Details items={[["Requested Discipleship Route", requestedRouteLabels[registration.requested_discipleship_route]], ["Current Advanced Entry Status", advancedEntryStatusLabels[registration.advanced_entry_status]], ["Assigned Discipleship Route", registration.assigned_discipleship_route ? assignedRouteLabels[registration.assigned_discipleship_route] : "Not Yet Assigned"], ["Alumni Verification Status", alumniVerificationStatusLabels[registration.alumni_verification_status]], ["Reviewed At", formatDate(registration.applicant_type === "realms_alumnus" ? registration.alumni_reviewed_at || null : registration.screening_reviewed_at || null)], ["Reviewed By", registration.applicant_type === "realms_alumnus" ? registration.alumni_reviewed_by || "Not reviewed" : registration.screening_reviewed_by || "Not reviewed"]]} />
      {registration.applicant_type === "realms_alumnus" ? <div className="mt-6 border-t border-slate-200 pt-6"><h3 className="font-semibold text-[#071327]">Previous REALMS Participation</h3><Details items={[["Previous Cohort", registration.alumni_previous_cohort || "Not provided"], ["Previous Email", registration.alumni_previous_email || "Not provided"], ["Previous Phone", registration.alumni_previous_phone || "Not provided"], ["Previous Student ID", registration.alumni_student_id || "Not provided"]]} /><ReviewNote label="Alumni Review Note" value={alumniNote} onChange={setAlumniNote} /><div className="mt-4 flex flex-wrap gap-3"><ActionButton disabled={Boolean(saving)} onClick={() => void patchReview("alumni-review", { action: "verify_alumni", reviewNote: alumniNote }, "alumni")}>Verify Alumni</ActionButton><ActionButton tone="danger" disabled={Boolean(saving)} onClick={() => void patchReview("alumni-review", { action: "unable_to_verify", reviewNote: alumniNote }, "alumni")}>Unable to Verify</ActionButton><ActionButton tone="secondary" disabled={Boolean(saving)} onClick={() => void patchReview("alumni-review", { action: "request_more_information", reviewNote: alumniNote }, "alumni")}>Request More Information</ActionButton></div><SeparationNotice /></div> : null}
      {registration.applicant_type === "prior_theological_education" ? <div className="mt-6 border-t border-slate-200 pt-6"><h3 className="font-semibold text-[#071327]">Previous Theological Training</h3><Details items={[["Institution / Ministry", registration.theological_institution || "Not provided"], ["Programme / Course", registration.theological_programme || "Not provided"], ["Duration", registration.theological_duration || "Not provided"], ["Year Completed", registration.theological_year_completed || "Not provided"], ["Qualification", registration.theological_qualification || "Not provided"]]} /></div> : null}
      {registration.applicant_type === "new_student" ? <p className="mt-5 text-sm text-slate-600">Advanced-entry review is not applicable to this foundational-route application.</p> : null}
    </Section>

    <Section title="D. Foundational Screening">
      {registration.applicant_type !== "prior_theological_education" ? <p className="mt-4 text-sm text-slate-600">Foundational screening is not required for this applicant type.</p> : <><Details items={[["Screening Status", labelOrValue({}, registration.screening_status)], ["Objective Score", `${registration.screening_objective_score ?? 0} / ${registration.screening_objective_max ?? 50}`], ["Short Answer Score", registration.screening_short_answer_score === null || registration.screening_short_answer_score === undefined ? "Not scored" : `${registration.screening_short_answer_score} / 50`], ["Total Score", registration.screening_total_score === null || registration.screening_total_score === undefined ? "Not calculated" : `${registration.screening_total_score} / 100`], ["Percentage", registration.screening_percentage === null || registration.screening_percentage === undefined ? "Not calculated" : `${registration.screening_percentage}%`], ["Reviewed At", formatDate(registration.screening_reviewed_at || null)], ["Reviewed By", registration.screening_reviewed_by || "Not reviewed"]]} />
        <div className="mt-6 grid gap-4">{screeningReview?.objective.map((item, index) => { const selected = item.options.find((option) => option.value === item.applicantAnswer); const correct = item.options.find((option) => option.value === item.correctAnswer); return <article key={item.id} className={`rounded-xl border p-4 ${item.isCorrect ? "border-emerald-200 bg-emerald-50/50" : "border-red-200 bg-red-50/40"}`}><div className="flex flex-wrap items-start justify-between gap-3"><h3 className="max-w-3xl font-semibold leading-6 text-[#071327]">{index + 1}. {item.question}</h3><Badge tone={item.isCorrect ? "green" : "red"}>{item.isCorrect ? "Correct" : "Incorrect"}</Badge></div><p className="mt-3 text-sm text-slate-700"><strong>Applicant answer:</strong> {item.applicantAnswer || "No answer"}{selected ? ` — ${selected.label}` : ""}</p>{!item.isCorrect ? <p className="mt-2 text-sm text-emerald-800"><strong>Correct answer:</strong> {item.correctAnswer}{correct ? ` — ${correct.label}` : ""}</p> : null}</article>; })}</div>
        <div className="mt-6 grid gap-5">{screeningReview?.shortAnswers.map((item, index) => <article key={item.id} className="rounded-xl border border-slate-200 bg-slate-50 p-4"><h3 className="font-semibold leading-6 text-[#071327]">Short Answer {index + 1}: {item.question}</h3><p className="mt-3 whitespace-pre-wrap text-sm leading-7 text-slate-700">{item.response || "No response recorded."}</p></article>)}</div>
        <div className="mt-6 grid gap-4 rounded-xl border border-amber-200 bg-amber-50 p-5 sm:grid-cols-2"><ScoreField label="Short Answer 1 Score" value={shortAnswer1Score} onChange={setShortAnswer1Score} /><ScoreField label="Short Answer 2 Score" value={shortAnswer2Score} onChange={setShortAnswer2Score} /><div className="sm:col-span-2"><p className="text-sm text-amber-950">Calculated short-answer score: <strong>{liveShortScore} / 50</strong> · Total: <strong>{liveTotal} / 100</strong> · Percentage: <strong>{liveTotal}%</strong></p></div></div>
        <ReviewNote label="Internal Screening Review Note (optional; never emailed)" value={screeningNote} onChange={setScreeningNote} />
        <ReviewNote label="Applicant Message (required only when requesting more information; included in email)" value={advancedEntryApplicantMessage} onChange={setAdvancedEntryApplicantMessage} />
        <div className="mt-4 flex flex-wrap gap-3"><ActionButton disabled={Boolean(saving)} onClick={() => void patchReview("screening-review", { action: "approve_advanced", shortAnswer1Score, shortAnswer2Score, reviewNote: screeningNote }, "screening")}>Approve Advanced Entry</ActionButton><ActionButton tone="secondary" disabled={Boolean(saving)} onClick={() => void patchReview("screening-review", { action: "require_foundational", shortAnswer1Score, shortAnswer2Score, reviewNote: screeningNote }, "screening")}>Require Foundational Route</ActionButton><ActionButton tone="secondary" disabled={Boolean(saving)} onClick={() => void patchReview("screening-review", { action: "request_more_information", shortAnswer1Score, shortAnswer2Score, reviewNote: screeningNote, applicantMessage: advancedEntryApplicantMessage }, "screening")}>Request More Information</ActionButton></div><div className="mt-5 border-t border-slate-200 pt-5"><ActionButton tone="secondary" disabled={resendingAdvancedEntry || !hasAdvancedEntryDecision} onClick={() => void resendAdvancedEntryDecisionEmail()}>{resendingAdvancedEntry ? "Sending..." : currentAdvancedEntryDecisionWasSent ? "Resend Advanced Entry Decision Email" : "Send Advanced Entry Decision Email"}</ActionButton><p className="mt-2 text-xs leading-5 text-slate-500">Uses the current saved advanced-entry decision. It does not change screening scores, route placement, scholarship, payment, admission or student provisioning.</p></div><SeparationNotice /></>}
    </Section>

    <Section title="E. Scholarship / Funding" id="scholarship-review">
      <Details items={[["Funding Route", registration.funding_route === "scholarship_request" ? "Scholarship Request" : "Self-Pay"], ["Scholarship Decision", scholarshipStatusLabels[registration.scholarship_status]], ["Normal Registration Fee", formatMoneyValue(registration.amount, registration.currency)], ["Approved Scholarship Support / Fee Waiver", scholarshipFinancials.approvedSupport === null ? "Not approved" : formatMoneyValue(scholarshipFinancials.approvedSupport, registration.currency)], ["Applicant Amount Due", scholarshipFinancials.amountDue === null ? "Not yet determined" : formatMoneyValue(scholarshipFinancials.amountDue, registration.currency)], ["Amount Paid", formatAmountPaid(registration)], ["Financial Requirement", labelOrValue({}, registration.financial_requirement_status)], ["Reviewed At", formatDate(registration.scholarship_reviewed_at || null)], ["Reviewed By", registration.scholarship_reviewed_by || "Not reviewed"]]} />
      {registration.funding_route === "scholarship_request" ? <><Details items={[["Reason", registration.scholarship_reason || "Not provided"], ["Financial Situation", registration.scholarship_financial_situation || "Not provided"], ["Applicant Said They Can Contribute", registration.scholarship_can_contribute === null || registration.scholarship_can_contribute === undefined ? "Not provided" : registration.scholarship_can_contribute ? "Yes" : "No"], ["Applicant-Proposed Contribution", registration.scholarship_contribution_amount === null || registration.scholarship_contribution_amount === undefined ? "None" : formatMoneyValue(registration.scholarship_contribution_amount, registration.currency)]]} /><label className="mt-5 grid gap-2 text-sm font-semibold text-slate-800"><span>Approved Scholarship Support / Fee Waiver (required for partial approval)</span><span className="text-xs font-normal leading-5 text-slate-500">This is the amount REALMS waives. Applicant amount due is the normal fee minus this support.</span><input type="number" min="1" max={Math.max(1, Number(registration.amount) - 1)} value={approvedAmount} onChange={(event) => setApprovedAmount(event.target.value)} className="min-h-12 rounded-xl border border-slate-300 px-4 font-normal" /></label><ReviewNote label="Internal Scholarship Review Note (never emailed)" value={scholarshipNote} onChange={setScholarshipNote} /><ReviewNote label="Applicant Message (required only when requesting more information; included in email)" value={scholarshipApplicantMessage} onChange={setScholarshipApplicantMessage} /><div className="mt-4 flex flex-wrap gap-3"><ActionButton disabled={Boolean(saving)} onClick={() => void patchReview("scholarship-review", { action: "approve_full", reviewNote: scholarshipNote }, "scholarship")}>Approve Full Scholarship</ActionButton><ActionButton tone="secondary" disabled={Boolean(saving)} onClick={() => void patchReview("scholarship-review", { action: "approve_partial", approvedAmount, reviewNote: scholarshipNote }, "scholarship")}>Approve Partial Scholarship</ActionButton><ActionButton tone="danger" disabled={Boolean(saving)} onClick={() => void patchReview("scholarship-review", { action: "decline", reviewNote: scholarshipNote }, "scholarship")}>Decline Scholarship</ActionButton><ActionButton tone="secondary" disabled={Boolean(saving)} onClick={() => void patchReview("scholarship-review", { action: "request_more_information", reviewNote: scholarshipNote, applicantMessage: scholarshipApplicantMessage }, "scholarship")}>Request More Information</ActionButton></div><div className="mt-5 border-t border-slate-200 pt-5"><ActionButton tone="secondary" disabled={resendingScholarship || !["approved_full", "approved_partial", "declined", "more_information_required"].includes(registration.scholarship_status)} onClick={() => void resendScholarshipDecisionEmail()}>{resendingScholarship ? "Sending..." : registration.scholarship_decision_email_sent ? "Resend Scholarship Decision Email" : "Send Scholarship Decision Email"}</ActionButton><p className="mt-2 text-xs leading-5 text-slate-500">Uses the current saved decision. It does not create or change a scholarship or admission decision.</p></div><SeparationNotice /></> : <p className="mt-5 text-sm text-slate-600">This applicant did not request scholarship support.</p>}
    </Section>

    <Section title="F. Payment"><Details items={[["Normal Registration Fee", formatMoneyValue(registration.amount, registration.currency)], ["Current Payment Expected", registration.payment_expected_amount === null ? "Not currently payable" : formatMoneyValue(registration.payment_expected_amount, registration.currency)], ["Amount Paid", formatAmountPaid(registration)], ["Currency", registration.currency], ["Payment Reference", registration.payment_reference || "Not created"], ["Payment Status", labelOrValue(paymentStatusLabels, registration.payment_status)], ["Financial Requirement", financialSatisfied ? "Satisfied" : "Payment required"], ["Paid At", formatDate(registration.paid_at)]]} /><div className="mt-7 border-t border-slate-200 pt-6"><h3 className="font-semibold text-[#071327]">Reconcile Paystack Payment</h3><p className="mt-2 text-sm leading-6 text-slate-600">Use this only when Paystack received a legitimate payment that REALMS did not record. REALMS will verify the reference directly with Paystack and require the transaction’s immutable application binding, stored payment reference, currency, and current amount due to match.</p><form onSubmit={verifyPaymentForReconciliation} className="mt-5 grid gap-4"><label className="grid gap-2 text-sm font-semibold text-slate-800"><span>Paystack Reference</span><input required autoComplete="off" maxLength={160} value={paystackReference} onChange={(event) => { setPaystackReference(event.target.value); setReconciliationPreview(null); setReconciliationMessage(""); }} className="min-h-12 rounded-xl border border-slate-300 bg-white px-4 font-normal text-slate-950" /></label><ActionButton submit disabled={Boolean(reconcilingPayment)}>{reconcilingPayment === "preview" ? "Verifying..." : "Verify Transaction"}</ActionButton></form>{reconciliationMessage ? <p className={`mt-4 rounded-xl border p-4 text-sm leading-6 ${reconciliationPreview?.outcome === "ready" ? "border-emerald-300 bg-emerald-50 text-emerald-950" : reconciliationPreview?.outcome === "already_reconciled" ? "border-slate-300 bg-slate-50 text-slate-800" : "border-amber-300 bg-amber-50 text-amber-950"}`}>{reconciliationMessage}</p> : null}{reconciliationPreview ? <div className="mt-5 rounded-xl border border-slate-200 bg-slate-50 p-4"><Details items={[["Paystack Status", labelOrValue({}, reconciliationPreview.transactionStatus)], ["Amount Received", formatMoneyValue(reconciliationPreview.amountReceived, reconciliationPreview.currency)], ["Currency", reconciliationPreview.currency || "Not returned"], ["Paid At", formatDate(reconciliationPreview.paidAt)], ["Customer Email", reconciliationPreview.customerEmail || "Not returned"], ["Current REALMS Amount Due", reconciliationPreview.currentRealmsAmountDue === null ? "Could not establish safely" : formatMoneyValue(reconciliationPreview.currentRealmsAmountDue, reconciliationPreview.currency)], ["Application Reference", reconciliationPreview.applicationReference || "Not safely matched"], ["Paystack Transaction ID", reconciliationPreview.transactionId || "Not returned"], ["Payment Channel", reconciliationPreview.paymentChannel || "Not returned"], ["Gateway Status", reconciliationPreview.gatewayStatus || "Not returned"], ["Binding Evidence", reconciliationPreview.binding || "Not established"], ["Excess Received", reconciliationPreview.excessAmount > 0 ? formatMoneyValue(reconciliationPreview.excessAmount, reconciliationPreview.currency) : "None"]]} />{reconciliationPreview.canApply ? <div className="mt-5"><ActionButton disabled={Boolean(reconcilingPayment)} onClick={() => void applyPaymentReconciliation()}>{reconcilingPayment === "apply" ? "Applying..." : "Apply Reconciliation"}</ActionButton></div> : null}</div> : null}<p className="mt-4 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm leading-6 text-amber-950">Reconciliation records verified payment only. It does not change scholarship support, admit the applicant, or provision a student account.</p></div></Section>

    <Section title="G. Admission Review"><Details items={[["Admission Status", applicationStatusLabels[registration.application_status]], ["Offer Issued At", formatDate(registration.admission_offer_at)], ["Payment Deadline", formatDate(registration.admission_payment_deadline)], ["Outstanding at Offer", registration.admission_outstanding_amount === null ? "Not applicable" : formatMoneyValue(registration.admission_outstanding_amount, registration.currency)], ["Admission Confirmed At", formatDate(registration.admission_confirmed_at)], ["Offer Lapsed At", formatDate(registration.admission_offer_lapsed_at)], ["Late Entry / Catch-Up", registration.late_entry_required ? `Required — flagged ${formatDate(registration.late_entry_flagged_at)}` : "Not flagged"], ["Reviewed At", formatDate(registration.reviewed_at)], ["Reviewed By", registration.reviewed_by || "Not reviewed"]]} /><p className="mt-5 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm leading-6 text-amber-950">Admission remains separately controlled. Advanced-route or scholarship approval does not admit this applicant. Use conditional admission when academic approval is complete but verified payment remains outstanding.</p><form onSubmit={updateAdmissionStatus} className="mt-6 grid gap-4"><label className="grid gap-2 text-sm font-semibold text-slate-800"><span>Admission Status</span><select name="applicationStatus" defaultValue={registration.application_status} className="min-h-12 rounded-xl border border-slate-300 bg-white px-4 text-sm font-normal text-slate-950">{applicationStatuses.map((status) => <option key={status} value={status}>{applicationStatusLabels[status]}</option>)}</select></label><label className="flex items-start gap-3 rounded-xl border border-slate-200 bg-[#f7f5ef] p-4 text-sm leading-6 text-slate-700"><input name="sendEmail" type="checkbox" className="mt-1 size-4 accent-[#a47720]" /><span>Send the appropriate branded admission/status email to the applicant</span></label><ActionButton submit disabled={Boolean(saving)}>{saving === "admission" ? "Saving..." : "Save Admission Status"}</ActionButton></form>{["conditional_admission_payment_outstanding", "admission_offer_lapsed_payment_outstanding"].includes(registration.application_status) ? <form onSubmit={extendPaymentDeadline} className="mt-7 grid gap-4 border-t border-slate-200 pt-6"><h3 className="font-semibold text-[#071327]">Extend Payment Deadline</h3><p className="text-sm leading-6 text-slate-600">A lapsed offer remains lapsed after extension. Reactivation requires a separate, deliberate admission-status decision.</p><label className="grid gap-2 text-sm font-semibold text-slate-800"><span>New Deadline</span><input required type="datetime-local" value={newPaymentDeadline} onChange={(event) => setNewPaymentDeadline(event.target.value)} className="min-h-12 rounded-xl border border-slate-300 px-4 font-normal" /></label><ReviewNote label="Reason for Extension" value={paymentDeadlineReason} onChange={setPaymentDeadlineReason} /><ActionButton submit disabled={extendingDeadline}>{extendingDeadline ? "Extending..." : "Extend Payment Deadline"}</ActionButton></form> : null}</Section>

    <Section title="H. Student Account & Enrolment">{studentProvisioning ? <><Details items={[["Student ID", studentProvisioning.student_number], ["Student Status", labelOrValue({}, studentProvisioning.student_status)], ["Onboarding", labelOrValue({}, studentProvisioning.onboarding_status)], ["Portal Identity", studentProvisioning.profile_id ? "Linked" : "Not linked"]]} /><div className="mt-5 flex flex-wrap gap-3"><Link href={`/admin/students/${studentProvisioning.id}`} className="rounded-lg bg-[#071327] px-5 py-3 text-sm font-semibold text-white">View student record</Link><ActionButton tone="secondary" disabled={portalSending} onClick={() => void sendPortalAccess()}>{portalSending ? "Sending..." : "Send / Resend Account Activation"}</ActionButton></div></> : registration.application_status === "admitted" && financialSatisfied && registration.assigned_discipleship_route && ["Web Development", "Cybersecurity Foundations"].includes(registration.skill_pathway) ? <><p className="text-sm leading-6 text-slate-700">This admitted application has an approved route, skill pathway, and satisfied financial requirement and is eligible for deliberate student provisioning.</p><p className="mt-3 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm leading-6 text-amber-950">Confirm the admission decision and approved route before provisioning. This creates or reuses one Supabase Auth identity, links the institutional student record, creates the cohort and course enrolments, and sends the appropriate activation, setup, or access-reminder email.</p><div className="mt-5"><ActionButton disabled={provisioning} onClick={() => void provisionStudent()}>{provisioning ? "Provisioning..." : "Provision Student Account"}</ActionButton></div></> : <p className="text-sm leading-6 text-slate-600">Provisioning becomes available only after admission, an approved route and skill pathway, and a financial requirement satisfied by verified payment or full scholarship coverage.</p>}</Section>

    <Section title="I. Email Status"><Details items={[["Applicant Payment Confirmation", registration.confirmation_email_sent ? "Sent" : "Not sent"], ["Applicant Payment Confirmation Sent At", formatDate(registration.confirmation_email_sent_at)], ["Paid Application Admin Notification", registration.admin_email_sent ? "Sent" : "Not sent"], ["Paid Application Admin Notification Sent At", formatDate(registration.admin_email_sent_at)], ["Advanced Entry Decision Email", advancedEntryEmailStatus], ["Advanced Entry Decision Type Sent", registration.advanced_entry_decision_email_type ? advancedEntryDecisionEmailLabels[registration.advanced_entry_decision_email_type] || labelOrValue({}, registration.advanced_entry_decision_email_type) : "Not sent"], ["Advanced Entry Decision Email Sent At", formatDate(registration.advanced_entry_decision_email_sent_at || null)], ["Advanced Entry Last Decision Email Attempt", formatDate(registration.advanced_entry_decision_email_last_attempted_at || null)], ["Advanced Entry Decision Email Failure", currentAdvancedEntryAttemptFailed ? registration.advanced_entry_decision_email_error || "Unknown delivery failure" : "None for current decision"], ["Scholarship Applicant Confirmation", registration.scholarship_confirmation_email_sent ? "Sent" : "Not sent"], ["Scholarship Applicant Confirmation Sent At", formatDate(registration.scholarship_confirmation_email_sent_at || null)], ["Scholarship Admin Notification", registration.scholarship_admin_email_sent ? "Sent" : "Not sent"], ["Scholarship Admin Notification Sent At", formatDate(registration.scholarship_admin_email_sent_at || null)], ["Scholarship Decision Email", registration.scholarship_decision_email_sent ? "Sent" : "Not sent"], ["Scholarship Decision Type Sent", registration.scholarship_decision_email_type ? scholarshipStatusLabels[registration.scholarship_decision_email_type as keyof typeof scholarshipStatusLabels] : "Not sent"], ["Scholarship Decision Email Sent At", formatDate(registration.scholarship_decision_email_sent_at || null)], ["Scholarship Last Decision Email Attempt", formatDate(registration.scholarship_decision_email_last_attempted_at || null)], ["Scholarship Decision Email Failure", registration.scholarship_decision_email_error || "None"], ["Admission/Status Email", registration.admission_email_sent ? "Sent" : "Not sent"], ["Admission/Status Sent At", formatDate(registration.admission_email_sent_at)]]} /><button type="button" disabled={resending || registration.payment_status !== "success"} onClick={resendApplicationEmails} className="mt-5 rounded-lg border border-[#071327] px-5 py-3 text-sm font-semibold text-[#071327] hover:bg-[#071327] hover:text-white disabled:cursor-not-allowed disabled:opacity-60">{resending ? "Resending..." : "Resend Application Emails"}</button>{registration.payment_status !== "success" ? <p className="mt-3 text-sm text-slate-600">Payment-confirmation emails remain unavailable without verified successful payment.</p> : null}{resendMessage ? <p className="mt-4 text-sm font-semibold text-slate-700">{resendMessage}</p> : null}</Section>

    <Section title="I. Admin Notes"><form onSubmit={saveAdminNote} className="grid gap-4"><ReviewNote label="General Admin Note" value={adminNote} onChange={setAdminNote} /><ActionButton submit disabled={Boolean(saving)}>{saving === "note" ? "Saving..." : "Save Admin Note"}</ActionButton></form><Details items={[["Note Updated At", formatDate(registration.admin_note_updated_at || null)], ["Note Updated By", registration.admin_note_updated_by || "Not recorded"]]} /><div className="mt-7 border-t border-slate-200 pt-6"><h3 className="font-semibold text-[#071327]">Application Review History</h3><AuditHistory events={reviewEvents} /></div></Section>
    <section className="rounded-2xl border border-red-300 bg-red-50 p-5 sm:p-6"><h2 className="text-lg font-semibold text-red-950">Danger Zone</h2><p className="mt-3 text-sm leading-6 text-red-900">Delete this application from active admissions operations. Historical decisions, payments and communications may be retained for institutional recordkeeping.</p><div className="mt-5"><ActionButton tone="danger" onClick={() => setShowRemoval(true)}>Delete Application</ActionButton></div></section>
    {showRemoval ? <ConfirmationModal title="Delete Application" onClose={() => setShowRemoval(false)}><Details items={[["Applicant", registration.full_name], ["Email", registration.email], ["Application Date", formatDate(registration.created_at)], ["Payment Status", labelOrValue(paymentStatusLabels, registration.payment_status)], ["Scholarship Status", scholarshipStatusLabels[registration.scholarship_status]], ["Advanced-entry Status", advancedEntryStatusLabels[registration.advanced_entry_status]], ["Admission Status", applicationStatusLabels[registration.application_status]]]} /><p className="mt-5 rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm leading-6 text-amber-950">This application will be removed from active admissions operations. Historical decisions, payments and communications may be retained for institutional recordkeeping.</p>{registration.payment_status === "success" || Number(registration.amount_paid || 0) > 0 ? <p className="mt-3 rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm leading-6 text-amber-950">This application contains payment history. Removing the application does not alter or refund the financial transaction.</p> : null}{studentProvisioning ? <p className="mt-3 rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm leading-6 text-amber-950">Deleting this application does not delete or withdraw the existing student record.</p> : null}<label className="mt-5 grid gap-2 text-sm font-semibold text-slate-800"><span>Reason</span><select required value={deletionReason} onChange={(event) => { setDeletionReason(event.target.value as ApplicationDeletionReason | ""); if (!['duplicate_application', 'applicant_restarted_application'].includes(event.target.value)) setSupersededByApplicationId(""); }} className="min-h-12 rounded-xl border border-slate-300 bg-white px-4"><option value="" disabled>Select a reason</option>{applicationDeletionReasons.map((reason) => <option key={reason} value={reason}>{applicationDeletionReasonLabels[reason]}</option>)}</select></label>{deletionReason === "duplicate_application" || deletionReason === "applicant_restarted_application" ? <label className="mt-5 grid gap-2 text-sm font-semibold text-slate-800"><span>Application to keep (optional)</span><select value={supersededByApplicationId} onChange={(event) => setSupersededByApplicationId(event.target.value)} className="min-h-12 rounded-xl border border-slate-300 bg-white px-4"><option value="">Not selected</option>{canonicalCandidates.map((candidate) => <option key={candidate.id} value={candidate.id}>{candidate.full_name} — {formatDate(candidate.created_at)} — {labelOrValue(paymentStatusLabels, candidate.payment_status)}</option>)}</select></label> : null}<ReviewNote label={deletionReason === "other" ? "Administrative Note (required)" : "Administrative Note (optional)"} value={deletionNote} onChange={setDeletionNote} /><label className="mt-5 grid gap-2 text-sm font-semibold text-slate-800"><span>Type DELETE to confirm</span><input value={deleteConfirmation} onChange={(event) => setDeleteConfirmation(event.target.value)} className="min-h-12 rounded-xl border border-red-300 px-4" /></label><div className="mt-5 flex flex-wrap gap-3"><ActionButton tone="danger" disabled={removing || deleteConfirmation !== "DELETE" || !deletionReason || (deletionReason === "other" && !deletionNote.trim())} onClick={() => void removeApplication()}>{removing ? "Removing..." : "Delete Application"}</ActionButton><ActionButton tone="secondary" disabled={removing} onClick={() => setShowRemoval(false)}>Cancel</ActionButton></div></ConfirmationModal> : null}
  </div>;
}

function Section({ title, children, id }: { title: string; children: ReactNode; id?: string }) { return <section id={id} className="scroll-mt-24 rounded-2xl border border-slate-200 bg-white p-5 sm:p-6"><h2 className="text-lg font-semibold text-[#071327]">{title}</h2>{children}</section>; }
function Details({ items }: { items: Array<[string, string]> }) { return <dl className="mt-5 grid gap-5 sm:grid-cols-2">{items.map(([label, value]) => <div key={label}><dt className="text-xs font-semibold uppercase tracking-wide text-slate-500">{label}</dt><dd className="mt-1 whitespace-pre-wrap break-words text-sm leading-6 text-slate-900">{value}</dd></div>)}</dl>; }
function ReviewNote({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) { return <label className="mt-5 grid gap-2 text-sm font-semibold text-slate-800"><span>{label}</span><textarea value={value} onChange={(event) => onChange(event.target.value)} rows={4} className="rounded-xl border border-slate-300 bg-white px-4 py-3 font-normal text-slate-950" /></label>; }
function ScoreField({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) { return <label className="grid gap-2 text-sm font-semibold text-amber-950"><span>{label} (0–25)</span><input required type="number" min="0" max="25" step="0.5" value={value} onChange={(event) => onChange(event.target.value)} className="min-h-12 rounded-xl border border-amber-300 bg-white px-4 font-normal text-slate-950" /></label>; }
function ActionButton({ children, onClick, disabled, tone = "primary", submit = false }: { children: ReactNode; onClick?: () => void; disabled?: boolean; tone?: "primary" | "secondary" | "danger"; submit?: boolean }) { const tones = { primary: "bg-[#071327] text-white hover:bg-[#102344]", secondary: "border border-slate-300 bg-white text-slate-800 hover:border-amber-500", danger: "border border-red-300 bg-red-50 text-red-800 hover:bg-red-100" }; return <button type={submit ? "submit" : "button"} onClick={onClick} disabled={disabled} className={`w-fit rounded-lg px-5 py-3 text-sm font-semibold disabled:cursor-not-allowed disabled:opacity-60 ${tones[tone]}`}>{children}</button>; }
function SeparationNotice() { return <p className="mt-4 rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm leading-6 text-slate-700">This decision only controls advanced-entry eligibility or scholarship support. It does not change admission status.</p>; }
function formatDate(value: string | null) { return value ? new Intl.DateTimeFormat("en", { dateStyle: "long", timeStyle: "short" }).format(new Date(value)) : "Not recorded"; }
function formatAmountPaid(registration: AdminRegistration) { return registration.amount_paid === null ? "No money recorded as received" : `${registration.currency} ${Number(registration.amount_paid).toLocaleString("en")}`; }
function formatMoneyValue(amount: number, currency: string) { return `${currency} ${Number(amount).toLocaleString("en")}`; }
function numericScore(value: string) { const parsed = Number(value); return Number.isFinite(parsed) && parsed >= 0 && parsed <= 25 ? parsed : 0; }
function AuditHistory({ events }: { events: ReviewEvent[] }) { return events.length ? <div className="mt-4 grid gap-3">{events.map((event) => <article key={event.id} className="rounded-xl border border-slate-200 bg-slate-50 p-4"><div className="flex flex-wrap items-center justify-between gap-3"><p className="font-semibold capitalize text-[#071327]">{event.event_type ? event.event_type.replaceAll("_", " ") : "Review event"}</p><span className="text-xs text-slate-500">{formatDate(event.created_at)}</span></div><p className="mt-2 text-sm text-slate-600">Recorded by {event.actor || "REALMS Admin"}</p>{event.note ? <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-slate-700">{event.note}</p> : <p className="mt-2 text-sm text-slate-500">No note recorded.</p>}</article>)}</div> : <p className="mt-3 text-sm text-slate-600">No audit events have been recorded yet.</p>; }
function ConfirmationModal({ title, children, onClose }: { title: string; children: ReactNode; onClose: () => void }) { return <div role="dialog" aria-modal="true" aria-label={title} className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 p-4" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}><div className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-2xl bg-white p-5 shadow-2xl sm:p-7"><div className="flex items-start justify-between gap-4"><h2 className="text-xl font-semibold text-[#071327]">{title}</h2><button type="button" onClick={onClose} className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm font-semibold text-slate-700">Close</button></div><div className="mt-5">{children}</div></div></div>; }
