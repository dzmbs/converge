import { createConfig, http } from "wagmi";
import { arcTestnet, baseSepolia } from "./chains";

export const wagmiConfig = createConfig({
  chains: [arcTestnet, baseSepolia],
  transports: {
    [arcTestnet.id]: http(),
    [baseSepolia.id]: http(),
  },
  ssr: true,
});
