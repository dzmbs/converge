const mobileBars = [
  { label: "T1", height: "40%" },
  { label: "CORE", height: "85%", accent: true },
  { label: "T2", height: "60%" },
  { label: "VLT", height: "30%" },
  { label: "T3", height: "45%" },
];

const desktopBars = [
  { height: "40%", fill: "1/2" },
  { height: "65%", fill: "2/3" },
  { height: "55%", fill: "1/2" },
  { height: "85%", fill: "3/4" },
  { height: "75%", fill: "2/3" },
  { height: "92%", fill: "4/5" },
  { height: "88%", fill: "3/4" },
];

export function LiquidityChart() {
  return (
    <div className="bg-surface-container-lowest rounded-xl p-6 md:p-8 border border-outline-variant/10">
      <div className="flex justify-between items-end mb-6 md:mb-12">
        <div>
          <h3 className="font-headline font-bold text-base md:text-xl text-primary">
            Liquidity Stratification
          </h3>
          <p className="text-[11px] font-medium text-on-surface-variant mt-1">
            <span className="md:hidden">V2 Asset Allocation Mesh</span>
            <span className="hidden md:inline">
              Oracle Verification: Converge
            </span>
          </p>
        </div>

        {/* Desktop legend */}
        <div className="hidden md:flex gap-6">
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-sm bg-secondary" />
            <span className="text-[11px] font-medium uppercase tracking-wider text-on-surface-variant">
              RWA Reserve
            </span>
          </div>
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-sm bg-surface-container-high opacity-60" />
            <span className="text-[11px] font-medium uppercase tracking-wider text-on-surface-variant">
              Redeem Reserve
            </span>
          </div>
        </div>

        <span className="material-symbols-outlined text-secondary text-sm md:hidden">
          monitoring
        </span>
      </div>

      {/* Mobile bars */}
      <div className="flex items-end gap-2 h-40 md:hidden">
        {mobileBars.map((bar) => (
          <div
            key={bar.label}
            className={`flex-1 relative group rounded-sm ${
              bar.accent ? "bg-secondary" : "bg-surface-container-high"
            }`}
            style={{ height: bar.height }}
          >
            <div
              className={`absolute bottom-full left-0 w-full text-[11px] text-center mb-1 ${
                bar.accent ? "text-secondary" : "text-on-surface-variant"
              }`}
            >
              {bar.label}
            </div>
          </div>
        ))}
      </div>

      {/* Desktop bars */}
      <div className="hidden md:flex items-end justify-between gap-1 h-64 border-b border-outline-variant/15 pb-2">
        {desktopBars.map((bar, i) => (
          <div
            key={i}
            className="w-full bg-surface-container-high hover:brightness-95 transition-all duration-300 relative rounded-sm"
            style={{ height: bar.height }}
          >
            <div className="absolute bottom-0 w-full bg-secondary h-1/2 rounded-sm" />
          </div>
        ))}
      </div>

      {/* Footer */}
      <div className="mt-6 md:mt-4 flex justify-between items-center text-[11px] tracking-tighter text-on-surface-variant border-t border-outline-variant/15 pt-4 md:border-t-0 md:pt-0">
        <span className="md:hidden">LIQUIDITY_EPOCH_7</span>
        <span className="md:hidden text-secondary">RUNNING CALC...</span>
        <div className="hidden md:flex justify-between w-full font-medium text-on-surface-variant uppercase tracking-wider opacity-60">
          <span>P-01</span>
          <span>P-02</span>
          <span>P-03</span>
          <span>P-04</span>
          <span>P-05</span>
          <span>P-06</span>
          <span>P-07</span>
        </div>
      </div>
    </div>
  );
}
