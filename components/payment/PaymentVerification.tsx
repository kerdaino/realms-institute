"use client";

import { useEffect, useState } from "react";

import { PrimaryButton } from "@/components/ui/Button";
import { contactEmail, whatsappChannelUrl } from "@/lib/constants";
import type { RegistrationDetails } from "@/lib/registration";

type PaymentDetails = { amount: number; currency: string; display: string; requiredDisplay: string; variance?: { type: "exact" | "overpayment"; amount: number; display: string } };
type RegistrationSave = { saved: true; id: string } | { saved: false; reason: string };
type EmailResult = { sent: boolean; reason?: string };
type EmailStatus = { applicant: EmailResult; admin: EmailResult };
type PaymentRegistrationDetails = Pick<RegistrationDetails, "fullName" | "email" | "whatsapp" | "learningMode" | "skillPathway" | "requestedDiscipleshipRoute" | "screeningStatus">;
type State = { kind: "loading" | "success" | "failed"; reference: string; registrationMatched?: boolean; registration?: PaymentRegistrationDetails; payment?: PaymentDetails; registrationSave?: RegistrationSave; emailStatus?: EmailStatus; message?: string };

export function PaymentVerification({ reference }: { reference: string }) {
  const [state, setState] = useState<State>({ kind: "loading", reference });
  useEffect(() => {
    if (!reference) return;
    const controller = new AbortController();
    fetch(`/api/paystack/verify?reference=${encodeURIComponent(reference)}`, { signal: controller.signal })
      .then(async (response) => ({ ok: response.ok, body: await response.json() }))
      .then(({ ok, body }) => {
        if (ok && body.success && body.status === "success" && body.paymentConfirmed) setState({ kind: "success", reference: body.reference || reference, registrationMatched: body.registrationMatched === true, registration: body.registrationMatched === true ? body.metadata?.registration : undefined, payment: { amount: body.amount, currency: body.currency, display: body.display, requiredDisplay: body.requiredDisplay, variance: body.variance }, registrationSave: body.registrationSave, emailStatus: body.emailStatus });
        else setState({ kind: "failed", reference, message: body.message });
      })
      .catch((error) => { if (error.name !== "AbortError") setState({ kind: "failed", reference, message: "Verification is temporarily unavailable." }); });
    return () => controller.abort();
  }, [reference]);

  if (!reference) return <Status title="No payment reference was provided." copy={`We could not confirm this payment. If you were debited, please contact REALMS Institute at ${contactEmail} with your payment reference.`} />;
  if (state.kind === "loading") return <Status title="Confirming your payment…" copy="Please wait while we securely check this reference with Paystack." />;
  if (state.kind === "failed") return <Status title="Payment Not Confirmed" copy={state.message || `We could not confirm this payment. If you were debited, please contact REALMS Institute at ${contactEmail} with your payment reference.`} reference={state.reference} />;
  return <Status title="Payment Confirmed — Application Received" copy="Your REALMS School of Discovery registration payment has been verified successfully. Your application has been received for review; payment confirmation does not mean automatic admission." reference={state.reference} registration={state.registrationMatched ? state.registration : undefined} payment={state.payment} registrationSave={state.registrationSave} emailStatus={state.emailStatus} showWhatsAppNextStep />;
}

function Status({ title, copy, reference, note, registration, payment, registrationSave, emailStatus, showWhatsAppNextStep = false }: { title: string; copy: string; reference?: string; note?: string; registration?: PaymentRegistrationDetails; payment?: PaymentDetails; registrationSave?: RegistrationSave; emailStatus?: EmailStatus; showWhatsAppNextStep?: boolean }) {
  const hasDetails = Boolean(registration || payment || reference);
  const saveMessage = registrationSave?.saved
    ? "Your application record has been saved successfully."
    : registrationSave
      ? "Your payment was confirmed. Please save your payment reference. REALMS Institute can trace your registration using this reference if needed."
      : null;
  const applicantEmailMessage = emailStatus?.applicant.sent
    ? "An application confirmation email has been sent to your email address."
    : emailStatus?.applicant.reason === "Already sent."
      ? "Your application confirmation email has already been sent."
      : emailStatus
        ? "REALMS Institute will contact you by email with your admission/onboarding status and next steps."
        : null;
  return <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-xl shadow-slate-950/5 sm:p-10"><h2 className="text-3xl font-semibold tracking-tight text-[#071327]">{title}</h2><p className="mt-4 max-w-2xl leading-7 text-slate-600">{copy}</p>{payment?.variance?.type === "overpayment" ? <p className="mt-5 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm leading-6 text-amber-950">Your payment included an additional amount above the required registration fee. The excess payment has been recorded for reconciliation and your registration payment is confirmed.</p> : null}{registration?.screeningStatus === "submitted" ? <p className="mt-5 rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm leading-6 text-slate-700">Your foundational knowledge screening has been submitted for review.</p> : null}{showWhatsAppNextStep ? <div className="mt-6 rounded-2xl border border-[#d7aa45]/50 bg-[#071327] p-5 text-white shadow-lg shadow-slate-950/10 sm:p-6"><h3 className="text-2xl font-semibold">Important Next Step</h3><p className="mt-3 max-w-2xl text-sm leading-6 text-white/80">Please join the REALMS Institute WhatsApp Channel now to receive cohort updates, announcements, onboarding reminders, and future program notices while your application is being reviewed.</p><p className="mt-3 text-sm leading-6 text-white/70">Joining the WhatsApp Channel does not confirm admission, but it helps you stay informed and not miss important updates.</p><div className="mt-5"><PrimaryButton href={whatsappChannelUrl} target="_blank" rel="noopener noreferrer" showIcon>Join WhatsApp Channel Now</PrimaryButton></div></div> : null}{saveMessage ? <p className={`mt-5 rounded-xl border p-4 text-sm leading-6 ${registrationSave?.saved ? "border-emerald-200 bg-emerald-50 text-emerald-900" : "border-slate-200 bg-slate-50 text-slate-700"}`}>{saveMessage}</p> : null}{applicantEmailMessage ? <p className={`mt-4 rounded-xl border p-4 text-sm leading-6 ${emailStatus?.applicant.sent || emailStatus?.applicant.reason === "Already sent." ? "border-emerald-200 bg-emerald-50 text-emerald-900" : "border-amber-200 bg-amber-50 text-amber-900"}`}>{applicantEmailMessage}</p> : null}{note ? <p className="mt-3 text-sm text-red-700">{note}</p> : null}{hasDetails ? <dl className="mt-8 grid gap-4 border-t border-slate-200 pt-7 sm:grid-cols-2">{registration ? <><Detail label="Applicant name" value={registration.fullName} /><Detail label="Email" value={registration.email} /><Detail label="WhatsApp" value={registration.whatsapp} /><Detail label="Requested discipleship route" value={registration.requestedDiscipleshipRoute === "advanced" ? "Advanced Discipleship Programme" : "Foundational Discipleship Programme"} /><Detail label="Skill pathway learning mode" value={registration.learningMode} /><Detail label="Skill pathway" value={registration.skillPathway} /></> : null}{payment ? <><Detail label="Required registration fee" value={payment.requiredDisplay} /><Detail label="Amount paid" value={payment.display} /><Detail label="Payment status" value="Confirmed" /></> : null}{reference ? <Detail label="Payment reference" value={reference} /> : null}</dl> : null}{reference ? <p className="mt-5 rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm font-semibold leading-6 text-slate-700">Please save your payment reference for your records.</p> : null}{reference ? <p className="mt-4 text-sm leading-6 text-slate-600">If you need help, contact REALMS Institute at <a className="font-semibold text-[#071327] underline underline-offset-4" href={`mailto:${contactEmail}`}>{contactEmail}</a> with your payment reference.</p> : null}</div>;
}
function Detail({ label, value }: { label: string; value: string }) { return <div><dt className="text-xs font-semibold uppercase tracking-wider text-slate-500">{label}</dt><dd className="mt-1 text-slate-900">{value}</dd></div>; }
