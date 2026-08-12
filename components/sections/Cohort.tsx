import { Badge } from "@/components/ui/Badge";
import { GlassCard } from "@/components/ui/GlassCard";
import { SectionHeading } from "@/components/ui/SectionHeading";
import { PrimaryButton } from "@/components/ui/Button";
import { SectionContainer } from "@/components/ui/SectionContainer";
import { realmClasses } from "@/lib/theme";
import { schoolOfDiscoveryLearningModeStatement, schoolOfDiscoveryStructureStatement } from "@/lib/schoolOfDiscoveryCurriculum";

export function Cohort({ registrationOpen, cohortName }: { registrationOpen: boolean; cohortName?: string }) {
  return (
    <SectionContainer id="cohort" labelledBy="cohort-title">
      <div className={realmClasses.container}>
        <GlassCard intensity="strong" className="p-6 md:p-10">
          <div className="relative grid gap-10 lg:grid-cols-[1fr_0.85fr] lg:items-center">
            <div>
              <Badge className="mb-6">Announcement</Badge>
            <SectionHeading
              id="cohort-title"
              eyebrow={registrationOpen ? "Registration Open" : "Registration Closed"}
              title={registrationOpen ? `Applications Open for ${cohortName ?? "the Current Cohort"}` : `${cohortName ?? "Current Cohort"} Registration Is Closed`}
              description={`${schoolOfDiscoveryStructureStatement} ${registrationOpen ? "The detailed cohort schedule is now published." : "Existing applications and applicant instructions remain valid."}`}
            />
            </div>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-1">
              {[
                schoolOfDiscoveryLearningModeStatement,
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
              {registrationOpen ? "Apply Now" : "Registration Information"}
            </PrimaryButton>
          </div>
        </GlassCard>
      </div>
    </SectionContainer>
  );
}
