"use client";

import Link from "next/link";
import { useEffect, useState, type ReactNode } from "react";

import { AdminMessage } from "@/components/admin/DashboardStats";
import type { AdminRegistration } from "@/lib/adminRegistrations";

export function RegistrationDetail({ id }: { id: string }) {
  const [registration, setRegistration] = useState<AdminRegistration | null>(null);
  const [message, setMessage] = useState("");
  useEffect(() => { fetch(`/api/admin/registrations/${encodeURIComponent(id)}`, { cache: "no-store" }).then(async response => ({ response, body: await response.json() })).then(({ response, body }) => { if (!response.ok) setMessage(body.message || "Registration could not be loaded."); else setRegistration(body.registration); }).catch(() => setMessage("Registration could not be loaded.")); }, [id]);
  if (message) return <AdminMessage message={message} />;
  if (!registration) return <p className="text-slate-600">Loading registration…</p>;
  return <div className="space-y-6"><Link href="/admin/registrations" className="text-sm font-semibold text-amber-800 hover:underline">← Back to registrations</Link><Section title="Applicant"><Details items={[["Full name", registration.full_name], ["Email", registration.email], ["WhatsApp", registration.whatsapp], ["Country", registration.country], ["City", registration.city], ["Gender", registration.gender], ["Age range", registration.age_range], ["Church / fellowship", registration.church || "Not provided"]]} /></Section><Section title="Cohort"><Details items={[["Learning mode", registration.learning_mode], ["Skill pathway", registration.skill_pathway], ["Reason for joining", registration.reason], ["Referral source", registration.referral_source], ["Consent", registration.consent ? "Confirmed" : "Not confirmed"]]} /></Section><Section title="Payment"><Details items={[["Amount", registration.amount_display || `${registration.currency} ${registration.amount}`], ["Currency", registration.currency], ["Payment reference", registration.payment_reference], ["Payment status", registration.payment_status], ["Paid at", formatDate(registration.paid_at)]]} /></Section><Section title="Emails"><Details items={[["Confirmation email sent", registration.confirmation_email_sent ? "Yes" : "No"], ["Admin email sent", registration.admin_email_sent ? "Yes" : "No"]]} /></Section></div>;
}
function Section({ title, children }: { title: string; children: ReactNode }) { return <section className="rounded-2xl border border-slate-200 bg-white p-5 sm:p-6"><h2 className="text-lg font-semibold text-[#071327]">{title}</h2>{children}</section>; }
function Details({ items }: { items: Array<[string, string]> }) { return <dl className="mt-5 grid gap-5 sm:grid-cols-2">{items.map(([label, value]) => <div key={label}><dt className="text-xs font-semibold uppercase tracking-wide text-slate-500">{label}</dt><dd className="mt-1 whitespace-pre-wrap break-words text-sm leading-6 text-slate-900">{value}</dd></div>)}</dl>; }
function formatDate(value: string | null) { return value ? new Intl.DateTimeFormat("en", { dateStyle: "long", timeStyle: "short" }).format(new Date(value)) : "Not recorded"; }
