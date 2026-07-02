import type { HTMLAttributes } from "react";

import { realmClasses } from "@/lib/theme";
import { cn } from "@/lib/utils";

type GlassCardProps = HTMLAttributes<HTMLElement> & {
  as?: "article" | "div";
  intensity?: "default" | "strong";
};

export function GlassCard({
  as = "div",
  intensity = "default",
  className,
  children,
  ...props
}: GlassCardProps) {
  const Component = as;

  return (
    <Component
      className={cn(
        "relative overflow-hidden rounded-[var(--realm-radius-xl)]",
        intensity === "strong" ? realmClasses.glassStrong : realmClasses.glass,
        className,
      )}
      {...props}
    >
      <div className="pointer-events-none absolute inset-x-6 top-0 h-px bg-gradient-to-r from-transparent via-[var(--realm-gold)]/55 to-transparent" />
      {children}
    </Component>
  );
}
