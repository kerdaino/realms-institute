import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";

import { PortalLoginForm } from "@/components/portal/PortalLoginForm";
import { BrandLogo } from "@/components/ui/BrandLogo";
import { getCurrentUser, getCurrentUserRoles, resolvePortalRouteForCurrentUser } from "@/lib/lms/auth";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "REALMS Institute Portal",
  description: "Access your REALMS learning and institutional account.",
};

export default async function PortalLoginPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const user = await getCurrentUser();
  if (user) redirect(await resolvePortalRouteForCurrentUser(await getCurrentUserRoles()));
  const { error } = await searchParams;

  return (
    <main className="relative flex min-h-dvh items-center justify-center overflow-hidden bg-[linear-gradient(145deg,#050d1c_0%,#0b2140_62%,#132f53_100%)] px-5 py-12 text-white">
      <div aria-hidden="true" className="realm-grid absolute inset-0 opacity-50" />
      <div aria-hidden="true" className="absolute -right-24 top-10 size-80 rounded-full bg-[#d7aa45]/12 blur-3xl" />
      <section className="glass-card relative w-full max-w-xl rounded-3xl p-7 md:p-10">
        <Link href="/" aria-label="REALMS Institute home" className="inline-flex items-center gap-3">
          <BrandLogo className="size-14" sizes="56px" priority />
          <span><span className="block font-semibold tracking-[0.12em]">REALMS</span><span className="block text-xs text-[var(--realm-muted)]">Institute</span></span>
        </Link>
        <p className="mt-9 text-xs font-semibold uppercase tracking-[0.22em] text-[var(--realm-gold-soft)]">REALMS Institute</p>
        <h1 className="mt-3 text-4xl font-semibold tracking-tight md:text-5xl">Portal Sign In</h1>
        <p className="mt-4 leading-7 text-[var(--realm-muted)]">Access your REALMS learning and institutional account.</p>
        {error ? <p role="alert" className="mt-6 rounded-xl border border-amber-300/25 bg-amber-300/10 p-4 text-sm leading-6 text-amber-100">This activation link is no longer valid. Please request a new account activation email or contact REALMS Institute.</p> : null}
        <PortalLoginForm />
        <p className="mt-6 text-xs leading-6 text-[var(--realm-slate)]">Portal access is issued only to activated REALMS students, alumni, facilitators and mentors. An authentication account alone does not create student status.</p>
      </section>
    </main>
  );
}
