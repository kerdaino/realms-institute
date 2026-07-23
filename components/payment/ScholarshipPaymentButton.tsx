"use client";

import { useState } from "react";

export function ScholarshipPaymentButton({ token }: { token: string }) {
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  async function continueToPaystack() {
    setBusy(true);
    setMessage("");
    try {
      const response = await fetch("/api/paystack/scholarship/initialize", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token }),
      });
      const body = await response.json();
      if (!response.ok || !body.success) throw new Error(body.message || "Payment could not be initialized.");
      if (body.completed) {
        setMessage("The required payment has already been completed. No additional payment is requested.");
        return;
      }
      if (typeof body.authorizationUrl !== "string" || !body.authorizationUrl.startsWith("https://")) throw new Error("The secure Paystack link was unavailable.");
      window.location.assign(body.authorizationUrl);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Payment could not be initialized.");
    } finally {
      setBusy(false);
    }
  }

  return <div className="mt-7">
    <button type="button" onClick={continueToPaystack} disabled={busy} className="rounded-full bg-[#d7aa45] px-6 py-3.5 text-sm font-semibold text-[#071327] shadow-lg shadow-amber-900/10 transition hover:bg-[#e4bb61] disabled:cursor-not-allowed disabled:opacity-60">
      {busy ? "Preparing Secure Payment…" : "Complete Registration Payment"}
    </button>
    {message ? <p className="mt-4 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm leading-6 text-amber-950">{message}</p> : null}
  </div>;
}
