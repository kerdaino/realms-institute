import { FeatureCard } from "@/components/ui/FeatureCard";
import { GlassCard } from "@/components/ui/GlassCard";
import { SectionContainer } from "@/components/ui/SectionContainer";
import { SectionHeading } from "@/components/ui/SectionHeading";
import { realmClasses } from "@/lib/theme";

export function Mission() {
  return (
    <SectionContainer
      id="mission"
      labelledBy="mission-title"
    >
      <div className={`${realmClasses.container} grid gap-10 lg:grid-cols-[0.85fr_1.15fr] lg:items-center`}>
        <GlassCard className="p-6 md:p-8">
          <div className="grid grid-cols-2 gap-3">
            {[
              "Missions",
              "Campuses",
              "Communities",
              "Media",
              "Technology",
              "Marketplace",
              "Families",
              "Nations",
            ].map((sphere) => (
              <FeatureCard key={sphere} className="p-4" title={sphere} />
            ))}
          </div>
        </GlassCard>
        <SectionHeading
          id="mission-title"
          eyebrow="Mission"
          title="From the Classroom to the Nations"
          description="Learning becomes powerful when it produces formation, deployment, and faithful influence. REALMS Institute prepares believers to carry Christ into missions, campuses, communities, media, technology, families, governance, and the marketplace with purity, intelligence, and excellence."
        />
      </div>
    </SectionContainer>
  );
}
