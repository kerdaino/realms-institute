import type { Metadata } from "next";
import { CheckCircle2 } from "lucide-react";

import { PageHero } from "@/components/layout/PageHero";
import { PageShell } from "@/components/layout/PageShell";
import { PrimaryButton, SecondaryButton } from "@/components/ui/Button";
import { Callout } from "@/components/ui/Callout";
import { InfoPanel } from "@/components/ui/InfoPanel";
import { SectionContainer } from "@/components/ui/SectionContainer";
import { SectionHeading } from "@/components/ui/SectionHeading";
import { Timeline } from "@/components/ui/Timeline";
import { admissionProcess, admissionRequirements, computerRequirementText, feeClarification, feeLabel, feePolicyNote, feePricingNote, physicalAddress, skillPathwayParticipationNote, whatsappChannelUrl } from "@/lib/constants";
import { schoolOfDiscoveryApplicationPaths, schoolOfDiscoveryCertificateStatement, schoolOfDiscoveryLearningModeStatement, schoolOfDiscoveryStructureStatement } from "@/lib/schoolOfDiscoveryCurriculum";
import { realmClasses } from "@/lib/theme";

export const metadata: Metadata = {
  title: "REALMS Institute | Admissions",
  description: "Learn how new students, REALMS alumni and prior-theological-education applicants can apply for the August 2026 School of Discovery cohort.",
};

export default function AdmissionsPage() {
  return (
    <PageShell>
      <PageHero
        eyebrow="Applications Open · August 2026"
        title="Admissions"
        subtitle="Apply through the path that truthfully reflects your background, choose one practical skill pathway and prepare for admission review."
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
      <SectionContainer labelledBy="application-paths-title" withGrid>
        <div className={realmClasses.container}>
          <SectionHeading id="application-paths-title" eyebrow="Application Paths" title="Three Clear Ways to Apply" description="Your applicant type determines the discipleship route you request and any verification or screening required before that route can be approved." />
          <div className="mt-10 grid gap-5 lg:grid-cols-3">
            {schoolOfDiscoveryApplicationPaths.map((path) => <article key={path.title} className="rounded-2xl border border-white/10 bg-white/[0.045] p-6"><h3 className="text-xl font-semibold text-white">{path.title}</h3><ol className="mt-5 grid gap-3 text-sm leading-6 text-[var(--realm-muted)]">{path.steps.map((step, index) => <li key={step} className="flex gap-3"><span className="font-semibold text-[var(--realm-gold-soft)]">{index + 1}.</span><span>{step}</span></li>)}</ol></article>)}
          </div>
          <div className="mt-6 rounded-2xl border border-[var(--realm-gold)]/25 bg-[var(--realm-gold)]/8 p-5 text-sm leading-7 text-[var(--realm-muted)]"><p>All applicants select Web Development or Cybersecurity Foundations. Advanced-entry eligibility does not guarantee admission, and payment does not guarantee admission.</p><p className="mt-2">Scholarship support is limited and subject to review and availability.</p></div>
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
            title="Understand the Learning Commitment"
            actions={<div className="flex flex-wrap gap-3"><PrimaryButton href="/register" showIcon>Apply Now</PrimaryButton><SecondaryButton href="/schools/discovery#schedule-title">View Programme Schedule</SecondaryButton><SecondaryButton href={whatsappChannelUrl} target="_blank" rel="noopener noreferrer" showIcon>Join WhatsApp Channel</SecondaryButton></div>}
          >
            <div className="grid gap-3">
              <p>REALMS Institute is designed for participants who desire Christian formation, disciplined learning, and practical equipping. {schoolOfDiscoveryCertificateStatement}</p>
              <p>{schoolOfDiscoveryStructureStatement} {skillPathwayParticipationNote}</p>
              <p>{schoolOfDiscoveryLearningModeStatement}</p>
              <p>{computerRequirementText}</p>
              <p>{feeLabel}: {feePricingNote} {feeClarification} {feePolicyNote} Payment does not guarantee admission.</p>
              <p>Physical skill-pathway location: {physicalAddress}</p>
              <p>The detailed August 2026 class schedule is published on the School of Discovery page.</p>
              <p>Scholarship support is subject to review and availability and does not guarantee admission.</p>
              <p>Stay updated through the REALMS Institute WhatsApp Channel.</p>
            </div>
          </Callout>
        </div>
      </SectionContainer>
    </PageShell>
  );
}
