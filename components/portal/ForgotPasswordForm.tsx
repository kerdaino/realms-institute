"use client";

import Link from "next/link";
import { useActionState } from "react";

import { requestPortalPasswordRecovery, type PortalLoginState } from "@/app/portal/login/actions";
import { PrimaryButton } from "@/components/ui/Button";

const initialState: PortalLoginState = { status: "idle", message: "" };

export function ForgotPasswordForm() {
  const [state, action, pending] = useActionState(requestPortalPasswordRecovery, initialState);
  return <form action={action} className="mt-8 grid gap-5">
    <label htmlFor="recovery-email" className="grid gap-2 text-sm font-semibold text-white">Email Address<input id="recovery-email" name="email" type="email" inputMode="email" autoComplete="email" required className="min-h-13 rounded-xl border border-white/15 bg-[#050d1c]/70 px-4 text-white outline-none focus:border-[var(--realm-gold)] focus:ring-2 focus:ring-[var(--realm-gold)]/20" /></label>
    <PrimaryButton type="submit" disabled={pending} className="w-full">{pending ? "Sending instructions…" : "Send Recovery Instructions"}</PrimaryButton>
    {state.message ? <p role="status" className={`rounded-xl border p-4 text-sm leading-6 ${state.status === "success" ? "border-emerald-300/25 bg-emerald-300/10 text-emerald-100" : "border-amber-300/25 bg-amber-300/10 text-amber-100"}`}>{state.message}</p> : null}
    <Link href="/portal/login" className="text-center text-sm font-semibold text-[var(--realm-gold-soft)] underline underline-offset-4">Return to Portal Sign In</Link>
  </form>;
}
