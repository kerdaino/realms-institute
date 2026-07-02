import { AnimatedReveal } from "@/components/ui/AnimatedReveal";
import { FeatureCard } from "@/components/ui/FeatureCard";
import { GradientOrb } from "@/components/ui/GradientOrb";
import { SectionContainer } from "@/components/ui/SectionContainer";
import { SectionHeading } from "@/components/ui/SectionHeading";
import { visionCards } from "@/lib/constants";
import { realmClasses } from "@/lib/theme";

export function Vision() {
  return (
    <SectionContainer
      id="vision"
      labelledBy="vision-title"
    >
      <GradientOrb className="-right-32 top-24" tone="blue" />
      <div className={realmClasses.container}>
        <SectionHeading
          id="vision-title"
          eyebrow="Vision"
          title="The Burden Behind REALMS"
          description="REALMS Institute is not just a learning platform. It is a formation system for believers who want to become useful to God in their generation. Through discipleship, sound doctrine, prayer, purity, calling discovery, and relevant skill, believers are prepared to reveal Christ with weight and wisdom in every assignment."
        />
        <AnimatedReveal
          className="mt-10 grid gap-4 md:grid-cols-3"
          variant="staggerChildren"
        >
          {visionCards.map((card) => (
            <AnimatedReveal key={card.title}>
              <FeatureCard title={card.title} description={card.description} />
            </AnimatedReveal>
          ))}
        </AnimatedReveal>
      </div>
    </SectionContainer>
  );
}
