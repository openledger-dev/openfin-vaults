import path from "path";
import type { NextConfig } from "next";

// Optional wagmi/Reown connector peer deps — not needed at runtime.
const STUB_PACKAGES = [
  "@base-org/account",
  "@coinbase/wallet-sdk",
  "@metamask/sdk",
  "porto",
  "porto/internal",
  "@walletconnect/ethereum-provider",
  "pino-pretty",
  "lokijs",
  "encoding",
];

const nextConfig: NextConfig = {
  outputFileTracingRoot: process.cwd(),

  // Turbopack (used for `next build`)
  turbopack: {
    resolveAlias: Object.fromEntries(
      STUB_PACKAGES.map((pkg) => [pkg, path.resolve("./src/lib/empty.ts")])
    ),
  },

  // Webpack (used for `next dev --webpack`)
  // Setting alias to `false` tells webpack to resolve the module as an empty
  // object without bundling anything — no stub file needed, no watchpack noise.
  webpack: (config) => {
    STUB_PACKAGES.forEach((pkg) => {
      config.resolve.alias[pkg] = false;
    });
    return config;
  },

  sassOptions: {
    silenceDeprecations: ["legacy-js-api"],
  },
};

export default nextConfig;
