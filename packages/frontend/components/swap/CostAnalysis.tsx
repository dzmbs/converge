const fees = [
  {
    label: "Congestion Fee",
    sublabel: "Dynamic — based on reserve health",
    value: "2.30 USDC",
  },
  {
    label: "Execution Fee",
    sublabel: "Fixed",
    value: "0.05 USDC",
  },
  {
    label: "Slippage",
    sublabel: "Oracle-priced",
    value: "0.00%",
  },
];

export function CostAnalysis() {
  return (
    <div className="space-y-1">
      {/* Section label */}
      <div className="flex items-center gap-3 mb-5">
        <div className="h-px bg-outline-variant/15 flex-1" />
        <span className="text-[11px] font-medium uppercase tracking-wider text-on-surface-variant">
          Cost Analysis
        </span>
        <div className="h-px bg-outline-variant/15 flex-1" />
      </div>

      {/* Fee rows */}
      <div className="space-y-0">
        {fees.map((fee, i) => (
          <div key={fee.label}>
            <div className="flex justify-between items-center py-3">
              <div className="flex items-baseline gap-1.5">
                <span className="text-sm text-on-surface-variant">
                  {fee.label}
                </span>
                <span className="text-[11px] text-on-surface-variant/60">
                  ({fee.sublabel})
                </span>
              </div>
              <span className="text-sm font-semibold text-on-surface tabular-nums">
                {fee.value}
              </span>
            </div>
            {i < fees.length - 1 && (
              <div className="border-t border-outline-variant/15" />
            )}
          </div>
        ))}
      </div>

      {/* Total row */}
      <div className="mt-3 bg-surface-container-low rounded-lg p-4 flex justify-between items-center">
        <div className="space-y-0.5">
          <span className="text-sm font-semibold text-on-surface">
            Total Execution Fees
          </span>
          <p className="text-[11px] font-medium uppercase tracking-wider text-on-surface-variant">
            Dynamic Congestion Fee + Fixed
          </p>
        </div>
        <div className="text-right space-y-0.5">
          <span className="font-headline font-bold text-base text-primary block tabular-nums">
            2.35 USDC
          </span>
          <span className="text-[11px] font-medium text-on-surface-variant block">
            23.5 bps
          </span>
        </div>
      </div>
    </div>
  );
}
