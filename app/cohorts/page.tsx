import type { Metadata } from "next";
import { Award, BookOpenCheck, CalendarClock, HandHeart, MessageCircle, Users } from "lucide-react";

import { PageHero } from "@/components/layout/PageHero";
import { PageShell } from "@/components/layout/PageShell";
import { Badge } from "@/components/ui/Badge";
import { PrimaryButton } from "@/components/ui/Button";
import { Callout } from "@/components/ui/Callout";
import { GlassCard } from "@/components/ui/GlassCard";
import { InfoPanel } from "@/components/ui/InfoPanel";
import { SectionContainer } from "@/components/ui/SectionContainer";
import { SectionHeading } from "@/components/ui/SectionHeading";
import { certificateNote, cohortExpectations } from "@/lib/constants";
import { realmClasses } from "@/lib/theme";

export const metadata: Metadata = {
  title: "REALMS Institute | Cohorts",
  description: "Explore upcoming REALMS Institute cohorts for structured learning, prayer, formation, and accountability.",
};

const expectationIcons = [BookOpenCheck, HandHeart, CalendarClock, Users, MessageCircle, Award] as const;

export default function CohortsPage() {
  return (
    <PageShell>
      <PageHero
        title="Cohorts"
        subtitle="REALMS Institute cohorts are structured seasons of learning, prayer, formation, and accountability."
        breadcrumbs={[{ label: "Home", href: "/" }, { label: "Cohorts" }]}
      />
      <SectionContainer labelledBy="next-cohort-title">
        <div className={realmClasses.container}>
          <GlassCard intensity="strong" className="p-6 md:p-10">
            <Badge>Next Cohort</Badge>
            <h2 id="next-cohort-title" className="mt-6 text-3xl font-semibold text-[var(--realm-white)] md:text-5xl">Formation for the Next Assignment</h2>
            <div className="mt-8 grid gap-3 md:grid-cols-3">
              {["Next Cohort", "Web Development", "Cybersecurity Foundations"].map((detail) => (
                <div key={detail} className="rounded-2xl border border-white/10 bg-[var(--realm-navy)]/45 px-5 py-5 font-semibold text-[var(--realm-white)]">{detail}</div>
              ))}
            </div>
          </GlassCard>
        </div>
      </SectionContainer>
      <SectionContainer labelledBy="cohort-expectations-title" withGrid>
        <div className={realmClasses.container}>
          <SectionHeading id="cohort-expectations-title" eyebrow="What to Expect" title="A Structured Formation Environment" />
          <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {cohortExpectations.map((expectation, index) => {
              const Icon = expectationIcons[index];
              return <InfoPanel key={expectation} title={expectation} icon={<Icon aria-hidden="true" className="size-5" />} />;
            })}
          </div>
          <p className="mt-6 text-sm leading-6 text-[var(--realm-muted)]">{certificateNote}</p>
        </div>
      </SectionContainer>
      <SectionContainer labelledBy="cohort-impact-title">
        <div className={realmClasses.container}>
          <Callout
            eyebrow="Past Cohort Impact"
            titleId="cohort-impact-title"
            title="The Beginning of a Larger Burden"
            actions={<PrimaryButton href="/register" showIcon>Apply for Next Cohort</PrimaryButton>}
          >
            <p>The first School of Discovery cohort marked the beginning of a larger burden to raise believers who are formed for doctrine, prayer, calling, and practical usefulness.</p>
          </Callout>
        </div>
      </SectionContainer>
    </PageShell>
  );
}
