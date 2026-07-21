"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";

import { BrandLogo } from "@/components/ui/BrandLogo";

const links = [["/alumni", "Dashboard"], ["/alumni/programmes", "Programmes"], ["/alumni/learning-archive", "Learning Archive"], ["/alumni/results", "Results"], ["/alumni/certificates", "Certificates"], ["/alumni/announcements", "Announcements"], ["/alumni/profile", "Profile & Outcomes"]] as const;

export function AlumniShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  return <div className="min-h-dvh bg-[#f5f2ea] text-slate-950"><header className="bg-[#071327] text-white"><div className="mx-auto flex max-w-[1480px] flex-wrap items-center justify-between gap-4 px-5 py-4 lg:px-8"><Link href="/alumni" className="flex items-center gap-3"><BrandLogo className="size-11" sizes="44px" priority /><span><strong className="block tracking-[0.1em]">REALMS</strong><span className="text-xs text-white/65">Alumni Portal</span></span></Link><form action="/auth/signout" method="post"><button className="min-h-11 rounded-xl border border-white/20 px-4 py-2 text-sm font-semibold">Sign Out</button></form></div></header><div className="mx-auto grid max-w-[1480px] lg:min-h-[calc(100dvh-77px)] lg:grid-cols-[250px_minmax(0,1fr)]"><aside className="border-r border-white/10 bg-[#0b2547] p-5 text-white"><nav aria-label="Alumni portal"><ul className="grid gap-1 sm:grid-cols-3 lg:grid-cols-1">{links.map(([href, label]) => { const active = href === "/alumni" ? pathname === href : pathname.startsWith(href); return <li key={href}><Link href={href} aria-current={active ? "page" : undefined} className={`block min-h-11 rounded-xl px-4 py-3 text-sm font-semibold ${active ? "bg-[var(--realm-gold)] text-[#071327]" : "text-white/80 hover:bg-white/10"}`}>{label}</Link></li>; })}</ul></nav></aside><main className="min-w-0 px-5 py-8 md:px-8 lg:px-10">{children}</main></div></div>;
}

export function AlumniPageHeader({ eyebrow, title, description }: { eyebrow: string; title: string; description?: string }) { return <header className="mb-8"><p className="text-xs font-semibold uppercase tracking-[0.18em] text-amber-800">{eyebrow}</p><h1 className="mt-2 text-3xl font-semibold text-[#071327] md:text-4xl">{title}</h1>{description ? <p className="mt-3 max-w-3xl leading-7 text-slate-600">{description}</p> : null}</header>; }
