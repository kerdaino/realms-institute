import type { Metadata } from "next";

import { PageHero } from "@/components/layout/PageHero";
import { PageShell } from "@/components/layout/PageShell";
import { FeatureList } from "@/components/ui/FeatureList";
import { InfoPanel } from "@/components/ui/InfoPanel";
import { SectionContainer } from "@/components/ui/SectionContainer";
import { SectionHeading } from "@/components/ui/SectionHeading";
import { VerificationMockup } from "@/components/ui/VerificationMockup";
import { programmeCompletionComponents, schoolOfDiscoveryCertificateStatement } from "@/lib/schoolOfDiscoveryCurriculum";
import { realmClasses } from "@/lib/theme";

export const metadata: Metadata = {
  title: "REALMS Institute | Certificates",
  description: "Learn how the integrated REALMS School of Discovery programme result and institutional certificate reflect published completion requirements.",
};

export default function CertificatesPage() {
  return (
    <PageShell>
      <PageHero eyebrow="Institutional Record" title="Certificates" subtitle="The School of Discovery uses one integrated programme result. Online certificate access and verification are not yet available." breadcrumbs={[{ label: "Home", href: "/" }, { label: "Certificates" }]} />
      <SectionContainer labelledBy="certificate-philosophy-title">
        <div className={realmClasses.container}>
          <SectionHeading id="certificate-philosophy-title" eyebrow="Certificate Philosophy" title="Formation Is the Goal" />
          <InfoPanel className="mt-10" title="A record of completed learning" description={schoolOfDiscoveryCertificateStatement} />
        </div>
      </SectionContainer>
      <SectionContainer labelledBy="certificate-access-title">
        <div className={realmClasses.container}>
          <SectionHeading id="certificate-access-title" eyebrow="Certificate Access" title="Access Will Follow Verified Completion" description="Certificate access and verification are planned for learners who successfully complete the published School of Discovery programme requirements." />
          <FeatureList items={programmeCompletionComponents} className="mt-8 max-w-3xl sm:grid-cols-2" />
          <p className="mt-8 max-w-3xl text-sm leading-7 text-[var(--realm-muted)]">The School of Discovery integrates the student&apos;s approved discipleship route and selected skill pathway within one programme result. It does not automatically issue one separate discipleship certificate plus one separate skill certificate.</p>
        </div>
      </SectionContainer>
      <SectionContainer labelledBy="verification-title">
        <div className={realmClasses.container}>
          <SectionHeading id="verification-title" eyebrow="Future Verification" title="Verification Preview" description="This static interface demonstrates the planned experience. It does not verify certificate records yet." />
          <div className="mt-10"><VerificationMockup /></div>
        </div>
      </SectionContainer>
    </PageShell>
  );
}
