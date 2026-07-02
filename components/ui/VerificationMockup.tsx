import { SearchCheck } from "lucide-react";

import { Button } from "@/components/ui/Button";
import { GlassCard } from "@/components/ui/GlassCard";
import { realmClasses } from "@/lib/theme";

export function VerificationMockup() {
  return (
    <GlassCard intensity="strong" className="p-7 md:p-10">
      <div className="flex size-12 items-center justify-center rounded-xl border border-[var(--realm-gold)]/25 bg-[var(--realm-gold)]/10 text-[var(--realm-gold-soft)]">
        <SearchCheck aria-hidden="true" className="size-6" />
      </div>
      <h3 className="mt-6 text-xl font-semibold text-[var(--realm-white)]">Certificate Verification</h3>
      <p className="mt-3 text-sm leading-7 text-[var(--realm-muted)]">This preview is not connected to a verification system yet.</p>
      <div className="mt-7 flex flex-col gap-3 sm:flex-row">
        <label className="sr-only" htmlFor="certificate-id">Certificate ID</label>
        <input id="certificate-id" disabled placeholder="Certificate ID" className={`min-h-12 min-w-0 flex-1 rounded-full border border-white/[0.14] bg-white/[0.06] px-5 text-sm text-[var(--realm-muted)] placeholder:text-white/35 disabled:cursor-not-allowed ${realmClasses.focus}`} />
        <Button disabled>Verify Certificate</Button>
      </div>
    </GlassCard>
  );
}
