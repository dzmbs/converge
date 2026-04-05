"use client";

import { useAccount, useWriteContract, useWaitForTransactionReceipt, useReadContracts } from "wagmi";
import Image from "next/image";
import { formatBalance } from "@/lib/format";
import { TopNavBar } from "@/components/layout/TopNavBar";
import { Footer } from "@/components/layout/Footer";
import { MobileBottomNav } from "@/components/layout/MobileBottomNav";
import { useChainDeployment, useFaucetCooldown } from "@/lib/hooks";
import { DemoFaucetAbi, ERC20Abi } from "@/lib/contracts";
import { getTokenIcon } from "@/lib/tokens";
import { TxStatus } from "@/components/ui/TxStatus";
import { motion } from "framer-motion";

export default function FaucetPage() {
  const { address, isConnected, chain } = useAccount();
  const deployment = useChainDeployment();

  // Always use the pool that has a faucet, regardless of currently-selected pool
  const faucetPool = deployment?.pools.find((p) => !!p.faucet);

  // The real-USDC pool for showing the native USDC balance alongside the mock balance
  const realUsdcPool = deployment?.pools.find((p) => p.isRealUsdc);

  const { data: cooldown, refetch: refetchCooldown } = useFaucetCooldown(faucetPool);
  const { writeContract, data: txHash, isPending } = useWriteContract();
  const { isLoading: isConfirming, isSuccess } = useWaitForTransactionReceipt({ hash: txHash });

  // Read mock USDC balance (redeemAsset of faucet pool) and ACRED balance
  const { data: tokenData, refetch: refetchTokens } = useReadContracts({
    contracts:
      faucetPool && address
        ? [
            { address: faucetPool.rwaToken, abi: ERC20Abi, functionName: "balanceOf", args: [address] },
            { address: faucetPool.redeemAsset, abi: ERC20Abi, functionName: "balanceOf", args: [address] },
          ]
        : undefined,
    query: { enabled: !!faucetPool && !!address },
  });

  // Read real USDC balance separately (if a separate real-USDC pool exists)
  const { data: realUsdcData, refetch: refetchRealUsdc } = useReadContracts({
    contracts:
      realUsdcPool && address
        ? [{ address: realUsdcPool.redeemAsset, abi: ERC20Abi, functionName: "balanceOf", args: [address] }]
        : undefined,
    query: { enabled: !!realUsdcPool && !!address && realUsdcPool?.id !== faucetPool?.id },
  });

  const rwaBalance = tokenData?.[0]?.result as bigint | undefined;
  const mockUsdcBalance = tokenData?.[1]?.result as bigint | undefined;
  const realUsdcBalance = realUsdcData?.[0]?.result as bigint | undefined;

  const rwaSymbol = faucetPool?.rwaSymbol ?? "ACRED";
  const rwaDecimals = faucetPool?.rwaDecimals ?? 18;
  const redeemDecimals = faucetPool?.redeemDecimals ?? 6;

  const canClaim = cooldown !== undefined && cooldown === 0n;
  const cooldownSeconds = cooldown ? Number(cooldown) : 0;

  function handleClaim() {
    if (!faucetPool?.faucet) return;
    writeContract({
      address: faucetPool.faucet,
      abi: DemoFaucetAbi,
      functionName: "claim",
    });
  }

  // Refetch after confirmation
  if (isSuccess) {
    refetchTokens();
    refetchRealUsdc();
    refetchCooldown();
  }

  return (
    <>
      <TopNavBar />
      <main className="relative flex-1 flex flex-col items-center justify-center pt-8 md:pt-24 pb-24 md:pb-32 px-4">
        <div className="absolute inset-0 overflow-hidden pointer-events-none">
          <div className="absolute top-1/4 left-1/3 w-[500px] h-[500px] bg-secondary-fixed opacity-30 blur-[120px]" />
        </div>

        <motion.div
          initial={{ opacity: 0, y: 24 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
          className="z-10 w-full max-w-[480px]"
        >
          <div className="bg-surface-container-lowest rounded-xl p-6 border border-outline-variant/10 shadow-[0_2px_24px_rgba(25,28,29,0.06)]">
            <div className="mb-6 pb-5 border-b border-outline-variant/15">
              <h1 className="font-headline font-bold text-2xl text-primary">Testnet Faucet</h1>
              <p className="text-[11px] font-medium uppercase tracking-wider text-on-surface-variant mt-1">
                Claim tokens for demo
              </p>
            </div>

            {/* Balances */}
            <div className="space-y-3 mb-6">
              {/* ACRED balance */}
              <div className="flex justify-between items-center bg-surface-container-low rounded-lg p-4">
                <div>
                  <span className="text-[11px] font-medium uppercase tracking-wider text-on-surface-variant block mb-1">
                    {rwaSymbol} Balance
                  </span>
                  <span className="font-headline font-bold text-lg text-on-surface">
                    {formatBalance(rwaBalance, rwaDecimals)}
                  </span>
                </div>
                <Image src={getTokenIcon(rwaSymbol)} alt={rwaSymbol} width={32} height={32} className="rounded-full" />
              </div>

              {/* Mock USDC balance */}
              <div className="flex justify-between items-center bg-surface-container-low rounded-lg p-4">
                <div>
                  <span className="text-[11px] font-medium uppercase tracking-wider text-on-surface-variant block mb-1">
                    USDC Balance <span className="normal-case text-[10px] text-on-surface-variant/60">(Demo)</span>
                  </span>
                  <span className="font-headline font-bold text-lg text-on-surface">
                    {formatBalance(mockUsdcBalance, redeemDecimals)}
                  </span>
                </div>
                <Image src={getTokenIcon("USDC")} alt="USDC" width={32} height={32} className="rounded-full" />
              </div>

              {/* Real (native) USDC balance — shown if a separate real-USDC pool exists */}
              {realUsdcPool && realUsdcPool.id !== faucetPool?.id && (
                <div className="flex justify-between items-center bg-surface-container-low rounded-lg p-4">
                  <div>
                    <span className="text-[11px] font-medium uppercase tracking-wider text-on-surface-variant block mb-1">
                      USDC Balance <span className="normal-case text-[10px] text-secondary">(Native)</span>
                    </span>
                    <span className="font-headline font-bold text-lg text-on-surface">
                      {formatBalance(realUsdcBalance, realUsdcPool.redeemDecimals)}
                    </span>
                  </div>
                  <Image src={getTokenIcon("USDC")} alt="USDC" width={32} height={32} className="rounded-full" />
                </div>
              )}
            </div>

            {/* Claim info */}
            <div className="bg-surface-container-low rounded-lg p-4 mb-6">
              <span className="text-[11px] font-medium uppercase tracking-wider text-on-surface-variant block mb-2">Per Claim</span>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Image src={getTokenIcon("USDC")} alt="USDC" width={16} height={16} className="rounded-full" />
                  <span className="text-sm font-bold text-on-surface">1,000 USDC</span>
                </div>
                <span className="text-[11px] text-on-surface-variant">+</span>
                <div className="flex items-center gap-2">
                  <Image src={getTokenIcon("ACRED")} alt="ACRED" width={16} height={16} className="rounded-full" />
                  <span className="text-sm font-bold text-on-surface">1,000 ACRED</span>
                </div>
              </div>
              <p className="text-[10px] text-on-surface-variant mt-2">1 hour cooldown between claims</p>
            </div>

            {/* Claim button */}
            {!isConnected ? (
              <div className="text-center text-sm text-on-surface-variant py-4">
                Connect your wallet to claim tokens
              </div>
            ) : !faucetPool?.faucet ? (
              <div className="text-center text-sm text-on-surface-variant py-4">
                Faucet not deployed on this network yet
              </div>
            ) : (
              <>
                <button
                  onClick={handleClaim}
                  disabled={isPending || isConfirming || !canClaim}
                  className="w-full signature-gradient text-on-primary rounded-lg py-4 font-headline font-bold text-lg flex items-center justify-center gap-2 transition-all hover:brightness-110 active:scale-[0.98] shadow-[0_4px_16px_rgba(0,27,68,0.25)] disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {isPending ? "Confirm in Wallet..." : isConfirming ? "Claiming..." : "Claim Tokens"}
                  <span className="material-symbols-outlined text-[20px]">
                    {isPending || isConfirming ? "hourglass_top" : "redeem"}
                  </span>
                </button>

                {cooldownSeconds > 0 && !isPending && !isConfirming && (
                  <p className="text-center text-xs text-on-surface-variant mt-3">
                    Next claim available in {Math.ceil(cooldownSeconds / 60)} minutes
                  </p>
                )}

                <TxStatus
                  chainId={chain?.id}
                  txHash={txHash}
                  isPending={isPending}
                  isConfirming={isConfirming}
                  isSuccess={isSuccess}
                  confirmingLabel="Claim submitted"
                  successLabel="Tokens claimed"
                />
              </>
            )}

            {/* Circle faucet link */}
            <div className="mt-6 pt-5 border-t border-outline-variant/15">
              <p className="text-[11px] text-on-surface-variant mb-2">
                Need gas USDC for Arc Testnet?
              </p>
              <a
                href="https://faucet.circle.com/"
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-2 text-secondary text-sm font-medium hover:underline"
              >
                <span className="material-symbols-outlined text-[16px]">open_in_new</span>
                Circle Faucet (faucet.circle.com)
              </a>
            </div>
          </div>
        </motion.div>
      </main>
      <Footer />
      <MobileBottomNav />
    </>
  );
}
