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
import { admissionProcess, admissionRequirements, computerRequirementText, feeClarification, feeLabel, feePolicyNote, physicalAddress, programStructureNote, skillPathwayParticipationNote, whatsappChannelUrl } from "@/lib/constants";
import { realmClasses } from "@/lib/theme";

export const metadata: Metadata = {
  title: "REALMS Institute | Admissions",
  description: "Learn how to apply for a REALMS Institute cohort and prepare for a structured season of formation.",
};

export default function AdmissionsPage() {
  return (
    <PageShell>
      <PageHero
        eyebrow="Next Cohort"
        title="Admissions"
        subtitle="Registration is open for the next cohort. Apply online, confirm your application interest, and prepare for a structured season of Christian formation and practical skill development."
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
            title="Understand the Learning Commitment"
            actions={<div className="flex flex-wrap gap-3"><PrimaryButton href="/register" showIcon>Apply Now</PrimaryButton><PrimaryButton href={whatsappChannelUrl} target="_blank" rel="noopener noreferrer" showIcon>Join WhatsApp Channel</PrimaryButton></div>}
          >
            <div className="grid gap-3">
              <p>REALMS Institute is designed for participants who desire Christian formation, disciplined learning, and practical equipping. Certificates are issued by REALMS Institute as records of completed learning requirements.</p>
              <p>{programStructureNote} For this cohort, available skill pathways are Web Development and Cybersecurity Foundations. {skillPathwayParticipationNote}</p>
              <p>{computerRequirementText}</p>
              <p>{feeLabel}: Physical Nigeria: ₦10,000, Online Nigeria: ₦15,000, International Online: $20 equivalent. {feeClarification} {feePolicyNote}</p>
              <p>Physical classes/location: {physicalAddress}</p>
              <p>Class schedule and onboarding details will be communicated to admitted applicants.</p>
              <p>Stay updated through the REALMS Institute WhatsApp Channel.</p>
            </div>
          </Callout>
        </div>
      </SectionContainer>
    </PageShell>
  );
}
