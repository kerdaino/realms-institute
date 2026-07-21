import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";

import { SetupPasswordForm } from "@/components/portal/SetupPasswordForm";
import { BrandLogo } from "@/components/ui/BrandLogo";
import { readPasswordSetupGrant } from "@/lib/lms/passwordSetupGrant";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Create Your Password | REALMS Institute", referrer: "no-referrer" };
export const dynamic = "force-dynamic";

export default async function SetupPasswordPage() {
  const supabase = await createSupabaseServerClient();
  const authenticated = await supabase.auth.getUser();
  if (authenticated.error || !authenticated.data.user) redirect("/portal/login?error=invalid_link");
  if (!(await readPasswordSetupGrant(authenticated.data.user.id))) redirect("/portal/login?error=invalid_link");
  return <main className="relative flex min-h-dvh items-center justify-center overflow-hidden bg-[linear-gradient(145deg,#050d1c_0%,#0b2140_62%,#132f53_100%)] px-5 py-12 text-white">
    <div aria-hidden="true" className="realm-grid absolute inset-0 opacity-50" />
    <section className="glass-card relative w-full max-w-xl rounded-3xl p-7 md:p-10">
      <Link href="/" aria-label="REALMS Institute home" className="inline-flex items-center gap-3"><BrandLogo className="size-14" sizes="56px" priority /><span><span className="block font-semibold tracking-[0.12em]">REALMS</span><span className="block text-xs text-[var(--realm-muted)]">Institute</span></span></Link>
      <p className="mt-9 text-xs font-semibold uppercase tracking-[0.22em] text-[var(--realm-gold-soft)]">Secure Account Setup</p>
      <h1 className="mt-3 text-4xl font-semibold tracking-tight">Create Your Password</h1>
      <p className="mt-4 leading-7 text-[var(--realm-muted)]">Choose a private password for normal REALMS Portal sign-in. Your password is sent directly to Supabase Auth and is never stored in REALMS application tables.</p>
      <SetupPasswordForm />
    </section>
  </main>;
}
