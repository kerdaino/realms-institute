import type { ReactNode } from "react";

export function PageHeading({ eyebrow, title, description }: { eyebrow: string; title: string; description?: string }) {
  return <header className="mb-8"><p className="text-xs font-semibold uppercase tracking-[0.2em] text-amber-700">{eyebrow}</p><h1 className="mt-2 text-3xl font-semibold tracking-tight text-[#071327] md:text-4xl">{title}</h1>{description ? <p className="mt-3 max-w-3xl leading-7 text-slate-600">{description}</p> : null}</header>;
}

export function StudentPanel({ title, description, action, children, className = "" }: { title: string; description?: string; action?: ReactNode; children: ReactNode; className?: string }) {
  return <section className={`rounded-2xl border border-slate-200 bg-white p-5 shadow-sm md:p-6 ${className}`}><div className="mb-5 flex flex-wrap items-start justify-between gap-3"><div><h2 className="text-xl font-semibold text-[#071327]">{title}</h2>{description ? <p className="mt-1 text-sm leading-6 text-slate-600">{description}</p> : null}</div>{action}</div>{children}</section>;
}

export function EmptyState({ children }: { children: ReactNode }) {
  return <p className="rounded-xl border border-dashed border-slate-300 bg-slate-50 px-4 py-6 text-sm leading-6 text-slate-600">{children}</p>;
}

export function StatusPill({ children }: { children: ReactNode }) {
  return <span className="inline-flex rounded-full border border-amber-200 bg-amber-50 px-3 py-1 text-xs font-semibold text-amber-900">{children}</span>;
}

export function DataCard({ label, value, detail }: { label: string; value: string; detail?: string }) {
  return <div className="rounded-xl border border-slate-200 bg-slate-50 p-4"><p className="text-xs font-semibold uppercase tracking-[0.13em] text-slate-500">{label}</p><p className="mt-2 font-semibold text-[#071327]">{value}</p>{detail ? <p className="mt-1 text-sm leading-6 text-slate-600">{detail}</p> : null}</div>;
}

export function formatStudentDate(value: string | null | undefined, includeTime = false) {
  if (!value) return "Not scheduled";
  return new Intl.DateTimeFormat("en-NG", includeTime ? { dateStyle: "medium", timeStyle: "short", timeZone: "Africa/Lagos" } : { dateStyle: "medium", timeZone: "Africa/Lagos" }).format(new Date(value));
}

export function formatStudentTime(value: string | null | undefined) {
  if (!value) return "Time to be announced";
  return new Intl.DateTimeFormat("en-NG", { hour: "numeric", minute: "2-digit", timeZone: "Africa/Lagos", timeZoneName: "short" }).format(new Date(value));
}

export function humanizeStudentValue(value: string | null | undefined) {
  if (!value) return "Not available";
  return value.replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

