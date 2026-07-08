"use client";

import Link from "next/link";
import { useEffect, useState, type FormEvent, type ReactNode } from "react";

import { AdminMessage } from "@/components/admin/DashboardStats";
import { applicationStatusLabels, applicationStatuses } from "@/lib/applicationStatus";
import type { AdminRegistration, RegistrationSummary } from "@/lib/adminRegistrations";

type Result = { registrations: AdminRegistration[]; summary: RegistrationSummary };

export function RegistrationsManager() {
  const [result, setResult] = useState<Result | null>(null);
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");

  async function load(nextQuery = query) {
    setLoading(true);
    setMessage("");
    try {
      const response = await fetch(`/api/admin/registrations${nextQuery ? `?${nextQuery}` : ""}`, { cache: "no-store" });
      const body = await response.json();
      if (!response.ok) throw new Error(body.message || "Registrations could not be loaded.");
      setResult(body);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Registrations could not be loaded.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    let active = true;
    fetch("/api/admin/registrations", { cache: "no-store" })
      .then(async (response) => ({ response, body: await response.json() }))
      .then(({ response, body }) => {
        if (!active) return;
        if (!response.ok) {
          setMessage(body.message || "Registrations could not be loaded.");
          return;
        }
        setResult(body);
      })
      .catch(() => { if (active) setMessage("Registrations could not be loaded."); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, []);

  function applyFilters(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const nextQuery = new URLSearchParams();
    new FormData(event.currentTarget).forEach((value, key) => {
      if (typeof value === "string" && value.trim()) nextQuery.set(key, value.trim());
    });
    const serialized = nextQuery.toString();
    setQuery(serialized);
    void load(serialized);
  }

  return (
    <div className="space-y-6">
      <form onSubmit={applyFilters} className="grid gap-3 rounded-2xl border border-slate-200 bg-white p-4 md:grid-cols-2 lg:grid-cols-7">
        <FilterInput name="search" label="Search" placeholder="Name, email or WhatsApp" />
        <FilterSelect name="learningMode" label="Learning mode" options={["Physical", "Online"]} />
        <FilterSelect name="skillPathway" label="Skill pathway" options={["Web Development", "Cybersecurity Foundations", "Not sure yet"]} />
        <FilterInput name="country" label="Country" placeholder="e.g. Nigeria" />
        <FilterInput name="paymentStatus" label="Payment status" placeholder="e.g. success" />
        <FilterSelect name="applicationStatus" label="Application status" options={applicationStatuses.map((status) => ({ value: status, label: applicationStatusLabels[status] }))} />
        <div className="flex items-end gap-2">
          <button className="rounded-lg bg-[#071327] px-4 py-2.5 text-sm font-semibold text-white">Apply</button>
          <button type="button" onClick={() => void load(query)} className="rounded-lg border border-slate-300 px-4 py-2.5 text-sm font-semibold text-slate-700">Refresh</button>
        </div>
      </form>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-slate-600">{result ? `${result.summary.total} matching registration${result.summary.total === 1 ? "" : "s"}` : "Registration records"}</p>
        <a href={`/api/admin/registrations/export${query ? `?${query}` : ""}`} className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-800 hover:border-amber-600">Export CSV</a>
      </div>

      {message ? <AdminMessage message={message} /> : null}
      {loading ? <p className="text-slate-600">Loading registrations...</p> : result ? <RegistrationList registrations={result.registrations} /> : null}
    </div>
  );
}

function RegistrationList({ registrations }: { registrations: AdminRegistration[] }) {
  if (!registrations.length) return <AdminMessage message="No registrations match the selected filters." />;

  return (
    <>
      <div className="hidden overflow-x-auto rounded-2xl border border-slate-200 bg-white lg:block">
        <table className="min-w-full text-left text-sm">
          <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-600">
            <tr>{["Name", "Email", "WhatsApp", "Country", "Mode", "Skill Pathway", "Amount", "Payment Status", "Application Status", "Paid At", "Actions"].map((label) => <th key={label} className="px-4 py-3 font-semibold">{label}</th>)}</tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {registrations.map((registration) => (
              <tr key={registration.id} className="align-top">
                <Cell>{registration.full_name}</Cell>
                <Cell>{registration.email}</Cell>
                <Cell>{registration.whatsapp}</Cell>
                <Cell>{registration.country}</Cell>
                <Cell>{registration.learning_mode}</Cell>
                <Cell>{registration.skill_pathway}</Cell>
                <Cell>{registration.amount_display || `${registration.currency} ${registration.amount}`}</Cell>
                <Cell>{registration.payment_status}</Cell>
                <Cell>{applicationStatusLabels[registration.application_status]}</Cell>
                <Cell>{formatDate(registration.paid_at)}</Cell>
                <Cell><Link className="font-semibold text-amber-800 hover:underline" href={`/admin/registrations/${registration.id}`}>View details</Link></Cell>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="grid gap-4 lg:hidden">
        {registrations.map((registration) => (
          <article key={registration.id} className="rounded-2xl border border-slate-200 bg-white p-5">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h2 className="font-semibold text-[#071327]">{registration.full_name}</h2>
                <p className="mt-1 break-all text-sm text-slate-600">{registration.email}</p>
              </div>
              <span className="rounded-full bg-amber-50 px-2.5 py-1 text-xs font-semibold text-amber-800">{applicationStatusLabels[registration.application_status]}</span>
            </div>
            <dl className="mt-4 grid grid-cols-2 gap-3 text-sm">
              <MobileDetail label="WhatsApp" value={registration.whatsapp} />
              <MobileDetail label="Country" value={registration.country} />
              <MobileDetail label="Mode" value={registration.learning_mode} />
              <MobileDetail label="Pathway" value={registration.skill_pathway} />
              <MobileDetail label="Payment" value={registration.payment_status} />
              <MobileDetail label="Amount" value={registration.amount_display || `${registration.currency} ${registration.amount}`} />
              <MobileDetail label="Paid at" value={formatDate(registration.paid_at)} />
            </dl>
            <Link className="mt-5 inline-block font-semibold text-amber-800 hover:underline" href={`/admin/registrations/${registration.id}`}>View details</Link>
          </article>
        ))}
      </div>
    </>
  );
}

function FilterInput({ name, label, placeholder }: { name: string; label: string; placeholder?: string }) {
  return <label className="grid gap-1 text-sm font-semibold text-slate-700"><span>{label}</span><input name={name} placeholder={placeholder} className="rounded-lg border border-slate-300 px-3 py-2 text-sm font-normal text-slate-950 outline-none focus:border-amber-600" /></label>;
}

function FilterSelect({ name, label, options }: { name: string; label: string; options: Array<string | { value: string; label: string }> }) {
  return (
    <label className="grid gap-1 text-sm font-semibold text-slate-700">
      <span>{label}</span>
      <select name={name} defaultValue="" className="rounded-lg border border-slate-300 px-3 py-2 text-sm font-normal text-slate-950 outline-none focus:border-amber-600">
        <option value="">All</option>
        {options.map((option) => {
          const value = typeof option === "string" ? option : option.value;
          const display = typeof option === "string" ? option : option.label;
          return <option key={value} value={value}>{display}</option>;
        })}
      </select>
    </label>
  );
}

function Cell({ children }: { children: ReactNode }) {
  return <td className="px-4 py-3 text-slate-700">{children}</td>;
}

function MobileDetail({ label, value }: { label: string; value: string }) {
  return <div><dt className="text-xs font-semibold uppercase tracking-wide text-slate-500">{label}</dt><dd className="mt-1 text-slate-900">{value}</dd></div>;
}

function formatDate(value: string | null) {
  return value ? new Intl.DateTimeFormat("en", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value)) : "Not recorded";
}
