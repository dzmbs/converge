"use client";

import Image from "next/image";
import { motion } from "framer-motion";
import { HeroSection } from "@/components/home/HeroSection";
import { OracleNAVCard } from "@/components/home/OracleNAVCard";
import { ArchitectureGrid } from "@/components/home/ArchitectureGrid";
import { FadeIn } from "@/components/motion/FadeIn";
import { TopNavBar } from "@/components/layout/TopNavBar";
import { MobileBottomNav } from "@/components/layout/MobileBottomNav";
import { Footer } from "@/components/layout/Footer";

const ease: [number, number, number, number] = [0.25, 0.1, 0.25, 1];

export default function HomePage() {
  return (
    <>
      <TopNavBar />

      <main className="relative flex-1">
        <HeroSection />
        <OracleNAVCard />
        <ArchitectureGrid />

        {/* Partnership Bento Grid */}
        <section className="py-20 md:py-28 px-8 md:px-16 bg-surface">
          <div className="max-w-[1280px] mx-auto grid grid-cols-1 lg:grid-cols-12 gap-6">
            {/* SKY Partnership */}
            <FadeIn direction="left" className="lg:col-span-8">
              <div className="signature-gradient p-10 md:p-12 rounded-xl relative overflow-hidden group h-full">
                <div className="relative z-10 space-y-5">
                  <span className="inline-block px-3 py-1 bg-secondary text-on-primary text-[11px] font-medium uppercase tracking-wider rounded">
                    Clearing Partner
                  </span>
                  <h2 className="font-headline font-bold text-4xl md:text-5xl text-on-primary leading-tight">
                    Clearing House
                    <br />
                    Integration
                  </h2>
                  <p className="text-on-primary/70 max-w-md text-base leading-relaxed">
                    SKY and Infinifi act as clearing houses that front liquidity
                    when pool reserves are insufficient, enabling instant
                    settlement without waiting for the async queue.
                  </p>
                  <button className="group/btn flex items-center gap-2 text-on-primary font-bold text-sm mt-4">
                    Learn about the Waterfall
                    <span className="material-symbols-outlined text-[18px] group-hover/btn:translate-x-1 transition-transform">
                      arrow_forward
                    </span>
                  </button>
                </div>
                <div className="absolute right-0 bottom-0 opacity-[0.08] group-hover:opacity-[0.14] transition-opacity duration-500">
                  <span
                    className="material-symbols-outlined text-[280px] text-white"
                    style={{ fontVariationSettings: "'FILL' 1" }}
                  >
                    cloud
                  </span>
                </div>
              </div>
            </FadeIn>

            {/* Inifi */}
            <FadeIn direction="right" delay={0.15} className="lg:col-span-4">
              <div className="bg-surface-container-lowest p-8 rounded-xl border border-outline-variant/10 flex flex-col justify-between h-full hover:border-secondary/20 hover:shadow-[0_4px_20px_rgba(0,96,170,0.06)] transition-all duration-300">
                <div className="space-y-4">
                  <div className="flex items-center gap-2 mb-2">
                    <div className="w-2 h-2 bg-secondary rounded-full" />
                    <span className="text-[11px] font-medium uppercase tracking-wider text-on-surface-variant">
                      Integration: INFINIFI
                    </span>
                  </div>
                  <h3 className="font-headline font-bold text-2xl text-primary">
                    Instant Settlement Partner
                  </h3>
                  <p className="text-sm text-on-surface-variant leading-relaxed">
                    Infinifi provides instant settlement when pool reserves are
                    constrained, bridging the gap before the async swap queue
                    is fulfilled.
                  </p>
                </div>
                <Image
                  src="https://lh3.googleusercontent.com/aida-public/AB6AXuDYOInWyWVugYR1d6e_uZ5zBzyMWQYu6pZrshyXffPbkZ6jPpBam9-1AGTGC9P8GnzBtaW5U1VV_1yvzYbt3U5MBLjijMwA2ty8w1-VvlUrOP7s7V4c37yJXGz14ctAVtHK8rlq1E67grz-KDBsAYpufoCx9yrNZzflC_VGjAcxX4kroDQzv9z3kybMv0r70OcH34rvowRsMkCm-SNdnQVGW8vZbsdeY1oYSeho6wpxDj5CZQBRBKXnUbORg1wLKYiIsC0GO1Va34mD"
                  alt="Network visualization"
                  width={400}
                  height={160}
                  className="w-full h-36 object-cover mt-6 rounded-lg grayscale hover:grayscale-0 transition-all duration-500"
                />
              </div>
            </FadeIn>
          </div>
        </section>

        {/* Trust & Transparency */}
        <section className="py-20 md:py-28 px-8 md:px-16 bg-surface-container-lowest overflow-hidden">
          <div className="max-w-[1280px] mx-auto flex flex-col md:flex-row items-center gap-12 md:gap-16">
            <FadeIn direction="left" className="w-full md:w-1/2">
              <motion.div
                whileHover={{ scale: 1.02 }}
                transition={{ duration: 0.4, ease }}
              >
                <Image
                  src="https://lh3.googleusercontent.com/aida-public/AB6AXuAT4aH2FDzTnZZ58ddDCiIlx2ay1lENe26UTG1sHeFVGbp8Nb-ffkbhdDgWaco9DI7VU38E0UXATAp9xof8AM2TQcEcd7lmC_Uo971ipZxcwuUb6OPjDHMaXc8wSB7tgQLOOT0Q3c4vUY-66s6Rr5VlanBZ1COWdbntby4h8ahRX4VDHq6YFpQfMJj9ZcmHMsppbm2gqAg3KPzrLSodu93bI5TqdIs3Ih_oXtTEINQCzg9pv8STJxJ-WHNp2BLPX8jR05RP4q5B8Nhg"
                  alt="Modern glass atrium architecture"
                  width={640}
                  height={500}
                  className="w-full h-[400px] md:h-[500px] object-cover rounded-xl shadow-[0_4px_24px_rgba(25,28,29,0.08)]"
                />
              </motion.div>
            </FadeIn>

            <FadeIn direction="right" delay={0.15} className="w-full md:w-1/2">
              <div className="space-y-6">
                <div className="flex gap-1">
                  <div className="w-4 h-1 bg-[#002395] rounded-full" />
                  <div className="w-4 h-1 bg-surface-container-high rounded-full" />
                  <div className="w-4 h-1 bg-[#ed2939] rounded-full" />
                </div>
                <h2 className="font-headline font-bold text-3xl md:text-4xl text-primary leading-tight">
                  Transparency by Architecture
                </h2>
                <p className="text-on-surface-variant text-lg leading-relaxed">
                  Converge is built on open, verifiable on-chain logic. Oracle
                  rates are public, fees are deterministic, and the liquidity
                  waterfall is fully transparent.
                </p>
                <ul className="space-y-5 pt-2">
                  {[
                    {
                      title: "Dynamic Congestion Fees",
                      desc: "Fees adjust automatically based on reserve health — low when reserves are deep, higher when constrained to incentivize rebalancing.",
                    },
                    {
                      title: "Yield Deployment",
                      desc: "Idle LP capital is deployed to Aave and Morpho, generating additional yield for liquidity providers on top of swap fees.",
                    },
                  ].map((item, i) => (
                    <motion.li
                      key={item.title}
                      initial={{ opacity: 0, x: 16 }}
                      whileInView={{ opacity: 1, x: 0 }}
                      viewport={{ once: true }}
                      transition={{ duration: 0.4, delay: 0.3 + i * 0.15, ease }}
                      className="flex gap-4 items-start"
                    >
                      <span className="material-symbols-outlined text-secondary pt-0.5">
                        check_circle
                      </span>
                      <div>
                        <h4 className="font-bold text-primary mb-1">
                          {item.title}
                        </h4>
                        <p className="text-sm text-on-surface-variant leading-relaxed">
                          {item.desc}
                        </p>
                      </div>
                    </motion.li>
                  ))}
                </ul>
              </div>
            </FadeIn>
          </div>
        </section>
      </main>

      <Footer />
      <MobileBottomNav />
    </>
  );
}
