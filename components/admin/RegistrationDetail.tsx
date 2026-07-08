"use client";

import Link from "next/link";
import { useEffect, useState, type FormEvent, type ReactNode } from "react";

import { AdminMessage } from "@/components/admin/DashboardStats";
import { applicationStatusLabels, applicationStatuses } from "@/lib/applicationStatus";
import type { AdminRegistration } from "@/lib/adminRegistrations";

export function RegistrationDetail({ id }: { id: string }) {
  const [registration, setRegistration] = useState<AdminRegistration | null>(null);
  const [message, setMessage] = useState("");
  const [saveMessage, setSaveMessage] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetch(`/api/admin/registrations/${encodeURIComponent(id)}`, { cache: "no-store" })
      .then(async (response) => ({ response, body: await response.json() }))
      .then(({ response, body }) => {
        if (!response.ok) setMessage(body.message || "Registration could not be loaded.");
        else setRegistration(body.registration);
      })
      .catch(() => setMessage("Registration could not be loaded."));
  }, [id]);

  async function updateStatus(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setSaveMessage("");
    const form = new FormData(event.currentTarget);
    try {
      const response = await fetch(`/api/admin/registrations/${encodeURIComponent(id)}/status`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          applicationStatus: form.get("applicationStatus"),
          adminNote: form.get("adminNote"),
        }),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.message || "Review status could not be saved.");
      setRegistration(body.registration);
      setSaveMessage("Review status saved.");
    } catch (error) {
      setSaveMessage(error instanceof Error ? error.message : "Review status could not be saved.");
    } finally {
      setSaving(false);
    }
  }

  if (message) return <AdminMessage message={message} />;
  if (!registration) return <p className="text-slate-600">Loading registration...</p>;

  return (
    <div className="space-y-6">
      <Link href="/admin/registrations" className="text-sm font-semibold text-amber-800 hover:underline">Back to registrations</Link>

      <Section title="Applicant">
        <Details items={[["Full name", registration.full_name], ["Email", registration.email], ["WhatsApp", registration.whatsapp], ["Country", registration.country], ["City", registration.city], ["Gender", registration.gender], ["Age range", registration.age_range], ["Church / fellowship", registration.church || "Not provided"]]} />
      </Section>

      <Section title="Cohort">
        <Details items={[["Learning mode", registration.learning_mode], ["Skill pathway", registration.skill_pathway], ["Reason for joining", registration.reason], ["Referral source", registration.referral_source], ["Consent", registration.consent ? "Confirmed" : "Not confirmed"]]} />
      </Section>

      <Section title="Payment">
        <Details items={[["Amount", registration.amount_display || `${registration.currency} ${registration.amount}`], ["Currency", registration.currency], ["Payment reference", registration.payment_reference], ["Payment status", registration.payment_status], ["Paid at", formatDate(registration.paid_at)]]} />
      </Section>

      <Section title="Application Review">
        <Details items={[["Application status", applicationStatusLabels[registration.application_status]], ["Admin note", registration.admin_note || "No note recorded"], ["Reviewed at", formatDate(registration.reviewed_at)], ["Reviewed by", registration.reviewed_by || "Not recorded"]]} />
        <p className="mt-5 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm leading-6 text-amber-950">After reviewing this applicant, contact them via WhatsApp or email with their admission/onboarding status and next steps.</p>
        <form onSubmit={updateStatus} className="mt-6 grid gap-4">
          <label className="grid gap-2 text-sm font-semibold text-slate-800">
            <span>Application status</span>
            <select name="applicationStatus" defaultValue={registration.application_status} className="min-h-12 rounded-xl border border-slate-300 bg-white px-4 text-sm font-normal text-slate-950 outline-none focus:border-amber-600">
              {applicationStatuses.map((status) => <option key={status} value={status}>{applicationStatusLabels[status]}</option>)}
            </select>
          </label>
          <label className="grid gap-2 text-sm font-semibold text-slate-800">
            <span>Admin note</span>
            <textarea name="adminNote" defaultValue={registration.admin_note || ""} rows={5} className="rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm font-normal text-slate-950 outline-none focus:border-amber-600" />
          </label>
          <button disabled={saving} className="w-fit rounded-lg bg-[#071327] px-5 py-3 text-sm font-semibold text-white hover:bg-[#102344] disabled:cursor-not-allowed disabled:opacity-60">{saving ? "Saving..." : "Save Review Status"}</button>
        </form>
        {saveMessage ? <p className="mt-4 text-sm font-semibold text-slate-700">{saveMessage}</p> : null}
      </Section>

      <Section title="Emails">
        <Details items={[["Confirmation email sent", registration.confirmation_email_sent ? "Yes" : "No"], ["Admin email sent", registration.admin_email_sent ? "Yes" : "No"]]} />
      </Section>
    </div>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return <section className="rounded-2xl border border-slate-200 bg-white p-5 sm:p-6"><h2 className="text-lg font-semibold text-[#071327]">{title}</h2>{children}</section>;
}

function Details({ items }: { items: Array<[string, string]> }) {
  return <dl className="mt-5 grid gap-5 sm:grid-cols-2">{items.map(([label, value]) => <div key={label}><dt className="text-xs font-semibold uppercase tracking-wide text-slate-500">{label}</dt><dd className="mt-1 whitespace-pre-wrap break-words text-sm leading-6 text-slate-900">{value}</dd></div>)}</dl>;
}

function formatDate(value: string | null) {
  return value ? new Intl.DateTimeFormat("en", { dateStyle: "long", timeStyle: "short" }).format(new Date(value)) : "Not recorded";
}
