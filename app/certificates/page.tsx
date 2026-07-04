import type { Metadata } from "next";

import { PageHero } from "@/components/layout/PageHero";
import { PageShell } from "@/components/layout/PageShell";
import { FeatureList } from "@/components/ui/FeatureList";
import { InfoPanel } from "@/components/ui/InfoPanel";
import { SectionContainer } from "@/components/ui/SectionContainer";
import { SectionHeading } from "@/components/ui/SectionHeading";
import { VerificationMockup } from "@/components/ui/VerificationMockup";
import { certificateNote, certificateRequirements } from "@/lib/constants";
import { realmClasses } from "@/lib/theme";

export const metadata: Metadata = {
  title: "REALMS Institute | Certificates",
  description: "Learn how future REALMS Institute certificates will record completed formation and assessed learning pathways.",
};

export default function CertificatesPage() {
  return (
    <PageShell>
      <PageHero eyebrow="Coming Soon" title="Certificates" subtitle="Institute-issued certificates will record completion of specified learning requirements. Certificate access and verification are not yet available." breadcrumbs={[{ label: "Home", href: "/" }, { label: "Certificates" }]} />
      <SectionContainer labelledBy="certificate-philosophy-title">
        <div className={realmClasses.container}>
          <SectionHeading id="certificate-philosophy-title" eyebrow="Certificate Philosophy" title="Formation Is the Goal" />
          <InfoPanel className="mt-10" title="A record of completed learning" description={certificateNote} />
        </div>
      </SectionContainer>
      <SectionContainer labelledBy="certificate-access-title">
        <div className={realmClasses.container}>
          <SectionHeading id="certificate-access-title" eyebrow="Certificate Access" title="Access Will Follow Verified Completion" description="Coming soon: Students will be able to verify or access certificates after completing the required parts of their learning pathway." />
          <FeatureList items={certificateRequirements} className="mt-8 max-w-3xl sm:grid-cols-2" />
          <div className="mt-8 space-y-2 text-sm leading-7 text-[var(--realm-muted)]"><p>Institute-issued certificate of completion in Discipleship &amp; Theology Formation</p><p>Institute-issued certificate of completion in the selected Skill Pathway</p></div>
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
