interface ComplianceLockProps {
  title: string;
  description: string;
  icon?: string;
}

export function ComplianceLock({
  title,
  description,
  icon = "security",
}: ComplianceLockProps) {
  return (
    <div className="bg-surface-container-lowest rounded-lg p-5 border border-outline-variant/15 flex gap-4 items-start">
      <div className="w-10 h-10 rounded-lg bg-sky flex items-center justify-center shrink-0">
        <span
          className="material-symbols-outlined text-secondary text-[20px]"
          style={{ fontVariationSettings: "'FILL' 1" }}
        >
          {icon}
        </span>
      </div>
      <div className="flex flex-col gap-1">
        <p className="text-sm font-bold text-primary uppercase tracking-wider">
          {title}
        </p>
        <p className="text-[12px] leading-relaxed text-on-surface-variant">
          {description}
        </p>
      </div>
    </div>
  );
}
