import { AnimatedReveal } from "@/components/ui/AnimatedReveal";
import { FeatureCard } from "@/components/ui/FeatureCard";
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
      <div className={realmClasses.container}>
        <SectionHeading
          id="vision-title"
          eyebrow="Vision"
          title="Christian Formation and Skill Equipping"
          description="REALMS Institute supports believers through discipleship, biblical teaching, prayer, calling discovery, character formation, and practical skill training for faithful service."
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
