"use client";

import { PrivyProvider } from "@privy-io/react-auth";
import { WagmiProvider } from "@privy-io/wagmi";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { wagmiConfig } from "@/lib/wagmi";
import { arcTestnet, baseSepolia } from "@/lib/chains";
import { PoolProvider } from "@/components/PoolProvider";

const queryClient = new QueryClient();

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
        supportedChains: [arcTestnet, baseSepolia],
        defaultChain: arcTestnet,
      }}
    >
      <QueryClientProvider client={queryClient}>
        <WagmiProvider config={wagmiConfig}>
          <PoolProvider>
            {children}
          </PoolProvider>
        </WagmiProvider>
      </QueryClientProvider>
    </PrivyProvider>
  );
}
