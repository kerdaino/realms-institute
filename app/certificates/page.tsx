import type { Metadata } from "next";

import { PageHero } from "@/components/layout/PageHero";
import { PageShell } from "@/components/layout/PageShell";
import { FeatureList } from "@/components/ui/FeatureList";
import { InfoPanel } from "@/components/ui/InfoPanel";
import { SectionContainer } from "@/components/ui/SectionContainer";
import { SectionHeading } from "@/components/ui/SectionHeading";
import { VerificationMockup } from "@/components/ui/VerificationMockup";
import { certificateRequirements } from "@/lib/constants";
import { realmClasses } from "@/lib/theme";

export const metadata: Metadata = {
  title: "REALMS Institute | Certificates",
  description: "Learn how future REALMS Institute certificates will record completed formation and assessed learning pathways.",
};

export default function CertificatesPage() {
  return (
    <PageShell>
      <PageHero title="Certificates" subtitle="REALMS Institute certificates will reflect completion of structured formation, learning, assessment, and participation." breadcrumbs={[{ label: "Home", href: "/" }, { label: "Certificates" }]} />
      <SectionContainer labelledBy="certificate-philosophy-title">
        <div className={realmClasses.container}>
          <SectionHeading id="certificate-philosophy-title" eyebrow="Certificate Philosophy" title="Formation Is the Goal" />
          <InfoPanel className="mt-10" title="A record, not the destination" description="A certificate is not the goal of REALMS Institute. Formation, obedience, and usefulness to God are the goal. Certificates only serve as a record of completed learning pathways." />
        </div>
      </SectionContainer>
      <SectionContainer labelledBy="certificate-access-title" withGrid>
        <div className={realmClasses.container}>
          <SectionHeading id="certificate-access-title" eyebrow="Certificate Access" title="Access Will Follow Verified Completion" description="Coming soon: Students will be able to verify or access certificates after completing the required parts of their learning pathway." />
          <FeatureList items={certificateRequirements} className="mt-8 max-w-3xl sm:grid-cols-2" />
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
