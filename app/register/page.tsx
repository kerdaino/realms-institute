import type { Metadata } from "next";

import { PageHero } from "@/components/layout/PageHero";
import { PageShell } from "@/components/layout/PageShell";
import { RegistrationForm } from "@/components/registration/RegistrationForm";

export const metadata: Metadata = { title: "Apply for REALMS Institute Next Cohort", description: "Apply for the next REALMS School of Discovery cohort and select Web Development or Cybersecurity Foundations as your practical skill pathway." };

export default function RegisterPage() {
  return <PageShell><PageHero eyebrow="Registration Open" title="Apply for the Next Cohort" subtitle="Registration is open for the next REALMS School of Discovery cohort. Choose Web Development or Cybersecurity Foundations as your practical skill pathway." breadcrumbs={[{ label: "Home", href: "/" }, { label: "Register" }]} /><section className="bg-[#f7f5ef] px-5 py-16 md:px-8 md:py-24"><div className="mx-auto max-w-4xl rounded-3xl border border-slate-200 bg-white p-5 shadow-lg shadow-slate-950/5 sm:p-8 lg:p-12"><RegistrationForm /></div></section></PageShell>;
}
