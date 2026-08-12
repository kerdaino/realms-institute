import type { Metadata } from "next";
import Link from "next/link";
import { connection } from "next/server";

import { PageHero } from "@/components/layout/PageHero";
import { PageShell } from "@/components/layout/PageShell";
import { RegistrationForm } from "@/components/registration/RegistrationForm";
import { contactEmail } from "@/lib/constants";
import { getPublicRegistrationState } from "@/lib/registrationControl.server";

export const metadata: Metadata = { title: "Apply for REALMS Institute", description: "View the current REALMS Institute registration cohort and apply when public registration is open." };

type RegisterPageProps = {
  searchParams: Promise<{ applicant?: string | string[]; skill?: string | string[] }>;
};

export default async function RegisterPage({ searchParams }: RegisterPageProps) {
  await connection();
  const query = await searchParams;
  const applicant = typeof query.applicant === "string" ? query.applicant : "";
  const skill = typeof query.skill === "string" ? query.skill : "";
  const initialSkillPathway = skill === "web-development" ? "Web Development" : skill === "cybersecurity-foundations" ? "Cybersecurity Foundations" : undefined;
  const state = await getPublicRegistrationState();

  if (state.kind === "closed") {
    const cohortName = state.cohort?.name;
    return <PageShell><PageHero eyebrow="Admissions" title="Registration Closed" subtitle={cohortName ? `${cohortName} is not currently accepting new public applications.` : "REALMS Institute is not currently accepting new public applications."} breadcrumbs={[{ label: "Home", href: "/" }, { label: "Register" }]} /><section className="bg-[#f7f5ef] px-5 py-16 md:px-8 md:py-24"><div className="mx-auto max-w-3xl rounded-3xl border border-slate-200 bg-white p-7 shadow-lg shadow-slate-950/5 sm:p-10"><p className="text-lg leading-8 text-slate-700">{cohortName ? `Registration for ${cohortName} is now closed.` : "Public registration is currently closed."}</p><p className="mt-5 leading-7 text-slate-600">Applications already submitted remain under review. Applicants who have already received payment, scholarship or admission instructions should continue using the links previously provided to them.</p><div className="mt-8 flex flex-wrap gap-3"><Link href="/" className="rounded-xl bg-[#071327] px-5 py-3 text-sm font-semibold text-white">REALMS Home</Link><a href={`mailto:${contactEmail}`} className="rounded-xl border border-slate-300 px-5 py-3 text-sm font-semibold text-[#071327]">Contact Admissions</a></div></div></section></PageShell>;
  }

  return <PageShell><PageHero eyebrow={`${state.cohort.name} Registration`} title="Apply for REALMS Institute" subtitle="Every admitted student completes one approved discipleship route and one practical skill pathway. REALMS will confirm your approved discipleship route after any required review." breadcrumbs={[{ label: "Home", href: "/" }, { label: "Register" }]} /><section className="bg-[#f7f5ef] px-5 py-16 md:px-8 md:py-24"><div className="mx-auto max-w-4xl rounded-3xl border border-slate-200 bg-white p-5 shadow-lg shadow-slate-950/5 sm:p-8 lg:p-12"><RegistrationForm cohortId={state.cohort.id} cohortName={state.cohort.name} initialSkillPathway={initialSkillPathway} advancedEntryRequested={applicant === "advanced"} /></div></section></PageShell>;
}
