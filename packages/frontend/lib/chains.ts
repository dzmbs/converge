import { defineChain } from "viem";
import { baseSepolia } from "viem/chains";

export const arcTestnet = defineChain({
  id: 5_042_002,
  name: "Arc Testnet",
  nativeCurrency: { name: "USD Coin", symbol: "USDC", decimals: 18 },
  rpcUrls: {
    default: { http: ["https://rpc.testnet.arc.network"] },
  },
  blockExplorers: {
    default: { name: "ArcScan", url: "https://testnet.arcscan.app" },
  },
  testnet: true,
});

export { baseSepolia };

export const supportedChains = [arcTestnet, baseSepolia] as const;

export type SupportedChainId = (typeof supportedChains)[number]["id"];
