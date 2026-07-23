import type { Metadata } from "next";

import { PageHero } from "@/components/layout/PageHero";
import { PageShell } from "@/components/layout/PageShell";
import { ScholarshipPaymentButton } from "@/components/payment/ScholarshipPaymentButton";
import { getScholarshipPaymentPageState } from "@/lib/scholarshipPayment.server";

export const metadata: Metadata = {
  title: "Scholarship Registration Payment | REALMS Institute",
  robots: { index: false, follow: false },
};

function first(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

function formatMoney(amount: number, currency: string) {
  try {
    return new Intl.NumberFormat("en-NG", { style: "currency", currency, maximumFractionDigits: 2 }).format(amount);
  } catch {
    return `${currency} ${amount.toLocaleString("en")}`;
  }
}

export default async function ScholarshipPaymentPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const token = (first((await searchParams).token) || "").trim();
  const state = await getScholarshipPaymentPageState(token);
  const title = state.kind === "payable" ? "Complete Registration Payment" : state.kind === "completed" ? "Payment Completed" : "Scholarship Payment Status";
  return <PageShell>
    <PageHero eyebrow="Secure Scholarship Payment" title={title} subtitle="Payment details are checked against the current scholarship decision held securely by REALMS Institute." breadcrumbs={[{ label: "Home", href: "/" }, { label: "Registration Payment" }]} />
    <section className="bg-[#f7f5ef] px-5 py-16 md:px-8 md:py-24">
      <div className="mx-auto max-w-3xl rounded-3xl border border-slate-200 bg-white p-6 shadow-xl shadow-slate-950/5 sm:p-10">
        {state.kind === "invalid" ? <><h2 className="text-2xl font-semibold text-[#071327]">Payment Link Unavailable</h2><p className="mt-4 leading-7 text-slate-600">{state.message}</p></> : null}
        {state.kind === "not_required" || state.kind === "manual_review" ? <><h2 className="text-2xl font-semibold text-[#071327]">Hello, {state.applicantName}</h2><p className="mt-4 leading-7 text-slate-600">{state.message}</p></> : null}
        {state.kind === "completed" ? <><h2 className="text-2xl font-semibold text-[#071327]">Hello, {state.applicantName}</h2><p className="mt-4 leading-7 text-slate-600">{state.message}</p><p className="mt-5 rounded-xl border border-emerald-200 bg-emerald-50 p-4 font-semibold text-emerald-900">Amount paid: {formatMoney(state.amountPaid, state.currency)}</p></> : null}
        {state.kind === "payable" ? <><h2 className="text-2xl font-semibold text-[#071327]">Hello, {state.applicantName}</h2><p className="mt-4 leading-7 text-slate-600">{state.scholarshipStatus === "approved_partial" ? "Your partial scholarship support has been approved. The amount below is the remaining registration amount due after that support." : "Your scholarship request was not approved. The normal registration fee remains due if you wish to continue your registration."}</p><dl className="mt-6 rounded-2xl border border-slate-200 bg-slate-50 p-5"><dt className="text-xs font-semibold uppercase tracking-wide text-slate-500">Current server-verified amount due</dt><dd className="mt-2 text-3xl font-semibold text-[#071327]">{formatMoney(state.amountDue, state.currency)}</dd></dl><ScholarshipPaymentButton token={token} /></> : null}
        <p className="mt-7 border-t border-slate-200 pt-5 text-sm leading-6 text-slate-600">Payment completes only the financial part of this application. It does not itself constitute admission, enrolment, or student account provisioning.</p>
      </div>
    </section>
  </PageShell>;
}
