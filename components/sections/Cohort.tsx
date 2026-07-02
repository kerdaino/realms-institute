import { Badge } from "@/components/ui/Badge";
import { GlassCard } from "@/components/ui/GlassCard";
import { SectionHeading } from "@/components/ui/SectionHeading";
import { PrimaryButton } from "@/components/ui/Button";
import { SectionContainer } from "@/components/ui/SectionContainer";
import { realmClasses } from "@/lib/theme";

export function Cohort() {
  return (
    <SectionContainer id="cohort" labelledBy="cohort-title">
      <div className={realmClasses.container}>
        <GlassCard intensity="strong" className="p-6 md:p-10">
          <div className="relative grid gap-10 lg:grid-cols-[1fr_0.85fr] lg:items-center">
            <div>
              <Badge className="mb-6">Announcement</Badge>
            <SectionHeading
              id="cohort-title"
              eyebrow="Next Cohort"
              title="Next Cohort"
              description="The upcoming August cohort combines the Theology & Discipleship Core with Web Development or Cybersecurity Foundations."
            />
            </div>
            <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-1">
              {[
                "Physical or Online",
                "Web Development",
                "Cybersecurity Foundations",
              ].map((item) => (
                <div
                  key={item}
                  className="rounded-2xl border border-white/[0.12] bg-[var(--realm-navy)]/42 px-5 py-4 text-sm font-semibold text-[var(--realm-white)]"
                >
                  {item}
                </div>
              ))}
            </div>
          </div>
          <div className="relative mt-8">
            <PrimaryButton href="/register" showIcon>
              Apply for Next Cohort
            </PrimaryButton>
          </div>
        </GlassCard>
      </div>
    </SectionContainer>
  );
}
