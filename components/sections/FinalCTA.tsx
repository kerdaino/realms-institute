import { PrimaryButton, SecondaryButton } from "@/components/ui/Button";
import { SectionContainer } from "@/components/ui/SectionContainer";
import { realmClasses } from "@/lib/theme";

export function FinalCTA() {
  return (
    <SectionContainer id="contact" labelledBy="contact-title" className="pb-24 pt-16 md:pt-24">
      <div className={realmClasses.container}>
        <div className="rounded-[var(--realm-radius-xl)] border border-[var(--realm-border-strong)] bg-[#0a1930] p-7 shadow-[var(--realm-shadow-md)] md:p-12">
          <p className="text-xs font-semibold uppercase tracking-[0.22em] text-[var(--realm-gold-soft)]">Next Cohort</p>
          <h2 id="contact-title" className="mt-4 max-w-3xl text-3xl font-semibold tracking-tight text-white md:text-5xl">Take the next step into formation.</h2>
          <p className="mt-5 max-w-3xl text-base leading-8 text-[var(--realm-muted)] md:text-lg">Apply for REALMS School of Discovery and choose Web Development or Cybersecurity Foundations as your practical skill pathway.</p>
          <div className="mt-8 flex flex-col gap-3 sm:flex-row">
            <PrimaryButton href="/register" showIcon>Apply for Next Cohort</PrimaryButton>
            <SecondaryButton href="/contact">Ask a Question</SecondaryButton>
          </div>
        </div>
      </div>
    </SectionContainer>
  );
}
