"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import { AdminMessage } from "@/components/admin/DashboardStats";
import { Badge } from "@/components/admin/RegistrationsManager";
import type { ApplicantType, RequestedDiscipleshipRoute, ScholarshipStatus } from "@/lib/registration";
import { applicantTypeLabels, requestedRouteLabels, scholarshipStatusLabels } from "@/lib/registrationReview";
import { scholarshipFinancialSummary } from "@/lib/scholarshipFinance";

type ScholarshipRequest = {
  id: string;
  created_at: string;
  full_name: string;
  email: string;
  applicant_type: ApplicantType;
  requested_discipleship_route: RequestedDiscipleshipRoute;
  skill_pathway: string;
  learning_mode: string;
  amount: number;
  currency: string;
  public_fee_display: string | null;
  scholarship_reason: string | null;
  scholarship_financial_situation: string | null;
  scholarship_can_contribute: boolean | null;
  scholarship_contribution_amount: number | null;
  scholarship_status: ScholarshipStatus;
  scholarship_approved_amount: number | null;
  scholarship_reviewed_at: string | null;
};

export function ScholarshipRequestsManager() {
  const [requests, setRequests] = useState<ScholarshipRequest[] | null>(null);
  const [message, setMessage] = useState("");
  useEffect(() => {
    let active = true;
    fetch("/api/admin/scholarships", { cache: "no-store" })
      .then(async (response) => ({ response, body: await response.json() }))
      .then(({ response, body }) => {
        if (!active) return;
        if (!response.ok) setMessage(body.message || "Scholarship requests could not be loaded.");
        else setRequests(body.scholarships);
      })
      .catch(() => { if (active) setMessage("Scholarship requests could not be loaded."); });
    return () => { active = false; };
  }, []);
  if (message) return <AdminMessage message={message} />;
  if (!requests) return <p className="text-slate-600">Loading scholarship requests...</p>;
  if (!requests.length) return <AdminMessage message="No scholarship requests have been submitted." />;
  return <div className="space-y-4">{requests.map((request) => {
    const financials = scholarshipFinancialSummary({ normalFee: Number(request.amount), scholarshipStatus: request.scholarship_status, approvedScholarshipAmount: request.scholarship_approved_amount });
    return <article key={request.id} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6"><div className="flex flex-wrap items-start justify-between gap-4"><div><h2 className="text-lg font-semibold text-[#071327]">{request.full_name}</h2><p className="mt-1 text-sm text-slate-600">{request.email}</p></div><Badge tone={request.scholarship_status.startsWith("approved") ? "green" : request.scholarship_status === "declined" ? "red" : "amber"}>{scholarshipStatusLabels[request.scholarship_status]}</Badge></div><dl className="mt-5 grid gap-4 text-sm sm:grid-cols-2 lg:grid-cols-4"><Detail label="Applicant Type" value={applicantTypeLabels[request.applicant_type]} /><Detail label="Requested Route" value={requestedRouteLabels[request.requested_discipleship_route]} /><Detail label="Skill Pathway" value={request.skill_pathway} /><Detail label="Learning Mode" value={request.learning_mode} /><Detail label="Normal Registration Fee" value={request.public_fee_display || `${request.currency} ${Number(request.amount).toLocaleString("en")}`} /><Detail label="Can Contribute?" value={request.scholarship_can_contribute === null ? "Not provided" : request.scholarship_can_contribute ? "Yes" : "No"} /><Detail label="Applicant-Proposed Contribution" value={request.scholarship_contribution_amount === null ? "None" : `${request.currency} ${Number(request.scholarship_contribution_amount).toLocaleString("en")}`} /><Detail label="Approved Scholarship Support / Fee Waiver" value={financials.approvedSupport === null ? "Not approved" : `${request.currency} ${financials.approvedSupport.toLocaleString("en")}`} /><Detail label="Applicant Amount Due" value={financials.amountDue === null ? "Not yet determined" : `${request.currency} ${financials.amountDue.toLocaleString("en")}`} /><div className="sm:col-span-2"><Detail label="Reason" value={request.scholarship_reason || "Not provided"} /></div><div className="sm:col-span-2"><Detail label="Financial Situation" value={request.scholarship_financial_situation || "Not provided"} /></div></dl><div className="mt-5 flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 pt-4"><p className="text-xs text-slate-500">Submitted {formatDate(request.created_at)}</p><Link href={`/admin/registrations/${request.id}#scholarship-review`} className="font-semibold text-amber-800 hover:underline">Review scholarship request</Link></div></article>;
  })}</div>;
}

function Detail({ label, value }: { label: string; value: string }) { return <div><dt className="text-xs font-semibold uppercase tracking-wide text-slate-500">{label}</dt><dd className="mt-1 whitespace-pre-wrap leading-6 text-slate-900">{value}</dd></div>; }
function formatDate(value: string) { return new Intl.DateTimeFormat("en", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value)); }
