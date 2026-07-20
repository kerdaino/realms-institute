import type { Metadata } from "next";

import { PageHero } from "@/components/layout/PageHero";
import { PageShell } from "@/components/layout/PageShell";
import { PrimaryButton } from "@/components/ui/Button";
import { contactEmail, whatsappChannelUrl } from "@/lib/constants";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";

export const metadata: Metadata = { title: "Scholarship Request Received | REALMS Institute" };

function first(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

export default async function ScholarshipReceivedPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const applicationId = (first((await searchParams).application) || "").trim();
  const supabase = getSupabaseAdmin();
  let confirmed = false;
  let screeningSubmitted = false;
  if (supabase && /^[0-9a-f-]{36}$/i.test(applicationId)) {
    const { data } = await supabase.from("registrations").select("funding_route, scholarship_status, screening_status").eq("id", applicationId).eq("funding_route", "scholarship_request").eq("scholarship_status", "pending").maybeSingle();
    confirmed = Boolean(data);
    screeningSubmitted = data?.screening_status === "submitted";
  }

  return <PageShell><PageHero eyebrow="Application Review" title={confirmed ? "Application & Scholarship Request Received" : "Application Confirmation Unavailable"} subtitle={confirmed ? "Your application has been saved for review without starting a Paystack transaction." : "We could not confirm a saved scholarship request from this link."} breadcrumbs={[{ label: "Home", href: "/" }, { label: "Register", href: "/register" }, { label: "Scholarship Request" }]} /><section className="bg-[#f7f5ef] px-5 py-16 md:px-8 md:py-24"><div className="mx-auto max-w-4xl rounded-3xl border border-slate-200 bg-white p-6 shadow-xl shadow-slate-950/5 sm:p-10">{confirmed ? <><h2 className="text-3xl font-semibold tracking-tight text-[#071327]">Application & Scholarship Request Received</h2><p className="mt-4 max-w-2xl leading-7 text-slate-600">Your application and scholarship support request have been received. REALMS Institute will review your request and contact you by email with the outcome and next steps.</p><p className="mt-5 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm leading-6 text-amber-950">Scholarship support is subject to review and availability. A scholarship request does not guarantee admission.</p>{screeningSubmitted ? <p className="mt-4 rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm leading-6 text-slate-700">Your foundational knowledge screening has been submitted for review.</p> : null}<div className="mt-6 rounded-2xl border border-[#d7aa45]/50 bg-[#071327] p-5 text-white sm:p-6"><h3 className="text-2xl font-semibold">Stay Informed</h3><p className="mt-3 max-w-2xl text-sm leading-6 text-white/80">Join the REALMS Institute WhatsApp Channel for programme updates and review-related announcements. Joining the channel does not confirm scholarship support or admission.</p><div className="mt-5"><PrimaryButton href={whatsappChannelUrl} target="_blank" rel="noopener noreferrer" showIcon>Join WhatsApp Channel</PrimaryButton></div></div></> : <><h2 className="text-3xl font-semibold tracking-tight text-[#071327]">Application Confirmation Unavailable</h2><p className="mt-4 max-w-2xl leading-7 text-slate-600">No payment was started from this page. Please return to the registration form and submit your scholarship request again, or contact REALMS Institute at <a className="font-semibold underline underline-offset-4" href={`mailto:${contactEmail}`}>{contactEmail}</a>.</p><div className="mt-6"><PrimaryButton href="/register" showIcon>Return to Registration</PrimaryButton></div></>}</div></section></PageShell>;
}
