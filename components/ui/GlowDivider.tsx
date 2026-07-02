import { cn } from "@/lib/utils";

type GlowDividerProps = {
  className?: string;
};

export function GlowDivider({ className }: GlowDividerProps) {
  return (
    <div
      aria-hidden="true"
      className={cn(
        "h-px w-full bg-gradient-to-r from-transparent via-[var(--realm-gold)]/50 to-transparent shadow-[var(--realm-glow-gold)]",
        className,
      )}
    />
  );
}
