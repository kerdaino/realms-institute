import { Building2, Church, Cpu, GraduationCap, Heart, Landmark, Megaphone, Send } from "lucide-react";

import { AnimatedReveal } from "@/components/ui/AnimatedReveal";
import { GlassCard } from "@/components/ui/GlassCard";
import { SectionContainer } from "@/components/ui/SectionContainer";
import { SectionHeading } from "@/components/ui/SectionHeading";
import { spheresOfInfluence } from "@/lib/constants";
import { realmClasses } from "@/lib/theme";

const icons = [Heart, GraduationCap, Church, Megaphone, Cpu, Building2, Send, Landmark];

export function Spheres() {
  return (
    <SectionContainer id="spheres" labelledBy="spheres-title" withGrid>
      <div className={realmClasses.container}>
        <SectionHeading
          id="spheres-title"
          eyebrow="Kingdom Influence"
          title="Formed for Every Sphere of Influence"
          description="REALMS prepares glory-revealing Christians to carry truth, wisdom, excellent work, and faithful witness wherever God assigns them."
          align="center"
        />
        <AnimatedReveal className="mt-12 grid grid-cols-2 gap-3 md:grid-cols-4" variant="staggerChildren">
          {spheresOfInfluence.map((sphere, index) => {
            const Icon = icons[index];
            return (
              <AnimatedReveal key={sphere}>
                <GlassCard as="article" className="group flex min-h-40 flex-col justify-between p-5 md:min-h-48 md:p-6">
                  <Icon aria-hidden="true" className="size-6 text-[var(--realm-gold-soft)] transition-transform duration-300 group-hover:scale-110" />
                  <div>
                    <span className="font-mono text-xs text-white/35">{String(index + 1).padStart(2, "0")}</span>
                    <h3 className="mt-2 text-base font-semibold text-[var(--realm-white)] md:text-lg">{sphere}</h3>
                  </div>
                </GlassCard>
              </AnimatedReveal>
            );
          })}
        </AnimatedReveal>
      </div>
    </SectionContainer>
  );
}
