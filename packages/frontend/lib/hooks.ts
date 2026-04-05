"use client";

import { createContext, useContext } from "react";
import { useAccount, useReadContract, useReadContracts } from "wagmi";
import { formatUnits } from "viem";
import { getChainDeployment, ERC20Abi, ConvergeQuoterAbi, DemoFaucetAbi, type PoolConfig, type ChainDeployment } from "./contracts";
import type { SupportedChainId } from "./chains";

// ---- Pool selection context ----
export const PoolContext = createContext<{
  pool: PoolConfig | undefined;
  pools: PoolConfig[];
  selectPool: (id: string) => void;
}>({ pool: undefined, pools: [], selectPool: () => {} });

export function usePool() {
  return useContext(PoolContext);
}

// ---- Chain deployment ----
export function useChainDeployment(): ChainDeployment | undefined {
  const { chain } = useAccount();
  const chainId = chain?.id as SupportedChainId | undefined;
  return chainId ? getChainDeployment(chainId) : undefined;
}

// ---- Token balances for a specific pool ----
export function useTokenBalances(pool: PoolConfig | undefined) {
  const { address } = useAccount();

  const { data, refetch } = useReadContracts({
    contracts: pool && address ? [
      { address: pool.rwaToken, abi: ERC20Abi, functionName: "balanceOf", args: [address] },
      { address: pool.redeemAsset, abi: ERC20Abi, functionName: "balanceOf", args: [address] },
    ] : undefined,
    query: { enabled: !!pool && !!address },
  });

  return {
    rwaBalance: data?.[0]?.result as bigint | undefined,
    redeemBalance: data?.[1]?.result as bigint | undefined,
    rwaSymbol: pool?.rwaSymbol ?? "ACRED",
    redeemSymbol: pool?.redeemSymbol ?? "USDC",
    rwaDecimals: pool?.rwaDecimals ?? 18,
    redeemDecimals: pool?.redeemDecimals ?? 6,
    refetch,
  };
}

// ---- Quote ----
export function useQuote(pool: PoolConfig | undefined, amountIn: bigint, swapRwaForRedeem: boolean) {
  return useReadContract({
    address: pool?.quoter,
    abi: ConvergeQuoterAbi,
    functionName: "getQuote",
    args: pool?.hook ? [pool.hook, amountIn, swapRwaForRedeem] : undefined,
    query: { enabled: !!pool?.quoter && amountIn > 0n },
  });
}

// ---- LP snapshot ----
export function useLpSnapshot(pool: PoolConfig | undefined) {
  const { address } = useAccount();
  return useReadContract({
    address: pool?.quoter,
    abi: ConvergeQuoterAbi,
    functionName: "getLpSnapshot",
    args: pool?.hook && address ? [pool.hook, address] : undefined,
    query: { enabled: !!pool?.quoter && !!address },
  });
}

// ---- Pool snapshot ----
export function usePoolSnapshot(pool: PoolConfig | undefined) {
  return useReadContract({
    address: pool?.quoter,
    abi: ConvergeQuoterAbi,
    functionName: "getPoolSnapshot",
    args: pool?.hook ? [pool.hook] : undefined,
    query: { enabled: !!pool?.quoter },
  });
}

// ---- Faucet cooldown ----
export function useFaucetCooldown(pool: PoolConfig | undefined) {
  const { address } = useAccount();
  return useReadContract({
    address: pool?.faucet,
    abi: DemoFaucetAbi,
    functionName: "timeUntilNextClaim",
    args: address ? [address] : undefined,
    query: { enabled: !!pool?.faucet && !!address },
  });
}
