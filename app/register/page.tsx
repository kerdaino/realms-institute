import type { Metadata } from "next";

import { PageHero } from "@/components/layout/PageHero";
import { PageShell } from "@/components/layout/PageShell";
import { RegistrationForm } from "@/components/registration/RegistrationForm";

export const metadata: Metadata = { title: "Apply for REALMS Institute August 2026", description: "Apply for the August 2026 REALMS Institute programme, request the appropriate discipleship route, and choose a practical skill pathway." };

export default function RegisterPage() {
  return <PageShell><PageHero eyebrow="August 2026 Registration" title="Apply for REALMS Institute" subtitle="Every admitted student completes one approved discipleship route and one practical skill pathway. REALMS will confirm your approved discipleship route after any required review." breadcrumbs={[{ label: "Home", href: "/" }, { label: "Register" }]} /><section className="bg-[#f7f5ef] px-5 py-16 md:px-8 md:py-24"><div className="mx-auto max-w-4xl rounded-3xl border border-slate-200 bg-white p-5 shadow-lg shadow-slate-950/5 sm:p-8 lg:p-12"><RegistrationForm /></div></section></PageShell>;
}
