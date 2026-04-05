import Link from "next/link";

const footerLinks = [
  { label: "Docs", href: "#" },
  { label: "GitHub", href: "https://github.com/dzmbs/antibes" },
  { label: "Arc Testnet", href: "#" },
  { label: "Circle CCTP", href: "https://www.circle.com/cross-chain-transfer-protocol" },
  { label: "Uniswap v4", href: "https://docs.uniswap.org/contracts/v4/overview" },
];

const mobileLinks = ["Docs", "GitHub", "Arc Testnet"];

export function Footer() {
  return (
    <footer className="bg-white border-t border-outline-variant/15 mt-auto">

      {/* Desktop footer — single row */}
      <div className="hidden md:flex items-center justify-between gap-8 px-10 py-6 w-full max-w-[1920px] mx-auto">

        {/* Logo + copyright left */}
        <div className="flex flex-col gap-1 shrink-0">
          <span className="font-logo font-extrabold text-primary-container text-lg tracking-tight">
            CONVERGE
          </span>
          <p className="text-on-surface-variant text-[11px] leading-relaxed">
            &copy; {new Date().getFullYear()} Converge. Built on Uniswap v4.
          </p>
        </div>

        {/* Nav links center */}
        <nav className="flex items-center gap-6 flex-wrap justify-center">
          {footerLinks.map((link) => (
            <Link
              key={link.label}
              href={link.href}
              className="text-on-surface-variant hover:text-bleu text-xs font-label transition-colors"
            >
              {link.label}
            </Link>
          ))}
        </nav>

        {/* Status indicator right */}
        <div className="flex items-center gap-2 shrink-0">
          <div className="w-1.5 h-1.5 rounded-full bg-success animate-pulse" />
          <span className="text-[11px] uppercase tracking-wider font-label font-semibold text-on-surface-variant">
            All Oracles Operational
          </span>
        </div>

      </div>

      {/* Mobile footer — stacked centered */}
      <div className="md:hidden flex flex-col items-center gap-5 px-8 py-10 mb-16">
        <span className="font-logo font-extrabold text-primary-container text-lg tracking-tight">
          CONVERGE
        </span>
        <div className="flex gap-6">
          {mobileLinks.map((label) => (
            <Link
              key={label}
              href="#"
              className="text-[11px] tracking-wider uppercase text-on-surface-variant hover:text-bleu transition-colors"
            >
              {label}
            </Link>
          ))}
        </div>
        <p className="text-[11px] text-on-surface-variant text-center leading-relaxed">
          &copy; {new Date().getFullYear()} Converge. Built on Uniswap v4.
        </p>
      </div>

    </footer>
  );
}
