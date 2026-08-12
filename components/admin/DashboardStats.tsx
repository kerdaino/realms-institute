"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

type NumberKey = "applications" | "pending" | "admitted" | "provisioned" | "activeStudents" | "pendingOnboarding" | "currentCohorts" | "currentCourses" | "facilitators" | "pendingAlumniVerification" | "pendingScreeningReviews" | "pendingScholarshipRequests" | "openEngagementAlerts" | "highSeverityAlerts" | "standingReviewsRequired" | "activeMentorAssignments" | "activeRecoveryPlans" | "openStudentReviews";
type DashboardSummary = Record<NumberKey, number> & {
  publicRegistrationApplications: number;
  publicRegistrationCohort: { id: string; code: string; name: string; registration_status: "open" | "closed" } | null;
};
const labels: Array<[NumberKey, string]> = [["applications", "Applications"], ["pending", "Pending"], ["admitted", "Admitted"], ["provisioned", "Provisioned"], ["activeStudents", "Active Students"], ["pendingOnboarding", "Pending Onboarding"], ["currentCohorts", "Current Cohorts"], ["currentCourses", "Current Courses"], ["facilitators", "Facilitators"], ["pendingAlumniVerification", "Pending Alumni Verification"], ["pendingScreeningReviews", "Pending Screening Reviews"], ["pendingScholarshipRequests", "Pending Scholarship Requests"], ["openEngagementAlerts", "Open Engagement Alerts"], ["highSeverityAlerts", "High-Severity Alerts"], ["standingReviewsRequired", "Standing Reviews Required"], ["activeMentorAssignments", "Active Mentor Assignments"], ["activeRecoveryPlans", "Active Recovery Plans"], ["openStudentReviews", "Open Student Reviews"]];

export function DashboardStats() {
  const [summary, setSummary] = useState<DashboardSummary | null>(null);
  const [message, setMessage] = useState("");
  useEffect(() => { fetch("/api/admin/dashboard").then(async (response) => ({ response, body: await response.json() })).then(({ response, body }) => { if (!response.ok) setMessage(body.message || "Dashboard data could not be loaded."); else setSummary(body.summary); }).catch(() => setMessage("Dashboard data could not be loaded.")); }, []);
  if (message) return <AdminMessage message={message} />;
  if (!summary) return <p className="text-slate-600">Loading Institute summary…</p>;
  return <div className="space-y-5">
    {summary.publicRegistrationCohort ? <article className="flex flex-wrap items-center justify-between gap-5 rounded-2xl border border-amber-200 bg-amber-50 p-5 shadow-sm"><div><p className="text-xs font-semibold uppercase tracking-wider text-amber-800">Active Registration Cohort</p><h2 className="mt-2 text-xl font-semibold text-[#071327]">{summary.publicRegistrationCohort.name}</h2><p className="mt-1 text-sm text-slate-700">Registration: <strong>{summary.publicRegistrationCohort.registration_status.toUpperCase()}</strong> · Applications: {summary.publicRegistrationApplications}</p></div><div className="flex flex-wrap gap-2"><Link href={`/admin/cohorts/${summary.publicRegistrationCohort.id}`} className="rounded-xl bg-[#071327] px-4 py-2 text-sm font-semibold text-white">{summary.publicRegistrationCohort.registration_status === "closed" ? "Open Registration" : "Manage Registration"}</Link><Link href={`/admin/cohorts/${summary.publicRegistrationCohort.id}`} className="rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm font-semibold">Manage Cohort</Link></div></article> : null}
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">{labels.map(([key, label]) => <article key={key} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"><p className="text-sm text-slate-600">{label}</p><p className="mt-2 text-3xl font-semibold text-[#071327]">{summary[key]}</p></article>)}</div>
  </div>;
}
export function AdminMessage({ message }: { message: string }) { return <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm leading-6 text-amber-950">{message}</div>; }
