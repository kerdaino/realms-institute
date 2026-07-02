import type { ReactNode } from "react";

import { GlassCard } from "@/components/ui/GlassCard";
import { cn } from "@/lib/utils";

type InfoPanelProps = {
  title: string;
  description?: string;
  icon?: ReactNode;
  children?: ReactNode;
  className?: string;
};

export function InfoPanel({ title, description, icon, children, className }: InfoPanelProps) {
  return (
    <GlassCard as="article" className={cn("h-full p-6 md:p-7", className)}>
      {icon ? (
        <div className="mb-5 flex size-11 items-center justify-center rounded-xl border border-[var(--realm-gold)]/25 bg-[var(--realm-gold)]/10 text-[var(--realm-gold-soft)]">
          {icon}
        </div>
      ) : null}
      <h3 className="text-lg font-semibold text-[var(--realm-white)]">{title}</h3>
      {description ? <p className="mt-3 leading-7 text-[var(--realm-muted)]">{description}</p> : null}
      {children ? <div className="mt-5">{children}</div> : null}
    </GlassCard>
  );
}
