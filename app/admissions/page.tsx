import type { Metadata } from "next";
import { CheckCircle2 } from "lucide-react";

import { PageHero } from "@/components/layout/PageHero";
import { PageShell } from "@/components/layout/PageShell";
import { PrimaryButton } from "@/components/ui/Button";
import { Callout } from "@/components/ui/Callout";
import { InfoPanel } from "@/components/ui/InfoPanel";
import { SectionContainer } from "@/components/ui/SectionContainer";
import { SectionHeading } from "@/components/ui/SectionHeading";
import { Timeline } from "@/components/ui/Timeline";
import { admissionProcess, admissionRequirements } from "@/lib/constants";
import { realmClasses } from "@/lib/theme";

export const metadata: Metadata = {
  title: "REALMS Institute | Admissions",
  description: "Learn how to apply for a REALMS Institute cohort and prepare for a structured season of formation.",
};

export default function AdmissionsPage() {
  return (
    <PageShell>
      <PageHero
        eyebrow="August Cohort"
        title="Admissions"
        subtitle="Apply online, confirm your application interest, and prepare for a structured season of Christian formation and practical skill development."
        breadcrumbs={[{ label: "Home", href: "/" }, { label: "Admissions" }]}
      />
      <SectionContainer labelledBy="admission-process-title">
        <div className={realmClasses.container}>
          <SectionHeading
            id="admission-process-title"
            eyebrow="Admission Process"
            title="A Clear Path Into Formation"
            description="The process helps each prospective student understand the cohort structure and enter with honest expectations."
          />
          <div className="mt-10">
            <Timeline items={admissionProcess} />
          </div>
        </div>
      </SectionContainer>
      <SectionContainer labelledBy="admission-requirements-title" withGrid>
        <div className={realmClasses.container}>
          <SectionHeading id="admission-requirements-title" eyebrow="Requirements" title="Come Ready to Learn and Respond" />
          <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {admissionRequirements.map((requirement) => (
              <InfoPanel
                key={requirement}
                title={requirement}
                icon={<CheckCircle2 aria-hidden="true" className="size-5" />}
              />
            ))}
          </div>
        </div>
      </SectionContainer>
      <SectionContainer labelledBy="admission-note-title">
        <div className={realmClasses.container}>
          <Callout
            eyebrow="Important Note"
            titleId="admission-note-title"
            title="Formation, Not Certificate Chasing"
            actions={<PrimaryButton href="/register" showIcon>Apply for Next Cohort</PrimaryButton>}
          >
            <p>REALMS Institute is not for certificate chasing. It is for believers who desire formation, obedience, discipline, and usefulness to God.</p>
          </Callout>
        </div>
      </SectionContainer>
    </PageShell>
  );
}
