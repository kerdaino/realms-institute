"use client";

import Link from "next/link";
import { useState } from "react";

export function ClassSummaryQueueAction({ summaryId, sessionId, status, lockVersion }: { summaryId: string; sessionId: string; status: string; lockVersion: number }) {
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  async function transition(action: "submit" | "approve" | "publish") {
    const prompt = action === "publish" ? "Publish this approved revision to students?" : action === "approve" ? "Approve this submitted revision after review?" : "Submit this administrator draft for review?";
    if (!window.confirm(prompt)) return;
    setBusy(true); setMessage("");
    const response = await fetch(`/api/admin/class-summaries/${summaryId}/transition`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action, expected_version: lockVersion }) });
    const payload = await response.json();
    setBusy(false);
    if (!response.ok) return setMessage(payload.message || "The summary transition could not be completed.");
    window.location.reload();
  }

  const next = status === "draft" || status === "changes_requested" ? ["submit", "Submit for review"] as const : status === "submitted" ? ["approve", "Approve"] as const : status === "approved" ? ["publish", "Publish"] as const : null;
  return <div className="min-w-36 space-y-2"><Link href={`/admin/sessions/${sessionId}#class-summary`} className="block font-semibold text-amber-800">Open summary record</Link>{next ? <button type="button" disabled={busy} onClick={() => void transition(next[0])} className="rounded-lg bg-[#071327] px-3 py-2 text-xs font-semibold text-white disabled:opacity-60">{busy ? "Working…" : next[1]}</button> : <span className="block text-xs text-slate-500">No transition required</span>}{message ? <p role="status" className="max-w-56 text-xs text-rose-700">{message}</p> : null}</div>;
}
