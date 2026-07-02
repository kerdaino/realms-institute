import { FeatureCard } from "@/components/ui/FeatureCard";
import { GlowDivider } from "@/components/ui/GlowDivider";

type PillarCardProps = {
  title: string;
  description?: string;
  className?: string;
};

export function PillarCard({
  title,
  description,
  className,
}: PillarCardProps) {
  return (
    <FeatureCard className={className} description={description} title={title}>
      <GlowDivider className="order-first mb-5 max-w-14" />
    </FeatureCard>
  );
}
