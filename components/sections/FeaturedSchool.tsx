import { Badge } from "@/components/ui/Badge";
import { FeatureCard } from "@/components/ui/FeatureCard";
import { GlassCard } from "@/components/ui/GlassCard";
import { SectionHeading } from "@/components/ui/SectionHeading";
import { SecondaryButton } from "@/components/ui/Button";
import { SectionContainer } from "@/components/ui/SectionContainer";
import { discoveryModules } from "@/lib/constants";
import { realmClasses } from "@/lib/theme";

export function FeaturedSchool() {
  return (
    <SectionContainer
      id="school-of-discovery"
      labelledBy="featured-school-title"
    >
      <div className={realmClasses.container}>
      <GlassCard
        intensity="strong"
        className="grid gap-8 p-5 md:p-8 lg:grid-cols-[0.95fr_1.05fr]"
      >
        <div className="flex flex-col justify-between gap-8">
          <div>
            <Badge>Foundational School</Badge>
            <SectionHeading
              id="featured-school-title"
              className="mt-6"
              eyebrow="Featured School"
              title="Realms School of Discovery"
              description="The foundational discipleship school for believers being formed in identity, calling, prayer, doctrine, evangelism, stewardship, and marketplace assignment."
            />
          </div>
          <div>
            <SecondaryButton href="/schools/discovery" showIcon>
              View School of Discovery
            </SecondaryButton>
          </div>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          {discoveryModules.map((module, index) => (
            <FeatureCard
              key={module}
              meta={String(index + 1).padStart(2, "0")}
              title={module}
            />
          ))}
        </div>
      </GlassCard>
      </div>
    </SectionContainer>
  );
}
