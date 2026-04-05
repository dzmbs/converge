import Image from "next/image";
import { MetricCard } from "@/components/ui/MetricCard";
import { LiquidityChart } from "@/components/dashboard/LiquidityChart";
import { OracleVerifications } from "@/components/dashboard/OracleVerifications";
import { TopNavBar } from "@/components/layout/TopNavBar";
import { MobileBottomNav } from "@/components/layout/MobileBottomNav";
import { Footer } from "@/components/layout/Footer";

export default function DashboardPage() {
  return (
    <>
      <TopNavBar />

      <main className="flex-1 min-h-screen">
        <div className="px-4 md:px-12 pt-6 md:pt-10 pb-24 max-w-[1920px] mx-auto">

          {/* Header */}
          <header className="mb-8 md:mb-12 relative md:flex md:justify-between md:items-end">
            <div>
              {/* Mobile accent bar */}
              <div className="absolute -left-4 md:hidden top-0 w-1 h-12 bg-gradient-to-b from-secondary via-secondary/50 to-transparent" />

              {/* Desktop eyebrow */}
              <div className="hidden md:flex items-center gap-3 mb-3">
                <span className="h-px w-12 bg-secondary" />
                <span className="text-[11px] font-medium uppercase tracking-wider text-on-surface-variant">
                  Converge Protocol — Live Metrics
                </span>
              </div>

              <h2 className="font-headline font-extrabold text-3xl md:text-5xl text-primary tracking-tight">
                Institutional Dashboard
              </h2>

              {/* Mobile system health */}
              <div className="flex items-center gap-2 mt-2 md:hidden">
                <span className="w-2 h-2 rounded-full bg-secondary animate-pulse" />
                <p className="text-[11px] font-medium uppercase tracking-wider text-on-surface-variant">
                  System Health:{" "}
                  <span className="text-success font-bold">OPTIMAL</span>
                </p>
              </div>
            </div>

            {/* Desktop action button */}
            <div className="hidden md:block">
              <button className="group flex items-center gap-4 bg-surface-container-lowest border border-secondary/30 text-secondary rounded-lg px-8 py-4 font-bold uppercase tracking-tight hover:border-secondary hover:bg-sky transition-all duration-300">
                <span className="text-sm">Initiate Clearing Registry</span>
                <span className="material-symbols-outlined text-xl group-hover:rotate-180 transition-transform duration-500">
                  sync_alt
                </span>
              </button>
            </div>
          </header>

          {/* Metric Grid */}
          <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-8 md:mb-12">

            {/* Reserve Ratio — Data Monolith (first cell) */}
            <div className="bg-surface-container-lowest rounded-lg border border-outline-variant/10 border-l-2 border-l-secondary p-6 md:p-8 flex flex-col justify-between col-span-1">
              <div>
                <p className="text-[11px] font-medium uppercase tracking-wider text-on-surface-variant mb-1">
                  Reserve Ratio
                </p>
                <h2 className="font-headline font-bold text-2xl md:text-5xl text-secondary">
                  34<span className="hidden md:inline">.12</span>%
                </h2>
              </div>
              <div className="hidden md:block mt-8">
                <div className="flex justify-between text-[11px] font-medium mb-2 text-on-surface-variant">
                  <span className="flex items-center gap-1">
                    <span className="w-1.5 h-1.5 rounded-full bg-secondary" />
                    Pool Reserves
                  </span>
                  <span className="text-secondary">+4.12% Delta</span>
                </div>
                <div className="h-[2px] w-full bg-outline-variant/30 rounded-full">
                  <div className="h-full bg-secondary rounded-full" style={{ width: "34%" }} />
                </div>
              </div>
            </div>

            {/* Duration Risk — desktop only */}
            <div className="hidden md:flex bg-surface-container-lowest rounded-lg border border-outline-variant/10 p-8 flex-col justify-between">
              <div>
                <p className="text-[11px] font-medium uppercase tracking-wider text-on-surface-variant mb-1">
                  Oracle Rate
                </p>
                <div className="flex items-baseline gap-2">
                  <h2 className="font-headline font-bold text-5xl text-on-surface">
                    $1.0023
                  </h2>
                  <span className="text-[11px] font-medium uppercase tracking-wider text-secondary">
                    Live
                  </span>
                </div>
              </div>
              <div className="flex items-end gap-1 mt-8 h-4">
                <div className="w-full bg-secondary/10 h-1/2 rounded-sm" />
                <div className="w-full bg-secondary/20 h-3/4 rounded-sm" />
                <div className="w-full bg-secondary/40 h-full rounded-sm border-t border-secondary" />
                <div className="w-full bg-outline-variant/30 h-1/4 rounded-sm" />
                <div className="w-full bg-outline-variant/30 h-1/4 rounded-sm" />
              </div>
            </div>

            {/* Redemption Queue */}
            <MetricCard
              label="Redemption Queue"
              value="3"
              badge="PENDING"
            />

            {/* Pool Liquidity */}
            <div className="bg-surface-container-lowest rounded-lg border border-outline-variant/10 p-6 md:p-8 flex flex-col justify-between">
              <div>
                <span className="text-[11px] font-medium uppercase tracking-wider text-on-surface-variant block mb-1">
                  Pool Liquidity
                </span>
                <span className="font-headline font-bold text-2xl md:text-4xl text-on-surface">
                  $2.4M
                </span>
              </div>
              <div className="hidden md:flex items-center gap-2 mt-8">
                <span className="material-symbols-outlined text-secondary text-sm">
                  trending_up
                </span>
                <span className="text-[11px] font-medium uppercase tracking-wider text-secondary">
                  ACRED/USDC Pair
                </span>
              </div>
            </div>

            {/* Fee Rate */}
            <div className="bg-surface-container-lowest rounded-lg border border-outline-variant/10 p-6 md:p-8 flex flex-col justify-between">
              <div>
                <span className="text-[11px] font-medium uppercase tracking-wider text-on-surface-variant block mb-1">
                  <span className="md:hidden">Fee Rate</span>
                  <span className="hidden md:inline">Fee Rate</span>
                </span>
                <span className="font-headline font-bold text-2xl md:text-4xl text-secondary">
                  23<span className="hidden md:inline"> bps</span>
                </span>
              </div>
              <div className="hidden md:flex items-end h-6 gap-0.5 mt-8">
                <div className="w-full bg-secondary/10 h-1/4 rounded-sm" />
                <div className="w-full bg-secondary/20 h-1/2 rounded-sm" />
                <div className="w-full bg-secondary/30 h-2/3 rounded-sm" />
                <div className="w-full bg-secondary/50 h-3/4 rounded-sm" />
                <div className="w-full bg-secondary h-full rounded-sm" />
              </div>
            </div>

            {/* Async Queue — desktop only */}
            <div className="hidden md:flex bg-surface-container-lowest rounded-lg border border-outline-variant/10 p-8 flex-col justify-between">
              <div>
                <p className="text-[11px] font-medium uppercase tracking-wider text-on-surface-variant mb-1">
                  Async Queue
                </p>
                <h2 className="font-headline font-bold text-4xl text-on-surface">
                  0
                </h2>
              </div>
              <div className="flex gap-2 mt-8">
                <span className="text-[11px] font-medium uppercase tracking-wider text-on-surface-variant/50">
                  Pending Swaps
                </span>
              </div>
            </div>
          </div>

          {/* Chart + Attestations */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 md:gap-12 mb-8">
            <section className="lg:col-span-2">
              <LiquidityChart />
            </section>
            <OracleVerifications />
          </div>

          {/* Glassmorphic action card — mobile only */}
          <section className="mb-8 md:hidden">
            <div className="glass-panel relative overflow-hidden rounded-xl border border-outline-variant/10 p-8 flex flex-col items-center text-center">
              <div className="absolute inset-0 opacity-20 pointer-events-none">
                <Image
                  src="https://lh3.googleusercontent.com/aida-public/AB6AXuA6wEWBn8V9hfy9jYSznrb8zrJlV83H34hUtzG2s6Gyt2pwO2bR6wNCzsmNG5_lTIMCu3jE0ry6X3D-8k40uibMqIhRhFvJlOoIwwrhX_7g9dD5bPt-jsFPvxarbAIPciM69wYJ0IPv7Wm-2VAPTJ8HRDfHXwyGlaEiYYXQQuXJozRSzcv4cWlMn8Xc1F16afOJeQlQFMeWtQEMaG9yfB7iZAhxJLnhs6Q-GajsFSJ_8L_oH_N1CL83BL55nzVbghqk5l99ErpUhLsP"
                  alt="Abstract digital network"
                  fill
                  className="object-cover mix-blend-overlay"
                />
              </div>
              <h4 className="font-headline font-bold text-xl text-on-surface mb-2 relative z-10">
                Portfolio Balancing
              </h4>
              <p className="text-[11px] text-on-surface-variant mb-6 relative z-10 max-w-[240px] leading-relaxed">
                Initialize automated protocol rebalancing across decentralized
                liquidity layers.
              </p>
              <button className="w-full signature-gradient text-on-primary font-headline font-bold py-4 text-[11px] uppercase tracking-wider rounded-lg relative z-10 transition-all hover:opacity-95">
                Rebalance Pool Registry
              </button>
            </div>
          </section>

          {/* Security Notice — mobile only */}
          <div className="md:hidden bg-surface-container-lowest rounded-lg p-5 border border-outline-variant/10 mb-12">
            <div className="flex gap-4">
              <div className="w-10 h-10 rounded-lg bg-rouge/10 flex items-center justify-center flex-shrink-0">
                <span className="material-symbols-outlined text-rouge text-lg">
                  security
                </span>
              </div>
              <div>
                <h5 className="text-[11px] font-medium uppercase tracking-wider text-on-surface mb-1">
                  Security Protocol Alpha
                </h5>
                <p className="text-[11px] text-on-surface-variant leading-relaxed">
                  Multi-signature authentication required for all outgoing
                  settlement transmissions. Current vault state: LOCKED.
                </p>
              </div>
            </div>
          </div>

        </div>
      </main>

      <Footer />
      <MobileBottomNav />
    </>
  );
}
