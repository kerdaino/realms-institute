import { AnimatedReveal } from "@/components/ui/AnimatedReveal";
import { GradientOrb } from "@/components/ui/GradientOrb";
import { PathwayCard } from "@/components/ui/PathwayCard";
import { SectionContainer } from "@/components/ui/SectionContainer";
import { SectionHeading } from "@/components/ui/SectionHeading";
import { schools } from "@/lib/constants";
import { realmClasses } from "@/lib/theme";

export function Schools() {
  return (
    <SectionContainer
      id="schools"
      labelledBy="schools-title"
      withGrid
    >
      <GradientOrb className="left-1/2 top-20 h-72 w-72 -translate-x-1/2" />
      <div className={realmClasses.container}>
        <SectionHeading
          id="schools-title"
          eyebrow="Schools"
          title="Schools for Formation, Skill, and Deployment"
          description="Each school serves a different dimension of kingdom usefulness, helping believers move from conviction into disciplined service."
        />
        <AnimatedReveal
          className="mt-10 grid gap-4 md:grid-cols-2 lg:grid-cols-3"
          variant="staggerChildren"
        >
          {schools.map((school, index) => (
            <AnimatedReveal key={school.title}>
              <PathwayCard
                title={school.title}
                description={school.description}
                index={index}
              />
            </AnimatedReveal>
          ))}
        </AnimatedReveal>
      </div>
    </SectionContainer>
  );
}
