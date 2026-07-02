import type { HTMLAttributes } from "react";

import { GridBackground } from "@/components/ui/GridBackground";
import { realmClasses } from "@/lib/theme";
import { cn } from "@/lib/utils";

type SectionContainerProps = HTMLAttributes<HTMLElement> & {
  labelledBy: string;
  withGrid?: boolean;
};

export function SectionContainer({
  id,
  labelledBy,
  withGrid = false,
  className,
  children,
  ...props
}: SectionContainerProps) {
  return (
    <section
      id={id}
      aria-labelledby={labelledBy}
      className={cn(realmClasses.section, className)}
      {...props}
    >
      {withGrid ? <GridBackground className="opacity-35" /> : null}
      {children}
    </section>
  );
}
