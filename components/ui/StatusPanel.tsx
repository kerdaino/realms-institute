import type { ReactNode } from "react";

import { ComingSoonBadge } from "@/components/ui/ComingSoonBadge";
import { GlassCard } from "@/components/ui/GlassCard";

type StatusPanelProps = { title: string; description: string; children?: ReactNode };

export function StatusPanel({ title, description, children }: StatusPanelProps) {
  return (
    <GlassCard intensity="strong" className="p-7 md:p-10">
      <ComingSoonBadge />
      <h2 className="mt-6 text-2xl font-semibold text-[var(--realm-white)] md:text-3xl">{title}</h2>
      <p className="mt-4 max-w-3xl leading-8 text-[var(--realm-muted)]">{description}</p>
      {children ? <div className="mt-8">{children}</div> : null}
    </GlassCard>
  );
}
