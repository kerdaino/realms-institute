import type { EmailOtpType } from "@supabase/supabase-js";
import type { Metadata } from "next";
import Link from "next/link";

import { ConfirmPortalAuthForm } from "@/components/portal/ConfirmPortalAuthForm";
import { BrandLogo } from "@/components/ui/BrandLogo";
import { isPortalLinkIntent, isPortalSetupContext } from "@/lib/lms/portalAuthPolicy";

export const metadata: Metadata = { title: "Confirm Secure Access | REALMS Institute", referrer: "no-referrer" };
const allowedTypes = new Set<EmailOtpType>(["magiclink", "invite", "email", "recovery"]);

export default async function ConfirmPortalAuthPage({ searchParams }: { searchParams: Promise<{ token_hash?: string; type?: string; intent?: string; context?: string; error?: string }> }) {
  const params = await searchParams;
  const tokenHash = params.token_hash?.trim() || "";
  const suppliedIntent = params.intent?.trim() || "signin";
  const suppliedContext = params.context?.trim() || "recovery";
  const type = allowedTypes.has(params.type as EmailOtpType) ? params.type as EmailOtpType : null;
  const intent = isPortalLinkIntent(suppliedIntent) ? suppliedIntent : null;
  const context = isPortalSetupContext(suppliedContext) ? suppliedContext : null;
  const confirmation = !params.error && tokenHash && type && intent && context ? { tokenHash, type, intent, context } : null;
  return <main className="relative flex min-h-dvh items-center justify-center overflow-hidden bg-[linear-gradient(145deg,#050d1c_0%,#0b2140_62%,#132f53_100%)] px-5 py-12 text-white">
    <div aria-hidden="true" className="realm-grid absolute inset-0 opacity-50" />
    <section className="glass-card relative w-full max-w-xl rounded-3xl p-7 md:p-10">
      <Link href="/" aria-label="REALMS Institute home" className="inline-flex items-center gap-3"><BrandLogo className="size-14" sizes="56px" priority /><span><span className="block font-semibold tracking-[0.12em]">REALMS</span><span className="block text-xs text-[var(--realm-muted)]">Institute</span></span></Link>
      <p className="mt-9 text-xs font-semibold uppercase tracking-[0.22em] text-[var(--realm-gold-soft)]">Secure Account Verification</p>
      <h1 className="mt-3 text-4xl font-semibold tracking-tight">Continue Securely</h1>
      {confirmation ? <><p className="mt-4 leading-7 text-[var(--realm-muted)]">Confirm that you want to continue. Your secure link is verified only after you press the button, which helps protect it from automated email previews.</p><ConfirmPortalAuthForm {...confirmation} /></> : <><p role="alert" className="mt-6 rounded-xl border border-amber-300/25 bg-amber-300/10 p-4 text-sm leading-6 text-amber-100">This activation link is no longer valid. Please request a new account activation email or contact REALMS Institute.</p><Link href="/portal/login" className="mt-6 inline-block font-semibold text-[var(--realm-gold-soft)] underline underline-offset-4">Return to Portal Sign In</Link></>}
    </section>
  </main>;
}
