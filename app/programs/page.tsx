import type { Metadata } from "next";

import { PageHero } from "@/components/layout/PageHero";
import { PageShell } from "@/components/layout/PageShell";
import { PrimaryButton, SecondaryButton } from "@/components/ui/Button";
import { Callout } from "@/components/ui/Callout";
import { ProgramCard } from "@/components/ui/ProgramCard";
import { SectionContainer } from "@/components/ui/SectionContainer";
import { SectionHeading } from "@/components/ui/SectionHeading";
import { programs } from "@/lib/constants";
import { routeComparison, schoolOfDiscoveryStructureStatement } from "@/lib/schoolOfDiscoveryCurriculum";
import { realmClasses } from "@/lib/theme";

export const metadata: Metadata = {
  title: "REALMS Institute | Programs",
  description: "Explore the August 2026 School of Discovery programme: Foundational or Advanced Discipleship with Web Development or Cybersecurity Foundations.",
};

export default function ProgramsPage() {
  return (
    <PageShell>
      <PageHero eyebrow="Registration Open · August 2026" title="Programs & Learning Pathways" subtitle={schoolOfDiscoveryStructureStatement} breadcrumbs={[{ label: "Home", href: "/" }, { label: "Programs" }]} />
      <SectionContainer labelledBy="current-program-title">
        <div className={realmClasses.container}>
          <SectionHeading id="current-program-title" eyebrow="Current Programme" title="Available for August 2026" description="Applications are open for the August 2026 REALMS School of Discovery cohort." />
          <div className="mt-10 grid gap-5 md:grid-cols-3">
            {programs.current.map((program) => <ProgramCard key={program.title} {...program} />)}
          </div>
          <div className="mt-8 grid gap-4 md:grid-cols-2">
            {routeComparison.map((route) => <article key={route.route} className="rounded-2xl border border-white/10 bg-white/[0.045] p-6"><p className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--realm-gold-soft)]">Discipleship Route</p><h3 className="mt-3 text-xl font-semibold text-white">{route.route}</h3><p className="mt-3 text-sm leading-7 text-[var(--realm-muted)]">{route.designedFor}</p><p className="mt-4 text-sm font-semibold text-white">{route.discipleship}</p></article>)}
          </div>
          <p className="mt-5 max-w-4xl text-sm leading-7 text-[var(--realm-muted)]">Advanced Discipleship is one complete route containing all five advanced courses. It runs concurrently during the August 2026 cohort and is not a set of independent electives.</p>
          <div className="mt-7"><SecondaryButton href="/schools/discovery" showIcon>Explore School of Discovery</SecondaryButton></div>
        </div>
      </SectionContainer>
      <SectionContainer labelledBy="future-programs-title">
        <div className={realmClasses.container}>
          <SectionHeading id="future-programs-title" eyebrow="Future Pathways" title="Not Available for This Cohort" description="Cloud Computing and these other pathways may be introduced in future cohorts as the institute grows." />
          <div className="mt-10 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {programs.future.map((program) => <ProgramCard key={program} title={program} comingSoon />)}
          </div>
        </div>
      </SectionContainer>
      <SectionContainer labelledBy="programs-cta-title">
        <div className={realmClasses.container}>
          <Callout eyebrow="Next Step" titleId="programs-cta-title" title="Find Your Formation Pathway" actions={<><PrimaryButton href="/register" showIcon>Apply Now</PrimaryButton><SecondaryButton href="/schools">Explore Schools</SecondaryButton></>}>
            <p>Explore the approved curriculum and published August 2026 schedule, then apply with clear expectations about your discipleship route, skill pathway and completion requirements.</p>
          </Callout>
        </div>
      </SectionContainer>
    </PageShell>
  );
}
