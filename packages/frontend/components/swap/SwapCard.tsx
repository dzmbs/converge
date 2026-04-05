"use client";

import { useState, useMemo, useEffect } from "react";
import Image from "next/image";
import { motion } from "framer-motion";
import { useAccount, useReadContract, useWriteContract, useWaitForTransactionReceipt } from "wagmi";
import { parseUnits, formatUnits } from "viem";
import { usePool, useChainDeployment, useTokenBalances, useQuote } from "@/lib/hooks";
import { ERC20Abi, SwapRouterAbi, ConvergeHookAbi } from "@/lib/contracts";
import { getTokenIcon } from "@/lib/tokens";
import { formatBalance } from "@/lib/format";
import { PoolSelector } from "@/components/PoolSelector";
import { TxStatus } from "@/components/ui/TxStatus";

const ease: [number, number, number, number] = [0.25, 0.1, 0.25, 1];

export function SwapCard() {
  const { address, chain, isConnected } = useAccount();
  const deployment = useChainDeployment();
  const { pool } = usePool();
  const { rwaBalance, redeemBalance, rwaSymbol, redeemSymbol, rwaDecimals, redeemDecimals, refetch } = useTokenBalances(pool);

  const [sellRwa, setSellRwa] = useState(false); // false = sell USDC buy ACRED, true = sell ACRED buy USDC
  const [inputAmount, setInputAmount] = useState("");
  const [debouncedInput, setDebouncedInput] = useState("");

  const inputDecimals = sellRwa ? rwaDecimals : redeemDecimals;
  const outputDecimals = sellRwa ? redeemDecimals : rwaDecimals;
  const sellSymbol = sellRwa ? rwaSymbol : redeemSymbol;
  const buySymbol = sellRwa ? redeemSymbol : rwaSymbol;
  const sellBalance = sellRwa ? rwaBalance : redeemBalance;
  const buyBalance = sellRwa ? redeemBalance : rwaBalance;
  const sellToken = sellRwa ? pool?.rwaToken : pool?.redeemAsset;
  const swapRwaForRedeem = sellRwa;

  // Debounce the input to avoid firing useQuote on every keystroke
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedInput(inputAmount), 300);
    return () => clearTimeout(timer);
  }, [inputAmount]);

  const parsedInput = useMemo(() => {
    try {
      return inputAmount ? parseUnits(inputAmount, inputDecimals) : 0n;
    } catch {
      return 0n;
    }
  }, [inputAmount, inputDecimals]);

  const debouncedParsedInput = useMemo(() => {
    try {
      return debouncedInput ? parseUnits(debouncedInput, inputDecimals) : 0n;
    } catch {
      return 0n;
    }
  }, [debouncedInput, inputDecimals]);

  const { data: quoteData } = useQuote(pool, debouncedParsedInput, swapRwaForRedeem);
  const quote = quoteData as { rate: bigint; feeBips: bigint; feeAmount: bigint; amountOut: bigint; maxSwappableAmount: bigint } | undefined;

  // Check allowance
  const { data: allowance } = useReadContract({
    address: sellToken,
    abi: ERC20Abi,
    functionName: "allowance",
    args: address && deployment?.swapRouter ? [address, deployment.swapRouter] : undefined,
    query: { enabled: !!sellToken && !!address && !!deployment },
  });

  // Read rwaIsCurrency0 to determine zeroForOne
  const { data: rwaIsCurrency0 } = useReadContract({
    address: pool?.hook,
    abi: ConvergeHookAbi,
    functionName: "rwaIsCurrency0",
    query: { enabled: !!pool?.hook },
  });

  const needsApproval = allowance !== undefined && debouncedParsedInput > 0n && (allowance as bigint) < debouncedParsedInput;

  const { writeContract: approve, data: approveTxHash, isPending: isApproving } = useWriteContract();
  const { isLoading: isApproveConfirming } = useWaitForTransactionReceipt({ hash: approveTxHash });

  const { writeContract: swap, data: swapTxHash, isPending: isSwapping } = useWriteContract();
  const { isLoading: isSwapConfirming, isSuccess: swapSuccess } = useWaitForTransactionReceipt({ hash: swapTxHash });

  function handleApprove() {
    if (!sellToken || !deployment?.swapRouter) return;
    approve({
      address: sellToken,
      abi: ERC20Abi,
      functionName: "approve",
      args: [deployment.swapRouter, debouncedParsedInput * 2n],
    });
  }

  function handleSwap() {
    if (!deployment?.swapRouter || !pool?.hook || rwaIsCurrency0 === undefined) return;
    const zeroForOne = sellRwa ? (rwaIsCurrency0 as boolean) : !(rwaIsCurrency0 as boolean);

    const [currency0, currency1] = pool.rwaToken.toLowerCase() < pool.redeemAsset.toLowerCase()
      ? [pool.rwaToken, pool.redeemAsset]
      : [pool.redeemAsset, pool.rwaToken];

    const poolKey = {
      currency0,
      currency1,
      fee: 0,
      tickSpacing: 1,
      hooks: pool.hook,
    };

    const deadline = BigInt(Math.floor(Date.now() / 1000) + 3600);

    swap({
      address: deployment.swapRouter,
      abi: SwapRouterAbi,
      functionName: "swapExactTokensForTokens",
      args: [debouncedParsedInput, 0n, zeroForOne, poolKey, "0x", address, deadline],
    });
  }

  function toggleDirection() {
    setSellRwa(!sellRwa);
    setInputAmount("");
  }

  if (swapSuccess) {
    refetch();
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 24, scale: 0.97 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ duration: 0.6, ease }}
      className="w-full max-w-[480px]"
    >
      <div className="bg-surface-container-lowest rounded-xl p-6 border border-outline-variant/10 shadow-[0_2px_24px_rgba(25,28,29,0.06)] hover:shadow-[0_8px_32px_rgba(25,28,29,0.1)] transition-shadow duration-500">
        {/* Card header */}
        <div className="flex justify-between items-start mb-6 pb-5 border-b border-outline-variant/15">
          <div className="space-y-1">
            <h1 className="font-headline font-bold text-2xl text-primary leading-tight">
              Asset Swap
            </h1>
            <p className="text-[11px] font-medium uppercase tracking-wider text-on-surface-variant">
              Converge Liquidity Engine
            </p>
          </div>
          <div className="flex items-center gap-1.5 px-2.5 py-1.5 bg-surface-container-low rounded-lg border border-outline-variant/15 mt-0.5">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
            <span className="text-[11px] font-medium uppercase tracking-wider text-on-surface-variant">
              Settlement: <span className="text-secondary font-bold">Instant</span>
            </span>
          </div>
        </div>

        {/* Pool selector */}
        <div className="mb-4">
          <PoolSelector />
          {pool?.isRealUsdc && (
            <p className="text-[10px] text-secondary mt-1.5 font-medium">Using Arc native USDC (bridged via CCTP)</p>
          )}
        </div>

        {/* Swap fields */}
        <div className="space-y-2">
          {/* Sell field */}
          <div className="bg-surface-container-low rounded-lg p-4">
            <div className="flex justify-between items-center mb-3">
              <label className="text-[11px] font-medium uppercase tracking-wider text-on-surface-variant">
                Sell
              </label>
              <span className="text-[11px] text-on-surface-variant">
                Balance: {formatBalance(sellBalance, inputDecimals)} {sellSymbol}
              </span>
            </div>
            <div className="flex items-center justify-between gap-4">
              <input
                type="text"
                placeholder="0.00"
                value={inputAmount}
                onChange={(e) => setInputAmount(e.target.value.replace(/[^0-9.]/g, ""))}
                className="bg-transparent border-none p-0 text-3xl font-headline font-bold text-on-surface focus:ring-0 focus:outline-none placeholder-on-surface-variant/40 w-full leading-tight"
              />
              <div className="flex items-center gap-2 bg-surface-container-lowest rounded-lg px-3 py-1.5 border border-outline-variant/15 flex-shrink-0">
                <Image src={getTokenIcon(sellSymbol)} alt={sellSymbol} width={20} height={20} className="rounded-full" />
                <span className="font-headline font-bold text-sm text-on-surface tracking-tight">
                  {sellSymbol}
                </span>
              </div>
            </div>
          </div>

          {/* Swap direction button */}
          <div className="flex justify-center py-1 relative z-10">
            <button
              onClick={toggleDirection}
              className="bg-surface-container-lowest rounded-lg p-2.5 border border-outline-variant/15 shadow-sm hover:scale-110 transition-transform duration-200 text-secondary cursor-pointer"
              aria-label="Swap direction"
            >
              <span className="material-symbols-outlined text-[20px] block">swap_vert</span>
            </button>
          </div>

          {/* Buy field */}
          <div className="bg-surface-container-low rounded-lg p-4">
            <div className="flex justify-between items-center mb-3">
              <label className="text-[11px] font-medium uppercase tracking-wider text-on-surface-variant">
                Buy
              </label>
              <span className="text-[11px] text-on-surface-variant">
                Balance: {formatBalance(buyBalance, outputDecimals)} {buySymbol}
              </span>
            </div>
            <div className="flex items-center justify-between gap-4">
              <span className="text-3xl font-headline font-bold text-on-surface leading-tight">
                {quote?.amountOut ? Number(formatUnits(quote.amountOut, outputDecimals)).toLocaleString(undefined, { maximumFractionDigits: 4 }) : "0.00"}
              </span>
              <div className="flex items-center gap-2 bg-surface-container-lowest rounded-lg px-3 py-1.5 border border-outline-variant/15 flex-shrink-0">
                <Image src={getTokenIcon(buySymbol)} alt={buySymbol} width={20} height={20} className="rounded-full" />
                <span className="font-headline font-bold text-sm text-on-surface tracking-tight">
                  {buySymbol}
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Quote details */}
        {quote && debouncedParsedInput > 0n && (
          <div className="mt-5 bg-surface-container-low rounded-lg p-4 space-y-3">
            <div className="flex justify-between items-center">
              <span className="text-[11px] font-medium uppercase tracking-wider text-on-surface-variant">
                Exchange Rate
              </span>
              <span className="font-headline font-bold text-sm text-on-surface">
                1 {sellSymbol} = {sellRwa
                  ? Number(formatUnits(quote.rate * BigInt(10 ** redeemDecimals) / BigInt(10 ** 18), redeemDecimals)).toFixed(4)
                  : Number(formatUnits(BigInt(10 ** 18) * BigInt(10 ** rwaDecimals) / quote.rate / BigInt(10 ** redeemDecimals), rwaDecimals > 6 ? 4 : 2)).toFixed(4)
                } {buySymbol}
              </span>
            </div>
            <div className="border-t border-outline-variant/15" />
            <div className="flex justify-between items-center">
              <span className="text-[11px] font-medium uppercase tracking-wider text-on-surface-variant">
                Fee
              </span>
              <span className="text-[11px] font-medium text-on-surface">
                {Number(quote.feeBips) / 100}% ({formatUnits(quote.feeAmount, inputDecimals)} {sellSymbol})
              </span>
            </div>
            <div className="border-t border-outline-variant/15" />
            <div className="flex justify-between items-center">
              <span className="text-[11px] font-medium uppercase tracking-wider text-on-surface-variant">
                Slippage
              </span>
              <span className="text-[11px] font-medium text-on-surface">
                0% (Fixed Price)
              </span>
            </div>
          </div>
        )}

        {/* CTA */}
        <div className="mt-5">
          {!isConnected ? (
            <button disabled className="w-full bg-surface-container-low text-on-surface-variant rounded-lg py-4 font-headline font-bold text-lg cursor-not-allowed">
              Connect Wallet
            </button>
          ) : !pool ? (
            <button disabled className="w-full bg-surface-container-low text-on-surface-variant rounded-lg py-4 font-headline font-bold text-lg cursor-not-allowed">
              Not deployed on this network
            </button>
          ) : needsApproval ? (
            <button
              onClick={handleApprove}
              disabled={isApproving || isApproveConfirming}
              className="w-full signature-gradient text-on-primary rounded-lg py-4 font-headline font-bold text-lg flex items-center justify-center gap-2 transition-all hover:brightness-110 active:scale-[0.98] shadow-[0_4px_16px_rgba(0,27,68,0.25)] disabled:opacity-50"
            >
              {isApproving ? "Confirm in Wallet..." : isApproveConfirming ? "Approving..." : `Approve ${sellSymbol}`}
            </button>
          ) : (
            <button
              onClick={handleSwap}
              disabled={isSwapping || isSwapConfirming || debouncedParsedInput === 0n}
              className="w-full signature-gradient text-on-primary rounded-lg py-4 font-headline font-bold text-lg flex items-center justify-center gap-2 transition-all hover:brightness-110 active:scale-[0.98] shadow-[0_4px_16px_rgba(0,27,68,0.25)] disabled:opacity-50"
            >
              {isSwapping ? "Confirm in Wallet..." : isSwapConfirming ? "Swapping..." : "Execute Swap"}
              <span className="material-symbols-outlined text-[20px]">arrow_forward</span>
            </button>
          )}
        </div>

        {/* Tx status */}
        <TxStatus
          chainId={chain?.id}
          txHash={swapTxHash}
          isPending={isSwapping}
          isConfirming={isSwapConfirming}
          isSuccess={swapSuccess}
          confirmingLabel="Swap submitted"
          successLabel="Swap confirmed"
        />
      </div>
    </motion.div>
  );
}
