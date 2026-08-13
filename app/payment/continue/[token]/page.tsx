import type { Metadata } from "next";

import { PageHero } from "@/components/layout/PageHero";
import { PageShell } from "@/components/layout/PageShell";
import { PaymentContinuationButton } from "@/components/payment/PaymentContinuationButton";
import { getPaymentContinuationPageState } from "@/lib/paymentContinuation.server";

export const metadata: Metadata = {
  title: "Continue Registration Payment | REALMS Institute",
  robots: { index: false, follow: false },
};

function formatMoney(amount: number, currency: string) {
  try {
    return new Intl.NumberFormat("en-NG", { style: "currency", currency, maximumFractionDigits: 2 }).format(amount);
  } catch {
    return `${currency} ${amount.toLocaleString("en")}`;
  }
}

function formatDeadline(value: string | null) {
  if (!value) return "Not applicable";
  return new Intl.DateTimeFormat("en-NG", { dateStyle: "full", timeStyle: "short", timeZone: "Africa/Lagos" }).format(new Date(value));
}

export default async function PaymentContinuationPage({ params }: { params: Promise<{ token: string }> }) {
  const token = (await params).token.trim();
  const state = await getPaymentContinuationPageState(token);
  const title = state.kind === "payable" ? "Complete Registration Payment" : state.kind === "completed" ? "Payment Completed" : "Registration Payment Status";
  return <PageShell>
    <PageHero eyebrow="Secure Registration Payment" title={title} subtitle="Your current application, offer, amount due and payment reference are checked securely by REALMS Institute before payment continues." breadcrumbs={[{ label: "Home", href: "/" }, { label: "Registration Payment" }]} />
    <section className="bg-[#f7f5ef] px-5 py-16 md:px-8 md:py-24">
      <div className="mx-auto max-w-3xl rounded-3xl border border-slate-200 bg-white p-6 shadow-xl shadow-slate-950/5 sm:p-10">
        {state.kind === "invalid" ? <><h2 className="text-2xl font-semibold text-[#071327]">Payment Link Unavailable</h2><p className="mt-4 leading-7 text-slate-600">{state.message}</p></> : null}
        {state.kind === "expired" || state.kind === "not_required" || state.kind === "manual_review" ? <><h2 className="text-2xl font-semibold text-[#071327]">Hello, {state.applicantName}</h2><p className="mt-4 leading-7 text-slate-600">{state.message}</p></> : null}
        {state.kind === "completed" ? <><h2 className="text-2xl font-semibold text-[#071327]">Hello, {state.applicantName}</h2><p className="mt-4 leading-7 text-slate-600">{state.message}</p><p className="mt-5 rounded-xl border border-emerald-200 bg-emerald-50 p-4 font-semibold text-emerald-900">Verified amount paid: {formatMoney(state.amountPaid, state.currency)}</p></> : null}
        {state.kind === "payable" ? <><h2 className="text-2xl font-semibold text-[#071327]">Hello, {state.applicantName}</h2><p className="mt-4 leading-7 text-slate-600">The details below come from your current active application. Paystack will be opened only after the server rechecks them.</p><dl className="mt-6 grid gap-4 rounded-2xl border border-slate-200 bg-slate-50 p-5 sm:grid-cols-2"><div><dt className="text-xs font-semibold uppercase tracking-wide text-slate-500">Registration Fee</dt><dd className="mt-1 font-semibold text-[#071327]">{formatMoney(state.normalFee, state.currency)}</dd></div>{state.fundingRoute === "scholarship_request" ? <div><dt className="text-xs font-semibold uppercase tracking-wide text-slate-500">Scholarship Support</dt><dd className="mt-1 font-semibold text-[#071327]">{formatMoney(state.scholarshipSupport, state.currency)}</dd></div> : null}<div><dt className="text-xs font-semibold uppercase tracking-wide text-slate-500">Verified Amount Paid</dt><dd className="mt-1 font-semibold text-[#071327]">{formatMoney(state.amountPaid, state.currency)}</dd></div><div><dt className="text-xs font-semibold uppercase tracking-wide text-slate-500">Current Amount Due</dt><dd className="mt-1 text-2xl font-semibold text-[#071327]">{formatMoney(state.amountDue, state.currency)}</dd></div>{state.paymentDeadline ? <div className="sm:col-span-2"><dt className="text-xs font-semibold uppercase tracking-wide text-slate-500">Conditional Admission Payment Deadline</dt><dd className="mt-1 font-semibold text-[#071327]">{formatDeadline(state.paymentDeadline)}</dd></div> : null}</dl><PaymentContinuationButton token={token} /></> : null}
        <p className="mt-7 border-t border-slate-200 pt-5 text-sm leading-6 text-slate-600">Payment satisfies only the financial requirement. It does not change academic requirements, create admission by itself, enrol a student, or provision a portal account.</p>
      </div>
    </section>
  </PageShell>;
}
