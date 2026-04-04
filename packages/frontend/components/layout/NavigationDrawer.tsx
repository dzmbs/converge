"use client";

import { useState } from "react";

const drawerLinks = [
  { href: "/", icon: "account_balance", label: "The Vault" },
  { href: "/dashboard", icon: "grid_view", label: "Asset Ledger" },
  { href: "/swap", icon: "swap_vert", label: "Institutional Transact" },
  { href: "/settlement", icon: "verified_user", label: "Security Protocol" },
  { href: "/settings", icon: "settings", label: "Settings" },
];

interface NavigationDrawerProps {
  activeHref?: string;
}

export function NavigationDrawer({ activeHref = "/" }: NavigationDrawerProps) {
  const [open, setOpen] = useState(false);

  return (
    <>
      {/* Backdrop */}
      {open && (
        <div
          className="fixed inset-0 z-[60] bg-black/20 backdrop-blur-sm"
          onClick={() => setOpen(false)}
        />
      )}

      {/* Drawer */}
      <nav
        className={`fixed inset-y-0 left-0 z-[70] w-72 h-full bg-white rounded-r-xl shadow-[0_0_48px_rgba(25,28,29,0.12)] flex flex-col transform transition-transform duration-300 ease-out ${
          open ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-5 border-b border-outline-variant/15">
          <span className="font-logo font-extrabold text-primary-container text-lg tracking-tight">
            CONVERGE
          </span>
          <button
            onClick={() => setOpen(false)}
            className="text-on-surface-variant hover:text-on-surface transition-colors p-1 rounded"
            aria-label="Close navigation"
          >
            <span className="material-symbols-outlined text-xl">close</span>
          </button>
        </div>

        {/* Nav items */}
        <div className="flex flex-col gap-1 p-3 flex-1 overflow-y-auto">
          {drawerLinks.map((link) => {
            const isActive = link.href === activeHref;
            return (
              <a
                key={link.label}
                href={link.href}
                className={`flex items-center gap-3 px-4 py-3 rounded-lg transition-colors ${
                  isActive
                    ? "bg-sky text-primary-container border-l-2 border-primary-container pl-[14px]"
                    : "text-on-surface-variant hover:bg-surface-container-low hover:text-on-surface border-l-2 border-transparent pl-[14px]"
                }`}
              >
                <span
                  className="material-symbols-outlined text-xl shrink-0"
                  style={
                    isActive
                      ? { fontVariationSettings: "'FILL' 1" }
                      : undefined
                  }
                >
                  {link.icon}
                </span>
                <span className="font-label text-sm font-medium">
                  {link.label}
                </span>
              </a>
            );
          })}
        </div>

        {/* Footer */}
        <div className="px-6 py-5 border-t border-outline-variant/15">
          <p className="text-[11px] text-on-surface-variant leading-relaxed">
            Regulated institutional interface.
            <br />
            &copy; {new Date().getFullYear()} Converge.
          </p>
        </div>
      </nav>
    </>
  );
}
