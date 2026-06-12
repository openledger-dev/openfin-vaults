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
  // Remove the X-Powered-By: Next.js header to prevent technology fingerprinting (OPE-20).
  poweredByHeader: false,

  env: {
    NEXT_PUBLIC_SHOW_ALLOCATION:
      process.env.NEXT_PUBLIC_SHOW_ALLOCATION ?? process.env.SHOW_ALLOCATION ?? "false",
  },

  // Produce a self-contained server bundle under .next/standalone/.
  // The runner stage copies only that folder + static assets, keeping the
  // final Docker image free of node_modules (~60-80% smaller).
  output: "standalone",
  outputFileTracingRoot: process.cwd(),

  // ── HTTP security headers ────────────────────────────────────────────────
  async headers() {
    // The app's canonical origin — used as the explicit CORS allowed origin so
    // that third-party sites cannot call our API routes cross-origin.
    const appOrigin =
      process.env.NEXT_PUBLIC_APP_URL ?? "https://openfin.openledger.xyz";

    return [
      // ── Applied to every response (pages + API + static assets) ───────────
      {
        source: "/(.*)",
        headers: [
          // Prevent clickjacking — legacy coverage for browsers without CSP.
          { key: "X-Frame-Options", value: "DENY" },
          // Prevent MIME-type sniffing.
          { key: "X-Content-Type-Options", value: "nosniff" },
          // Don't send full URL as Referer to third parties.
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          // Restrict browser features not needed by this app.
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=()" },
          // max-age=63072000 satisfies the minimum for hstspreload.org submission.
          // Primary enforcement is at the Cloudflare edge (covers ports 2053/2083/2087/2096).
          // This origin header is defense-in-depth (OPE-17).
          { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" },          // Prevent other origins from loading any resource from this server
          // (via <img>, <script>, fetch, etc.) unless it's the same origin.
          { key: "Cross-Origin-Resource-Policy", value: "same-origin" },
          // Isolate the browsing context from cross-origin documents while
          // still allowing popups — required for wallet connection flows that
          // open a separate window (WalletConnect mobile, MetaMask, etc.).
          { key: "Cross-Origin-Opener-Policy", value: "same-origin-allow-popups" },
          // CSP is set in src/middleware.ts (nonce-based, report-only by default).
          // See src/lib/csp.ts for the full directive list and domain inventory.
        ],
      },

      // ── Explicit least-privilege CORS policy for all API routes ───────────
      // These routes are Backend-For-Frontend proxies; they carry server-side
      // API keys and must not be callable from arbitrary third-party origins.
      // Setting Access-Control-Allow-Origin to the app's own canonical URL
      // (never wildcard) means the browser will block cross-origin requests
      // from any other origin at the preflight/response stage.
      // POST routes (swap/quote, swap/submit) also export an OPTIONS handler
      // in src/lib/cors.ts to answer CORS preflights correctly.
      {
        source: "/api/(.*)",
        headers: [
          { key: "Access-Control-Allow-Origin",  value: appOrigin },
          { key: "Access-Control-Allow-Methods", value: "GET, POST, OPTIONS" },
          { key: "Access-Control-Allow-Headers", value: "Content-Type" },
          // Vary: Origin is required whenever ACAO is not wildcard — tells
          // CDNs/proxies not to serve a cached response to a different origin.
          { key: "Vary", value: "Origin" },
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
