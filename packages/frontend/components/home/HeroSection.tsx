"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import { CountUp } from "@/components/motion/CountUp";

const ease: [number, number, number, number] = [0.25, 0.1, 0.25, 1];

const assetRows = [
  { icon: "account_balance", label: "US Treasury Bills", value: "$1,002.45", border: "border-secondary", iconColor: "text-secondary" },
  { icon: "domain", label: "Prime Real Estate", value: "$450,230", border: "border-error", iconColor: "text-error" },
  { icon: "currency_exchange", label: "EU Trade Finance", value: "$105.82", border: "border-bleu", iconColor: "text-bleu" },
];

export function HeroSection() {
  return (
    <section className="relative py-16 md:py-0 md:min-h-[90vh] flex items-center overflow-hidden bg-surface">
      {/* Architectural background */}
      <div className="absolute inset-0 pointer-events-none overflow-hidden">
        <motion.div
          initial={{ scale: 0.8, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ duration: 1.5, ease }}
          className="absolute top-[-20%] right-[-10%] w-[800px] h-[800px] rounded-full border-[40px] border-primary-container/[0.06]"
        />
        <motion.div
          initial={{ scale: 0.8, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ duration: 1.5, delay: 0.3, ease }}
          className="absolute bottom-[-30%] left-[-15%] w-[600px] h-[600px] rounded-full border-[30px] border-secondary/[0.04]"
        />
        <div className="absolute top-0 right-0 w-1/2 h-2/3 bg-gradient-to-bl from-sky/60 via-transparent to-transparent" />
        <div className="absolute bottom-0 left-0 w-2/3 h-1/3 bg-gradient-to-tr from-sky/30 to-transparent" />
      </div>

      <div className="relative z-10 w-full max-w-[1280px] mx-auto px-5 md:px-16">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-10 lg:gap-16 items-center">
          {/* Left: Copy */}
          <div className="lg:col-span-7 space-y-8">
            <motion.div
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, delay: 0.1, ease }}
              className="flex items-center gap-3"
            >
              <div className="flex gap-0.5">
                <div className="w-3 h-1 bg-[#002395] rounded-full" />
                <div className="w-3 h-1 bg-surface-container-high rounded-full" />
                <div className="w-3 h-1 bg-[#ed2939] rounded-full" />
              </div>
              <span className="text-[11px] font-medium uppercase tracking-wider text-on-surface-variant">
                Institutional-Grade RWA Protocol
              </span>
            </motion.div>

            <motion.h1
              initial={{ opacity: 0, y: 24 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.7, delay: 0.2, ease }}
              className="font-headline font-extrabold text-4xl sm:text-5xl md:text-6xl lg:text-7xl text-primary leading-[1.08] tracking-tight"
            >
              Professional RWA{" "}
              <span className="text-secondary">Settlement</span>
              <br />
              at Scale.
            </motion.h1>

            <motion.p
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, delay: 0.35, ease }}
              className="text-on-surface-variant text-base md:text-xl max-w-lg leading-relaxed"
            >
              The digital atrium for high-velocity asset clearing. Sub-second
              finality for institutional real-world assets, backed by SKY and
              Inifi clearing houses.
            </motion.p>

            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, delay: 0.5, ease }}
              className="flex flex-col sm:flex-row gap-4 pt-2"
            >
              <Link href="/swap">
                <button className="group w-full sm:w-auto signature-gradient text-on-primary font-headline font-bold rounded-lg px-10 py-3.5 md:py-4 text-base flex items-center justify-center gap-3 transition-all hover:shadow-[0_8px_32px_rgba(0,27,68,0.35)] active:scale-[0.98] shadow-[0_4px_24px_rgba(0,27,68,0.25)]">
                  Access Terminal
                  <span className="material-symbols-outlined text-[20px] group-hover:translate-x-1 transition-transform">
                    arrow_forward
                  </span>
                </button>
              </Link>
              <button className="w-full sm:w-auto bg-surface-container-lowest border border-outline-variant/20 text-primary font-headline font-bold rounded-lg px-10 py-3.5 md:py-4 text-base transition-all hover:border-secondary/30 hover:shadow-[0_2px_12px_rgba(0,96,170,0.08)] active:scale-[0.98]">
                View Documentation
              </button>
            </motion.div>
          </div>

          {/* Right: Glass data card */}
          <motion.div
            initial={{ opacity: 0, y: 32, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            transition={{ duration: 0.8, delay: 0.4, ease }}
            className="lg:col-span-5 relative"
          >
            <div className="absolute -inset-8 bg-gradient-to-br from-secondary/[0.06] via-sky/30 to-transparent rounded-3xl blur-2xl" />

            <div className="relative glass-panel rounded-xl border border-outline-variant/15 shadow-[0_8px_40px_rgba(25,28,29,0.08)] p-8 hover:shadow-[0_12px_48px_rgba(25,28,29,0.12)] transition-shadow duration-500">
              <div className="flex justify-between items-end mb-8">
                <div>
                  <span className="text-[11px] font-medium uppercase tracking-wider text-on-surface-variant">
                    Total Value Locked
                  </span>
                  <div className="font-headline font-extrabold text-4xl text-primary mt-1">
                    <CountUp value={4.28} prefix="$" suffix="B" decimals={2} />
                  </div>
                </div>
                <div className="text-right">
                  <span className="text-[11px] font-bold text-secondary">
                    +12.4%
                  </span>
                  <div className="h-1 w-20 bg-surface-container-high rounded-full overflow-hidden mt-1">
                    <motion.div
                      initial={{ width: 0 }}
                      animate={{ width: "75%" }}
                      transition={{ duration: 1.2, delay: 0.8, ease }}
                      className="h-full bg-secondary rounded-full"
                    />
                  </div>
                </div>
              </div>

              <div className="space-y-3">
                {assetRows.map((row, i) => (
                  <motion.div
                    key={row.label}
                    initial={{ opacity: 0, x: 20 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ duration: 0.5, delay: 0.6 + i * 0.12, ease }}
                    className={`flex items-center justify-between p-4 bg-surface-container-lowest rounded-lg border-l-2 ${row.border} hover:bg-surface-container-low/50 transition-colors cursor-default`}
                  >
                    <div className="flex items-center gap-3">
                      <span className={`material-symbols-outlined ${row.iconColor}`}>
                        {row.icon}
                      </span>
                      <span className="font-body font-semibold text-sm text-on-surface">
                        {row.label}
                      </span>
                    </div>
                    <span className="font-headline font-bold text-on-surface">
                      {row.value}
                    </span>
                  </motion.div>
                ))}
              </div>
            </div>
          </motion.div>
        </div>
      </div>
    </section>
  );
}
