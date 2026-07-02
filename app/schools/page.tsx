import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, BookOpenCheck } from "lucide-react";

import { PageHero } from "@/components/layout/PageHero";
import { PageShell } from "@/components/layout/PageShell";
import { Badge } from "@/components/ui/Badge";
import { GlassCard } from "@/components/ui/GlassCard";
import { SectionContainer } from "@/components/ui/SectionContainer";
import { schools } from "@/lib/constants";
import { realmClasses } from "@/lib/theme";

export const metadata: Metadata = {
  title: "REALMS Institute | Schools",
  description: "Explore the REALMS Institute schools of formation for discipleship, mission, leadership, technology, and enterprise.",
};

export default function SchoolsPage() {
  return (
    <PageShell>
      <PageHero
        eyebrow="Learning Pathways"
        title="Schools of Formation"
        subtitle="Every school within REALMS Institute is designed to form believers for obedience, excellence, and influence in specific spheres of assignment."
        breadcrumbs={[{ label: "Home", href: "/" }, { label: "Schools" }]}
      />
      <SectionContainer labelledBy="schools-list-title" withGrid>
        <div className={realmClasses.container}>
          <h2 id="schools-list-title" className="sr-only">REALMS Institute schools</h2>
          <div className="grid gap-5 md:grid-cols-2 lg:grid-cols-3">
            {schools.map((school, index) => (
              <GlassCard as="article" key={school.title} className="flex min-h-80 flex-col p-6 md:p-7">
                <div className="flex items-start justify-between gap-4">
                  <span className="flex size-11 items-center justify-center rounded-xl border border-[var(--realm-gold)]/25 bg-[var(--realm-gold)]/10 text-[var(--realm-gold-soft)]">
                    <BookOpenCheck aria-hidden="true" className="size-5" />
                  </span>
                  <Badge className={school.status === "Coming Soon" ? "border-white/10 bg-white/[0.05] text-[var(--realm-muted)]" : undefined}>
                    {school.status}
                  </Badge>
                </div>
                <p className="mt-6 text-xs font-semibold tracking-[0.18em] text-[var(--realm-gold-soft)]">SCHOOL {String(index + 1).padStart(2, "0")}</p>
                <h2 className="mt-2 text-xl font-semibold text-[var(--realm-white)]">{school.title}</h2>
                <p className="mt-3 flex-1 leading-7 text-[var(--realm-muted)]">{school.description}</p>
                <ul className="mt-5 flex flex-wrap gap-2" aria-label={`${school.title} focus areas`}>
                  {school.focusAreas.map((area) => (
                    <li key={area} className="rounded-full bg-white/[0.055] px-3 py-1.5 text-xs text-[var(--realm-muted)]">{area}</li>
                  ))}
                </ul>
                {"href" in school ? (
                  <Link className={`${realmClasses.focus} mt-6 inline-flex items-center gap-2 self-start rounded-full text-sm font-semibold text-[var(--realm-gold-soft)] hover:text-[var(--realm-white)]`} href={school.href}>
                    Explore the school <ArrowRight aria-hidden="true" className="size-4" />
                  </Link>
                ) : (
                  <p className="mt-6 text-sm text-[var(--realm-slate)]">Details will be announced as the school develops.</p>
                )}
              </GlassCard>
            ))}
          </div>
        </div>
      </SectionContainer>
    </PageShell>
  );
}
