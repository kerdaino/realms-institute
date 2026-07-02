import { cn } from "@/lib/utils";

type GridBackgroundProps = {
  className?: string;
};

export function GridBackground({ className }: GridBackgroundProps) {
  return (
    <div
      aria-hidden="true"
      className={cn("realm-grid pointer-events-none absolute inset-0 -z-20", className)}
    />
  );
}
