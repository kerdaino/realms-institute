import { Breadcrumbs, type BreadcrumbItem } from "@/components/ui/Breadcrumbs";
import { realmClasses } from "@/lib/theme";

type PageHeroProps = {
  eyebrow?: string;
  title: string;
  subtitle: string;
  breadcrumbs: BreadcrumbItem[];
};

export function PageHero({
  eyebrow = "REALMS Institute",
  title,
  subtitle,
  breadcrumbs,
}: PageHeroProps) {
  return (
    <header className="relative isolate overflow-hidden border-b border-[var(--realm-border)] px-5 py-16 md:px-8 md:py-24">
      <div className={`${realmClasses.container} relative px-0 md:px-0`}>
        <Breadcrumbs items={breadcrumbs} />
        <p className={`${realmClasses.caption} mt-10`}>{eyebrow}</p>
        <h1 className="mt-5 max-w-4xl text-4xl font-semibold leading-[1.02] tracking-tight text-[var(--realm-white)] sm:text-5xl md:text-6xl">
          {title}
        </h1>
        <p className="mt-6 max-w-3xl text-base leading-8 text-[var(--realm-muted)] md:text-lg">
          {subtitle}
        </p>
      </div>
    </header>
  );
}
