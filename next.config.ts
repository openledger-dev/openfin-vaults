import type { NextConfig } from "next";

/** Relative to project root — Turbopack rejects absolute paths in resolveAlias. */
const EMPTY_STUB = "./src/lib/empty.ts";

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

  // Keep Node.js-only packages out of the browser bundle.
  // ioredis (and viem's transports) use stream/net/tls which don't exist in browsers.
  serverExternalPackages: ["ioredis"],

  // Turbopack (used for `next build`)
  turbopack: {
    resolveAlias: Object.fromEntries(
      STUB_PACKAGES.map((pkg) => [pkg, EMPTY_STUB])
    ),
  },

  // Webpack (used for `next dev --webpack`)
  // Setting alias to `false` tells webpack to resolve the module as an empty
  // object without bundling anything — no stub file needed, no watchpack noise.
  webpack: (config, { isServer }) => {
    STUB_PACKAGES.forEach((pkg) => {
      config.resolve.alias[pkg] = false;
    });

    if (isServer) {
      // ioredis depends on Node.js built-ins (stream, net, tls) that webpack
      // cannot resolve in some server compilation passes (e.g. instrumentation).
      // Externalising it here means webpack emits `require("ioredis")` and lets
      // Node.js resolve it at runtime — the same intent as serverExternalPackages.
      const prev = Array.isArray(config.externals) ? config.externals : [];
      config.externals = [...prev, "ioredis"];
    }

    return config;
  },

  sassOptions: {
    silenceDeprecations: ["legacy-js-api"],
  },
};

export default nextConfig;
