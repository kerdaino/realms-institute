"use client";

import { useEffect, useState } from "react";

import type { RegistrationDetails } from "@/lib/registration";

type PaymentDetails = { amount: number; currency: string; display: string };
type RegistrationSave = { saved: true; id: string } | { saved: false; reason: string };
type State = { kind: "loading" | "success" | "failed"; reference: string; registration?: RegistrationDetails; payment?: PaymentDetails; registrationSave?: RegistrationSave; message?: string };

export function PaymentVerification({ reference }: { reference: string }) {
  const [state, setState] = useState<State>({ kind: "loading", reference });
  useEffect(() => {
    if (!reference) return;
    const controller = new AbortController();
    fetch(`/api/paystack/verify?reference=${encodeURIComponent(reference)}`, { signal: controller.signal })
      .then(async (response) => ({ ok: response.ok, body: await response.json() }))
      .then(({ ok, body }) => {
        if (ok && body.success && body.status === "success") setState({ kind: "success", reference: body.reference || reference, registration: body.metadata?.registration, payment: { amount: body.amount, currency: body.currency, display: body.display }, registrationSave: body.registrationSave });
        else setState({ kind: "failed", reference, message: body.message });
      })
      .catch((error) => { if (error.name !== "AbortError") setState({ kind: "failed", reference, message: "Verification is temporarily unavailable." }); });
    return () => controller.abort();
  }, [reference]);

  if (!reference) return <Status title="No payment reference was provided." copy="We could not confirm this payment. If you were debited, please contact REALMS Institute with your payment reference." />;
  if (state.kind === "loading") return <Status title="Confirming your payment…" copy="Please wait while we securely check this reference with Paystack." />;
  if (state.kind === "failed") return <Status title="Payment Not Confirmed" copy="We could not confirm this payment. If you were debited, please contact REALMS Institute with your payment reference." reference={state.reference} note={state.message} />;
  return <Status title="Registration Payment Successful" copy="Your registration payment has been confirmed. REALMS Institute will contact you with onboarding details for the next cohort." reference={state.reference} registration={state.registration} payment={state.payment} registrationSave={state.registrationSave} />;
}

function Status({ title, copy, reference, note, registration, payment, registrationSave }: { title: string; copy: string; reference?: string; note?: string; registration?: RegistrationDetails; payment?: PaymentDetails; registrationSave?: RegistrationSave }) {
  const saveMessage = registrationSave?.saved
    ? "Your registration has been saved successfully."
    : registrationSave
      ? "Your payment was confirmed, but we could not automatically save your registration. Please contact REALMS Institute with your payment reference."
      : null;
  return <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-xl shadow-slate-950/5 sm:p-10"><h2 className="text-3xl font-semibold tracking-tight text-[#071327]">{title}</h2><p className="mt-4 max-w-2xl leading-7 text-slate-600">{copy}</p>{saveMessage ? <p className={`mt-5 rounded-xl border p-4 text-sm leading-6 ${registrationSave?.saved ? "border-emerald-200 bg-emerald-50 text-emerald-900" : "border-amber-200 bg-amber-50 text-amber-900"}`}>{saveMessage}</p> : null}{reference ? <p className="mt-6 rounded-xl bg-slate-100 p-4 text-sm text-slate-700"><strong>Payment reference:</strong> <span className="break-all">{reference}</span></p> : null}{note ? <p className="mt-3 text-sm text-red-700">{note}</p> : null}{registration ? <dl className="mt-8 grid gap-4 border-t border-slate-200 pt-7 sm:grid-cols-2"><Detail label="Applicant name" value={registration.fullName} /><Detail label="Email" value={registration.email} /><Detail label="WhatsApp" value={registration.whatsapp} /><Detail label="Learning mode" value={registration.learningMode} /><Detail label="Skill pathway" value={registration.skillPathway} />{payment ? <Detail label="Amount paid" value={payment.display} /> : null}</dl> : null}</div>;
}
function Detail({ label, value }: { label: string; value: string }) { return <div><dt className="text-xs font-semibold uppercase tracking-wider text-slate-500">{label}</dt><dd className="mt-1 text-slate-900">{value}</dd></div>; }
