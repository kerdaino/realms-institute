import type { ReactNode } from "react";

import { GlassCard } from "@/components/ui/GlassCard";
import { realmClasses } from "@/lib/theme";
import { cn } from "@/lib/utils";

type FeatureCardProps = {
  title: string;
  description?: string;
  eyebrow?: string;
  meta?: string;
  children?: ReactNode;
  className?: string;
};

export function FeatureCard({
  title,
  description,
  eyebrow,
  meta,
  children,
  className,
}: FeatureCardProps) {
  return (
    <GlassCard
      as="article"
      className={cn("group h-full p-6", realmClasses.cardHover, className)}
    >
      <div className="relative">
        {eyebrow || meta ? (
          <div className="mb-8 flex items-center justify-between gap-4">
            {eyebrow ? (
              <span className={realmClasses.caption}>{eyebrow}</span>
            ) : null}
            {meta ? (
              <span className="font-mono text-sm text-white/35">{meta}</span>
            ) : null}
          </div>
        ) : null}
        {children}
        <h3 className={realmClasses.headingCard}>{title}</h3>
        {description ? (
          <p className="mt-4 text-sm leading-7 text-[var(--realm-muted)]">
            {description}
          </p>
        ) : null}
      </div>
    </GlassCard>
  );
}
