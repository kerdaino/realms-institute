import type { Metadata } from "next";
import { Mail, MapPin, MonitorSmartphone } from "lucide-react";

import { PageHero } from "@/components/layout/PageHero";
import { PageShell } from "@/components/layout/PageShell";
import { Button } from "@/components/ui/Button";
import { GlassCard } from "@/components/ui/GlassCard";
import { InfoPanel } from "@/components/ui/InfoPanel";
import { SectionContainer } from "@/components/ui/SectionContainer";
import { contactEmail, physicalAddress, whatsappChannelUrl } from "@/lib/constants";
import { realmClasses } from "@/lib/theme";

export const metadata: Metadata = {
  title: "Contact REALMS Institute",
  description: "Contact REALMS Institute with questions about the School of Discovery, registration, learning modes, or the next cohort.",
};

const fieldClassName = "mt-2 min-h-12 w-full rounded-xl border border-white/[0.14] bg-[var(--realm-navy)]/70 px-4 py-3 text-[var(--realm-white)] outline-none placeholder:text-[var(--realm-slate)] focus:border-[var(--realm-gold)] focus:ring-2 focus:ring-[var(--realm-gold)]/20";

export default function ContactPage() {
  return (
    <PageShell>
      <PageHero
        title="Contact REALMS Institute"
        subtitle="Ask questions about the School of Discovery, registration, learning modes, or the next cohort."
        breadcrumbs={[{ label: "Home", href: "/" }, { label: "Contact" }]}
      />
      <SectionContainer labelledBy="contact-form-title">
        <div className={`${realmClasses.container} grid gap-6 lg:grid-cols-[1.15fr_0.85fr]`}>
          <GlassCard className="p-6 md:p-8">
            <h2 id="contact-form-title" className="text-2xl font-semibold text-[var(--realm-white)] md:text-3xl">Send an Enquiry</h2>
            <p className="mt-3 leading-7 text-[var(--realm-muted)]">For immediate enquiries, please use the email address provided.</p>
            <form className="mt-8 grid gap-5" aria-describedby="contact-form-note">
              <div className="grid gap-5 sm:grid-cols-2">
                <div>
                  <label className="text-sm font-medium text-[var(--realm-white)]" htmlFor="name">Name</label>
                  <input className={fieldClassName} id="name" name="name" type="text" autoComplete="name" />
                </div>
                <div>
                  <label className="text-sm font-medium text-[var(--realm-white)]" htmlFor="email">Email</label>
                  <input className={fieldClassName} id="email" name="email" type="email" autoComplete="email" />
                </div>
              </div>
              <div className="grid gap-5 sm:grid-cols-2">
                <div>
                  <label className="text-sm font-medium text-[var(--realm-white)]" htmlFor="whatsapp">WhatsApp</label>
                  <input className={fieldClassName} id="whatsapp" name="whatsapp" type="tel" autoComplete="tel" />
                </div>
                <div>
                  <label className="text-sm font-medium text-[var(--realm-white)]" htmlFor="interest">Interest type</label>
                  <select className={fieldClassName} id="interest" name="interest" defaultValue="">
                    <option value="" disabled>Select an option</option>
                    <option value="cohort">Joining a cohort</option>
                    <option value="partnership">Partnership</option>
                    <option value="volunteering">Volunteering</option>
                    <option value="general">General enquiry</option>
                  </select>
                </div>
              </div>
              <div>
                <label className="text-sm font-medium text-[var(--realm-white)]" htmlFor="message">Message</label>
                <textarea className={`${fieldClassName} min-h-36 resize-y`} id="message" name="message" rows={5} />
              </div>
              <p id="contact-form-note" className="text-sm text-[var(--realm-slate)]">Online submission is not enabled yet. Please email REALMS Institute directly.</p>
              <div>
                <Button disabled type="button">Send Message</Button>
              </div>
            </form>
          </GlassCard>
          <div className="grid gap-4 sm:grid-cols-3 lg:grid-cols-1">
            <InfoPanel title="Email" description={contactEmail} icon={<Mail aria-hidden="true" className="size-5" />} />
            <InfoPanel title="Physical Classes/Location" description={physicalAddress} icon={<MapPin aria-hidden="true" className="size-5" />} />
            <InfoPanel title="Learning Mode" description="Physical + Online" icon={<MonitorSmartphone aria-hidden="true" className="size-5" />} />
            <GlassCard className="p-5 sm:col-span-3 lg:col-span-1">
              <h2 className="text-lg font-semibold text-[var(--realm-white)]">REALMS WhatsApp Channel</h2>
              <p className="mt-2 text-sm leading-6 text-[var(--realm-muted)]">Stay updated through the REALMS Institute WhatsApp Channel.</p>
              <div className="mt-4"><Button href={whatsappChannelUrl} target="_blank" rel="noopener noreferrer" showIcon>Join WhatsApp Channel</Button></div>
            </GlassCard>
          </div>
        </div>
      </SectionContainer>
    </PageShell>
  );
}
