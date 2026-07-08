"use client";

import { useEffect, useState } from "react";

import type { RegistrationSummary } from "@/lib/adminRegistrations";

const labels: Array<[keyof RegistrationSummary, string]> = [["pendingReview", "Pending Review"], ["admitted", "Admitted"], ["contacted", "Contacted"], ["waitlisted", "Waitlisted"], ["notAdmitted", "Not Admitted"], ["total", "Total registrations"], ["paid", "Paid registrations"], ["physical", "Physical applicants"], ["online", "Online applicants"], ["webDevelopment", "Web Development"], ["cybersecurity", "Cybersecurity Foundations"], ["nigerian", "Nigerian applicants"], ["international", "International applicants"]];

export function DashboardStats() {
  const [summary, setSummary] = useState<RegistrationSummary | null>(null);
  const [message, setMessage] = useState("");
  useEffect(() => { fetch("/api/admin/registrations").then(async response => ({ response, body: await response.json() })).then(({ response, body }) => { if (!response.ok) setMessage(body.message || "Dashboard data could not be loaded."); else setSummary(body.summary); }).catch(() => setMessage("Dashboard data could not be loaded.")); }, []);
  if (message) return <AdminMessage message={message} />;
  if (!summary) return <p className="text-slate-600">Loading registration summary…</p>;
  return <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">{labels.map(([key, label]) => <article key={key} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"><p className="text-sm text-slate-600">{label}</p><p className="mt-2 text-3xl font-semibold text-[#071327]">{summary[key]}</p></article>)}</div>;
}

export function AdminMessage({ message }: { message: string }) { return <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm leading-6 text-amber-950">{message}</div>; }
