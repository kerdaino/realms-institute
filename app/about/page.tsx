import type { Metadata } from "next";
import Link from "next/link";
import { BookOpen, Church, Compass, Flame } from "lucide-react";

import { PageHero } from "@/components/layout/PageHero";
import { PageShell } from "@/components/layout/PageShell";
import { Callout } from "@/components/ui/Callout";
import { InfoPanel } from "@/components/ui/InfoPanel";
import { SectionContainer } from "@/components/ui/SectionContainer";
import { SectionHeading } from "@/components/ui/SectionHeading";
import { formationPillars, gloryrealmChristianCentreUrl, spheresOfInfluence } from "@/lib/constants";
import { realmClasses } from "@/lib/theme";

export const metadata: Metadata = {
  title: "REALMS Institute | About",
  description: "Learn about REALMS Institute, a Christian formation and skill-equipping institute serving believers through discipleship and practical training.",
};

const storySections = [
  {
    title: "The Vision",
    description: "To help believers grow in Christ and serve faithfully with biblical grounding, character, and practical skill.",
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
        subtitle="REALMS Institute is a Christian formation and skill-equipping institute helping believers grow in God and prepare for faithful service in their field of assignment."
        breadcrumbs={[{ label: "Home", href: "/" }, { label: "About" }]}
      />
      <SectionContainer labelledBy="about-identity-title">
        <div className={realmClasses.container}>
          <SectionHeading
            id="about-identity-title"
            eyebrow="Our Current Identity"
            title="Christian Formation and Practical Equipping"
            description="REALMS brings discipleship, biblical teaching, prayer, calling discovery, character, and practical skills into one coherent formation journey. For August 2026, every School of Discovery student completes one approved discipleship route—Foundational or Advanced—and Web Development or Cybersecurity Foundations."
          />
          <div className="mt-10 grid gap-4 md:grid-cols-2">
            {storySections.map((section) => (
              <InfoPanel
                key={section.title}
                {...section}
                title={section.title === "Powered by Gloryrealm Christian Centre"
                  ? <Link href={gloryrealmChristianCentreUrl} target="_blank" rel="noopener noreferrer" className="hover:text-[var(--realm-gold-soft)]">Powered by Gloryrealm Christian Centre</Link>
                  : section.title}
              />
            ))}
          </div>
        </div>
      </SectionContainer>
      <SectionContainer labelledBy="about-audience-title">
        <div className={realmClasses.container}>
          <Callout eyebrow="Who We Serve" titleId="about-audience-title" title="A Clear Christian Foundation">
            <p>REALMS Institute primarily serves believers who desire deeper formation in God and practical equipping for their field of assignment. Those who are new to faith or exploring Christianity may begin through the foundational teachings of the School of Discovery.</p>
          </Callout>
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
