import { ComingSoonBadge } from "@/components/ui/ComingSoonBadge";
import { FeatureCard } from "@/components/ui/FeatureCard";

type ProgramCardProps = { title: string; description?: string; comingSoon?: boolean };

export function ProgramCard({ title, description, comingSoon = false }: ProgramCardProps) {
  return (
    <FeatureCard title={title} description={description}>
      {comingSoon ? <div className="mb-6"><ComingSoonBadge /></div> : null}
    </FeatureCard>
  );
}
