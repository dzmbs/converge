const prices = [
  { symbol: "ACRED/USDC", price: "$1.0023", change: "+0.02%", up: true },
  { symbol: "BUIDL/USDC", price: "$1.0000", change: "Stable", up: true },
  { symbol: "USDY/USDC", price: "$1.0531", change: "+0.05%", up: true },
  { symbol: "ACRED/RATE", price: "5.24%", change: "Stable", up: true },
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
