import type { Metadata } from "next";
import { BookOpen, Church, Compass, Flame } from "lucide-react";

import { PageHero } from "@/components/layout/PageHero";
import { PageShell } from "@/components/layout/PageShell";
import { Callout } from "@/components/ui/Callout";
import { InfoPanel } from "@/components/ui/InfoPanel";
import { SectionContainer } from "@/components/ui/SectionContainer";
import { SectionHeading } from "@/components/ui/SectionHeading";
import { formationPillars, spheresOfInfluence } from "@/lib/constants";
import { realmClasses } from "@/lib/theme";

export const metadata: Metadata = {
  title: "REALMS Institute | About",
  description: "Learn about the vision, burden, and Kingdom formation philosophy of REALMS Institute.",
};

const storySections = [
  {
    title: "The Vision",
    description: "To raise mature, useful, glory-revealing Christians who carry Christ faithfully into every sphere of influence.",
    icon: <Compass aria-hidden="true" className="size-5" />,
  },
  {
    title: "The Burden",
    description: "Many believers have information but need integrated formation in doctrine, prayer, purity, calling, skill, and practical obedience.",
    icon: <Flame aria-hidden="true" className="size-5" />,
  },
  {
    title: "Our Formation Philosophy",
    description: "Truth should become conviction, devotion, character, competence, mission, and visible usefulness—not merely completed lessons.",
    icon: <BookOpen aria-hidden="true" className="size-5" />,
  },
  {
    title: "Powered by Gloryrealm Christian Centre",
    description: "REALMS Institute grows from a local-church burden for discipleship, spiritual maturity, mission, leadership, and faithful influence.",
    icon: <Church aria-hidden="true" className="size-5" />,
  },
] as const;

export default function AboutPage() {
  return (
    <PageShell>
      <PageHero
        title="About REALMS Institute"
        subtitle="REALMS Institute exists to bring the will of the Father into the earth realm by forming believers into mature, useful, glory-revealing Christians in every sphere of influence."
        breadcrumbs={[{ label: "Home", href: "/" }, { label: "About" }]}
      />
      <SectionContainer labelledBy="about-identity-title">
        <div className={realmClasses.container}>
          <SectionHeading
            id="about-identity-title"
            eyebrow="A Kingdom Formation Institution"
            title="More Than a School, Platform, or Skill Centre"
            description="REALMS brings discipleship, spiritual formation, biblical foundation, purity, prayer, calling, excellence, skills, and deployment into one coherent formation journey."
          />
          <div className="mt-10 grid gap-4 md:grid-cols-2">
            {storySections.map((section) => (
              <InfoPanel key={section.title} {...section} />
            ))}
          </div>
        </div>
      </SectionContainer>
      <SectionContainer labelledBy="about-formation-title" withGrid>
        <div className={realmClasses.container}>
          <SectionHeading
            id="about-formation-title"
            eyebrow="Integrated Formation"
            title="Rooted in Christ. Prepared for Assignment."
            description="Formation reaches the inner life and the public assignment: prayer and purity, doctrine and leadership, mission and marketplace relevance, media and technology."
          />
          <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {formationPillars.map((pillar) => (
              <InfoPanel key={pillar.title} title={pillar.title} description={pillar.description} />
            ))}
          </div>
          <div className="mt-8 flex flex-wrap gap-2" aria-label="Spheres of influence">
            {spheresOfInfluence.map((sphere) => (
              <span key={sphere} className="rounded-full border border-white/10 bg-white/[0.05] px-4 py-2 text-sm text-[var(--realm-muted)]">
                {sphere}
              </span>
            ))}
          </div>
        </div>
      </SectionContainer>
      <SectionContainer labelledBy="about-callout-title">
        <div className={realmClasses.container}>
          <Callout eyebrow="The Aim" titleId="about-callout-title" title="Formation That Produces Faithful Obedience">
            <p>
              REALMS is designed to help believers know Christ, discern assignment, grow in disciplined Christian living, and serve the Church, society, and the nations with integrity and excellence.
            </p>
          </Callout>
        </div>
      </SectionContainer>
    </PageShell>
  );
}
