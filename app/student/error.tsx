"use client";

import { useEffect } from "react";

export default function StudentPortalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error("Student portal rendering failed", { name: error.name, digest: error.digest });
  }, [error]);
  return <div className="mx-auto max-w-3xl rounded-2xl border border-rose-200 bg-white p-6 shadow-sm"><h1 className="text-2xl font-semibold text-[#071327]">Dashboard temporarily unavailable</h1><p className="mt-3 leading-7 text-slate-700">We could not load part of your learning dashboard right now. Please refresh the page or contact REALMS Institute if the issue continues.</p><button type="button" onClick={reset} className="mt-5 min-h-11 rounded-xl bg-[#0b315c] px-5 py-2 font-semibold text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber-700">Try again</button></div>;
}

