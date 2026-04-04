"use client";

import { usePrivy, useWallets } from "@privy-io/react-auth";

export function MobileWalletButton() {
  const { ready, authenticated, login } = usePrivy();
  const { wallets } = useWallets();

  if (!ready) return null;

  if (authenticated) {
    const address = wallets[0]?.address;
    const truncated = address
      ? `${address.slice(0, 4)}...${address.slice(-3)}`
      : null;

    return (
      <div className="flex items-center gap-2">
        <span className="w-1.5 h-1.5 bg-success rounded-full animate-pulse" />
        {truncated && (
          <span className="text-[11px] font-medium text-success uppercase tracking-wider">
            {truncated}
          </span>
        )}
      </div>
    );
  }

  return (
    <button onClick={login} className="flex items-center gap-1">
      <span className="material-symbols-outlined text-primary-container text-xl">
        account_balance_wallet
      </span>
    </button>
  );
}
