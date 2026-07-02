import type { Metadata } from "next";

import { PageHero } from "@/components/layout/PageHero";
import { PageShell } from "@/components/layout/PageShell";
import { RegistrationForm } from "@/components/registration/RegistrationForm";

export const metadata: Metadata = { title: "Apply for the Next Cohort | REALMS Institute", description: "Apply for the next REALMS Institute formation cohort and proceed to secure Paystack checkout." };

export default function RegisterPage() {
  return <PageShell><PageHero eyebrow="August Cohort" title="Apply for the Next Cohort" subtitle="Apply for REALMS School of Discovery and choose Web Development or Cybersecurity Foundations as your practical skill pathway." breadcrumbs={[{ label: "Home", href: "/" }, { label: "Register" }]} /><section className="bg-[#f7f5ef] px-5 py-16 md:px-8 md:py-24"><div className="mx-auto max-w-4xl rounded-3xl border border-slate-200 bg-white p-5 shadow-xl shadow-slate-950/5 sm:p-8 lg:p-12"><RegistrationForm /></div></section></PageShell>;
}
