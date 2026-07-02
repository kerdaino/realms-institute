import type { Metadata } from "next";

import { PageHero } from "@/components/layout/PageHero";
import { PageShell } from "@/components/layout/PageShell";
import { PrimaryButton } from "@/components/ui/Button";
import { Callout } from "@/components/ui/Callout";
import { PartnerCard } from "@/components/ui/PartnerCard";
import { SectionContainer } from "@/components/ui/SectionContainer";
import { SectionHeading } from "@/components/ui/SectionHeading";
import { partnerAreas } from "@/lib/constants";
import { realmClasses } from "@/lib/theme";

export const metadata: Metadata = {
  title: "REALMS Institute | Partners",
  description: "Explore principled ways to support the future discipleship, training, missions, and infrastructure work of REALMS Institute.",
};

export default function PartnersPage() {
  return (
    <PageShell>
      <PageHero title="Partner With the Vision" subtitle="REALMS Institute is a Kingdom formation vision that welcomes prayer, service, skill, finance, media, teaching, and technology partnership." breadcrumbs={[{ label: "Home", href: "/" }, { label: "Partners" }]} />
      <SectionContainer labelledBy="why-partner-title">
        <div className={realmClasses.container}>
          <SectionHeading id="why-partner-title" eyebrow="Why Partner" title="Stewarding the Work Together" description="Partnership can support discipleship, missions, training, student support, technology infrastructure, media, and responsible future expansion." />
        </div>
      </SectionContainer>
      <SectionContainer labelledBy="partnership-areas-title" withGrid>
        <div className={realmClasses.container}>
          <SectionHeading id="partnership-areas-title" eyebrow="Partnership Areas" title="Contribute Through Prayer, Capacity, and Stewardship" />
          <div className="mt-10 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
            {partnerAreas.map((area) => <PartnerCard key={area} title={area} />)}
          </div>
        </div>
      </SectionContainer>
      <SectionContainer labelledBy="partnership-principle-title">
        <div className={realmClasses.container}>
          <Callout eyebrow="Partnership Principle" titleId="partnership-principle-title" title="Integrity Is Non-Negotiable" actions={<PrimaryButton href="/contact" showIcon>Contact Us</PrimaryButton>}>
            <p>Partnership with REALMS Institute must be handled with integrity, accountability, and Kingdom stewardship.</p>
          </Callout>
        </div>
      </SectionContainer>
    </PageShell>
  );
}
