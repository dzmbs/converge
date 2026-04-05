const mobileItems = [
  {
    icon: "verified",
    filled: true,
    label: "NAV Attestation",
    time: "12m ago",
    color: "text-secondary",
  },
  {
    icon: "cloud_done",
    filled: true,
    label: "Asset Reserve Proof",
    time: "4h ago",
    color: "text-secondary",
  },
  {
    icon: "fact_check",
    filled: false,
    label: "Compliance Audit",
    time: "Processing",
    color: "text-secondary",
  },
];

const desktopItems = [
  {
    icon: "price_check",
    title: "Oracle Rate Feed",
    description:
      "Live oracle prices feed into all swap executions, ensuring zero slippage at fair market value.",
  },
  {
    icon: "waterfall_chart",
    title: "Liquidity Waterfall",
    description:
      "Pool reserves, yield vault recall, clearing house settlement, and async queue form a four-stage fulfillment cascade.",
  },
  {
    icon: "account_balance",
    title: "Yield Deployment",
    description:
      "Idle LP capital is deployed to Aave and Morpho, generating lending yield on top of swap fee revenue.",
  },
];

export function OracleVerifications() {
  return (
    <section>
      {/* Mobile */}
      <div className="md:hidden">
        <h3 className="text-[11px] font-bold text-on-surface-variant uppercase tracking-wider mb-4 flex items-center gap-2">
          Oracle Verifications
          <span className="flex-1 h-px bg-outline-variant/15" />
        </h3>
        <div className="flex flex-col gap-1">
          {mobileItems.map((item) => (
            <div
              key={item.label}
              className="bg-surface-container-lowest rounded-lg p-4 mb-1 flex items-center justify-between transition-colors hover:bg-surface-container-low"
            >
              <div className="flex items-center gap-4">
                <span
                  className={`material-symbols-outlined ${item.color} text-lg`}
                  style={
                    item.filled
                      ? { fontVariationSettings: "'FILL' 1" }
                      : undefined
                  }
                >
                  {item.icon}
                </span>
                <span className="text-sm font-medium text-on-surface">
                  {item.label}
                </span>
              </div>
              <span
                className={`text-[11px] ${
                  item.time === "Processing"
                    ? "text-secondary"
                    : "text-on-surface-variant"
                }`}
              >
                {item.time}
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* Desktop */}
      <div className="hidden md:block bg-surface-container-lowest rounded-xl p-8 h-full border border-outline-variant/10">
        <h3 className="font-headline font-bold text-2xl text-primary mb-6">
          Protocol Verifications
        </h3>
        <div className="space-y-8">
          {desktopItems.map((item) => (
            <div
              key={item.title}
              className="flex items-start gap-4 pb-6 border-b border-outline-variant/15"
            >
              <div className="w-9 h-9 rounded-lg bg-sky flex items-center justify-center shrink-0">
                <span className="material-symbols-outlined text-secondary text-xl">
                  {item.icon}
                </span>
              </div>
              <div>
                <p className="text-sm font-bold text-primary mb-1">
                  {item.title}
                </p>
                <p className="text-[12px] text-on-surface-variant leading-relaxed">
                  {item.description}
                </p>
              </div>
            </div>
          ))}
        </div>
        <div className="mt-8 bg-surface-container-lowest rounded-lg p-5 border border-outline-variant/10">
          <div className="flex items-center justify-between mb-2">
            <span className="text-[11px] font-medium uppercase tracking-wider text-on-surface-variant">
              Protocol Integrity
            </span>
            <span className="text-[11px] font-bold text-secondary uppercase">
              Hardened
            </span>
          </div>
          <div className="h-1 w-full rounded-full bg-outline-variant/15">
            <div className="h-full bg-secondary w-full rounded-full" />
          </div>
        </div>
      </div>
    </section>
  );
}
