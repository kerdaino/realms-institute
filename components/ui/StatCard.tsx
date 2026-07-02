import { GlassCard } from "@/components/ui/GlassCard";

type StatCardProps = {
  label: string;
  value: string;
};

export function StatCard({ label, value }: StatCardProps) {
  return (
    <GlassCard className="px-4 py-3">
      <dt className="text-sm text-[var(--realm-slate)]">{label}</dt>
      <dd className="mt-1 font-semibold text-[var(--realm-white)]">{value}</dd>
    </GlassCard>
  );
}
