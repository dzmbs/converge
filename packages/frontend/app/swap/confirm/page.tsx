"use client";

import { motion } from "framer-motion";
import { CostAnalysis } from "@/components/swap/CostAnalysis";
import { ComplianceLock } from "@/components/ui/ComplianceLock";
import { TopNavBar } from "@/components/layout/TopNavBar";
import { MobileBottomNav } from "@/components/layout/MobileBottomNav";
import { Footer } from "@/components/layout/Footer";

export default function ConfirmPage() {
  return (
    <>
      <TopNavBar />

      <main className="flex-1 flex items-center justify-center p-6 bg-surface-container-lowest">
        <motion.div
          initial={{ opacity: 0, y: 20, scale: 0.98 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          transition={{ duration: 0.6, ease: [0.25, 0.1, 0.25, 1] }}
          className="max-w-2xl w-full bg-surface-container-lowest rounded-xl border border-outline-variant/10 shadow-[0_2px_24px_rgba(25,28,29,0.06)] relative overflow-hidden"
        >
          {/* Tricolor accent */}
          <div className="tricolor-ribbon-horizontal w-full" />

          {/* Header */}
          <div className="bg-surface-container/50 px-6 md:px-8 py-6 md:py-8 border-b border-outline-variant/15 flex justify-between items-start">
            <div className="space-y-2">
              <span className="text-[11px] font-medium uppercase tracking-wider text-on-surface-variant">
                Transaction Type
              </span>
              <h1 className="font-headline font-bold text-2xl md:text-3xl text-primary">
                Asset Settlement Confirmation
              </h1>
            </div>
            <button className="text-on-surface-variant hover:text-on-surface transition-colors hidden md:block">
              <span className="material-symbols-outlined">close</span>
            </button>
          </div>

          <div className="p-6 md:p-8 space-y-8 md:space-y-10">
            {/* Settlement visual flow */}
            <div className="flex flex-col md:flex-row md:items-center md:justify-between md:gap-6">
              {/* Collateral Out */}
              <div className="flex-1 bg-surface-container-low rounded-lg border-l-2 border-secondary p-5">
                <div className="flex items-center gap-3 mb-3">
                  <span className="material-symbols-outlined text-secondary text-sm">
                    north_east
                  </span>
                  <span className="text-[11px] font-medium uppercase tracking-wider text-on-surface-variant">
                    Collateral Out
                  </span>
                </div>
                <div className="flex items-baseline gap-2">
                  <span className="font-headline font-bold text-3xl md:text-4xl text-on-surface">
                    1,000.00
                  </span>
                  <span className="font-label text-sm font-bold text-secondary">
                    USDC
                  </span>
                </div>
              </div>

              {/* Bridge icon */}
              <div className="flex items-center justify-center py-3 md:py-0">
                <span className="material-symbols-outlined text-on-surface-variant scale-125">
                  sync_alt
                </span>
              </div>

              {/* Asset In */}
              <div className="flex-1 bg-surface-container-low rounded-lg border-l-2 border-error p-5">
                <div className="flex items-center gap-3 mb-3">
                  <span className="material-symbols-outlined text-error text-sm">
                    south_west
                  </span>
                  <span className="text-[11px] font-medium uppercase tracking-wider text-on-surface-variant">
                    Asset In
                  </span>
                </div>
                <div className="flex items-baseline gap-2">
                  <span className="font-headline font-bold text-3xl md:text-4xl text-on-surface">
                    997.70
                  </span>
                  <span className="font-label text-sm font-bold text-error">
                    ACRED
                  </span>
                </div>
              </div>
            </div>

            {/* Oracle & Status Grid */}
            <div className="grid grid-cols-2 gap-3">
              {/* Oracle Source */}
              <div className="bg-surface-container-low rounded-lg p-5 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-medium uppercase tracking-wider text-on-surface-variant">
                    Oracle Source
                  </span>
                  <span className="text-[11px] text-secondary font-bold px-2 py-0.5 border border-secondary/30 rounded">
                    LIVE
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="material-symbols-outlined text-xs text-secondary">
                    verified
                  </span>
                  <span className="font-body text-xs font-semibold uppercase tracking-tighter text-on-surface">
                    Chainlink
                  </span>
                </div>
              </div>

              {/* Pre-Trade Check */}
              <div className="bg-surface-container-low rounded-lg p-5 space-y-3">
                <span className="text-[11px] font-medium uppercase tracking-wider text-on-surface-variant block">
                  Pre-Trade Check
                </span>
                <div className="flex flex-col gap-2">
                  <div className="flex items-center gap-2">
                    <span className="w-1.5 h-1.5 rounded-full bg-secondary shrink-0" />
                    <span className="font-label text-xs font-medium text-on-surface">
                      Compliance check: Passed
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="w-1.5 h-1.5 rounded-full bg-secondary shrink-0" />
                    <span className="font-label text-xs font-medium text-on-surface">
                      Settlement: Instant
                    </span>
                  </div>
                </div>
              </div>
            </div>

            {/* Cost Analysis — single responsive render */}
            <CostAnalysis />

            {/* Compliance Lock */}
            <ComplianceLock
              title="Compliance Mode"
              description="Compliance mode active for this pool. Converge supports open access, LP-gated, and full EIP-712 swap authorization. Check pool configuration for applicable restrictions."
              icon="verified_user"
            />

            {/* Primary action */}
            <button className="w-full signature-gradient text-on-primary rounded-lg py-5 font-headline font-bold text-lg tracking-tight transition-all active:scale-[0.99] flex items-center justify-center gap-3 hover:opacity-95">
              <span
                className="material-symbols-outlined font-bold"
                style={{ fontVariationSettings: "'FILL' 1" }}
              >
                lock
              </span>
              <span>Confirm Swap &amp; Settle</span>
            </button>
          </div>

          {/* Architectural watermark — kept at very low opacity */}
          <div className="hidden md:block absolute top-0 right-0 p-12 opacity-[0.015] pointer-events-none">
            <span
              className="material-symbols-outlined text-[240px]"
              style={{ fontVariationSettings: "'FILL' 1" }}
            >
              architecture
            </span>
          </div>
        </motion.div>
      </main>

      <Footer />
      <MobileBottomNav />
    </>
  );
}
