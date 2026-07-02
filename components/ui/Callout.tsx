import type { ReactNode } from "react";

import { GlassCard } from "@/components/ui/GlassCard";

type CalloutProps = {
  eyebrow?: string;
  titleId?: string;
  title: string;
  children: ReactNode;
  actions?: ReactNode;
};

export function Callout({ eyebrow, titleId, title, children, actions }: CalloutProps) {
  return (
    <GlassCard intensity="strong" className="p-6 md:p-10">
      <div className="relative max-w-3xl">
        {eyebrow ? <p className="text-xs font-semibold uppercase tracking-[0.22em] text-[var(--realm-gold-soft)]">{eyebrow}</p> : null}
        <h2 id={titleId} className="mt-3 text-2xl font-semibold text-[var(--realm-white)] md:text-4xl">{title}</h2>
        <div className="mt-4 leading-8 text-[var(--realm-muted)]">{children}</div>
        {actions ? <div className="mt-7 flex flex-wrap gap-3">{actions}</div> : null}
      </div>
    </GlassCard>
  );
}
