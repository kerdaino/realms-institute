"use client";

import Link from "next/link";
import { useEffect, useState, type FormEvent, type ReactNode } from "react";

import { AdminMessage } from "@/components/admin/DashboardStats";
import { applicationStatusLabels, applicationStatuses } from "@/lib/applicationStatus";
import type { AdminRegistration, RegistrationSummary } from "@/lib/adminRegistrations";
import {
  advancedEntryStatusLabels,
  applicantTypeLabels,
  assignedRouteLabels,
  labelOrValue,
  paymentStatusLabels,
  requestedRouteLabels,
  scholarshipStatusLabels,
} from "@/lib/registrationReview";

type Result = { registrations: AdminRegistration[]; summary: RegistrationSummary };

const applicantTypeOptions = Object.entries(applicantTypeLabels).map(([value, label]) => ({ value, label }));
const requestedRouteOptions = Object.entries(requestedRouteLabels).map(([value, label]) => ({ value, label }));
const assignedRouteOptions = [...Object.entries(assignedRouteLabels).map(([value, label]) => ({ value, label })), { value: "unassigned", label: "Not Yet Assigned" }];
const advancedEntryOptions = ["pending_alumni_verification", "pending_screening_review", "advanced_approved", "foundation_required", "more_information_required"].map((value) => ({ value, label: advancedEntryStatusLabels[value as keyof typeof advancedEntryStatusLabels] }));
const scholarshipOptions = Object.entries(scholarshipStatusLabels).map(([value, label]) => ({ value, label }));

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
        if (!response.ok) setMessage(body.message || "Registrations could not be loaded.");
        else setResult(body);
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
      <form onSubmit={applyFilters} className="grid gap-3 rounded-2xl border border-slate-200 bg-white p-4 md:grid-cols-2 xl:grid-cols-4">
        <FilterInput name="search" label="Search" placeholder="Name, email or WhatsApp" />
        <FilterSelect name="applicantType" label="Applicant Type" options={applicantTypeOptions} />
        <FilterSelect name="requestedRoute" label="Requested Route" options={requestedRouteOptions} />
        <FilterSelect name="assignedRoute" label="Assigned Route" options={assignedRouteOptions} />
        <FilterSelect name="advancedEntryStatus" label="Advanced Entry Status" options={advancedEntryOptions} />
        <FilterSelect name="scholarshipStatus" label="Scholarship" options={scholarshipOptions} />
        <FilterSelect name="paymentStatus" label="Payment" options={[{ value: "success", label: "Paid" }, { value: "pending", label: "Payment Pending" }, { value: "not_paid", label: "Not Paid" }]} />
        <FilterSelect name="applicationStatus" label="Admission Status" options={applicationStatuses.map((status) => ({ value: status, label: applicationStatusLabels[status] }))} />
        <FilterSelect name="learningMode" label="Skill Pathway Learning Mode" options={["Physical", "Online"]} />
        <FilterSelect name="skillPathway" label="Skill Pathway" options={["Web Development", "Cybersecurity Foundations"]} />
        <FilterInput name="country" label="Country" placeholder="e.g. Nigeria" />
        <FilterInput name="from" label="Submitted From" type="date" />
        <FilterInput name="to" label="Submitted To" type="date" />
        <div className="flex items-end gap-2">
          <button className="rounded-lg bg-[#071327] px-4 py-2.5 text-sm font-semibold text-white">Apply Filters</button>
          <button type="button" onClick={() => { setQuery(""); window.location.reload(); }} className="rounded-lg border border-slate-300 px-4 py-2.5 text-sm font-semibold text-slate-700">Clear</button>
        </div>
      </form>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-slate-600">{result ? `${result.summary.total} matching application${result.summary.total === 1 ? "" : "s"}` : "Application records"}</p>
        <div className="flex flex-wrap gap-2"><Link href="/admin/scholarships" className="rounded-lg border border-amber-300 bg-amber-50 px-4 py-2 text-sm font-semibold text-amber-900">Scholarship Requests</Link><a href={`/api/admin/registrations/export${query ? `?${query}` : ""}`} className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-800 hover:border-amber-600">Export CSV</a></div>
      </div>

      {message ? <AdminMessage message={message} /> : null}
      {loading ? <p className="text-slate-600">Loading applications...</p> : result ? <RegistrationList registrations={result.registrations} /> : null}
    </div>
  );
}

function RegistrationList({ registrations }: { registrations: AdminRegistration[] }) {
  if (!registrations.length) return <AdminMessage message="No applications match the selected filters." />;
  return (
    <>
      <div className="hidden overflow-x-auto rounded-2xl border border-slate-200 bg-white lg:block">
        <table className="min-w-[1500px] text-left text-sm">
          <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-600"><tr>{["Applicant", "Programme", "Applicant Type", "Requested Route", "Advanced Entry", "Scholarship", "Payment", "Admission", "Submitted", "Actions"].map((label) => <th key={label} className="px-4 py-3 font-semibold">{label}</th>)}</tr></thead>
          <tbody className="divide-y divide-slate-100">
            {registrations.map((registration) => <tr key={registration.id} className="align-top">
              <Cell><span className="font-semibold text-[#071327]">{registration.full_name}</span><span className="mt-1 block break-all text-xs">{registration.email}</span><span className="mt-1 block text-xs">{registration.whatsapp} · {registration.country}</span></Cell>
              <Cell><span className="font-medium">{registration.skill_pathway}</span><span className="mt-1 block text-xs">{registration.learning_mode}</span></Cell>
              <Cell><Badge tone="navy">{applicantTypeLabels[registration.applicant_type]}</Badge></Cell>
              <Cell><Badge tone="blue">{requestedRouteLabels[registration.requested_discipleship_route]}</Badge><span className="mt-2 block text-xs">Assigned: {registration.assigned_discipleship_route ? assignedRouteLabels[registration.assigned_discipleship_route] : "Not Yet Assigned"}</span></Cell>
              <Cell><Badge tone={registration.advanced_entry_status === "advanced_approved" ? "green" : registration.advanced_entry_status === "foundation_required" ? "amber" : "slate"}>{advancedEntryStatusLabels[registration.advanced_entry_status]}</Badge></Cell>
              <Cell><Badge tone={registration.scholarship_status.startsWith("approved") ? "green" : registration.scholarship_status === "declined" ? "red" : registration.scholarship_status === "pending" ? "amber" : "slate"}>{scholarshipStatusLabels[registration.scholarship_status]}</Badge></Cell>
              <Cell><Badge tone={registration.payment_status === "success" ? "green" : "slate"}>{labelOrValue(paymentStatusLabels, registration.payment_status)}</Badge><span className="mt-2 block text-xs">{formatAmountPaid(registration)}</span></Cell>
              <Cell><Badge tone={registration.application_status === "admitted" ? "green" : registration.application_status === "not_admitted" ? "red" : "amber"}>{applicationStatusLabels[registration.application_status]}</Badge></Cell>
              <Cell>{formatDate(registration.created_at)}</Cell>
              <Cell><Link className="font-semibold text-amber-800 hover:underline" href={`/admin/registrations/${registration.id}`}>Review application</Link></Cell>
            </tr>)}
          </tbody>
        </table>
      </div>

      <div className="grid gap-4 lg:hidden">
        {registrations.map((registration) => <article key={registration.id} className="rounded-2xl border border-slate-200 bg-white p-5">
          <h2 className="font-semibold text-[#071327]">{registration.full_name}</h2><p className="mt-1 break-all text-sm text-slate-600">{registration.email}</p>
          <div className="mt-4 flex flex-wrap gap-2"><Badge tone="navy">{applicantTypeLabels[registration.applicant_type]}</Badge><Badge tone="blue">{requestedRouteLabels[registration.requested_discipleship_route]}</Badge><Badge tone="slate">{advancedEntryStatusLabels[registration.advanced_entry_status]}</Badge><Badge tone={registration.scholarship_status === "pending" ? "amber" : "slate"}>{scholarshipStatusLabels[registration.scholarship_status]}</Badge><Badge tone={registration.payment_status === "success" ? "green" : "slate"}>{labelOrValue(paymentStatusLabels, registration.payment_status)}</Badge></div>
          <dl className="mt-4 grid grid-cols-2 gap-3 text-sm"><MobileDetail label="Pathway" value={registration.skill_pathway} /><MobileDetail label="Mode" value={registration.learning_mode} /><MobileDetail label="Assigned route" value={registration.assigned_discipleship_route ? assignedRouteLabels[registration.assigned_discipleship_route] : "Not Yet Assigned"} /><MobileDetail label="Admission" value={applicationStatusLabels[registration.application_status]} /></dl>
          <Link className="mt-5 inline-block font-semibold text-amber-800 hover:underline" href={`/admin/registrations/${registration.id}`}>Review application</Link>
        </article>)}
      </div>
    </>
  );
}

export function Badge({ children, tone = "slate" }: { children: ReactNode; tone?: "navy" | "blue" | "green" | "amber" | "red" | "slate" }) {
  const tones = { navy: "bg-slate-900 text-white", blue: "bg-blue-50 text-blue-800", green: "bg-emerald-50 text-emerald-800", amber: "bg-amber-50 text-amber-900", red: "bg-red-50 text-red-800", slate: "bg-slate-100 text-slate-700" };
  return <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${tones[tone]}`}>{children}</span>;
}

function FilterInput({ name, label, placeholder, type = "text" }: { name: string; label: string; placeholder?: string; type?: string }) { return <label className="grid gap-1 text-sm font-semibold text-slate-700"><span>{label}</span><input name={name} type={type} placeholder={placeholder} className="rounded-lg border border-slate-300 px-3 py-2 text-sm font-normal text-slate-950 outline-none focus:border-amber-600" /></label>; }
function FilterSelect({ name, label, options }: { name: string; label: string; options: Array<string | { value: string; label: string }> }) { return <label className="grid gap-1 text-sm font-semibold text-slate-700"><span>{label}</span><select name={name} defaultValue="" className="rounded-lg border border-slate-300 px-3 py-2 text-sm font-normal text-slate-950 outline-none focus:border-amber-600"><option value="">All</option>{options.map((option) => { const value = typeof option === "string" ? option : option.value; const display = typeof option === "string" ? option : option.label; return <option key={value} value={value}>{display}</option>; })}</select></label>; }
function Cell({ children }: { children: ReactNode }) { return <td className="px-4 py-4 text-slate-700">{children}</td>; }
function MobileDetail({ label, value }: { label: string; value: string }) { return <div><dt className="text-xs font-semibold uppercase tracking-wide text-slate-500">{label}</dt><dd className="mt-1 text-slate-900">{value}</dd></div>; }
function formatDate(value: string | null) { return value ? new Intl.DateTimeFormat("en", { dateStyle: "medium" }).format(new Date(value)) : "Not recorded"; }
function formatAmountPaid(registration: AdminRegistration) { const amountPaid = registration.amount_paid ?? (registration.payment_status === "success" ? Number(registration.amount) : null); return amountPaid === null ? "Not yet paid" : `${registration.currency} ${amountPaid.toLocaleString("en")}`; }
