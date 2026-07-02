import type { Metadata } from "next";

import { PageHero } from "@/components/layout/PageHero";
import { PageShell } from "@/components/layout/PageShell";
import { ResourceCard } from "@/components/ui/ResourceCard";
import { SectionContainer } from "@/components/ui/SectionContainer";
import { SectionHeading } from "@/components/ui/SectionHeading";
import { resourceCategories, resources } from "@/lib/constants";
import { realmClasses } from "@/lib/theme";

export const metadata: Metadata = {
  title: "REALMS Institute | Resources",
  description: "Discover forthcoming REALMS Institute teachings, study guides, prayer materials, and formation resources.",
};

export default function ResourcesPage() {
  return (
    <PageShell>
      <PageHero title="Resources" subtitle="Teachings, guides, prayer materials, study notes, and formation resources for believers growing in doctrine, devotion, and assignment." breadcrumbs={[{ label: "Home", href: "/" }, { label: "Resources" }]} />
      {resourceCategories.map((category, index) => {
        const categoryResources = resources.filter((resource) => resource.category === category);
        return (
          <SectionContainer key={category} labelledBy={`resources-${index}-title`} withGrid={index % 2 === 1}>
            <div className={realmClasses.container}>
              <SectionHeading id={`resources-${index}-title`} title={category} description="Carefully prepared materials will appear here as they become available." />
              <div className="mt-10 grid gap-5 md:grid-cols-2 xl:grid-cols-3">
                {categoryResources.map((resource) => <ResourceCard key={resource.title} {...resource} />)}
                {categoryResources.length === 0 ? <ResourceCard title={`${category} collection`} category={category} /> : null}
              </div>
            </div>
          </SectionContainer>
        );
      })}
      <aside className="border-t border-[var(--realm-border)] px-5 py-10 text-center text-sm leading-7 text-[var(--realm-muted)] md:px-8">Resources will be released gradually as the institute grows.</aside>
    </PageShell>
  );
}
