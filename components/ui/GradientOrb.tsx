import { cn } from "@/lib/utils";

type GradientOrbProps = {
  className?: string;
  tone?: "gold" | "blue" | "white";
};

const tones = {
  gold: "bg-[var(--realm-gold)]/18",
  blue: "bg-blue-400/[0.14]",
  white: "bg-white/[0.08]",
};

export function GradientOrb({ className, tone = "gold" }: GradientOrbProps) {
  return (
    <div
      aria-hidden="true"
      className={cn("glow-orb h-64 w-64", tones[tone], className)}
    />
  );
}
