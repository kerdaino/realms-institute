"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";

export function StudentProfileForm({ preferredName, phone, avatarUrl }: { preferredName: string; phone: string; avatarUrl: string }) {
  const router = useRouter();
  const [status, setStatus] = useState<{ type: "idle" | "saving" | "success" | "error"; message?: string }>({ type: "idle" });

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setStatus({ type: "saving" });
    try {
      const response = await fetch("/api/student/profile", { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ preferred_name: form.get("preferred_name"), phone: form.get("phone"), avatar_url: form.get("avatar_url") }) });
      const result = await response.json().catch(() => null) as { message?: string } | null;
      if (!response.ok) throw new Error(result?.message || "Your profile could not be updated right now.");
      setStatus({ type: "success", message: "Your personal profile details have been updated." });
      router.refresh();
    } catch (error) {
      setStatus({ type: "error", message: error instanceof Error ? error.message : "Your profile could not be updated right now." });
    }
  }

  return <form onSubmit={submit} className="space-y-5"><div><label htmlFor="preferred_name" className="text-sm font-semibold text-[#071327]">Preferred Name</label><input id="preferred_name" name="preferred_name" defaultValue={preferredName} maxLength={80} className="mt-2 min-h-11 w-full rounded-xl border border-slate-300 bg-white px-4 py-2 text-slate-950 focus:border-amber-600 focus:outline-none focus:ring-2 focus:ring-amber-200" /></div><div><label htmlFor="phone" className="text-sm font-semibold text-[#071327]">Phone</label><input id="phone" name="phone" type="tel" defaultValue={phone} maxLength={40} className="mt-2 min-h-11 w-full rounded-xl border border-slate-300 bg-white px-4 py-2 text-slate-950 focus:border-amber-600 focus:outline-none focus:ring-2 focus:ring-amber-200" /></div><div><label htmlFor="avatar_url" className="text-sm font-semibold text-[#071327]">Profile Image URL</label><input id="avatar_url" name="avatar_url" type="url" defaultValue={avatarUrl} maxLength={2048} placeholder="https://" className="mt-2 min-h-11 w-full rounded-xl border border-slate-300 bg-white px-4 py-2 text-slate-950 focus:border-amber-600 focus:outline-none focus:ring-2 focus:ring-amber-200" /><p className="mt-2 text-xs leading-5 text-slate-500">Optional. Use a secure HTTPS image URL.</p></div>{status.message ? <p role="status" className={`rounded-xl px-4 py-3 text-sm ${status.type === "success" ? "bg-emerald-50 text-emerald-800" : "bg-rose-50 text-rose-800"}`}>{status.message}</p> : null}<button type="submit" disabled={status.type === "saving"} className="min-h-11 rounded-xl bg-[#0b315c] px-5 py-2 font-semibold text-white hover:bg-[#124574] disabled:cursor-wait disabled:opacity-60 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber-700">{status.type === "saving" ? "Saving…" : "Save Personal Details"}</button></form>;
}

