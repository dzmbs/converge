"use client";

import { motion } from "framer-motion";

const ease: [number, number, number, number] = [0.25, 0.1, 0.25, 1];

const features = [
  {
    icon: "security",
    title: "Isolated Custody",
    description:
      "Each asset class resides in a unique vault compartment, preventing cross-contamination and ensuring programmatic solvency.",
    color: "bg-sky",
    iconColor: "text-primary-container",
  },
  {
    icon: "bolt",
    title: "Atomic Settlement",
    description:
      "Bypass the legacy 3-day clearing cycle. Settlements on Converge occur within 800ms of transaction validation.",
    color: "bg-secondary/10",
    iconColor: "text-secondary",
  },
  {
    icon: "contract_edit",
    title: "Compliance Oracle",
    description:
      "Embedded KYC/AML rails at the protocol level. Smart contracts only execute when jurisdictional parameters are met.",
    color: "bg-sky",
    iconColor: "text-primary-container",
  },
];

export function ArchitectureGrid() {
  return (
    <section className="py-20 md:py-28 px-8 md:px-16 bg-surface-container-lowest">
      <div className="max-w-[1280px] mx-auto">
        {/* Section header */}
        <motion.div
          initial={{ opacity: 0, y: 24 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-80px" }}
          transition={{ duration: 0.6, ease }}
          className="max-w-2xl mb-12 md:mb-16"
        >
          <h2 className="font-headline text-3xl md:text-4xl font-bold text-primary mb-4 leading-tight">
            The Med-Vault Protocol
          </h2>
          <p className="text-on-surface-variant text-lg leading-relaxed">
            Architecture inspired by classical safety, executed with
            quantum-resistant cryptography. Our vault system separates liquidity
            from settlement logic.
          </p>
        </motion.div>

        {/* Feature cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {features.map((feature, i) => (
            <motion.div
              key={feature.title}
              initial={{ opacity: 0, y: 28 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: "-60px" }}
              transition={{ duration: 0.5, delay: i * 0.12, ease }}
              className="p-8 bg-surface-container-low/60 rounded-lg border border-outline-variant/10 hover:border-secondary/20 hover:bg-surface-container-low hover:shadow-[0_4px_20px_rgba(0,96,170,0.06)] transition-all duration-300 group"
            >
              <div
                className={`w-12 h-12 rounded-lg ${feature.color} flex items-center justify-center mb-6 group-hover:scale-110 transition-transform duration-300`}
              >
                <span
                  className={`material-symbols-outlined ${feature.iconColor} text-[22px]`}
                >
                  {feature.icon}
                </span>
              </div>
              <h3 className="font-headline font-bold text-xl text-primary mb-3">
                {feature.title}
              </h3>
              <p className="text-sm text-on-surface-variant leading-relaxed">
                {feature.description}
              </p>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}
