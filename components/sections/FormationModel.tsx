import { AnimatedReveal } from "@/components/ui/AnimatedReveal";
import { PillarCard } from "@/components/ui/PillarCard";
import { SectionContainer } from "@/components/ui/SectionContainer";
import { SectionHeading } from "@/components/ui/SectionHeading";
import { formationPillars } from "@/lib/constants";
import { realmClasses } from "@/lib/theme";

export function FormationModel() {
  return (
    <SectionContainer labelledBy="formation-title">
      <div className={realmClasses.container}>
        <SectionHeading
          id="formation-title"
          eyebrow="Formation Model"
          title="One Integrated Formation Journey"
          description="Every student completes a Theology & Discipleship Core alongside a Skill / Field Pathway. Spiritual depth and practical excellence are formed together for faithful service."
        />
        <AnimatedReveal
          className="mt-10 grid gap-4 md:grid-cols-2 lg:grid-cols-4"
          variant="staggerChildren"
        >
          {formationPillars.map((pillar) => (
            <AnimatedReveal key={pillar.title}>
              <PillarCard
                title={pillar.title}
                description={pillar.description}
              />
            </AnimatedReveal>
          ))}
        </AnimatedReveal>
      </div>
    </SectionContainer>
  );
}
