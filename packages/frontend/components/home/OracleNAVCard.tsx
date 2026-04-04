const prices = [
  { symbol: "SKY/NAV", price: "$1.0402", change: "+0.02%", up: true },
  { symbol: "INIFI/NAV", price: "$0.9982", change: "-0.01%", up: false },
  { symbol: "USTB/YIELD", price: "5.24%", change: "Stable", up: true },
  { symbol: "FR-RWA/INDEX", price: "1,245.00", change: "+1.4%", up: true },
];

export function OracleNAVCard() {
  return (
    <div className="bg-surface-container-low py-4 border-y border-outline-variant/15 overflow-hidden">
      <div className="flex items-center justify-between gap-8 px-8 max-w-[1280px] mx-auto overflow-x-auto">
        {prices.map((item) => (
          <div key={item.symbol} className="flex items-center gap-3 shrink-0">
            <span className="text-[11px] font-medium uppercase tracking-wider text-on-surface-variant">
              {item.symbol}
            </span>
            <span className="font-headline font-bold text-sm text-on-surface">
              {item.price}
            </span>
            <span
              className={`text-[11px] font-bold ${
                item.up ? "text-secondary" : "text-error"
              }`}
            >
              {item.change}
            </span>
          </div>
        ))}
        <div className="flex items-center gap-1.5 shrink-0">
          <span className="w-1.5 h-1.5 bg-success rounded-full animate-pulse" />
          <span className="text-[11px] font-medium text-on-surface-variant">
            Live Oracle Feed
          </span>
        </div>
      </div>
    </div>
  );
}
