"use client";

import { useEffect, useState } from "react";

import type { RegistrationDetails } from "@/lib/registration";

type PaymentDetails = { amount: number; currency: string; display: string };
type RegistrationSave = { saved: true; id: string } | { saved: false; reason: string };
type EmailResult = { sent: boolean; reason?: string };
type EmailStatus = { applicant: EmailResult; admin: EmailResult };
type State = { kind: "loading" | "success" | "failed"; reference: string; registration?: RegistrationDetails; payment?: PaymentDetails; registrationSave?: RegistrationSave; emailStatus?: EmailStatus; message?: string };

export function PaymentVerification({ reference }: { reference: string }) {
  const [state, setState] = useState<State>({ kind: "loading", reference });
  useEffect(() => {
    if (!reference) return;
    const controller = new AbortController();
    fetch(`/api/paystack/verify?reference=${encodeURIComponent(reference)}`, { signal: controller.signal })
      .then(async (response) => ({ ok: response.ok, body: await response.json() }))
      .then(({ ok, body }) => {
        if (ok && body.success && body.status === "success") setState({ kind: "success", reference: body.reference || reference, registration: body.metadata?.registration, payment: { amount: body.amount, currency: body.currency, display: body.display }, registrationSave: body.registrationSave, emailStatus: body.emailStatus });
        else setState({ kind: "failed", reference, message: body.message });
      })
      .catch((error) => { if (error.name !== "AbortError") setState({ kind: "failed", reference, message: "Verification is temporarily unavailable." }); });
    return () => controller.abort();
  }, [reference]);

  if (!reference) return <Status title="No payment reference was provided." copy="We could not confirm this payment. If you were debited, please contact REALMS Institute with your payment reference." />;
  if (state.kind === "loading") return <Status title="Confirming your payment…" copy="Please wait while we securely check this reference with Paystack." />;
  if (state.kind === "failed") return <Status title="Payment Not Confirmed" copy="We could not confirm this payment. If you were debited, please contact REALMS Institute with your payment reference." reference={state.reference} note={state.message} />;
  return <Status title="Payment Confirmed — Application Received" copy="Your registration payment has been confirmed and your application has been received. REALMS Institute will review your registration and contact you with your admission/onboarding status and next steps." reference={state.reference} registration={state.registration} payment={state.payment} registrationSave={state.registrationSave} emailStatus={state.emailStatus} />;
}

function Status({ title, copy, reference, note, registration, payment, registrationSave, emailStatus }: { title: string; copy: string; reference?: string; note?: string; registration?: RegistrationDetails; payment?: PaymentDetails; registrationSave?: RegistrationSave; emailStatus?: EmailStatus }) {
  const saveMessage = registrationSave?.saved
    ? "Your registration has been saved successfully."
    : registrationSave
      ? "Your payment was confirmed, but we could not automatically save your registration. Please contact REALMS Institute with your payment reference."
      : null;
  const applicantEmailMessage = emailStatus?.applicant.sent
    ? "Confirmation email sent to your email address."
    : emailStatus?.applicant.reason === "Already sent."
      ? "Your confirmation email has already been sent."
      : emailStatus
        ? "Your payment was confirmed. If you do not receive an email, REALMS Institute will still contact you using your registration details."
        : null;
  return <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-xl shadow-slate-950/5 sm:p-10"><h2 className="text-3xl font-semibold tracking-tight text-[#071327]">{title}</h2><p className="mt-4 max-w-2xl leading-7 text-slate-600">{copy}</p>{saveMessage ? <p className={`mt-5 rounded-xl border p-4 text-sm leading-6 ${registrationSave?.saved ? "border-emerald-200 bg-emerald-50 text-emerald-900" : "border-amber-200 bg-amber-50 text-amber-900"}`}>{saveMessage}</p> : null}{applicantEmailMessage ? <p className={`mt-3 rounded-xl border p-4 text-sm leading-6 ${emailStatus?.applicant.sent || emailStatus?.applicant.reason === "Already sent." ? "border-emerald-200 bg-emerald-50 text-emerald-900" : "border-amber-200 bg-amber-50 text-amber-900"}`}>{applicantEmailMessage}</p> : null}{reference ? <p className="mt-6 rounded-xl bg-slate-100 p-4 text-sm text-slate-700"><strong>Payment reference:</strong> <span className="break-all">{reference}</span></p> : null}{reference ? <p className="mt-3 text-sm font-semibold text-slate-700">Please save your payment reference for your records.</p> : null}{note ? <p className="mt-3 text-sm text-red-700">{note}</p> : null}{registration ? <dl className="mt-8 grid gap-4 border-t border-slate-200 pt-7 sm:grid-cols-2"><Detail label="Applicant name" value={registration.fullName} /><Detail label="Email" value={registration.email} /><Detail label="WhatsApp" value={registration.whatsapp} /><Detail label="Learning mode" value={registration.learningMode} /><Detail label="Skill pathway" value={registration.skillPathway} />{payment ? <Detail label="Amount paid" value={payment.display} /> : null}{reference ? <Detail label="Payment reference" value={reference} /> : null}</dl> : null}</div>;
}
function Detail({ label, value }: { label: string; value: string }) { return <div><dt className="text-xs font-semibold uppercase tracking-wider text-slate-500">{label}</dt><dd className="mt-1 text-slate-900">{value}</dd></div>; }
