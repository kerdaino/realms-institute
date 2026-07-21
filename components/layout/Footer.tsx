import Link from "next/link";

import { contactEmail, footerLinks, physicalAddress, siteConfig } from "@/lib/constants";
import { BrandLogo } from "@/components/ui/BrandLogo";
import { realmClasses } from "@/lib/theme";

export function Footer() {
  return (
    <footer className="border-t border-[var(--realm-border)] bg-[var(--realm-navy)]/72 py-12">
      <div className={`${realmClasses.container} grid gap-10 text-sm text-[var(--realm-muted)] lg:grid-cols-[1fr_auto_auto] lg:items-end`}>
        <div className="flex max-w-2xl items-start gap-5">
          <BrandLogo className="w-24 shrink-0" sizes="96px" />
          <div>
            <p className="text-lg font-semibold tracking-[0.14em] text-[var(--realm-white)] uppercase">{siteConfig.instituteName}</p>
            <p className="mt-3 leading-7">{siteConfig.motto}</p>
            <p className="mt-2 text-[var(--realm-gold-soft)]">{siteConfig.independenceStatement}</p>
          </div>
        </div>
        <nav aria-label="Institutional links">
          <p className="mb-3 text-xs font-semibold uppercase tracking-[0.18em] text-[var(--realm-gold-soft)]">Explore</p>
          <ul className="grid gap-2">
            {footerLinks.map((link) => (
              <li key={link.href}><Link className="hover:text-[var(--realm-white)]" href={link.href}>{link.label}</Link></li>
            ))}
          </ul>
        </nav>
        <address className="not-italic leading-7 lg:text-right">
          <span className="text-[var(--realm-white)]">Email:</span>{" "}
          <a className="hover:text-[var(--realm-white)]" href={`mailto:${contactEmail}`}>{contactEmail}</a>
          <br />
          <span className="text-[var(--realm-white)]">Physical skill-pathway location:</span> {physicalAddress}
        </address>
      </div>
    </footer>
  );
}
