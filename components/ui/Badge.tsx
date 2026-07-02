import type { HTMLAttributes } from "react";

import { realmClasses } from "@/lib/theme";
import { cn } from "@/lib/utils";

type BadgeProps = HTMLAttributes<HTMLSpanElement>;

export function Badge({ className, children, ...props }: BadgeProps) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-2 rounded-full border border-[var(--realm-gold)]/28 bg-[var(--realm-gold)]/10 px-4 py-2",
        realmClasses.caption,
        className,
      )}
      {...props}
    >
      {children}
    </span>
  );
}
