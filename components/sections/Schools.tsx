import { AnimatedReveal } from "@/components/ui/AnimatedReveal";
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
    >
      <div className={realmClasses.container}>
        <SectionHeading
          id="schools-title"
          eyebrow="Schools"
          title="Current and Future Schools"
          description="The School of Discovery is currently active. Other schools shown here are future plans and are not open for the next cohort."
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
