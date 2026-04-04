"use client";

import { usePrivy, useWallets } from "@privy-io/react-auth";

export function ConnectWalletButton() {
  const { ready, authenticated, login, logout } = usePrivy();
  const { wallets } = useWallets();

  if (!ready) {
    return (
      <button
        disabled
        className="bg-surface-container-low rounded-lg text-on-surface-variant px-5 py-2 text-xs font-bold uppercase tracking-widest opacity-50 cursor-not-allowed"
      >
        Loading...
      </button>
    );
  }

  if (authenticated) {
    const address = wallets[0]?.address;
    const truncated = address
      ? `${address.slice(0, 6)}...${address.slice(-4)}`
      : "No Wallet";

    return (
      <div className="flex items-center gap-3">
        <div className="hidden lg:flex items-center gap-2 px-3 py-1 bg-sky border border-bleu/15 rounded-lg">
          <span className="w-1.5 h-1.5 bg-success rounded-full animate-pulse" />
          <span className="text-[11px] font-medium uppercase tracking-wider text-success">
            Connected
          </span>
        </div>
        <button
          onClick={logout}
          className="bg-surface-container-lowest text-primary px-4 py-2 text-xs font-bold uppercase tracking-widest rounded-lg border border-outline-variant/15 hover:border-bleu/20 transition-all active:scale-95 flex items-center gap-2"
        >
          <span className="material-symbols-outlined text-sm text-bleu">
            account_balance_wallet
          </span>
          {truncated}
        </button>
      </div>
    );
  }

  return (
    <button
      onClick={login}
      className="signature-gradient text-on-primary px-5 py-2 font-headline font-bold text-xs rounded-lg uppercase tracking-widest hover:brightness-110 active:scale-95 transition-all"
    >
      Connect Wallet
    </button>
  );
}
