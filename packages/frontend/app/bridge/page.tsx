"use client";

import { useState } from "react";
import Image from "next/image";
import { motion } from "framer-motion";
import { useAccount, useSwitchChain, useReadContract, useWriteContract, useWaitForTransactionReceipt } from "wagmi";
import { parseUnits } from "viem";
import { TopNavBar } from "@/components/layout/TopNavBar";
import { Footer } from "@/components/layout/Footer";
import { MobileBottomNav } from "@/components/layout/MobileBottomNav";
import { TxStatus } from "@/components/ui/TxStatus";
import { formatBalance } from "@/lib/format";
import { CCTP_ROUTES, TOKEN_MESSENGER_ABI, ERC20_APPROVE_ABI, addressToBytes32 } from "@/lib/cctp";

export default function BridgePage() {
  const { address, isConnected, chain } = useAccount();
  const { switchChain } = useSwitchChain();
  const [routeIdx, setRouteIdx] = useState(0);
  const [amount, setAmount] = useState("");
  const route = CCTP_ROUTES[routeIdx];

  const isOnSourceChain = chain?.id === route.fromChainId;
  const parsedAmount = (() => { try { return amount ? parseUnits(amount, route.usdcDecimals) : 0n; } catch { return 0n; } })();

  // USDC balance on source chain
  const { data: usdcBalance } = useReadContract({
    address: route.usdc,
    abi: ERC20_APPROVE_ABI,
    functionName: "allowance", // just to get the contract working, we'll read balance separately
    args: address ? [address, route.tokenMessenger] : undefined,
    query: { enabled: false }, // disabled, we only use the allowance read below
  });

  // Allowance check
  const { data: allowance, refetch: refetchAllowance } = useReadContract({
    address: route.usdc,
    abi: ERC20_APPROVE_ABI,
    functionName: "allowance",
    args: address ? [address, route.tokenMessenger] : undefined,
    query: { enabled: isOnSourceChain && !!address },
  });

  // Balance
  const { data: balance } = useReadContract({
    address: route.usdc,
    abi: [{ name: "balanceOf", type: "function", stateMutability: "view", inputs: [{ name: "account", type: "address" }], outputs: [{ name: "", type: "uint256" }] }] as const,
    functionName: "balanceOf",
    args: address ? [address] : undefined,
    query: { enabled: isOnSourceChain && !!address },
  });

  const needsApproval = allowance !== undefined && parsedAmount > 0n && (allowance as bigint) < parsedAmount;

  // Approve
  const { writeContract: approve, data: approveTxHash, isPending: isApproving } = useWriteContract();
  const { isLoading: isApproveConfirming, isSuccess: approveSuccess } = useWaitForTransactionReceipt({ hash: approveTxHash });

  // Refetch allowance after approval confirms
  if (approveSuccess) {
    refetchAllowance();
  }

  // Bridge
  const { writeContract: bridge, data: bridgeTxHash, isPending: isBridging, error: bridgeError } = useWriteContract();
  const { isLoading: isBridgeConfirming, isSuccess: bridgeSuccess } = useWaitForTransactionReceipt({ hash: bridgeTxHash });

  function handleApprove() {
    approve({
      address: route.usdc,
      abi: ERC20_APPROVE_ABI,
      functionName: "approve",
      args: [route.tokenMessenger, parsedAmount * 2n],
    });
  }

  function handleBridge() {
    if (!address) return;
    const zeroCaller = "0x0000000000000000000000000000000000000000000000000000000000000000" as `0x${string}`;
    bridge({
      address: route.tokenMessenger,
      abi: TOKEN_MESSENGER_ABI,
      functionName: "depositForBurn",
      args: [parsedAmount, route.destinationDomain, addressToBytes32(address), route.usdc, zeroCaller, 0n, 1000],
      // Skip gas estimation — Arc's blocklist precompile causes simulation to fail but on-chain it works
      gas: 300_000n,
    });
  }

  function toggleDirection() {
    setRouteIdx(routeIdx === 0 ? 1 : 0);
    setAmount("");
  }

  return (
    <>
      <TopNavBar />
      <main className="relative flex-1 flex flex-col items-center justify-center pt-8 md:pt-24 pb-24 md:pb-32 px-4">
        <div className="absolute inset-0 overflow-hidden pointer-events-none">
          <div className="absolute bottom-1/4 left-1/4 w-[500px] h-[500px] bg-primary-fixed opacity-20 blur-[100px]" />
        </div>

        <motion.div
          initial={{ opacity: 0, y: 24 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
          className="z-10 w-full max-w-[480px]"
        >
          <div className="bg-surface-container-lowest rounded-xl p-6 border border-outline-variant/10 shadow-[0_2px_24px_rgba(25,28,29,0.06)]">
            <div className="mb-6 pb-5 border-b border-outline-variant/15">
              <h1 className="font-headline font-bold text-2xl text-primary">CCTP Bridge</h1>
              <p className="text-[11px] font-medium uppercase tracking-wider text-on-surface-variant mt-1">
                Cross-Chain Transfer Protocol by Circle
              </p>
            </div>

            {/* Direction selector */}
            <div className="flex items-center gap-3 mb-6">
              <div className="flex-1 bg-surface-container-low rounded-lg p-4 text-center">
                <span className="text-[11px] font-medium uppercase tracking-wider text-on-surface-variant block mb-2">From</span>
                <div className="flex items-center justify-center gap-2">
                  <Image src={route.fromIcon} alt={route.fromLabel} width={18} height={18} className="rounded-full" />
                  <span className="font-headline font-bold text-sm text-on-surface">{route.fromLabel}</span>
                </div>
              </div>

              <button
                onClick={toggleDirection}
                className="bg-surface-container-lowest rounded-lg p-2 border border-outline-variant/15 shadow-sm hover:scale-110 transition-transform text-secondary cursor-pointer shrink-0"
              >
                <span className="material-symbols-outlined text-[20px] block">swap_horiz</span>
              </button>

              <div className="flex-1 bg-surface-container-low rounded-lg p-4 text-center">
                <span className="text-[11px] font-medium uppercase tracking-wider text-on-surface-variant block mb-2">To</span>
                <div className="flex items-center justify-center gap-2">
                  <Image src={route.toIcon} alt={route.toLabel} width={18} height={18} className="rounded-full" />
                  <span className="font-headline font-bold text-sm text-on-surface">{route.toLabel}</span>
                </div>
              </div>
            </div>

            {/* Amount input */}
            <div className="bg-surface-container-low rounded-lg p-4 mb-4">
              <div className="flex justify-between items-center mb-2">
                <label className="text-[11px] font-medium uppercase tracking-wider text-on-surface-variant">Amount</label>
                {isOnSourceChain && (
                  <span className="text-[11px] text-on-surface-variant">
                    Balance: {formatBalance(balance as bigint | undefined, route.usdcDecimals)} USDC
                  </span>
                )}
              </div>
              <div className="flex items-center gap-4">
                <input
                  type="text"
                  placeholder="0.00"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value.replace(/[^0-9.]/g, ""))}
                  className="bg-transparent border-none p-0 text-3xl font-headline font-bold text-on-surface focus:ring-0 focus:outline-none w-full"
                />
                <div className="flex items-center gap-2 bg-surface-container-lowest rounded-lg px-3 py-1.5 border border-outline-variant/15">
                  <Image src="/tokens/usdc.svg" alt="USDC" width={20} height={20} className="rounded-full" />
                  <span className="font-headline font-bold text-sm text-on-surface">USDC</span>
                </div>
              </div>
            </div>

            {/* How it works */}
            <div className="bg-surface-container-low rounded-lg p-4 mb-5 space-y-2">
              <span className="text-[11px] font-medium uppercase tracking-wider text-on-surface-variant">How CCTP Works</span>
              <div className="space-y-1.5">
                {[
                  `1. USDC is burned on ${route.fromLabel} via Circle CCTP`,
                  "2. Circle attestation service validates the burn",
                  `3. Native USDC is minted on ${route.toLabel}`,
                  "4. No wrapped tokens, no bridge risk",
                ].map((step) => (
                  <div key={step} className="flex items-center gap-2">
                    <span className="w-1 h-1 rounded-full bg-secondary shrink-0" />
                    <span className="text-xs text-on-surface">{step}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* CTA */}
            {!isConnected ? (
              <button disabled className="w-full bg-surface-container-low text-on-surface-variant rounded-lg py-4 font-headline font-bold text-lg cursor-not-allowed">
                Connect Wallet
              </button>
            ) : !isOnSourceChain ? (
              <button
                onClick={() => switchChain({ chainId: route.fromChainId })}
                className="w-full signature-gradient text-on-primary rounded-lg py-4 font-headline font-bold text-lg flex items-center justify-center gap-2 hover:brightness-110 active:scale-[0.98] shadow-[0_4px_16px_rgba(0,27,68,0.25)]"
              >
                Switch to {route.fromLabel}
                <span className="material-symbols-outlined text-[20px]">swap_horiz</span>
              </button>
            ) : needsApproval ? (
              <button
                onClick={handleApprove}
                disabled={isApproving || isApproveConfirming || parsedAmount === 0n}
                className="w-full signature-gradient text-on-primary rounded-lg py-4 font-headline font-bold text-lg flex items-center justify-center gap-2 hover:brightness-110 active:scale-[0.98] shadow-[0_4px_16px_rgba(0,27,68,0.25)] disabled:opacity-50"
              >
                {isApproving ? "Confirm in Wallet..." : isApproveConfirming ? "Approving..." : "Approve USDC"}
              </button>
            ) : (
              <button
                onClick={handleBridge}
                disabled={isBridging || isBridgeConfirming || parsedAmount === 0n}
                className="w-full signature-gradient text-on-primary rounded-lg py-4 font-headline font-bold text-lg flex items-center justify-center gap-2 hover:brightness-110 active:scale-[0.98] shadow-[0_4px_16px_rgba(0,27,68,0.25)] disabled:opacity-50"
              >
                {isBridging ? "Confirm in Wallet..." : isBridgeConfirming ? "Bridging..." : "Bridge USDC"}
                <span className="material-symbols-outlined text-[20px]">arrow_forward</span>
              </button>
            )}

            {/* Tx status */}
            <TxStatus
              chainId={chain?.id}
              txHash={bridgeTxHash}
              isPending={isBridging}
              isConfirming={isBridgeConfirming}
              isSuccess={bridgeSuccess}
              confirmingLabel="Bridge submitted"
              successLabel="Bridge initiated! USDC will arrive in ~1-2 min"
            />

            {bridgeError && (
              <div className="mt-3 bg-error/10 rounded-lg p-3">
                <p className="text-xs text-error font-medium">Bridge failed</p>
                <p className="text-[10px] text-error/80 mt-1 break-all">{bridgeError.message.slice(0, 200)}</p>
              </div>
            )}

            {bridgeSuccess && (
              <button
                onClick={() => switchChain({ chainId: route.toChainId })}
                className="w-full mt-3 text-sm text-secondary font-medium hover:underline text-center"
              >
                Switch to {route.toLabel} to see your USDC →
              </button>
            )}

            {/* Circle attribution */}
            <div className="mt-6 pt-5 border-t border-outline-variant/15 flex items-center justify-center gap-2">
              <span className="text-[11px] text-on-surface-variant">Powered by</span>
              <span className="font-headline font-bold text-xs text-primary tracking-tight">Circle CCTP V2</span>
            </div>
          </div>
        </motion.div>
      </main>
      <Footer />
      <MobileBottomNav />
    </>
  );
}
