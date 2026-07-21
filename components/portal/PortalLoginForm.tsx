"use client";

import { useActionState } from "react";
import { Mail } from "lucide-react";

import { PrimaryButton } from "@/components/ui/Button";
import { requestPortalMagicLink, type PortalLoginState } from "@/app/portal/login/actions";

const initialPortalLoginState: PortalLoginState = { status: "idle", message: "" };

export function PortalLoginForm() {
  const [state, action, pending] = useActionState(requestPortalMagicLink, initialPortalLoginState);

  return (
    <form action={action} className="mt-8 grid gap-5">
      <label className="grid gap-2 text-sm font-semibold text-white" htmlFor="portal-email">
        Institutional email address
        <span className="relative">
          <Mail aria-hidden="true" className="absolute left-4 top-1/2 size-5 -translate-y-1/2 text-[var(--realm-slate)]" />
          <input
            id="portal-email"
            name="email"
            type="email"
            inputMode="email"
            autoComplete="email"
            required
            placeholder="you@example.com"
            className="min-h-13 w-full rounded-xl border border-white/15 bg-[#050d1c]/70 py-3 pl-12 pr-4 text-white outline-none placeholder:text-[var(--realm-slate)] focus:border-[var(--realm-gold)] focus:ring-2 focus:ring-[var(--realm-gold)]/20"
          />
        </span>
      </label>
      <PrimaryButton type="submit" disabled={pending} className="w-full">
        {pending ? "Sending secure link…" : "Email Me a Secure Access Link"}
      </PrimaryButton>
      {state.message ? (
        <p role="status" className={`rounded-xl border p-4 text-sm leading-6 ${state.status === "success" ? "border-emerald-300/25 bg-emerald-300/10 text-emerald-100" : "border-amber-300/25 bg-amber-300/10 text-amber-100"}`}>
          {state.message}
        </p>
      ) : null}
    </form>
  );
}
