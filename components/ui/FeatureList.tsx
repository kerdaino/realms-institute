import { CheckCircle2 } from "lucide-react";

import { cn } from "@/lib/utils";

type FeatureListProps = { items: readonly string[]; className?: string };

export function FeatureList({ items, className }: FeatureListProps) {
  return (
    <ul className={cn("grid gap-3", className)}>
      {items.map((item) => (
        <li key={item} className="flex items-start gap-3 text-sm leading-6 text-[var(--realm-muted)]">
          <CheckCircle2 aria-hidden="true" className="mt-0.5 size-5 shrink-0 text-[var(--realm-gold-soft)]" />
          <span>{item}</span>
        </li>
      ))}
    </ul>
  );
}
