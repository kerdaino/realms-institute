"use client";

import { useState } from "react";

export function PaymentContinuationButton({ token }: { token: string }) {
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  async function continueToPaystack() {
    setBusy(true);
    setMessage("");
    try {
      const response = await fetch("/api/paystack/continue", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token }),
      });
      const body = await response.json();
      if (!response.ok || !body.success) throw new Error(body.message || "Payment could not be prepared.");
      if (body.completed) {
        setMessage("The required payment has already been verified. No additional payment is requested.");
        return;
      }
      const redirectUrl = typeof body.redirectUrl === "string" ? body.redirectUrl : "";
      if (!redirectUrl.startsWith("https://") && !redirectUrl.startsWith("/payment/verify?reference=")) throw new Error("The secure payment destination was unavailable.");
      window.location.assign(redirectUrl);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Payment could not be prepared.");
    } finally {
      setBusy(false);
    }
  }

  return <div className="mt-7">
    <button type="button" onClick={continueToPaystack} disabled={busy} className="rounded-full bg-[#d7aa45] px-6 py-3.5 text-sm font-semibold text-[#071327] shadow-lg shadow-amber-900/10 transition hover:bg-[#e4bb61] disabled:cursor-not-allowed disabled:opacity-60">
      {busy ? "Checking Secure Payment…" : "Complete Registration Payment"}
    </button>
    {message ? <p className="mt-4 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm leading-6 text-amber-950">{message}</p> : null}
  </div>;
}
