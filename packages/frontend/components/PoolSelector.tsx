"use client";

import { usePool } from "@/lib/hooks";

export function PoolSelector() {
  const { pool, pools, selectPool } = usePool();

  if (pools.length <= 1) return null;

  return (
    <div className="flex gap-2">
      {pools.map((p) => (
        <button
          key={p.id}
          onClick={() => selectPool(p.id)}
          className={`px-3 py-1.5 rounded-lg text-[11px] font-bold uppercase tracking-wider transition-colors ${
            pool?.id === p.id
              ? "bg-primary text-on-primary"
              : "bg-surface-container-low text-on-surface-variant hover:text-on-surface"
          }`}
        >
          {p.isRealUsdc ? "Native USDC" : "Demo Pool"}
        </button>
      ))}
    </div>
  );
}
