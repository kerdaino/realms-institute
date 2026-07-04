import { AnimatedReveal } from "@/components/ui/AnimatedReveal";
import { GlassCard } from "@/components/ui/GlassCard";
import { SectionContainer } from "@/components/ui/SectionContainer";
import { SectionHeading } from "@/components/ui/SectionHeading";
import { formationJourney } from "@/lib/constants";
import { realmClasses } from "@/lib/theme";

export function Journey() {
  return (
    <SectionContainer id="journey" labelledBy="journey-title">
      <div className={realmClasses.container}>
        <SectionHeading
          id="journey-title"
          eyebrow="Formation Pathway"
          title="The REALMS Formation Journey"
          description="A structured journey through Christian foundations, disciplined learning, practical equipping, and faithful service."
        />
        <AnimatedReveal className="relative mt-12 grid gap-4 lg:grid-cols-4" variant="staggerChildren">
          <div className="absolute left-[12%] right-[12%] top-8 hidden h-px bg-gradient-to-r from-transparent via-[var(--realm-gold)]/50 to-transparent lg:block" />
          {formationJourney.map((step, index) => (
            <AnimatedReveal key={step.title}>
              <GlassCard as="article" className="h-full p-6 pt-7">
                <div className="relative mb-8 flex size-12 items-center justify-center rounded-full border border-[var(--realm-gold)]/35 bg-[var(--realm-navy)] text-sm font-semibold text-[var(--realm-gold-soft)]">
                  {String(index + 1).padStart(2, "0")}
                </div>
                <h3 className={realmClasses.headingCard}>{step.title}</h3>
                <p className="mt-4 text-sm leading-7 text-[var(--realm-muted)]">{step.description}</p>
              </GlassCard>
            </AnimatedReveal>
          ))}
        </AnimatedReveal>
      </div>
    </SectionContainer>
  );
}
