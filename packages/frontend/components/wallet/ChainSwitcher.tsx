"use client";

import { useAccount, useSwitchChain } from "wagmi";
import { arcTestnet, baseSepolia } from "@/lib/chains";

const chains = [
  { chain: arcTestnet, label: "Arc Testnet", color: "bg-blue-500" },
  { chain: baseSepolia, label: "Base Sepolia", color: "bg-indigo-500" },
];

export function ChainSwitcher() {
  const { chain } = useAccount();
  const { switchChain } = useSwitchChain();

  const current = chains.find((c) => c.chain.id === chain?.id);

  return (
    <div className="relative group">
      <button className="flex items-center gap-2 px-3 py-1.5 bg-surface-container-low rounded-lg border border-outline-variant/15 hover:border-outline-variant/30 transition-colors text-xs font-medium uppercase tracking-wider">
        <span className={`w-2 h-2 rounded-full ${current?.color ?? "bg-gray-400"}`} />
        {current?.label ?? "Switch Network"}
        <span className="material-symbols-outlined text-[14px] text-on-surface-variant">
          expand_more
        </span>
      </button>

      <div className="absolute right-0 top-full mt-1 bg-surface-container-lowest border border-outline-variant/15 rounded-lg shadow-lg opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all z-50 min-w-[160px]">
        {chains.map((c) => (
          <button
            key={c.chain.id}
            onClick={() => switchChain({ chainId: c.chain.id })}
            className={`w-full flex items-center gap-2 px-4 py-2.5 text-xs font-medium hover:bg-surface-container-low transition-colors first:rounded-t-lg last:rounded-b-lg ${
              c.chain.id === chain?.id ? "text-primary font-bold" : "text-on-surface"
            }`}
          >
            <span className={`w-2 h-2 rounded-full ${c.color}`} />
            {c.label}
            {c.chain.id === chain?.id && (
              <span className="material-symbols-outlined text-[14px] ml-auto text-primary">check</span>
            )}
          </button>
        ))}
      </div>
    </div>
  );
}
