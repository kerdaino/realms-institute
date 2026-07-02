import { ChevronRight } from "lucide-react";
import Link from "next/link";

import { realmClasses } from "@/lib/theme";
import { cn } from "@/lib/utils";

export type BreadcrumbItem = {
  label: string;
  href?: string;
};

type BreadcrumbsProps = {
  items: BreadcrumbItem[];
};

export function Breadcrumbs({ items }: BreadcrumbsProps) {
  return (
    <nav aria-label="Breadcrumb">
      <ol className="flex flex-wrap items-center gap-2 text-sm text-[var(--realm-muted)]">
        {items.map((item, index) => {
          const isCurrent = index === items.length - 1;

          return (
            <li key={`${item.label}-${index}`} className="flex items-center gap-2">
              {index > 0 ? (
                <ChevronRight aria-hidden="true" className="size-3.5 text-[var(--realm-slate)]" />
              ) : null}
              {item.href && !isCurrent ? (
                <Link className={cn("rounded-sm hover:text-[var(--realm-white)]", realmClasses.focus)} href={item.href}>
                  {item.label}
                </Link>
              ) : (
                <span aria-current={isCurrent ? "page" : undefined} className={isCurrent ? "text-[var(--realm-gold-soft)]" : undefined}>
                  {item.label}
                </span>
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
