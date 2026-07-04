import { BookOpenCheck, Code2, Globe2, ShieldCheck } from "lucide-react";

import { Badge } from "@/components/ui/Badge";
import { BrandLogo } from "@/components/ui/BrandLogo";
import { PrimaryButton, SecondaryButton } from "@/components/ui/Button";

const trustItems = [
  [Globe2, "Physical or Online"],
  [BookOpenCheck, "Discipleship Core"],
  [Code2, "Web Development"],
  [ShieldCheck, "Cybersecurity Foundations"],
] as const;

export function Hero() {
  return (
    <section id="home" aria-labelledby="hero-title" className="relative isolate overflow-hidden bg-[linear-gradient(125deg,#050d1c_0%,#0b2140_58%,#15345c_100%)] px-5 pb-0 pt-16 md:px-8 md:pt-24">
      <div className="mx-auto grid max-w-7xl gap-12 pb-16 lg:grid-cols-[1.2fr_0.8fr] lg:items-center lg:pb-24">
        <div>
          <Badge>Next Cohort Opening Soon</Badge>
          <div className="mt-7 h-px w-20 bg-[var(--realm-gold)]" />
          <h1 id="hero-title" className="mt-7 max-w-4xl text-5xl font-semibold leading-[1.02] tracking-tight text-white sm:text-6xl lg:text-7xl">
            Be Formed in God. <span className="text-[var(--realm-gold-soft)]">Be Equipped for Your Field.</span>
          </h1>
          <p className="mt-7 max-w-3xl text-lg leading-8 text-[var(--realm-muted)] md:text-xl md:leading-9">
            REALMS Institute combines Christian discipleship, doctrine, prayer, calling discovery, and practical skill training to raise believers who can serve God faithfully in every sphere of influence.
          </p>
          <div className="mt-9 flex flex-col gap-3 sm:flex-row">
            <PrimaryButton href="/register" showIcon>Apply for Next Cohort</PrimaryButton>
            <SecondaryButton href="/schools/discovery" showIcon>Explore School of Discovery</SecondaryButton>
          </div>
        </div>
        <div className="mx-auto flex w-full max-w-lg items-center justify-center rounded-[2rem] border border-slate-200 bg-[#fffefa] p-6 shadow-[0_24px_70px_rgba(0,0,0,0.22)] sm:p-10 lg:p-12">
          <BrandLogo priority className="w-full max-w-80" sizes="(min-width: 1024px) 320px, (min-width: 640px) 288px, calc(100vw - 88px)" />
        </div>
      </div>
      <div className="border-t border-white/10 bg-black/10">
        <ul className="mx-auto grid max-w-7xl sm:grid-cols-2 lg:grid-cols-4">
          {trustItems.map(([Icon, label]) => (
            <li key={label} className="flex items-center gap-3 border-white/10 px-5 py-5 text-sm font-medium text-white/85 sm:border-r md:px-8">
              <Icon aria-hidden="true" className="size-5 text-[var(--realm-gold-soft)]" />{label}
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
