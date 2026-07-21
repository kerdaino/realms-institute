"use client";

import { useActionState } from "react";

import { acknowledgeRequiredStudentHandbook, type HandbookAcknowledgementActionState } from "@/app/student/onboarding/handbook/actions";

const initialState: HandbookAcknowledgementActionState = { status: "idle", message: "" };

export function HandbookAcknowledgementForm({ acknowledgementText, disabled = false }: { acknowledgementText: string; disabled?: boolean }) {
  const [state, action, pending] = useActionState(acknowledgeRequiredStudentHandbook, initialState);
  return (
    <form action={action} className="mt-8 space-y-5 border-t border-slate-200 pt-6">
      <label className="flex items-start gap-3 rounded-2xl border border-amber-200 bg-amber-50 p-5 text-sm leading-7 text-slate-800">
        <input required disabled={disabled || pending} name="handbook_acknowledgement" value="confirmed" type="checkbox" className="mt-1 size-5 shrink-0 accent-[#a47720]" />
        <span>{acknowledgementText}</span>
      </label>
      <button disabled={disabled || pending} type="submit" className="min-h-12 rounded-xl bg-[#071327] px-6 py-3 text-sm font-semibold text-white shadow-sm transition hover:bg-[#102f57] disabled:cursor-not-allowed disabled:opacity-55 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber-700">
        {pending ? "Recording Acknowledgement…" : "Acknowledge Handbook"}
      </button>
      {state.message ? <p role="status" className="rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm leading-6 text-rose-900">{state.message}</p> : null}
    </form>
  );
}
