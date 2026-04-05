import { TimelineStep } from "@/components/settlement/TimelineStep";
import { TopNavBar } from "@/components/layout/TopNavBar";
import { Footer } from "@/components/layout/Footer";

export default function SettlementPage() {
  return (
    <>
      <TopNavBar />

      <main className="flex-1 min-h-screen max-w-[1440px] mx-auto px-6 md:px-12 py-10 md:py-16 grid grid-cols-1 lg:grid-cols-12 gap-8 md:gap-12 items-start">

        {/* Left Column: Status & Timeline */}
        <div className="lg:col-span-7 space-y-10">

          {/* Hero section */}
          <section className="space-y-6">
            {/* Status badge */}
            <div className="inline-flex items-center gap-2 px-3 py-1.5 bg-sky rounded-lg">
              <span
                className="material-symbols-outlined text-secondary text-sm"
                style={{ fontVariationSettings: "'FILL' 1" }}
              >
                hourglass_empty
              </span>
              <span className="text-secondary text-[11px] font-medium uppercase tracking-wider">
                Settlement Status: Queued
              </span>
            </div>

            {/* Title */}
            <h1 className="font-headline font-extrabold text-5xl md:text-7xl text-primary leading-[1.05]">
              Async Swap <br />
              <span className="text-secondary">Queue</span>
            </h1>

            <p className="text-on-surface-variant max-w-xl leading-relaxed text-sm">
              Pool reserves were insufficient for atomic execution. This swap
              has entered the async queue. Converge will fulfill it as reserves
              are replenished — via yield vault recall,{" "}
              <span className="text-primary font-medium">SKY</span> or{" "}
              <span className="text-primary font-medium">Infinifi</span> clearing
              house settlement, or new LP deposits.
            </p>
          </section>

          {/* Timeline */}
          <div className="bg-surface-container-lowest rounded-xl p-8 md:p-10 border border-outline-variant/10 shadow-[0_2px_12px_rgba(25,28,29,0.04)]">
            <h3 className="text-[11px] font-medium uppercase tracking-wider text-on-surface-variant mb-8 md:mb-12">
              Settlement Ledger &amp; Node History
            </h3>

            <div className="relative flex flex-col gap-10 md:gap-14">
              {/* Vertical progress line */}
              <div className="absolute left-[13px] top-2 bottom-2 w-px bg-outline-variant/30" />

              <TimelineStep
                icon="check"
                title="Entry Submitted"
                subtitle="LOG_ID: 2024-10-24 14:02:11 UTC"
                status="complete"
              />
              <TimelineStep
                icon="verified_user"
                title="Compliance Protocol"
                subtitle="Automated Clearance Verified"
                status="complete"
              />
              <TimelineStep
                title="Liquidity Waterfall"
                subtitle="Attempting yield vault recall, then clearing house settlement..."
                status="active"
                badge="Waterfall Active"
              />
              <TimelineStep
                title="Settlement Finality"
                subtitle="Est. Window: 45m"
                status="pending"
              />
            </div>
          </div>

          {/* Strategy note */}
          <div className="bg-surface-container-low rounded-lg p-6 border border-outline-variant/10 flex gap-6">
            <span className="material-symbols-outlined text-secondary flex-shrink-0 mt-0.5">
              account_balance
            </span>
            <div className="space-y-2">
              <h4 className="text-[11px] font-medium uppercase tracking-wider text-on-surface">
                Converge Liquidity Waterfall
              </h4>
              <p className="text-[11px] text-on-surface-variant leading-relaxed uppercase tracking-wider">
                When pool reserves are insufficient, Converge executes a
                four-stage waterfall: pool reserves → yield vault recall →
                clearing house (SKY / Infinifi) → async queue. Swappers always
                receive oracle-rate execution; only the timing differs.
              </p>
            </div>
          </div>
        </div>

        {/* Right Column: Receipt Card */}
        <div className="lg:col-span-5 lg:sticky lg:top-32">
          <div className="bg-surface-container-lowest rounded-xl border border-outline-variant/10 shadow-[0_2px_12px_rgba(25,28,29,0.04)] relative overflow-hidden group">

            {/* French tricolor detail */}
            <div className="absolute top-0 right-12 flex h-[2px] w-[45px] rounded-sm overflow-hidden">
              <div className="w-1/3 bg-[#002395]" />
              <div className="w-1/3 bg-white" />
              <div className="w-1/3 bg-[#ED2939]" />
            </div>

            <div className="p-8 md:p-10 space-y-8 md:space-y-10">
              {/* Receipt header */}
              <div className="flex justify-between items-start">
                <div className="space-y-2">
                  <h2 className="font-headline font-bold text-3xl md:text-4xl text-primary">
                    Settlement Queued
                  </h2>
                  <p className="text-[11px] font-medium uppercase tracking-wider text-on-surface-variant/60">
                    Hash: 0x4f...92E1
                  </p>
                </div>
                <span className="material-symbols-outlined text-secondary text-4xl md:text-5xl">
                  receipt_long
                </span>
              </div>

              {/* Amounts */}
              <div className="space-y-4">
                {/* USDC — secondary accent */}
                <div className="bg-surface-container-low rounded-lg p-6 border-l-2 border-secondary flex flex-col">
                  <span className="text-[11px] font-medium uppercase tracking-wider text-on-surface-variant mb-2">
                    Liquidation Asset
                  </span>
                  <div className="flex justify-between items-end">
                    <span className="font-headline font-bold text-2xl md:text-3xl text-on-surface">
                      10,000.00
                    </span>
                    <span className="text-[11px] font-medium uppercase tracking-wider text-secondary">
                      USDC
                    </span>
                  </div>
                </div>

                {/* Divider arrow */}
                <div className="flex justify-center relative z-10">
                  <div className="bg-surface-container-lowest rounded-lg p-2 border border-outline-variant/10 transition-transform group-hover:scale-110">
                    <span className="material-symbols-outlined text-secondary text-sm">
                      expand_more
                    </span>
                  </div>
                </div>

                {/* ACRED — muted outline accent */}
                <div className="bg-surface-container-low rounded-lg p-6 border-l-2 border-outline-variant/30 flex flex-col">
                  <span className="text-[11px] font-medium uppercase tracking-wider text-on-surface-variant mb-2">
                    Target Receipt (EST)
                  </span>
                  <div className="flex justify-between items-end">
                    <span className="font-headline font-bold text-2xl md:text-3xl text-on-surface">
                      9,977.24
                    </span>
                    <span className="text-[11px] font-medium uppercase tracking-wider text-on-surface-variant">
                      ACRED
                    </span>
                  </div>
                </div>
              </div>

              {/* Meta grid */}
              <div className="grid grid-cols-2 gap-3">
                <div className="bg-surface-container-low rounded-lg p-4">
                  <span className="block text-[11px] font-medium uppercase tracking-wider text-on-surface-variant mb-1">
                    Fee Class
                  </span>
                  <span className="text-[11px] font-bold text-primary uppercase tracking-tight">
                    Institutional Select
                  </span>
                </div>
                <div className="bg-surface-container-low rounded-lg p-4">
                  <span className="block text-[11px] font-medium uppercase tracking-wider text-on-surface-variant mb-1">
                    Oracle Ledger
                  </span>
                  <span className="text-[11px] font-bold text-primary uppercase tracking-tight">
                    Pyth Network
                  </span>
                </div>
              </div>

              {/* Actions */}
              <div className="space-y-3">
                <button className="w-full signature-gradient text-on-primary rounded-lg py-4 font-headline font-bold text-[11px] uppercase tracking-wider transition-all hover:opacity-90">
                  Monitor Position
                </button>
                <button className="w-full bg-surface-container-lowest border border-outline-variant/15 rounded-lg text-on-surface-variant py-3 font-medium text-[11px] uppercase tracking-wider hover:text-primary hover:border-outline-variant/30 transition-all">
                  Export Compliance Receipt
                </button>
              </div>
            </div>
          </div>

          {/* Contextual insight card */}
          <div className="mt-6 bg-sky rounded-lg p-5 border border-secondary/10">
            <div className="flex items-center gap-4">
              <div className="w-10 h-10 rounded-lg bg-secondary/10 flex items-center justify-center flex-shrink-0">
                <span className="material-symbols-outlined text-secondary text-xl">
                  insights
                </span>
              </div>
              <div>
                <p className="text-[11px] font-medium uppercase tracking-wider text-on-surface-variant mb-0.5">
                  Real-time Insight
                </p>
                <p className="text-[11px] font-medium uppercase tracking-wider text-on-surface">
                  Waterfall stage 2 active — clearing house settlement in progress.
                </p>
              </div>
            </div>
          </div>
        </div>
      </main>

      <Footer />
    </>
  );
}
