import Image from "next/image";

import { cn } from "@/lib/utils";

type BrandLogoProps = {
  className?: string;
  markClassName?: string;
  priority?: boolean;
  sizes?: string;
};

export function BrandLogo({
  className,
  markClassName,
  priority = false,
  sizes = "96px",
}: BrandLogoProps) {
  return (
    <span className={cn("realm-logo-frame", className)}>
      <Image
        src="/images/realms-logo.png"
        alt="REALMS Institute logo"
        width={1254}
        height={1254}
        sizes={sizes}
        priority={priority}
        className={cn("realm-logo-mark", markClassName)}
      />
    </span>
  );
}
