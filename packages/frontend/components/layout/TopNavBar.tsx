"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ConnectWalletButton } from "@/components/wallet/ConnectWalletButton";
import { MobileWalletButton } from "@/components/wallet/MobileWalletButton";

const navLinks = [
  { href: "/swap", label: "Swap" },
  { href: "/dashboard", label: "Dashboard" },
  { href: "/settlement", label: "Portfolio" },
  { href: "#", label: "Compliance" },
];

export function TopNavBar() {
  const pathname = usePathname();

  return (
    <header className="bg-white/95 backdrop-blur-md border-b border-outline-variant/15 sticky top-0 z-50">
      <div className="flex items-center justify-between w-full px-5 md:px-10 h-14 md:h-16 max-w-[1920px] mx-auto">
        {/* Left: Logo */}
        <Link href="/" className="shrink-0">
          <span className="font-logo font-extrabold text-primary-container text-xl md:text-[22px] tracking-tight">
            CONVERGE
          </span>
        </Link>

        {/* Center: Desktop nav links */}
        <nav className="hidden md:flex items-center h-16 gap-1">
          {navLinks.map((link) => {
            const isActive =
              link.href !== "#" && pathname.startsWith(link.href);
            return (
              <Link
                key={link.label}
                href={link.href}
                className={`relative h-full flex items-center px-4 font-headline text-sm font-semibold transition-colors ${
                  isActive
                    ? "text-primary-container after:absolute after:bottom-0 after:left-4 after:right-4 after:h-0.5 after:bg-primary-container after:rounded-full"
                    : "text-on-surface-variant hover:text-primary-container"
                }`}
              >
                {link.label}
              </Link>
            );
          })}
        </nav>

        {/* Right: Wallet */}
        <div className="flex items-center gap-3">
          <div className="md:hidden">
            <MobileWalletButton />
          </div>
          <div className="hidden md:block">
            <ConnectWalletButton />
          </div>
        </div>
      </div>
    </header>
  );
}
