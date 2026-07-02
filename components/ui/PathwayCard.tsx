import { FeatureCard } from "@/components/ui/FeatureCard";

type PathwayCardProps = {
  title: string;
  description?: string;
  index?: number;
  className?: string;
};

export function PathwayCard({
  title,
  description,
  index = 0,
  className,
}: PathwayCardProps) {
  return (
    <FeatureCard
      className={className}
      description={description}
      eyebrow="Pathway"
      meta={String(index + 1).padStart(2, "0")}
      title={title}
    />
  );
}
