"use client";

import { useState, useEffect } from "react";
import { useAccount } from "wagmi";
import { PoolContext, useChainDeployment } from "@/lib/hooks";
import type { PoolConfig } from "@/lib/contracts";

export function PoolProvider({ children }: { children: React.ReactNode }) {
  const deployment = useChainDeployment();
  const pools = deployment?.pools ?? [];
  const [selectedId, setSelectedId] = useState<string>("");

  // Auto-select first pool when chain changes
  useEffect(() => {
    if (pools.length > 0 && !pools.find((p) => p.id === selectedId)) {
      setSelectedId(pools[0].id);
    }
  }, [pools, selectedId]);

  const pool = pools.find((p) => p.id === selectedId);

  return (
    <PoolContext.Provider value={{ pool, pools, selectPool: setSelectedId }}>
      {children}
    </PoolContext.Provider>
  );
}
