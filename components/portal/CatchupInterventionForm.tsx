"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";

export function CatchupInterventionForm({ makeupId, canAssignAlternative }: { makeupId: string; canAssignAlternative: boolean }) {
  const router = useRouter(); const [busy, setBusy] = useState(false); const [message, setMessage] = useState("");
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); const form = new FormData(event.currentTarget); const action = String(form.get("action"));
    if (!window.confirm(action === "verify_alternative" ? "Confirm that you reviewed this evidence and it satisfies the authorised alternative activity?" : "Publish these alternative catch-up instructions to the student?")) return;
    setBusy(true); setMessage("");
    const response = await fetch(`/api/facilitator/makeup/${makeupId}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action, instructions: form.get("instructions"), reason: form.get("reason"), evidence_description: form.get("evidence_description") }) });
    const body = await response.json().catch(() => ({})); setBusy(false);
    if (!response.ok) return setMessage(body.message || "Catch-up intervention could not be saved.");
    setMessage("Catch-up intervention saved."); router.refresh();
  }
  if (!canAssignAlternative) return null;
  return <form onSubmit={submit} className="mt-5 space-y-3 rounded-xl border border-white/10 bg-black/10 p-4">
    <h3 className="font-semibold">Facilitator intervention</h3>
    <select name="action" className="min-h-11 w-full rounded-xl border border-white/15 bg-[#0b2746] px-3 text-white">
      <option value="set_alternative" data-recommended={canAssignAlternative || undefined}>Assign alternative activity</option>
      <option value="verify_alternative">Verify submitted alternative evidence</option>
    </select>
    <textarea name="instructions" rows={3} placeholder="Student-visible alternative activity instructions" className="w-full rounded-xl border border-white/15 bg-[#0b2746] p-3 text-white placeholder:text-white/45" />
    <textarea name="evidence_description" rows={2} placeholder="Evidence reviewed (required when verifying)" className="w-full rounded-xl border border-white/15 bg-[#0b2746] p-3 text-white placeholder:text-white/45" />
    <textarea name="reason" required rows={2} placeholder="Academic reason or verification note" className="w-full rounded-xl border border-white/15 bg-[#0b2746] p-3 text-white placeholder:text-white/45" />
    <button disabled={busy} className="rounded-xl bg-[var(--realm-gold)] px-4 py-2 font-semibold text-[#071327] disabled:opacity-50">Save intervention</button>
    {message ? <p role="status" className="text-sm text-amber-100">{message}</p> : null}
  </form>;
}
