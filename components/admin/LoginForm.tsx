"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";

export function LoginForm() {
  const router = useRouter();
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setLoading(true); setMessage("");
    const password = new FormData(event.currentTarget).get("password");
    try {
      const response = await fetch("/api/admin/login", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ password }) });
      const body = await response.json();
      if (!response.ok) { setMessage(body.message || "Login failed."); return; }
      router.replace("/admin/dashboard"); router.refresh();
    } catch { setMessage("Admin login is temporarily unavailable."); } finally { setLoading(false); }
  }
  return <form onSubmit={submit} className="mt-8 space-y-5"><div><label htmlFor="password" className="text-sm font-medium text-slate-800">Password</label><input id="password" name="password" type="password" required autoComplete="current-password" className="mt-2 w-full rounded-xl border border-slate-300 px-4 py-3 outline-none focus:border-amber-600 focus:ring-2 focus:ring-amber-200" /></div>{message ? <p role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-800">{message}</p> : null}<button disabled={loading} className="w-full rounded-xl bg-[#071327] px-5 py-3 font-semibold text-white hover:bg-[#102344] disabled:cursor-wait disabled:opacity-60">{loading ? "Signing in…" : "Login"}</button></form>;
}
