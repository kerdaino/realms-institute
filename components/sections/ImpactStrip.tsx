import { impactStats } from "@/lib/constants";
import { realmClasses } from "@/lib/theme";

export function ImpactStrip() {
  return (
    <section aria-label="REALMS Institute impact" className="relative z-10 border-y border-white/10 bg-white/[0.035]">
      <div className={`${realmClasses.container} grid sm:grid-cols-2 lg:grid-cols-4`}>
        {impactStats.map((item, index) => (
          <div
            key={item}
            className="flex min-h-24 items-center gap-4 border-b border-white/10 py-5 sm:px-5 sm:odd:border-r lg:border-b-0 lg:border-r lg:first:pl-0 lg:last:border-r-0 lg:last:pr-0"
          >
            <span className="font-mono text-xs text-[var(--realm-gold-soft)]">0{index + 1}</span>
            <p className="text-sm font-semibold leading-6 text-[var(--realm-white)]">{item}</p>
          </div>
        ))}
      </div>
    </section>
  );
}
