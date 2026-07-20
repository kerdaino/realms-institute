import { Badge } from "@/components/ui/Badge";
import { FeatureCard } from "@/components/ui/FeatureCard";
import { GlassCard } from "@/components/ui/GlassCard";
import { SectionHeading } from "@/components/ui/SectionHeading";
import { SecondaryButton } from "@/components/ui/Button";
import { SectionContainer } from "@/components/ui/SectionContainer";
import { foundationalDiscipleshipCourses, schoolOfDiscoveryStructureStatement } from "@/lib/schoolOfDiscoveryCurriculum";
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
            <Badge>August 2026 Programme</Badge>
            <SectionHeading
              id="featured-school-title"
              className="mt-6"
              eyebrow="Featured School"
              title="Realms School of Discovery"
              description={schoolOfDiscoveryStructureStatement}
            />
          </div>
          <div>
            <SecondaryButton href="/schools/discovery" showIcon>
              View School of Discovery
            </SecondaryButton>
          </div>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          {foundationalDiscipleshipCourses.map((course) => (
            <FeatureCard
              key={course.code}
              meta={course.code}
              title={course.title}
            />
          ))}
        </div>
      </GlassCard>
      </div>
    </SectionContainer>
  );
}
