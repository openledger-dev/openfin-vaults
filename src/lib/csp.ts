/**
 * Content Security Policy (CSP) for OpenFin.
 *
 * Addresses security audit finding OPE-7.
 *
 * Toggle enforcement:
 *   CSP_REPORT_ONLY=true   → Content-Security-Policy-Report-Only (default, safe rollout)
 *   CSP_REPORT_ONLY=false  → Content-Security-Policy (enforcement)
 *
 * Optional violation reporting:
 *   CSP_REPORT_URI=https://your-collector.example/csp
 *
 * Deployment-specific RPC origins (browser-visible NEXT_PUBLIC_* only):
 *   CSP_ADDITIONAL_CONNECT_SRC=https://mainnet.infura.io,https://base-mainnet.infura.io
 */

// ── Static third-party origins (audited against src/ + @reown/appkit) ─────────

/** Reown AppKit / WalletConnect — wallet modal, relay, RPC proxy, analytics */
const REOWN_WALLETCONNECT_CONNECT = [
  "https://api.web3modal.org", // wallet list, images API, auth (AppKit)
  "https://rpc.walletconnect.org", // blockchain RPC proxy (wagmi adapter)
  "https://pulse.walletconnect.org", // AppKit analytics (features.analyti
  // cs: true)
  "wss://relay.walletconnect.org", // WalletConnect v2 relay
] as const;

/** Reown AppKit — embedded verification iframe */
const REOWN_WALLETCONNECT_FRAME = [
  "https://verify.walletconnect.com",
  "https://verify.walletconnect.org",
  "https://secure.walletconnect.org", // secure site SDK origin (AppKit common)
] as const;

/** Reown AppKit — brand fonts + wallet/asset images served from API */
const REOWN_FONT = ["https://fonts.reown.com"] as const;
const REOWN_IMG = [
  "https://api.web3modal.org", // getWalletImage / getAssetImage
  "https://token-icons.s3.amazonaws.com", // fallback token icons in AppKit tests/utilities
] as const;

/**
 * Public EVM RPC fallbacks referenced in src/lib/viemClient.ts and src/lib/onchain.ts.
 * Included for connect-src in case a future client hook reads chain data directly.
 * Server-side API routes are unaffected by browser CSP.
 */
const PUBLIC_RPC_CONNECT = [
  "https://eth.llamarpc.com",
  "https://base.llamarpc.com",
  "https://optimism.llamarpc.com",
  "https://arbitrum.llamarpc.com",
  "https://eth.drpc.org",
  "https://base.drpc.org",
  "https://optimism.drpc.org",
  "https://arbitrum.drpc.org",
] as const;

/** OpenGraph / branding (metadata; social crawlers; no runtime img in UI today) */
const BRANDING_IMG = ["https://cdn.openledger.xyz"] as const;

/** GitHub avatar used in Reown AppKit metadata (context/index.tsx) */
const METADATA_IMG = ["https://avatars.githubusercontent.com"] as const;

// ── Env helpers ───────────────────────────────────────────────────────────────

function parseEnvOrigins(envKey: string): string[] {
  const raw = process.env[envKey];
  if (!raw?.trim()) return [];
  return raw
    .split(",")
    .map((part) => originFromUrl(part.trim()))
    .filter((o): o is string => Boolean(o));
}

function rpcOriginsFromEnv(): string[] {
  const keys = [
    "NEXT_PUBLIC_RPC_URL_1",
    "NEXT_PUBLIC_RPC_URL_10",
    "NEXT_PUBLIC_RPC_URL_8453",
    "NEXT_PUBLIC_RPC_URL_42161",
  ] as const;
  return keys
    .map((key) => originFromUrl(process.env[key]))
    .filter((o): o is string => Boolean(o));
}

/** Extract `https://host` from a full URL; undefined when invalid. */
export function originFromUrl(url: string | undefined): string | undefined {
  if (!url?.trim()) return undefined;
  try {
    return new URL(url.trim()).origin;
  } catch {
    return undefined;
  }
}

/** When true, send Content-Security-Policy-Report-Only instead of enforcing. */
export function isCspReportOnly(): boolean {
  const flag = process.env.CSP_REPORT_ONLY;
  if (flag === undefined || flag === "") return true; // safe default
  return flag !== "false" && flag !== "0";
}

export type CspBuildOptions = {
  /** Per-request nonce (base64) for script-src; generated in middleware. */
  nonce: string;
  /** NODE_ENV === "development" — relaxes script-src for webpack HMR. */
  isDev?: boolean;
};

/**
 * Builds the complete CSP directive string.
 * All external domains used by the app are listed explicitly (no https: wildcards).
 */
export function buildContentSecurityPolicy(options: CspBuildOptions): string {
  const { nonce, isDev = false } = options;

  const connectSrc = [
    "'self'",
    ...REOWN_WALLETCONNECT_CONNECT,
    ...PUBLIC_RPC_CONNECT,
    ...rpcOriginsFromEnv(),
    ...parseEnvOrigins("CSP_ADDITIONAL_CONNECT_SRC"),
  ];

  const imgSrc = [
    "'self'",
    "data:",
    "blob:",
    ...BRANDING_IMG,
    ...METADATA_IMG,
    ...REOWN_IMG,
  ];

  const fontSrc = ["'self'", "data:", ...REOWN_FONT];

  // Next.js applies the request x-nonce header to its own script tags automatically.
  // strict-dynamic allows scripts loaded by a trusted (nonced) root script.
  // unsafe-eval is required only for webpack dev / HMR — not for production builds.
  const scriptSrc = [
    "'self'",
    `'nonce-${nonce}'`,
    "'strict-dynamic'",
    ...(isDev ? ["'unsafe-eval'"] : []),
  ];

  // Tailwind utility classes, next-themes, and Reown AppKit web components inject
  // element-level style attributes; blocking these breaks layout and the wallet modal.
  const styleSrc = ["'self'", "'unsafe-inline'"];

  const directives: string[] = [
    "default-src 'self'",
    `script-src ${scriptSrc.join(" ")}`,
    `style-src ${styleSrc.join(" ")}`,
    `img-src ${imgSrc.join(" ")}`,
    `font-src ${fontSrc.join(" ")}`,
    `connect-src ${connectSrc.join(" ")}`,
    `frame-src 'self' ${REOWN_WALLETCONNECT_FRAME.join(" ")}`,
    "frame-ancestors 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "object-src 'none'",
    "worker-src 'self' blob:",
    "manifest-src 'self'",
  ];

  const reportUri = process.env.CSP_REPORT_URI?.trim();
  if (reportUri) {
    directives.push(`report-uri ${reportUri}`);
  }

  // Avoid upgrading localhost HTTP during local development.
  if (!isDev) {
    directives.push("upgrade-insecure-requests");
  }

  return directives.join("; ");
}
