"use client";

import { useState } from "react";
import Image from "next/image";
import { motion } from "framer-motion";
import { useAccount, useReadContract, useWriteContract, useWaitForTransactionReceipt } from "wagmi";
import { parseUnits } from "viem";
import { TopNavBar } from "@/components/layout/TopNavBar";
import { Footer } from "@/components/layout/Footer";
import { MobileBottomNav } from "@/components/layout/MobileBottomNav";
import { usePool, useTokenBalances, useLpSnapshot, usePoolSnapshot } from "@/lib/hooks";
import { ERC20Abi, ConvergeHookAbi } from "@/lib/contracts";
import { formatBalance } from "@/lib/format";
import { getTokenIcon } from "@/lib/tokens";
import { PoolSelector } from "@/components/PoolSelector";
import { TxStatus } from "@/components/ui/TxStatus";

export default function PoolPage() {
  const { address, isConnected, chain } = useAccount();
  const { pool } = usePool();
  const { rwaBalance, redeemBalance, rwaSymbol, redeemSymbol, rwaDecimals, redeemDecimals, refetch } = useTokenBalances(pool);
  const { data: lpSnapshot, refetch: refetchLp } = useLpSnapshot(pool);
  const { data: poolSnapshot } = usePoolSnapshot(pool);

  const [rwaInput, setRwaInput] = useState("");
  const [redeemInput, setRedeemInput] = useState("");
  const [mode, setMode] = useState<"deposit" | "withdraw">("deposit");

  const parsedRwa = (() => { try { return rwaInput ? parseUnits(rwaInput, rwaDecimals) : 0n; } catch { return 0n; } })();
  const parsedRedeem = (() => { try { return redeemInput ? parseUnits(redeemInput, redeemDecimals) : 0n; } catch { return 0n; } })();

  // Allowances
  const { data: rwaAllowance } = useReadContract({
    address: pool?.rwaToken,
    abi: ERC20Abi,
    functionName: "allowance",
    args: address && pool?.hook ? [address, pool.hook] : undefined,
    query: { enabled: !!pool?.rwaToken && !!address && !!pool?.hook },
  });
  const { data: redeemAllowance } = useReadContract({
    address: pool?.redeemAsset,
    abi: ERC20Abi,
    functionName: "allowance",
    args: address && pool?.hook ? [address, pool.hook] : undefined,
    query: { enabled: !!pool?.redeemAsset && !!address && !!pool?.hook },
  });

  const needsRwaApproval = rwaAllowance !== undefined && parsedRwa > 0n && (rwaAllowance as bigint) < parsedRwa;
  const needsRedeemApproval = redeemAllowance !== undefined && parsedRedeem > 0n && (redeemAllowance as bigint) < parsedRedeem;

  const { writeContract: approveRwa, data: approveRwaTx, isPending: isApprovingRwa } = useWriteContract();
  const { isLoading: isConfirmingRwaApproval } = useWaitForTransactionReceipt({ hash: approveRwaTx });

  const { writeContract: approveRedeem, data: approveRedeemTx, isPending: isApprovingRedeem } = useWriteContract();
  const { isLoading: isConfirmingRedeemApproval } = useWaitForTransactionReceipt({ hash: approveRedeemTx });

  const { writeContract: deposit, data: depositTx, isPending: isDepositing } = useWriteContract();
  const { isLoading: isConfirmingDeposit, isSuccess: depositSuccess } = useWaitForTransactionReceipt({ hash: depositTx });

  const { writeContract: withdraw, data: withdrawTx, isPending: isWithdrawing } = useWriteContract();
  const { isLoading: isConfirmingWithdraw, isSuccess: withdrawSuccess } = useWaitForTransactionReceipt({ hash: withdrawTx });

  function handleApproveRwa() {
    if (!pool?.rwaToken || !pool?.hook) return;
    approveRwa({ address: pool.rwaToken, abi: ERC20Abi, functionName: "approve", args: [pool.hook, parsedRwa * 2n] });
  }

  function handleApproveRedeem() {
    if (!pool?.redeemAsset || !pool?.hook) return;
    approveRedeem({ address: pool.redeemAsset, abi: ERC20Abi, functionName: "approve", args: [pool.hook, parsedRedeem * 2n] });
  }

  function handleDeposit() {
    if (!pool?.hook) return;
    const deadline = BigInt(Math.floor(Date.now() / 1000) + 3600);
    deposit({
      address: pool.hook,
      abi: ConvergeHookAbi,
      functionName: "deposit",
      args: [parsedRwa, parsedRedeem, 0n, deadline],
    });
  }

  function handleWithdraw() {
    if (!pool?.hook || !lp) return;
    const deadline = BigInt(Math.floor(Date.now() / 1000) + 3600);
    withdraw({
      address: pool.hook,
      abi: ConvergeHookAbi,
      functionName: "withdraw",
      args: [lp.shareBalance, 0n, 0n, deadline],
    });
  }

  if (depositSuccess || withdrawSuccess) {
    refetch();
    refetchLp();
  }

  const lp = lpSnapshot as { shareBalance: bigint; shareValue: bigint; totalShares: bigint; totalValue: bigint } | undefined;
  const poolStats = poolSnapshot as { totalValue: bigint; totalShares: bigint; rwaReserve: bigint; redeemReserve: bigint } | undefined;

  return (
    <>
      <TopNavBar />
      <main className="relative flex-1 flex flex-col items-center justify-center pt-8 md:pt-24 pb-24 md:pb-32 px-4">
        <div className="absolute inset-0 overflow-hidden pointer-events-none">
          <div className="absolute top-1/3 right-1/4 w-[500px] h-[500px] bg-primary-fixed opacity-20 blur-[120px]" />
        </div>

        <motion.div
          initial={{ opacity: 0, y: 24 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
          className="z-10 w-full max-w-[520px] space-y-4"
        >
          {/* Pool selector */}
          <div className="mb-2"><PoolSelector /></div>

          {/* LP Position card */}
          {lp && lp.shareBalance > 0n && (
            <div className="bg-surface-container-lowest rounded-xl p-6 border border-outline-variant/10 shadow-sm">
              <h2 className="text-[11px] font-medium uppercase tracking-wider text-on-surface-variant mb-4">Your LP Position</h2>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <span className="text-[11px] text-on-surface-variant block mb-1">Shares</span>
                  <span className="font-headline font-bold text-lg text-on-surface">
                    {lp.totalShares > 0n
                      ? `${((Number(lp.shareBalance) / Number(lp.totalShares)) * 100).toFixed(2)}%`
                      : "0%"}
                  </span>
                  <span className="text-[10px] text-on-surface-variant block mt-0.5">
                    {Number(lp.shareBalance).toLocaleString()} / {Number(lp.totalShares).toLocaleString()}
                  </span>
                </div>
                <div>
                  <span className="text-[11px] text-on-surface-variant block mb-1">Value ({redeemSymbol})</span>
                  <span className="font-headline font-bold text-lg text-on-surface">
                    {formatBalance(lp.shareValue, redeemDecimals)}
                  </span>
                </div>
              </div>
            </div>
          )}

          {/* Pool stats */}
          {poolStats && (
            <div className="bg-surface-container-lowest rounded-xl p-6 border border-outline-variant/10 shadow-sm">
              <h2 className="text-[11px] font-medium uppercase tracking-wider text-on-surface-variant mb-4">Pool Reserves</h2>
              <div className="grid grid-cols-2 gap-4">
                <div className="flex items-center gap-3">
                  <Image src={getTokenIcon(rwaSymbol)} alt={rwaSymbol} width={28} height={28} className="rounded-full shrink-0" />
                  <div>
                    <span className="text-[11px] text-on-surface-variant block mb-0.5">{rwaSymbol}</span>
                    <span className="font-headline font-bold text-on-surface">
                      {formatBalance(poolStats.rwaReserve, rwaDecimals, 0)}
                    </span>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <Image src={getTokenIcon(redeemSymbol)} alt={redeemSymbol} width={28} height={28} className="rounded-full shrink-0" />
                  <div>
                    <span className="text-[11px] text-on-surface-variant block mb-0.5">{redeemSymbol}</span>
                    <span className="font-headline font-bold text-on-surface">
                      {formatBalance(poolStats.redeemReserve, redeemDecimals, 0)}
                    </span>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Deposit/Withdraw card */}
          <div className="bg-surface-container-lowest rounded-xl p-6 border border-outline-variant/10 shadow-[0_2px_24px_rgba(25,28,29,0.06)]">
            {/* Tabs */}
            <div className="flex gap-2 mb-6">
              {(["deposit", "withdraw"] as const).map((m) => (
                <button
                  key={m}
                  onClick={() => setMode(m)}
                  className={`px-4 py-2 rounded-lg text-sm font-headline font-bold uppercase tracking-wider transition-colors ${
                    mode === m
                      ? "bg-primary text-on-primary"
                      : "bg-surface-container-low text-on-surface-variant hover:text-on-surface"
                  }`}
                >
                  {m}
                </button>
              ))}
            </div>

            {mode === "deposit" ? (
              <div className="space-y-4">
                {/* RWA input */}
                <div className="bg-surface-container-low rounded-lg p-4">
                  <div className="flex justify-between items-center mb-2">
                    <label className="text-[11px] font-medium uppercase tracking-wider text-on-surface-variant">{rwaSymbol}</label>
                    <span className="text-[11px] text-on-surface-variant">
                      Balance: {formatBalance(rwaBalance, rwaDecimals)}
                    </span>
                  </div>
                  <div className="flex items-center gap-3">
                    <input
                      type="text"
                      placeholder="0.00"
                      value={rwaInput}
                      onChange={(e) => setRwaInput(e.target.value.replace(/[^0-9.]/g, ""))}
                      className="bg-transparent border-none p-0 text-2xl font-headline font-bold text-on-surface focus:ring-0 focus:outline-none w-full"
                    />
                    <div className="flex items-center gap-2 bg-surface-container-lowest rounded-lg px-3 py-1.5 border border-outline-variant/15 shrink-0">
                      <Image src={getTokenIcon(rwaSymbol)} alt={rwaSymbol} width={18} height={18} className="rounded-full" />
                      <span className="font-headline font-bold text-sm text-on-surface">{rwaSymbol}</span>
                    </div>
                  </div>
                </div>

                {/* Redeem input */}
                <div className="bg-surface-container-low rounded-lg p-4">
                  <div className="flex justify-between items-center mb-2">
                    <label className="text-[11px] font-medium uppercase tracking-wider text-on-surface-variant">{redeemSymbol}</label>
                    <span className="text-[11px] text-on-surface-variant">
                      Balance: {formatBalance(redeemBalance, redeemDecimals)}
                    </span>
                  </div>
                  <div className="flex items-center gap-3">
                    <input
                      type="text"
                      placeholder="0.00"
                      value={redeemInput}
                      onChange={(e) => setRedeemInput(e.target.value.replace(/[^0-9.]/g, ""))}
                      className="bg-transparent border-none p-0 text-2xl font-headline font-bold text-on-surface focus:ring-0 focus:outline-none w-full"
                    />
                    <div className="flex items-center gap-2 bg-surface-container-lowest rounded-lg px-3 py-1.5 border border-outline-variant/15 shrink-0">
                      <Image src={getTokenIcon(redeemSymbol)} alt={redeemSymbol} width={18} height={18} className="rounded-full" />
                      <span className="font-headline font-bold text-sm text-on-surface">{redeemSymbol}</span>
                    </div>
                  </div>
                </div>

                {/* Action buttons */}
                {!isConnected ? (
                  <button disabled className="w-full bg-surface-container-low text-on-surface-variant rounded-lg py-4 font-headline font-bold text-lg cursor-not-allowed">
                    Connect Wallet
                  </button>
                ) : !pool ? (
                  <button disabled className="w-full bg-surface-container-low text-on-surface-variant rounded-lg py-4 font-headline font-bold text-lg cursor-not-allowed">
                    Not deployed on this network
                  </button>
                ) : needsRwaApproval ? (
                  <button onClick={handleApproveRwa} disabled={isApprovingRwa || isConfirmingRwaApproval}
                    className="w-full signature-gradient text-on-primary rounded-lg py-4 font-headline font-bold text-lg disabled:opacity-50">
                    {isApprovingRwa ? "Confirm..." : isConfirmingRwaApproval ? "Approving..." : `Approve ${rwaSymbol}`}
                  </button>
                ) : needsRedeemApproval ? (
                  <button onClick={handleApproveRedeem} disabled={isApprovingRedeem || isConfirmingRedeemApproval}
                    className="w-full signature-gradient text-on-primary rounded-lg py-4 font-headline font-bold text-lg disabled:opacity-50">
                    {isApprovingRedeem ? "Confirm..." : isConfirmingRedeemApproval ? "Approving..." : `Approve ${redeemSymbol}`}
                  </button>
                ) : (
                  <button onClick={handleDeposit} disabled={isDepositing || isConfirmingDeposit || (parsedRwa === 0n && parsedRedeem === 0n)}
                    className="w-full signature-gradient text-on-primary rounded-lg py-4 font-headline font-bold text-lg flex items-center justify-center gap-2 hover:brightness-110 active:scale-[0.98] shadow-[0_4px_16px_rgba(0,27,68,0.25)] disabled:opacity-50">
                    {isDepositing ? "Confirm in Wallet..." : isConfirmingDeposit ? "Depositing..." : "Deposit Liquidity"}
                  </button>
                )}
                <TxStatus
                  chainId={chain?.id}
                  txHash={depositTx}
                  isPending={isDepositing}
                  isConfirming={isConfirmingDeposit}
                  isSuccess={depositSuccess}
                  confirmingLabel="Deposit submitted"
                  successLabel="Deposit confirmed"
                />
              </div>
            ) : (
              <div className="space-y-4">
                <p className="text-sm text-on-surface-variant">
                  Withdraw your full LP position ({lp && lp.totalShares > 0n ? `${((Number(lp.shareBalance) / Number(lp.totalShares)) * 100).toFixed(2)}%` : "0%"} of pool)
                </p>
                <button
                  onClick={handleWithdraw}
                  disabled={isWithdrawing || isConfirmingWithdraw || !lp || lp.shareBalance === 0n}
                  className="w-full bg-error/90 text-on-primary rounded-lg py-4 font-headline font-bold text-lg flex items-center justify-center gap-2 hover:bg-error active:scale-[0.98] disabled:opacity-50"
                >
                  {isWithdrawing ? "Confirm in Wallet..." : isConfirmingWithdraw ? "Withdrawing..." : "Withdraw All"}
                </button>
                <TxStatus
                  chainId={chain?.id}
                  txHash={withdrawTx}
                  isPending={isWithdrawing}
                  isConfirming={isConfirmingWithdraw}
                  isSuccess={withdrawSuccess}
                  confirmingLabel="Withdrawal submitted"
                  successLabel="Withdrawal confirmed"
                />
              </div>
            )}
          </div>
        </motion.div>
      </main>
      <Footer />
      <MobileBottomNav />
    </>
  );
}
