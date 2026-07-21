import Link from "next/link";
import type { ReactNode } from "react";

import { BrandLogo } from "@/components/ui/BrandLogo";

export function PortalShell({ eyebrow, title, description, children }: { eyebrow: string; title: string; description?: string; children: ReactNode }) {
  return (
    <main className="relative min-h-dvh overflow-hidden bg-[linear-gradient(145deg,#050d1c_0%,#0b2140_62%,#132f53_100%)] px-5 py-8 text-white md:px-8 md:py-12">
      <div aria-hidden="true" className="realm-grid absolute inset-0 opacity-45" />
      <div className="relative mx-auto max-w-6xl">
        <header className="flex flex-wrap items-center justify-between gap-4 border-b border-white/10 pb-6">
          <Link href="/" aria-label="REALMS Institute home" className="flex items-center gap-3">
            <BrandLogo className="size-12" sizes="48px" priority />
            <span><span className="block font-semibold tracking-[0.12em]">REALMS</span><span className="block text-xs text-[var(--realm-muted)]">Institute Portal</span></span>
          </Link>
          <form action="/auth/signout" method="post">
            <button type="submit" className="rounded-full border border-white/15 bg-white/[0.06] px-4 py-2 text-sm font-semibold text-white hover:border-[var(--realm-gold)]/50 hover:bg-white/[0.1] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--realm-gold)]">Sign Out</button>
          </form>
        </header>
        <section className="py-12 md:py-16">
          <p className="text-xs font-semibold uppercase tracking-[0.22em] text-[var(--realm-gold-soft)]">{eyebrow}</p>
          <h1 className="mt-4 max-w-4xl text-4xl font-semibold tracking-tight md:text-6xl">{title}</h1>
          {description ? <p className="mt-5 max-w-3xl text-base leading-8 text-[var(--realm-muted)] md:text-lg">{description}</p> : null}
          <div className="mt-10">{children}</div>
        </section>
      </div>
    </main>
  );
}

export function PortalDetails({ items }: { items: ReadonlyArray<readonly [string, string]> }) {
  return <dl className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">{items.map(([label, value]) => <div key={label} className="rounded-2xl border border-white/10 bg-white/[0.055] p-5 shadow-lg shadow-black/10"><dt className="text-xs font-semibold uppercase tracking-[0.16em] text-[var(--realm-gold-soft)]">{label}</dt><dd className="mt-3 text-base font-semibold leading-7 text-white">{value}</dd></div>)}</dl>;
}
