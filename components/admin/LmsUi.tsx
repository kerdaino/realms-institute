import type { ReactNode } from "react";

import { humanize } from "@/lib/lms/adminConstants";

export function StatusBadge({ value }: { value: string | null | undefined }) {
  const positive = value === "active" || value === "completed" || value === "admitted" || value === "admissions_open";
  const caution = value?.includes("pending") || value === "in_progress" || value === "planned";
  const tone = positive ? "border-emerald-200 bg-emerald-50 text-emerald-800" : caution ? "border-amber-200 bg-amber-50 text-amber-900" : "border-slate-200 bg-slate-50 text-slate-700";
  return <span className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-semibold ${tone}`}>{humanize(value)}</span>;
}

export function EmptyState({ title, detail }: { title: string; detail: string }) {
  return <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-10 text-center"><h2 className="font-semibold text-[#071327]">{title}</h2><p className="mx-auto mt-2 max-w-xl text-sm leading-6 text-slate-600">{detail}</p></div>;
}

export function AdminPanel({ title, description, children }: { title: string; description?: string; children: ReactNode }) {
  return <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm md:p-6"><div className="mb-5"><h2 className="text-lg font-semibold text-[#071327]">{title}</h2>{description ? <p className="mt-1 text-sm leading-6 text-slate-600">{description}</p> : null}</div>{children}</section>;
}

export function DataItem({ label, children }: { label: string; children: ReactNode }) {
  return <div><dt className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">{label}</dt><dd className="mt-1 text-sm leading-6 text-slate-900">{children || "Not set"}</dd></div>;
}

export function formatDate(value: string | null | undefined, includeTime = false) {
  if (!value) return "Not set";
  return new Intl.DateTimeFormat("en-NG", includeTime ? { dateStyle: "medium", timeStyle: "short" } : { dateStyle: "medium" }).format(new Date(value));
}
