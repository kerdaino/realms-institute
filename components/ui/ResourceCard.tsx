import { BookOpenText } from "lucide-react";

import { ComingSoonBadge } from "@/components/ui/ComingSoonBadge";
import { GlassCard } from "@/components/ui/GlassCard";

type ResourceCardProps = { title: string; category: string };

export function ResourceCard({ title, category }: ResourceCardProps) {
  return (
    <GlassCard as="article" className="h-full p-6">
      <div className="flex items-start justify-between gap-4">
        <span className="flex size-11 shrink-0 items-center justify-center rounded-xl border border-[var(--realm-gold)]/25 bg-[var(--realm-gold)]/10 text-[var(--realm-gold-soft)]">
          <BookOpenText aria-hidden="true" className="size-5" />
        </span>
        <ComingSoonBadge />
      </div>
      <p className="mt-8 text-xs font-semibold uppercase tracking-[0.18em] text-[var(--realm-gold-soft)]">{category}</p>
      <h3 className="mt-3 text-lg font-semibold text-[var(--realm-white)]">{title}</h3>
    </GlassCard>
  );
}
