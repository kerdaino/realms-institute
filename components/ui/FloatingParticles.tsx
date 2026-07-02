import { cn } from "@/lib/utils";

type FloatingParticlesProps = {
  className?: string;
};

const particles = [
  "left-[8%] top-[18%] size-1",
  "left-[22%] top-[64%] size-1.5",
  "left-[44%] top-[24%] size-1",
  "left-[63%] top-[72%] size-1.5",
  "left-[78%] top-[34%] size-1",
  "left-[91%] top-[58%] size-1",
];

export function FloatingParticles({ className }: FloatingParticlesProps) {
  return (
    <div
      aria-hidden="true"
      className={cn("pointer-events-none absolute inset-0 -z-10", className)}
    >
      {particles.map((particle, index) => (
        <span
          key={particle}
          className={cn(
            "absolute rounded-full bg-[var(--realm-gold-soft)]/70 shadow-[0_0_18px_rgba(242,210,122,0.5)] motion-safe:animate-[realm-float_8s_ease-in-out_infinite]",
            particle,
          )}
          style={{ animationDelay: `${index * 0.8}s` }}
        />
      ))}
    </div>
  );
}
