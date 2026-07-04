import type { Metadata } from "next";

import { PageHero } from "@/components/layout/PageHero";
import { PageShell } from "@/components/layout/PageShell";
import { PrimaryButton } from "@/components/ui/Button";
import { FeatureList } from "@/components/ui/FeatureList";
import { SectionContainer } from "@/components/ui/SectionContainer";
import { StatusPanel } from "@/components/ui/StatusPanel";
import { portalFeatures } from "@/lib/constants";
import { realmClasses } from "@/lib/theme";

export const metadata: Metadata = {
  title: "REALMS Institute | Student Portal",
  description: "Preview the future REALMS Institute learning environment for enrolled students.",
};

export default function StudentPortalPage() {
  return (
    <PageShell>
      <PageHero eyebrow="Coming Soon" title="Student Portal" subtitle="A planned learning area for enrolled students. Portal access and features are not yet available." breadcrumbs={[{ label: "Home", href: "/" }, { label: "Student Portal" }]} />
      <SectionContainer labelledBy="portal-status-title" withGrid>
        <div className={realmClasses.container}>
          <StatusPanel title="Student learning environment" description="The portal is planned for a later phase. There is no student login, dashboard, or connected learning system on this website yet.">
            <h3 id="portal-status-title" className="text-lg font-semibold text-[var(--realm-white)]">Future features</h3>
            <FeatureList items={portalFeatures} className="mt-5 sm:grid-cols-2 lg:grid-cols-4" />
            <div className="mt-9"><PrimaryButton href="/admissions" showIcon>Register interest for the next cohort</PrimaryButton></div>
          </StatusPanel>
        </div>
      </SectionContainer>
    </PageShell>
  );
}
