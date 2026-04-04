"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import { SwapField } from "./SwapField";

const ease: [number, number, number, number] = [0.25, 0.1, 0.25, 1];

export function SwapCard() {
  return (
    <motion.div
      initial={{ opacity: 0, y: 24, scale: 0.97 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ duration: 0.6, ease }}
      className="w-full max-w-[480px]"
    >
      {/* Main card */}
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
              Settlement:{" "}
              <span className="text-secondary font-bold">Instant</span>
            </span>
          </div>
        </div>

        {/* Swap fields + divider */}
        <div className="space-y-2">
          <SwapField
            label="Sell Asset"
            balance="1,420,000.00 USDC"
            amount="500,000.00"
            usdValue="$500,000.00 USD"
            tokenName="USDC"
            tokenIcon="https://lh3.googleusercontent.com/aida-public/AB6AXuBBt15Jt9QMYVlnIXvJsGoDaEckp5_wo5Gy8JAPtlSx8BYZJMPFYWZa7JgnEY7lT_l9DA-u61twqrZ1hbWxuBYX80In9oOFCTkMNNQlDxABYcP2g9VhiVvoqux-4VCT3nY_E5prJdzPuk-4W6GkSg8kgrtKUahdtAa62bW-OF528Pqd5Gm6C_QOxqbUN4JHJyya2kMsRDmwK89DlwME6hqfhvRom02pNuMv2ynkpPIK1wCBEN-N4M0X0ZJ6rIxDUYVA6RHRrdJhwMBE"
          />

          {/* Swap direction button */}
          <div className="flex justify-center py-1 relative z-10">
            <button
              className="bg-surface-container-lowest rounded-lg p-2.5 border border-outline-variant/15 shadow-sm hover:scale-110 transition-transform duration-200 text-secondary cursor-pointer"
              aria-label="Swap direction"
            >
              <span className="material-symbols-outlined text-[20px] block">
                swap_vert
              </span>
            </button>
          </div>

          <SwapField
            label="Buy Asset"
            balance="0.00 tbUSD"
            amount="498,852.66"
            usdValue="Institutional Treasury Bill Bond"
            tokenName="tbUSD"
            tokenIcon="https://lh3.googleusercontent.com/aida-public/AB6AXuD2Yt74p9DN2aR_rAeOiTnZ7VIjg8VUFCq_dKk1ag9PqE1js_UIb2OhPGMj9ig4rYEo_eg5zEkPdaZRTpkG-ss872S_GysIyrFuEQ0fTIkk2xpw2Xmi9FdscT2YCvXJRXYsEJaKe_nHLdBotRSIAYqZJ-igBEKCvvRp1L6q9dnKnEXEjO1Ui6-1Bf_uWYQQSXWkkOB1SGP5K-uv0xYWwxvQxJAIyxNQXKfGselezWDEw0xCiSr8Bc-kx9Df3dxaIEJDJPN46ubh_iXG"
            badgeText="Max Yield"
          />
        </div>

        {/* Oracle data section */}
        <div className="mt-5 bg-surface-container-low rounded-lg p-4 space-y-3">
          <div className="flex justify-between items-center">
            <span className="text-[11px] font-medium uppercase tracking-wider text-on-surface-variant">
              NAV Price
            </span>
            <div className="flex items-baseline gap-1.5">
              <span className="font-headline font-bold text-sm text-on-surface">
                $1.0023
              </span>
              <span className="text-[11px] text-on-surface-variant">/ tbUSD</span>
            </div>
          </div>

          <div className="border-t border-outline-variant/15" />

          <div className="flex justify-between items-center">
            <span className="text-[11px] font-medium uppercase tracking-wider text-on-surface-variant">
              Oracle Source
            </span>
            <div className="flex items-center gap-2">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
              <span className="text-[11px] font-medium text-on-surface uppercase tracking-wider">
                Chainlink Verified
              </span>
            </div>
          </div>

          <div className="border-t border-outline-variant/15" />

          <div className="flex justify-between items-center">
            <span className="text-[11px] font-medium uppercase tracking-wider text-on-surface-variant">
              Slippage Tolerance
            </span>
            <span className="text-[11px] font-medium text-on-surface">
              0.05% (Institutional)
            </span>
          </div>
        </div>

        {/* CTA */}
        <div className="mt-5">
          <Link href="/swap/confirm">
            <button className="w-full signature-gradient text-on-primary rounded-lg py-4 font-headline font-bold text-lg flex items-center justify-center gap-2 transition-all hover:brightness-110 active:scale-[0.98] shadow-[0_4px_16px_rgba(0,27,68,0.25)]">
              Execute Swap
              <span className="material-symbols-outlined text-[20px]">
                arrow_forward
              </span>
            </button>
          </Link>
        </div>
      </div>

      {/* Contextual stats */}
      <div className="grid grid-cols-2 gap-4 mt-4">
        <div className="bg-surface-container-low rounded-lg p-4 border-l-2 border-secondary">
          <p className="text-[11px] font-medium uppercase tracking-wider text-on-surface-variant mb-2">
            Total Vault Liquidity
          </p>
          <p className="font-headline font-bold text-lg text-on-surface">
            $1.24B{" "}
            <span className="text-[11px] text-secondary font-medium ml-1">
              +0.12%
            </span>
          </p>
        </div>
        <div className="bg-surface-container-low rounded-lg p-4 border-l-2 border-primary-container">
          <p className="text-[11px] font-medium uppercase tracking-wider text-on-surface-variant mb-2">
            Yield Performance (7D)
          </p>
          <p className="font-headline font-bold text-lg text-on-surface">
            5.42%{" "}
            <span className="text-[11px] text-on-surface-variant font-medium ml-1">
              APY
            </span>
          </p>
        </div>
      </div>
    </motion.div>
  );
}
