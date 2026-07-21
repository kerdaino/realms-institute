import type { Metadata } from "next";
import Link from "next/link";

import { ForgotPasswordForm } from "@/components/portal/ForgotPasswordForm";
import { BrandLogo } from "@/components/ui/BrandLogo";

export const metadata: Metadata = { title: "Forgot Password | REALMS Institute" };

export default function ForgotPasswordPage() {
  return <main className="relative flex min-h-dvh items-center justify-center overflow-hidden bg-[linear-gradient(145deg,#050d1c_0%,#0b2140_62%,#132f53_100%)] px-5 py-12 text-white">
    <div aria-hidden="true" className="realm-grid absolute inset-0 opacity-50" />
    <section className="glass-card relative w-full max-w-xl rounded-3xl p-7 md:p-10">
      <Link href="/" aria-label="REALMS Institute home" className="inline-flex items-center gap-3"><BrandLogo className="size-14" sizes="56px" priority /><span><span className="block font-semibold tracking-[0.12em]">REALMS</span><span className="block text-xs text-[var(--realm-muted)]">Institute</span></span></Link>
      <p className="mt-9 text-xs font-semibold uppercase tracking-[0.22em] text-[var(--realm-gold-soft)]">Secure Account Recovery</p>
      <h1 className="mt-3 text-4xl font-semibold tracking-tight">Forgot Password</h1>
      <p className="mt-4 leading-7 text-[var(--realm-muted)]">Enter your portal email address. For privacy, the response is the same whether or not an account exists.</p>
      <ForgotPasswordForm />
      <p className="mt-6 text-center text-sm text-[var(--realm-muted)]">Need help? <a href="mailto:gloryrealm2025@gmail.com" className="font-semibold text-white underline underline-offset-4">gloryrealm2025@gmail.com</a></p>
    </section>
  </main>;
}
