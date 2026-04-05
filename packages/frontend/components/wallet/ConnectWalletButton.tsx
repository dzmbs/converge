"use client";

import { useState, useRef, useEffect } from "react";
import Image from "next/image";
import { usePrivy, useWallets } from "@privy-io/react-auth";
import { useAccount, useSwitchChain, useBalance, useReadContracts } from "wagmi";
import { arcTestnet, baseSepolia } from "@/lib/chains";
import { formatBalance } from "@/lib/format";
import { useChainDeployment } from "@/lib/hooks";
import { ERC20Abi } from "@/lib/contracts";
import { getTokenIcon } from "@/lib/tokens";

const chains = [
  { chain: arcTestnet, label: "Arc Testnet", icon: "/chains/arc.svg" },
  { chain: baseSepolia, label: "Base Sepolia", icon: "/chains/base.svg" },
];

export function ConnectWalletButton() {
  const { ready, authenticated, login, logout } = usePrivy();
  const { wallets } = useWallets();
  const { address: wagmiAddress, chain } = useAccount();
  const { switchChain } = useSwitchChain();
  const { data: nativeBalance } = useBalance({ address: wagmiAddress });
  const deployment = useChainDeployment();
  // Read token balances for the first pool (ACRED + redeem asset)
  const firstPool = deployment?.pools[0];
  const { data: tokenBalances } = useReadContracts({
    contracts: firstPool && wagmiAddress ? [
      { address: firstPool.rwaToken, abi: ERC20Abi, functionName: "balanceOf", args: [wagmiAddress] },
      { address: firstPool.rwaToken, abi: ERC20Abi, functionName: "decimals" },
    ] : undefined,
    query: { enabled: !!firstPool && !!wagmiAddress },
  });
  const acredBalance = tokenBalances?.[0]?.result as bigint | undefined;
  const acredDecimals = (tokenBalances?.[1]?.result as number) ?? 18;
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  // Close dropdown on outside click
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  if (!ready) {
    return (
      <button
        disabled
        className="bg-surface-container-low rounded-lg text-on-surface-variant px-5 py-2 text-xs font-bold uppercase tracking-widest opacity-50 cursor-not-allowed"
      >
        Loading...
      </button>
    );
  }

  if (!authenticated) {
    return (
      <button
        onClick={login}
        className="signature-gradient text-on-primary px-5 py-2 font-headline font-bold text-xs rounded-lg uppercase tracking-widest hover:brightness-110 active:scale-95 transition-all"
      >
        Connect Wallet
      </button>
    );
  }

  const address = wallets[0]?.address;
  const truncated = address
    ? `${address.slice(0, 6)}...${address.slice(-4)}`
    : "No Wallet";
  const current = chains.find((c) => c.chain.id === chain?.id);

  return (
    <div className="relative" ref={ref}>
      {/* Single unified button */}
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center gap-2.5 bg-surface-container-lowest rounded-lg px-3 py-2 border border-outline-variant/15 hover:border-outline-variant/30 transition-all active:scale-[0.98]"
      >
        {/* Chain icon */}
        {current && (
          <Image src={current.icon} alt={current.label} width={18} height={18} className="rounded-full" />
        )}

        {/* Connected dot + address */}
        <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse shrink-0" />
        <span className="text-xs font-bold uppercase tracking-wider text-on-surface">
          {truncated}
        </span>

        {/* Dropdown arrow */}
        <span className="material-symbols-outlined text-[14px] text-on-surface-variant">
          expand_more
        </span>
      </button>

      {/* Dropdown */}
      {open && (
        <div className="absolute right-0 top-full mt-1.5 bg-surface-container-lowest border border-outline-variant/15 rounded-xl shadow-lg z-50 min-w-[200px] overflow-hidden">
          {/* Chain section */}
          <div className="px-3 pt-3 pb-1.5">
            <span className="text-[10px] font-medium uppercase tracking-widest text-on-surface-variant">
              Network
            </span>
          </div>
          {chains.map((c) => (
            <button
              key={c.chain.id}
              onClick={() => {
                switchChain({ chainId: c.chain.id });
                setOpen(false);
              }}
              className={`w-full flex items-center gap-2.5 px-3 py-2.5 text-xs font-medium hover:bg-surface-container-low transition-colors ${
                c.chain.id === chain?.id ? "text-primary font-bold" : "text-on-surface"
              }`}
            >
              <Image src={c.icon} alt={c.label} width={16} height={16} className="rounded-full" />
              {c.label}
              {c.chain.id === chain?.id && (
                <span className="material-symbols-outlined text-[14px] ml-auto text-primary">check</span>
              )}
            </button>
          ))}

          {/* Divider */}
          <div className="border-t border-outline-variant/15 my-1" />

          {/* Balances */}
          {(nativeBalance || acredBalance !== undefined) && (
            <>
              <div className="px-3 pt-2.5 pb-1">
                <span className="text-[10px] font-medium uppercase tracking-widest text-on-surface-variant">
                  Balances
                </span>
              </div>
              {nativeBalance && (
                <div className="px-3 py-1.5 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Image src={getTokenIcon(chain?.nativeCurrency?.symbol === "USDC" ? "USDC" : "ETH")} alt="" width={14} height={14} className="rounded-full" />
                    <span className="text-xs text-on-surface-variant">{chain?.nativeCurrency?.symbol ?? "ETH"}</span>
                  </div>
                  <span className="text-xs font-bold text-on-surface">
                    {formatBalance(nativeBalance.value, nativeBalance.decimals, 4)}
                  </span>
                </div>
              )}
              {acredBalance !== undefined && (
                <div className="px-3 py-1.5 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Image src={getTokenIcon("ACRED")} alt="" width={14} height={14} className="rounded-full" />
                    <span className="text-xs text-on-surface-variant">ACRED</span>
                  </div>
                  <span className="text-xs font-bold text-on-surface">
                    {formatBalance(acredBalance, acredDecimals, 2)}
                  </span>
                </div>
              )}
              <div className="border-t border-outline-variant/15 my-1" />
            </>
          )}

          {/* Disconnect */}
          <button
            onClick={() => {
              logout();
              setOpen(false);
            }}
            className="w-full flex items-center gap-2.5 px-3 py-2.5 text-xs font-medium text-error hover:bg-surface-container-low transition-colors"
          >
            <span className="material-symbols-outlined text-[16px]">logout</span>
            Disconnect
          </button>
        </div>
      )}
    </div>
  );
}
