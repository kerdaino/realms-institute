"use client";

import { useActionState } from "react";
import Link from "next/link";
import { LockKeyhole, Mail } from "lucide-react";

import { PrimaryButton } from "@/components/ui/Button";
import { requestPortalMagicLink, signInWithPortalPassword, type PortalLoginState } from "@/app/portal/login/actions";

const initialPortalLoginState: PortalLoginState = { status: "idle", message: "" };

export function PortalLoginForm() {
  const [state, action, pending] = useActionState(signInWithPortalPassword, initialPortalLoginState);
  const [linkState, linkAction, linkPending] = useActionState(requestPortalMagicLink, initialPortalLoginState);

  return (
    <div className="mt-8 space-y-5">
      <form action={action} className="grid gap-5">
        <label className="grid gap-2 text-sm font-semibold text-white" htmlFor="portal-email">Email Address<span className="relative"><Mail aria-hidden="true" className="absolute left-4 top-1/2 size-5 -translate-y-1/2 text-[var(--realm-slate)]" /><input id="portal-email" name="email" type="email" inputMode="email" autoComplete="email" required placeholder="you@example.com" className="min-h-13 w-full rounded-xl border border-white/15 bg-[#050d1c]/70 py-3 pl-12 pr-4 text-white outline-none placeholder:text-[var(--realm-slate)] focus:border-[var(--realm-gold)] focus:ring-2 focus:ring-[var(--realm-gold)]/20" /></span></label>
        <label className="grid gap-2 text-sm font-semibold text-white" htmlFor="portal-password">Password<span className="relative"><LockKeyhole aria-hidden="true" className="absolute left-4 top-1/2 size-5 -translate-y-1/2 text-[var(--realm-slate)]" /><input id="portal-password" name="password" type="password" autoComplete="current-password" required className="min-h-13 w-full rounded-xl border border-white/15 bg-[#050d1c]/70 py-3 pl-12 pr-4 text-white outline-none focus:border-[var(--realm-gold)] focus:ring-2 focus:ring-[var(--realm-gold)]/20" /></span></label>
        <div className="flex justify-end"><Link href="/portal/forgot-password" className="text-sm font-semibold text-[var(--realm-gold-soft)] underline-offset-4 hover:underline">Forgot Password?</Link></div>
        <PrimaryButton type="submit" disabled={pending} className="w-full">{pending ? "Signing in…" : "Sign In"}</PrimaryButton>
        {state.message ? <p role="alert" className="rounded-xl border border-amber-300/25 bg-amber-300/10 p-4 text-sm leading-6 text-amber-100">{state.message}</p> : null}
      </form>

      <details className="rounded-2xl border border-white/10 bg-white/5 p-4">
        <summary className="cursor-pointer text-sm font-semibold text-white">Email me a sign-in link</summary>
        <form action={linkAction} className="mt-4 grid gap-4">
          <label className="grid gap-2 text-sm text-white" htmlFor="magic-link-email">Email Address<input id="magic-link-email" name="email" type="email" autoComplete="email" required className="min-h-11 rounded-xl border border-white/15 bg-[#050d1c]/70 px-4 text-white outline-none focus:border-[var(--realm-gold)]" /></label>
          <PrimaryButton type="submit" disabled={linkPending} className="w-full">{linkPending ? "Sending…" : "Send Secure Sign-In Link"}</PrimaryButton>
          {linkState.message ? <p role="status" className={`rounded-xl border p-3 text-sm leading-6 ${linkState.status === "success" ? "border-emerald-300/25 bg-emerald-300/10 text-emerald-100" : "border-amber-300/25 bg-amber-300/10 text-amber-100"}`}>{linkState.message}</p> : null}
        </form>
      </details>
      <p className="text-center text-sm text-[var(--realm-muted)]">Need help? <a href="mailto:gloryrealm2025@gmail.com" className="font-semibold text-white underline underline-offset-4">gloryrealm2025@gmail.com</a></p>
    </div>
  );
}
