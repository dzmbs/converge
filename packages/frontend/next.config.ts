import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  images: {
    remotePatterns: [
      { hostname: "lh3.googleusercontent.com" },
      { hostname: "cryptologos.cc" },
      { hostname: "assets.coingecko.com" },
    ],
  },
};

export default nextConfig;
