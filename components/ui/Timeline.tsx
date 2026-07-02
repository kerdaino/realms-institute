type TimelineItem = {
  title: string;
  description: string;
};

type TimelineProps = {
  items: readonly TimelineItem[];
};

export function Timeline({ items }: TimelineProps) {
  return (
    <ol className="grid gap-4 lg:grid-cols-5">
      {items.map((item, index) => (
        <li key={item.title} className="relative rounded-2xl border border-[var(--realm-border)] bg-white/[0.045] p-5">
          <span className="flex size-9 items-center justify-center rounded-full border border-[var(--realm-gold)]/35 bg-[var(--realm-gold)]/10 text-sm font-semibold text-[var(--realm-gold-soft)]">
            {index + 1}
          </span>
          <h3 className="mt-5 font-semibold text-[var(--realm-white)]">{item.title}</h3>
          <p className="mt-2 text-sm leading-6 text-[var(--realm-muted)]">{item.description}</p>
        </li>
      ))}
    </ol>
  );
}
