"use client";

import { useActionState } from "react";

import { confirmPortalAuth, type ConfirmPortalAuthState } from "@/app/auth/confirm/actions";
import { PrimaryButton } from "@/components/ui/Button";
import type { PortalLinkIntent, PortalSetupContext } from "@/lib/lms/portalAuthPolicy";

const initialState: ConfirmPortalAuthState = { status: "idle", message: "" };

export function ConfirmPortalAuthForm({ tokenHash, type, intent, context }: {
  tokenHash: string;
  type: string;
  intent: PortalLinkIntent;
  context: PortalSetupContext;
}) {
  const [state, action, pending] = useActionState(confirmPortalAuth, initialState);

  return <form action={action} className="mt-8">
    <input type="hidden" name="token_hash" value={tokenHash} />
    <input type="hidden" name="type" value={type} />
    <input type="hidden" name="intent" value={intent} />
    <input type="hidden" name="context" value={context} />
    <PrimaryButton type="submit" disabled={pending} className="w-full">
      {pending ? "Verifying secure link…" : "Continue to REALMS Portal"}
    </PrimaryButton>
    {state.message ? <p role="alert" aria-live="polite" className="mt-4 rounded-xl border border-amber-300/25 bg-amber-300/10 p-4 text-sm leading-6 text-amber-100">{state.message}</p> : null}
  </form>;
}
