"use client";

import { useEffect, useState } from "react";

import { PrimaryButton } from "@/components/ui/Button";
import { whatsappChannelUrl } from "@/lib/constants";
import type { RegistrationDetails } from "@/lib/registration";

type PaymentDetails = { amount: number; currency: string; display: string; publicFeeDisplay?: string };
type RegistrationSave = { saved: true; id: string } | { saved: false; reason: string };
type EmailResult = { sent: boolean; reason?: string };
type EmailStatus = { applicant: EmailResult; admin: EmailResult };
type State = { kind: "loading" | "success" | "failed"; reference: string; registrationMatched?: boolean; registration?: RegistrationDetails; payment?: PaymentDetails; customerEmail?: string; registrationSave?: RegistrationSave; emailStatus?: EmailStatus; message?: string };

function readCustomerEmail(customer: unknown) {
  if (!customer || typeof customer !== "object" || Array.isArray(customer)) return undefined;
  const email = (customer as Record<string, unknown>).email;
  return typeof email === "string" && email.trim() ? email.trim() : undefined;
}

export function PaymentVerification({ reference }: { reference: string }) {
  const [state, setState] = useState<State>({ kind: "loading", reference });
  useEffect(() => {
    if (!reference) return;
    const controller = new AbortController();
    fetch(`/api/paystack/verify?reference=${encodeURIComponent(reference)}`, { signal: controller.signal })
      .then(async (response) => ({ ok: response.ok, body: await response.json() }))
      .then(({ ok, body }) => {
        if (ok && body.success && body.status === "success" && body.paymentConfirmed) setState({ kind: "success", reference: body.reference || reference, registrationMatched: body.registrationMatched === true, registration: body.registrationMatched === true ? body.metadata?.registration : undefined, payment: { amount: body.amount, currency: body.currency, display: body.display, publicFeeDisplay: body.publicFeeDisplay }, customerEmail: readCustomerEmail(body.customer), registrationSave: body.registrationSave, emailStatus: body.emailStatus });
        else setState({ kind: "failed", reference, message: body.message });
      })
      .catch((error) => { if (error.name !== "AbortError") setState({ kind: "failed", reference, message: "Verification is temporarily unavailable." }); });
    return () => controller.abort();
  }, [reference]);

  if (!reference) return <Status title="No payment reference was provided." copy="We could not confirm this payment. If you were debited, please contact REALMS Institute with your payment reference." />;
  if (state.kind === "loading") return <Status title="Confirming your payment…" copy="Please wait while we securely check this reference with Paystack." />;
  if (state.kind === "failed") return <Status title="Payment Not Confirmed" copy="We could not confirm this payment. If you were debited, please contact REALMS Institute with your payment reference." reference={state.reference} note={state.message} />;
  return <Status title="Payment Confirmed — Application Received" copy="Your registration payment has been confirmed and your application has been received. REALMS Institute will review your registration and contact you by email with your admission/onboarding status and next steps." reference={state.reference} registration={state.registrationMatched ? state.registration : undefined} payment={state.payment} customerEmail={state.registrationMatched ? undefined : state.customerEmail} registrationSave={state.registrationSave} emailStatus={state.emailStatus} showWhatsAppNextStep />;
}

function Status({ title, copy, reference, note, registration, payment, customerEmail, registrationSave, emailStatus, showWhatsAppNextStep = false }: { title: string; copy: string; reference?: string; note?: string; registration?: RegistrationDetails; payment?: PaymentDetails; customerEmail?: string; registrationSave?: RegistrationSave; emailStatus?: EmailStatus; showWhatsAppNextStep?: boolean }) {
  const hasDetails = Boolean(registration || payment || reference || customerEmail);
  const saveMessage = registrationSave?.saved
    ? "Your application record has been saved successfully."
    : registrationSave
      ? "Your payment was confirmed. If your application record does not appear automatically, REALMS Institute can still trace your registration using your payment reference."
      : null;
  const applicantEmailMessage = emailStatus?.applicant.sent
    ? "An application confirmation email has been sent to your email address."
    : emailStatus?.applicant.reason === "Already sent."
      ? "Your application confirmation email has already been sent."
      : emailStatus
        ? "REALMS Institute will contact you by email with your admission/onboarding status and next steps."
        : null;
  const showDevEmailStatus = process.env.NODE_ENV !== "production" && emailStatus;
  return <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-xl shadow-slate-950/5 sm:p-10"><h2 className="text-3xl font-semibold tracking-tight text-[#071327]">{title}</h2><p className="mt-4 max-w-2xl leading-7 text-slate-600">{copy}</p>{showWhatsAppNextStep ? <div className="mt-6 rounded-2xl border border-[#d7aa45]/50 bg-[#071327] p-5 text-white shadow-lg shadow-slate-950/10 sm:p-6"><h3 className="text-2xl font-semibold">Important Next Step</h3><p className="mt-3 max-w-2xl text-sm leading-6 text-white/80">Please join the REALMS Institute WhatsApp Channel now to receive cohort updates, announcements, onboarding reminders, and future program notices while your application is being reviewed.</p><p className="mt-3 text-sm leading-6 text-white/70">Joining the WhatsApp Channel does not confirm admission, but it helps you stay informed and not miss important updates.</p><div className="mt-5"><PrimaryButton href={whatsappChannelUrl} target="_blank" rel="noopener noreferrer" showIcon>Join WhatsApp Channel Now</PrimaryButton></div></div> : null}{applicantEmailMessage ? <p className={`mt-5 rounded-xl border p-4 text-sm leading-6 ${emailStatus?.applicant.sent || emailStatus?.applicant.reason === "Already sent." ? "border-emerald-200 bg-emerald-50 text-emerald-900" : "border-amber-200 bg-amber-50 text-amber-900"}`}>{applicantEmailMessage}</p> : null}{showDevEmailStatus ? <div className="mt-4 rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm leading-6 text-slate-700"><p className="font-semibold text-slate-950">Email Status:</p><p>Applicant Email: {emailStatus.applicant.sent ? "sent" : emailStatus.applicant.reason || "not sent"}</p><p>Admin Email: {emailStatus.admin.sent ? "sent" : emailStatus.admin.reason || "not sent"}</p></div> : null}{note ? <p className="mt-3 text-sm text-red-700">{note}</p> : null}{hasDetails ? <dl className="mt-8 grid gap-4 border-t border-slate-200 pt-7 sm:grid-cols-2">{registration ? <><Detail label="Applicant name" value={registration.fullName} /><Detail label="Email" value={registration.email} /><Detail label="WhatsApp" value={registration.whatsapp} /><Detail label="Learning mode" value={registration.learningMode} /><Detail label="Skill pathway" value={registration.skillPathway} /></> : null}{payment?.publicFeeDisplay && payment.publicFeeDisplay !== payment.display ? <Detail label="Registration Fee" value={payment.publicFeeDisplay} /> : null}{payment ? <Detail label="Amount paid" value={payment.display} /> : null}{reference ? <Detail label="Payment reference" value={reference} /> : null}{customerEmail ? <Detail label="Customer email" value={customerEmail} /> : null}</dl> : null}{reference ? <p className="mt-5 text-sm font-semibold text-slate-700">Please save your payment reference for your records.</p> : null}{saveMessage ? <p className={`mt-4 rounded-xl border p-4 text-sm leading-6 ${registrationSave?.saved ? "border-emerald-200 bg-emerald-50 text-emerald-900" : "border-slate-200 bg-slate-50 text-slate-700"}`}>{saveMessage}</p> : null}</div>;
}
function Detail({ label, value }: { label: string; value: string }) { return <div><dt className="text-xs font-semibold uppercase tracking-wider text-slate-500">{label}</dt><dd className="mt-1 text-slate-900">{value}</dd></div>; }
