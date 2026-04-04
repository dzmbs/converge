"use client";

import { PrivyProvider } from "@privy-io/react-auth";

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <PrivyProvider
      appId={process.env.NEXT_PUBLIC_PRIVY_APP_ID!}
      config={{
        appearance: {
          theme: "light",
          accentColor: "#002f6c",
          showWalletLoginFirst: true,
          walletList: [
            "detected_ethereum_wallets",
            "metamask",
            "coinbase_wallet",
            "phantom",
            "rainbow",
            "zerion",
            "wallet_connect",
          ],
        },
        loginMethods: ["wallet", "email", "google"],
        embeddedWallets: {
          ethereum: { createOnLogin: "users-without-wallets" },
        },
      }}
    >
      {children}
    </PrivyProvider>
  );
}
