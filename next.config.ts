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
  // @wagmi/core "tempo" experimental connector — requires a Cloudflare
  // "accounts" peer dep that is not installed. Stubbing prevents a
  // webpack "module not found" build error (app does not use Tempo connectors).
  "accounts",
  // @wagmi/connectors@8.0.15 MetaMask connector peer dep — not needed since
  // MetaMask is handled via WalletConnect / Reown AppKit, not the direct SDK.
  "@metamask/connect-evm",
];

const nextConfig: NextConfig = {
  // Produce a self-contained server bundle under .next/standalone/.
  // The runner stage copies only that folder + static assets, keeping the
  // final Docker image free of node_modules (~60-80% smaller).
  output: "standalone",
  outputFileTracingRoot: process.cwd(),

  // ── HTTP security headers ────────────────────────────────────────────────
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          // Prevent clickjacking — disallow embedding in iframes
          { key: "X-Frame-Options", value: "DENY" },
          // Prevent MIME-type sniffing
          { key: "X-Content-Type-Options", value: "nosniff" },
          // Don't send full URL as Referer to third parties
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          // Restrict access to browser features not needed by this app
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=()" },
          // Enforce HTTPS for future visits (1 year, include subdomains)
          { key: "Strict-Transport-Security", value: "max-age=31536000; includeSubDomains" },
          // CSP: tightened for a DeFi app that only talks to known origins.
          // - script-src: Next.js needs 'self' + inline scripts for hydration
          // - connect-src: wallet RPCs, 1Click API, NEAR intents explorer, Morpho GraphQL, Midas API, WalletConnect relay
          // - frame-src: WalletConnect QR modal uses an iframe
          { key: "Content-Security-Policy", value: [
            "default-src 'self'",
            "script-src 'self' 'unsafe-inline' 'unsafe-eval'",
            "style-src 'self' 'unsafe-inline'",
            "img-src 'self' data: https:",
            "font-src 'self' data: https://fonts.reown.com",
            "connect-src 'self' https: wss:",
            "frame-src 'self' https://verify.walletconnect.com https://verify.walletconnect.org",
            "object-src 'none'",
            "base-uri 'self'",
            "form-action 'self'",
            "upgrade-insecure-requests",
          ].join("; ") },
        ],
      },
    ];
  },

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
