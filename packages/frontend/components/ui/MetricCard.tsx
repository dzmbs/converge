interface MetricCardProps {
  label: string;
  value: string;
  accent?: boolean;
  badge?: string;
  children?: React.ReactNode;
}

export function MetricCard({
  label,
  value,
  accent = false,
  badge,
  children,
}: MetricCardProps) {
  return (
    <div className="bg-surface-container-lowest rounded-lg border-l-2 border-secondary p-5 flex flex-col gap-1.5">
      <span className="text-[11px] font-medium text-on-surface-variant uppercase tracking-wider">
        {label}
      </span>
      <div className="flex items-baseline gap-2">
        <span
          className={`font-headline text-2xl font-bold ${
            accent ? "text-secondary" : "text-on-surface"
          }`}
        >
          {value}
        </span>
        {badge && (
          <span className="text-[11px] font-medium bg-tertiary-container/20 text-tertiary px-1.5 py-0.5 rounded border border-tertiary/30">
            {badge}
          </span>
        )}
      </div>
      {children}
    </div>
  );
}
