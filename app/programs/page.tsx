import type { Metadata } from "next";

import { PageHero } from "@/components/layout/PageHero";
import { PageShell } from "@/components/layout/PageShell";
import { PrimaryButton, SecondaryButton } from "@/components/ui/Button";
import { Callout } from "@/components/ui/Callout";
import { ProgramCard } from "@/components/ui/ProgramCard";
import { SectionContainer } from "@/components/ui/SectionContainer";
import { SectionHeading } from "@/components/ui/SectionHeading";
import { programs } from "@/lib/constants";
import { realmClasses } from "@/lib/theme";

export const metadata: Metadata = {
  title: "REALMS Institute | Programs",
  description: "Explore the current REALMS School of Discovery program and skill pathways available for the next cohort.",
};

export default function ProgramsPage() {
  return (
    <PageShell>
      <PageHero eyebrow="August Cohort" title="Programs & Learning Pathways" subtitle="The next cohort combines the Realms School of Discovery formation core with one currently available practical skill pathway." breadcrumbs={[{ label: "Home", href: "/" }, { label: "Programs" }]} />
      <SectionContainer labelledBy="current-program-title">
        <div className={realmClasses.container}>
          <SectionHeading id="current-program-title" eyebrow="Current Programs" title="Available for the Next Cohort" description="These are the institute and skill pathways currently open for application." />
          <div className="mt-10 grid gap-5 md:grid-cols-3">
            {programs.current.map((program) => <ProgramCard key={program.title} {...program} />)}
          </div>
          <div className="mt-7"><SecondaryButton href="/schools/discovery" showIcon>Explore School of Discovery</SecondaryButton></div>
        </div>
      </SectionContainer>
      <SectionContainer labelledBy="future-programs-title">
        <div className={realmClasses.container}>
          <SectionHeading id="future-programs-title" eyebrow="Future Pathways" title="Not Available for This Cohort" description="Cloud Computing and these other pathways will be introduced in future cohorts as the institute grows." />
          <div className="mt-10 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {programs.future.map((program) => <ProgramCard key={program} title={program} comingSoon />)}
          </div>
        </div>
      </SectionContainer>
      <SectionContainer labelledBy="programs-cta-title">
        <div className={realmClasses.container}>
          <Callout eyebrow="Next Step" titleId="programs-cta-title" title="Find Your Formation Pathway" actions={<><PrimaryButton href="/register" showIcon>Apply for Next Cohort</PrimaryButton><SecondaryButton href="/schools">Explore Schools</SecondaryButton></>}>
            <p>Explore the pathways and register your interest in a future cohort with clear expectations.</p>
          </Callout>
        </div>
      </SectionContainer>
    </PageShell>
  );
}
