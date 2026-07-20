import type { Metadata } from "next";
import Link from "next/link";
import { Award, BookOpenCheck, Check, Clock3, Laptop, MapPin, ShieldCheck, type LucideIcon } from "lucide-react";
import type { ReactNode } from "react";

import { PageHero } from "@/components/layout/PageHero";
import { PageShell } from "@/components/layout/PageShell";
import { Testimonials } from "@/components/sections/Testimonials";
import { PrimaryButton, SecondaryButton } from "@/components/ui/Button";
import { cohortPricing, feeClarification, feeLabel, feePolicyNote, physicalAddress } from "@/lib/constants";
import {
  advancedDiscipleshipCourses,
  advancedDiscipleshipSchedule,
  foundationalDiscipleshipCourses,
  programmeAudiences,
  programmeCompletionComponents,
  programmeReceives,
  programmeSchedules,
  routeComparison,
  skillPathwayCurricula,
  type PublicCourse,
} from "@/lib/schoolOfDiscoveryCurriculum";

export const metadata: Metadata = {
  title: "REALMS School of Discovery | Foundational & Advanced Discipleship and Skill Pathways",
  description: "Explore the REALMS School of Discovery August 2026 programme: Foundational or Advanced Discipleship alongside Web Development or Cybersecurity Foundations.",
};

const sectionNav = [
  { label: "Foundational Discipleship", href: "#foundational-discipleship" },
  { label: "Advanced Discipleship", href: "#advanced-discipleship" },
  { label: "Web Development", href: "#web-development" },
  { label: "Cybersecurity", href: "#cybersecurity-foundations" },
] as const;

export default function DiscoveryPage() {
  return (
    <PageShell>
      <PageHero
        eyebrow="Registration Open"
        title="REALMS School of Discovery"
        subtitle="Applications are now open for the August 2026 cohort. Christian Formation. Practical Competence. Kingdom Purpose."
        breadcrumbs={[{ label: "Home", href: "/" }, { label: "Schools", href: "/schools" }, { label: "School of Discovery" }]}
      />

      <section aria-label="Explore the School of Discovery curriculum" className="border-b border-slate-200 bg-white px-5 py-5 md:px-8">
        <nav className="mx-auto flex max-w-7xl gap-2 overflow-x-auto pb-1" aria-label="Curriculum sections">
          {sectionNav.map((item) => (
            <Link key={item.href} href={item.href} className="shrink-0 rounded-full border border-slate-200 bg-[#f7f5ef] px-4 py-2 text-sm font-semibold text-[#071327] hover:border-[#a47720] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#a47720]">
              {item.label}
            </Link>
          ))}
        </nav>
      </section>

      <LightSection eyebrow="Overview" title="One programme. Two connected dimensions.">
        <p className="max-w-4xl text-lg leading-8 text-slate-600">The REALMS School of Discovery combines one approved discipleship route with one practical skill pathway. Students complete either the Foundational Discipleship Programme or, where eligible, the Advanced Discipleship Programme, alongside Web Development or Cybersecurity Foundations.</p>
        <div className="mt-10 grid gap-4 md:grid-cols-[1fr_auto_1fr] md:items-stretch">
          <OverviewCard number="01" title="One approved discipleship route" copy="Foundational Discipleship or, where eligibility is verified and approved, the complete Advanced Discipleship route." />
          <span aria-hidden="true" className="hidden self-center text-3xl font-light text-[#a47720] md:block">+</span>
          <OverviewCard number="02" title="One practical skill pathway" copy="Web Development or Cybersecurity Foundations, including practical learning and a skill capstone." />
        </div>
        <p className="mt-6 rounded-2xl border border-[#d7aa45]/35 bg-amber-50 p-5 text-sm leading-7 text-amber-950">Every admitted learner completes one approved discipleship route, one practical skill pathway, integrated attendance, participation, integrity and assessment requirements, plus a practical skill capstone.</p>
      </LightSection>

      <section aria-labelledby="discipleship-routes-title" className="bg-[#071327] px-5 py-20 text-white md:px-8 md:py-28">
        <div className="mx-auto max-w-7xl">
          <SectionIntro id="discipleship-routes-title" dark eyebrow="Your Discipleship Route" title="Formation in God. Equipping for Your Field." description="Your discipleship route is confirmed through the applicable admission, verification or screening process. Advanced-entry consideration never guarantees admission." />
          <div className="mt-12 grid gap-8">
            <article id="foundational-discipleship" className="scroll-mt-28 rounded-3xl border border-white/12 bg-white/[0.055] p-6 md:p-9">
              <div className="grid gap-7 lg:grid-cols-[0.75fr_1.25fr]">
                <div>
                  <RouteBadge>Foundational Discipleship</RouteBadge>
                  <h3 className="mt-5 text-3xl font-semibold">A strong biblical foundation for faithful Christian living.</h3>
                  <p className="mt-5 leading-8 text-white/70">Designed for new students and applicants who do not meet advanced-entry requirements. The route includes all eight foundational courses.</p>
                  <PrimaryButton href="/register" className="mt-7" showIcon>Apply for the Foundational Route</PrimaryButton>
                </div>
                <CourseAccordionList courses={foundationalDiscipleshipCourses} />
              </div>
            </article>

            <article id="advanced-discipleship" className="scroll-mt-28 rounded-3xl border border-[#d7aa45]/35 bg-[linear-gradient(135deg,rgba(215,170,69,0.12),rgba(255,255,255,0.035))] p-6 md:p-9">
              <div className="grid gap-10 lg:grid-cols-[0.82fr_1.18fr]">
                <div>
                  <RouteBadge>Advanced Discipleship</RouteBadge>
                  <h3 className="mt-5 text-3xl font-semibold">One complete eight-week advanced route.</h3>
                  <p className="mt-5 leading-8 text-white/75">The Advanced Discipleship Programme is one complete eight-week route. Eligible students complete all five advanced courses; students do not select one advanced elective.</p>
                  <div className="mt-7 rounded-2xl border border-white/10 bg-[#050d1c]/50 p-5">
                    <p className="font-semibold text-[var(--realm-gold-soft)]">Eligibility for consideration</p>
                    <ul className="mt-4 grid gap-3 text-sm leading-6 text-white/70">
                      <li>REALMS alumni who successfully completed the foundational programme, subject to verification.</li>
                      <li>Applicants with sufficient prior theological or structured discipleship education who complete the REALMS foundational knowledge screening and are approved for advanced entry.</li>
                    </ul>
                  </div>
                  <div className="mt-5 flex items-start gap-3 text-sm leading-6 text-white/75"><Clock3 aria-hidden="true" className="mt-1 size-4 shrink-0 text-[var(--realm-gold-soft)]" /><div>{advancedDiscipleshipSchedule.sessions.map((session) => <p key={session.days}>{session.days}<br />{session.time}</p>)}<p>{advancedDiscipleshipSchedule.mode}</p></div></div>
                  <PrimaryButton href="/register?applicant=advanced" className="mt-7" showIcon>Apply for Advanced Entry</PrimaryButton>
                </div>
                <CourseMap courses={advancedDiscipleshipCourses} dark />
              </div>
            </article>
          </div>
        </div>
      </section>

      <LightSection id="skill-pathways" eyebrow="Practical Skill Pathways" title="Choose Your Practical Skill Pathway" description="Every School of Discovery student selects either Web Development or Cybersecurity Foundations.">
        <div className="mt-12 grid gap-10">
          {skillPathwayCurricula.map((pathway) => (
            <article key={pathway.id} id={pathway.id} className="scroll-mt-28 overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-[0_20px_65px_rgba(5,13,28,0.08)]">
              <div className="border-b border-slate-200 bg-[#071327] p-6 text-white md:p-10">
                <div className="flex items-center gap-3 text-[var(--realm-gold-soft)]">
                  {pathway.id === "web-development" ? <Laptop aria-hidden="true" className="size-6" /> : <ShieldCheck aria-hidden="true" className="size-6" />}
                  <p className="text-xs font-semibold uppercase tracking-[0.22em]">Eight-Week Skill Pathway</p>
                </div>
                <h3 className="mt-5 text-3xl font-semibold md:text-4xl">{pathway.title}</h3>
                <p className="mt-3 text-lg font-medium text-white/85">{pathway.subtitle}</p>
                <p className="mt-5 max-w-4xl leading-8 text-white/65">{pathway.purpose}</p>
              </div>
              <div className="grid gap-10 p-6 md:p-10">
                <div>
                  <h4 className="text-xl font-semibold text-[#071327]">Curriculum Map</h4>
                  <CourseMap courses={pathway.courses} />
                </div>
                <div className="grid gap-8 lg:grid-cols-[1.25fr_0.75fr]">
                  <div>
                    <h4 className="text-xl font-semibold text-[#071327]">What You Will Practically Gain</h4>
                    <p className="mt-3 text-sm leading-7 text-slate-600">By the end of the pathway, a student who successfully completes the learning and practical requirements should be able to:</p>
                    <CheckList items={pathway.outcomes} />
                  </div>
                  <div className="grid content-start gap-4">
                    {"ethicsNotice" in pathway ? <Notice icon={ShieldCheck} title="Ethics Notice">{pathway.ethicsNotice}</Notice> : null}
                    {"equipmentNote" in pathway ? <Notice icon={Laptop} title="Equipment">{pathway.equipmentNote}</Notice> : null}
                    <div className="rounded-2xl border border-[#d7aa45]/35 bg-amber-50 p-6">
                      <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[#8b641c]">Capstone Outcome</p>
                      <p className="mt-3 text-sm leading-7 text-amber-950">{pathway.capstone}</p>
                    </div>
                    <PrimaryButton href={pathway.applyHref} className="mt-2 w-full" showIcon>Apply for {pathway.title}</PrimaryButton>
                  </div>
                </div>
              </div>
            </article>
          ))}
        </div>
      </LightSection>

      <section aria-labelledby="integrated-journey-title" className="bg-[#071327] px-5 py-20 text-white md:px-8 md:py-28">
        <div className="mx-auto max-w-7xl">
          <SectionIntro id="integrated-journey-title" dark eyebrow="Official Programme Structure" title="One Integrated Learning Journey" description="The School of Discovery uses an integrated programme model. Students are expected to meet the published requirements of both their approved discipleship route and selected skill pathway." />
          <ol className="mt-12 grid gap-3 lg:grid-cols-[1fr_auto_1fr_auto_1fr_auto_1fr_auto_1.15fr] lg:items-stretch">
            {programmeCompletionComponents.map((item, index) => (
              <li key={item} className="contents">
                <div className="rounded-2xl border border-white/12 bg-white/[0.055] p-5"><span className="text-xs font-semibold text-[var(--realm-gold-soft)]">0{index + 1}</span><p className="mt-3 font-semibold leading-6">{item}</p></div>
                <span aria-hidden="true" className="self-center text-center text-2xl text-[var(--realm-gold-soft)]">{index === programmeCompletionComponents.length - 1 ? "=" : "+"}</span>
              </li>
            ))}
            <li className="rounded-2xl border border-[#d7aa45]/40 bg-[#d7aa45]/12 p-5"><Award aria-hidden="true" className="size-6 text-[var(--realm-gold-soft)]" /><p className="mt-3 font-semibold leading-6">REALMS School of Discovery Programme Completion</p></li>
          </ol>
        </div>
      </section>

      <LightSection eyebrow="Programme Route Comparison" title="Understand the route that applies to you" description="Both routes include one practical skill pathway and a required capstone. Route approval remains separate from final admission review.">
        <div role="region" aria-label="Foundational and advanced route comparison" tabIndex={0} className="mt-10 overflow-x-auto rounded-2xl border border-slate-200 bg-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#a47720]">
          <table className="min-w-[820px] w-full border-collapse text-left text-sm">
            <thead className="bg-[#071327] text-white"><tr><th scope="col" className="p-5">Route</th><th scope="col" className="p-5">Designed for</th><th scope="col" className="p-5">Discipleship</th><th scope="col" className="p-5">Skill</th><th scope="col" className="p-5">Capstone</th><th scope="col" className="p-5">Entry</th></tr></thead>
            <tbody>{routeComparison.map((route) => <tr key={route.route} className="border-t border-slate-200 align-top text-slate-700"><th scope="row" className="p-5 font-semibold text-[#071327]">{route.route}</th><td className="p-5 leading-6">{route.designedFor}</td><td className="p-5 leading-6">{route.discipleship}</td><td className="p-5 leading-6">{route.skill}</td><td className="p-5 leading-6">{route.capstone}</td><td className="p-5 leading-6">{route.entry}</td></tr>)}</tbody>
          </table>
        </div>
        <p className="mt-4 text-sm leading-6 text-slate-500">Advanced-entry approval confirms the discipleship route only; it does not automatically equal admission.</p>
      </LightSection>

      <section aria-labelledby="schedule-title" className="bg-white px-5 py-20 md:px-8 md:py-28">
        <div className="mx-auto max-w-7xl">
          <SectionIntro id="schedule-title" eyebrow="August 2026 Schedule" title="A clear weekly rhythm" description="Physical/Online learning-mode selection applies to the practical skill pathway. Discipleship sessions are delivered online according to the student's approved discipleship route." />
          <div className="mt-10 grid gap-5 md:grid-cols-2 xl:grid-cols-4">
            {programmeSchedules.map((schedule) => <ScheduleCard key={schedule.title} {...schedule} />)}
          </div>
          <p className="mt-7 flex items-start gap-3 rounded-2xl border border-slate-200 bg-[#f7f5ef] p-5 text-sm leading-6 text-slate-700"><MapPin aria-hidden="true" className="mt-0.5 size-5 shrink-0 text-[#9a7021]" /><span><strong className="text-[#071327]">Physical skill-pathway location:</strong> {physicalAddress}</span></p>
        </div>
      </section>

      <LightSection eyebrow="What You Will Receive" title="Formation, practical learning and accountable completion">
        <CheckList items={programmeReceives} columns />
        <div className="mt-7 flex items-start gap-4 rounded-2xl border border-[#d7aa45]/35 bg-white p-5 text-sm leading-7 text-slate-600"><Award aria-hidden="true" className="mt-1 size-5 shrink-0 text-[#9a7021]" /><p>The certificate is issued by REALMS Institute as an institutional record of completed programme requirements. It is not presented as a government-accredited diploma or degree.</p></div>
      </LightSection>

      <Testimonials id="discovery-testimonials" showAll />

      <section aria-labelledby="audience-title" className="bg-white px-5 py-20 md:px-8 md:py-28">
        <div className="mx-auto grid max-w-7xl gap-12 lg:grid-cols-[1.08fr_0.92fr]">
          <div>
            <SectionIntro id="audience-title" eyebrow="Who It Is For" title="For believers ready to learn, grow and serve." description="The School of Discovery welcomes learners at different stages while preserving clear entry requirements for the advanced route." />
            <CheckList items={programmeAudiences} />
            <p className="mt-5 text-sm leading-6 text-slate-500">Previous theological or structured discipleship education does not automatically guarantee advanced entry or admission.</p>
          </div>
          <div className="rounded-3xl border border-[#d7aa45]/30 bg-[#071327] p-7 text-white md:p-9">
            <BookOpenCheck aria-hidden="true" className="size-7 text-[var(--realm-gold-soft)]" />
            <h2 className="mt-5 text-3xl font-semibold">Structured for participation.</h2>
            <CheckList items={["Live learning sessions", "Attendance and participation", "Integrity and assessment requirements", "Prayer and accountability", "Practical skill exercises", "Required skill capstone"]} dark />
          </div>
        </div>
      </section>

      <LightSection eyebrow={feeLabel} title="Choose your skill-pathway learning mode">
        <div className="grid gap-4 md:grid-cols-3">
          <PriceCard label="Physical Nigeria" value={cohortPricing.physical.display} detail="Practical skill pathway onsite" />
          <PriceCard label="Online Nigeria" value={cohortPricing.onlineNigeria.display} detail="Practical skill pathway online in Nigeria" />
          <PriceCard label="International Online" value={`${cohortPricing.internationalOnline.publicDisplay} / ${cohortPricing.internationalOnline.display}`} detail="Practical skill pathway online outside Nigeria" />
        </div>
        <div className="mt-7 grid gap-3 text-sm leading-7 text-slate-600">
          <p>The Physical or Online fee category refers to the selected practical skill-pathway learning mode. Discipleship sessions are online.</p>
          <p>{feeClarification}</p>
          <p>{feePolicyNote}</p>
        </div>
        <div className="mt-8 rounded-2xl border border-[#d7aa45]/35 bg-white p-6 md:flex md:items-center md:justify-between md:gap-8">
          <div><h3 className="text-xl font-semibold text-[#071327]">Need help with the registration fee?</h3><p className="mt-2 max-w-3xl text-sm leading-7 text-slate-600">Applicants who genuinely cannot afford the registration/application fee may request scholarship support during registration. Support is limited and subject to review and availability.</p></div>
          <PrimaryButton href="/register" className="mt-5 shrink-0 md:mt-0" showIcon>Request Support During Registration</PrimaryButton>
        </div>
      </LightSection>

      <section className="bg-[#f7f5ef] px-5 py-20 md:px-8">
        <div className="mx-auto flex max-w-7xl flex-col items-start justify-between gap-8 rounded-3xl border border-[#d7aa45]/30 bg-[#071327] p-7 text-white md:flex-row md:items-center md:p-12">
          <div><p className="text-sm font-semibold uppercase tracking-[0.2em] text-[var(--realm-gold-soft)]">Take the Next Step</p><h2 className="mt-3 text-3xl font-semibold">Ready to Begin Your REALMS Journey?</h2><p className="mt-3 max-w-2xl leading-7 text-white/65">Apply for the August 2026 cohort or contact REALMS Institute if you need help choosing the route or skill pathway that fits your application.</p></div>
          <div className="flex w-full flex-col gap-3 sm:w-auto sm:flex-row"><PrimaryButton href="/register" showIcon>Apply for August 2026</PrimaryButton><SecondaryButton href="/contact">Ask a Question</SecondaryButton></div>
        </div>
      </section>
    </PageShell>
  );
}

function LightSection({ id, eyebrow, title, description, children }: { id?: string; eyebrow: string; title: string; description?: string; children: ReactNode }) {
  return <section id={id} className="bg-[#f7f5ef] px-5 py-20 md:px-8 md:py-28"><div className="mx-auto max-w-7xl"><SectionIntro eyebrow={eyebrow} title={title} description={description} />{children}</div></section>;
}

function SectionIntro({ id, eyebrow, title, description, dark = false }: { id?: string; eyebrow: string; title: string; description?: string; dark?: boolean }) {
  return <div className="max-w-4xl"><p className={`text-xs font-semibold uppercase tracking-[0.22em] ${dark ? "text-[var(--realm-gold-soft)]" : "text-[#8b641c]"}`}>{eyebrow}</p><h2 id={id} className={`mt-4 text-3xl font-semibold tracking-tight md:text-5xl ${dark ? "text-white" : "text-[#071327]"}`}>{title}</h2>{description ? <p className={`mt-5 text-base leading-8 md:text-lg ${dark ? "text-white/65" : "text-slate-600"}`}>{description}</p> : null}</div>;
}

function OverviewCard({ number, title, copy }: { number: string; title: string; copy: string }) {
  return <article className="rounded-2xl border border-slate-200 bg-white p-6"><span className="text-xs font-semibold text-[#8b641c]">{number}</span><h3 className="mt-3 text-xl font-semibold text-[#071327]">{title}</h3><p className="mt-3 text-sm leading-7 text-slate-600">{copy}</p></article>;
}

function RouteBadge({ children }: { children: ReactNode }) {
  return <span className="inline-flex rounded-full border border-[#d7aa45]/35 bg-[#d7aa45]/10 px-4 py-2 text-xs font-semibold uppercase tracking-[0.18em] text-[var(--realm-gold-soft)]">{children}</span>;
}

function CourseAccordionList({ courses }: { courses: readonly PublicCourse[] }) {
  return <div className="grid gap-3">{courses.map((course) => <details key={course.code} className="group rounded-2xl border border-white/10 bg-[#050d1c]/45 open:border-[#d7aa45]/30"><summary className="flex cursor-pointer list-none items-center justify-between gap-5 p-5 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#d7aa45]"><span><span className="block text-xs font-semibold tracking-[0.16em] text-[var(--realm-gold-soft)]">{course.code}</span><span className="mt-2 block font-semibold leading-6 text-white">{course.title}</span></span><span aria-hidden="true" className="text-2xl font-light text-[var(--realm-gold-soft)] transition-transform group-open:rotate-45">+</span></summary><div className="grid gap-4 border-t border-white/10 px-5 py-5 text-sm leading-7 text-white/70 sm:grid-cols-3"><CourseDetail label="What This Course Covers" value={course.covers} /><CourseDetail label="What You Will Learn" value={course.learning} /><CourseDetail label="Practical / Assessed Evidence" value={course.evidence} /></div></details>)}</div>;
}

function CourseDetail({ label, value }: { label: string; value?: string }) {
  return <div><p className="font-semibold text-white">{label}</p><p className="mt-1">{value}</p></div>;
}

function CourseMap({ courses, dark = false }: { courses: readonly PublicCourse[]; dark?: boolean }) {
  return <ol className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{courses.map((course) => <li key={course.code} className={`rounded-2xl border p-5 ${dark ? "border-white/10 bg-[#050d1c]/45" : "border-slate-200 bg-[#f7f5ef]"}`}><p className={`text-xs font-semibold uppercase tracking-[0.14em] ${dark ? "text-[var(--realm-gold-soft)]" : "text-[#8b641c]"}`}>{course.delivery}</p><p className={`mt-2 text-xs font-semibold ${dark ? "text-white/55" : "text-slate-500"}`}>{course.code}</p><h4 className={`mt-2 font-semibold leading-6 ${dark ? "text-white" : "text-[#071327]"}`}>{course.title}</h4></li>)}</ol>;
}

function CheckList({ items, dark = false, columns = false }: { items: readonly string[]; dark?: boolean; columns?: boolean }) {
  return <ul className={`mt-7 grid gap-3 ${columns ? "md:grid-cols-2" : ""}`}>{items.map((item) => <li key={item} className={`flex items-start gap-3 rounded-xl border p-4 text-sm leading-6 ${dark ? "border-white/10 bg-white/[0.04] text-white/75" : "border-slate-200 bg-white text-slate-700"}`}><Check aria-hidden="true" className={`mt-1 size-4 shrink-0 ${dark ? "text-[var(--realm-gold-soft)]" : "text-[#9a7021]"}`} /><span>{item}</span></li>)}</ul>;
}

function Notice({ icon: Icon, title, children }: { icon: LucideIcon; title: string; children: ReactNode }) {
  return <div className="rounded-2xl border border-slate-200 bg-[#f7f5ef] p-5"><Icon aria-hidden="true" className="size-5 text-[#9a7021]" /><p className="mt-3 font-semibold text-[#071327]">{title}</p><p className="mt-2 text-sm leading-7 text-slate-600">{children}</p></div>;
}

function ScheduleCard({ title, sessions, mode }: { title: string; sessions: readonly { days: string; time: string }[]; mode: string }) {
  return <article className="rounded-2xl border border-slate-200 border-t-[#b8882f] bg-white p-6 shadow-[0_14px_40px_rgba(5,13,28,0.06)]"><Clock3 aria-hidden="true" className="size-5 text-[#9a7021]" /><h3 className="mt-4 text-xl font-semibold text-[#071327]">{title}</h3><div className="mt-4 grid gap-3">{sessions.map((session) => <div key={session.days}><p className="font-semibold leading-7 text-slate-800">{session.days}</p><p className="text-sm leading-6 text-slate-600">{session.time}</p></div>)}</div><p className="mt-4 inline-flex rounded-full bg-amber-50 px-3 py-1.5 text-xs font-semibold text-[#7a5718]">{mode}</p></article>;
}

function PriceCard({ label, value, detail }: { label: string; value: string; detail: string }) {
  return <article className="rounded-2xl border border-slate-200 bg-white p-6"><p className="text-sm font-semibold text-[#8b641c]">{label}</p><p className="mt-3 text-3xl font-semibold text-[#071327]">{value}</p><p className="mt-2 text-sm leading-6 text-slate-600">{detail}</p></article>;
}
