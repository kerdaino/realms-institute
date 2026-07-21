"use client";

import { useActionState } from "react";

import { setPortalPassword, type SetupPasswordState } from "@/app/auth/setup-password/actions";
import { PrimaryButton } from "@/components/ui/Button";

const initialState: SetupPasswordState = { status: "idle", message: "" };

export function SetupPasswordForm() {
  const [state, action, pending] = useActionState(setPortalPassword, initialState);
  return <form action={action} className="mt-8 grid gap-5">
    <label htmlFor="new-password" className="grid gap-2 text-sm font-semibold text-white">New Password<input id="new-password" name="password" type="password" autoComplete="new-password" required minLength={12} className="min-h-13 rounded-xl border border-white/15 bg-[#050d1c]/70 px-4 text-white outline-none focus:border-[var(--realm-gold)] focus:ring-2 focus:ring-[var(--realm-gold)]/20" /></label>
    <label htmlFor="confirm-password" className="grid gap-2 text-sm font-semibold text-white">Confirm Password<input id="confirm-password" name="password_confirmation" type="password" autoComplete="new-password" required minLength={12} className="min-h-13 rounded-xl border border-white/15 bg-[#050d1c]/70 px-4 text-white outline-none focus:border-[var(--realm-gold)] focus:ring-2 focus:ring-[var(--realm-gold)]/20" /></label>
    <div className="rounded-xl border border-white/10 bg-white/5 p-4 text-sm leading-6 text-[var(--realm-muted)]"><p className="font-semibold text-white">Password requirements</p><ul className="mt-2 list-disc space-y-1 pl-5"><li>At least 12 characters</li><li>An uppercase and lowercase letter</li><li>A number</li><li>A symbol</li></ul></div>
    <PrimaryButton type="submit" disabled={pending} className="w-full">{pending ? "Setting password…" : "Set Password & Continue"}</PrimaryButton>
    {state.message ? <p role="alert" className="rounded-xl border border-amber-300/25 bg-amber-300/10 p-4 text-sm leading-6 text-amber-100">{state.message}</p> : null}
  </form>;
}
