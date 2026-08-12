import type { Metadata } from "next";
import Link from "next/link";
import { connection } from "next/server";

import { PageHero } from "@/components/layout/PageHero";
import { PageShell } from "@/components/layout/PageShell";
import { RegistrationForm } from "@/components/registration/RegistrationForm";
import { contactEmail } from "@/lib/constants";
import { getLateRegistrationPageState } from "@/lib/registrationControl.server";

export const metadata: Metadata = { title: "Private Registration Invitation | REALMS Institute", robots: { index: false, follow: false } };

export default async function LateRegistrationInvitePage({ params }: { params: Promise<{ token: string }> }) {
  await connection();
  const { token } = await params;
  const state = await getLateRegistrationPageState(token);
  if (state.kind === "invalid") {
    return <PageShell><PageHero eyebrow="Admissions" title="Invitation Unavailable" subtitle="This private registration invitation cannot be used." breadcrumbs={[{ label: "Home", href: "/" }, { label: "Private Registration" }]} /><section className="bg-[#f7f5ef] px-5 py-16 md:px-8 md:py-24"><div className="mx-auto max-w-3xl rounded-3xl border border-slate-200 bg-white p-7 sm:p-10"><p className="leading-7 text-slate-700">{state.message}</p><div className="mt-7 flex gap-3"><Link href="/" className="rounded-xl bg-[#071327] px-5 py-3 text-sm font-semibold text-white">REALMS Home</Link><a href={`mailto:${contactEmail}`} className="rounded-xl border border-slate-300 px-5 py-3 text-sm font-semibold">Contact Admissions</a></div></div></section></PageShell>;
  }
  return <PageShell><PageHero eyebrow="Private Registration Invitation" title="Apply for REALMS Institute" subtitle={`This invitation authorises one application to ${state.cohort.name} using ${state.applicantEmail}.`} breadcrumbs={[{ label: "Home", href: "/" }, { label: "Private Registration" }]} /><section className="bg-[#f7f5ef] px-5 py-16 md:px-8 md:py-24"><div className="mx-auto max-w-4xl rounded-3xl border border-slate-200 bg-white p-5 shadow-lg shadow-slate-950/5 sm:p-8 lg:p-12"><RegistrationForm cohortId={state.cohort.id} cohortName={state.cohort.name} inviteToken={token} authorisedEmail={state.applicantEmail} applicantName={state.applicantName} /></div></section></PageShell>;
}
