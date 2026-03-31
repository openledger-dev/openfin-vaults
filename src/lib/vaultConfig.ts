// ── Platform kind discriminator ───────────────────────────────────────────────

/**
 * Identifies the contract interface a vault uses, driving:
 *   - which on-chain calls are made (adapter hook)
 *   - which action modal is shown
 *   - how APY is sourced
 */
export type PlatformKind = "ultrayield" | "morpho" | "midas";

// ── Asset configuration ────────────────────────────────────────────────────────

export type AssetConfig = {
  address: `0x${string}`;
  symbol: string;
  decimals: number;
  /** true = 1:1 peg to the vault's base asset (e.g. USDT when base is USDC) */
  isPegged: boolean;
};

// ── Vault + Platform configuration ────────────────────────────────────────────

export type PlatformVaultEntry = {
  /** Share token address (ERC-20 on all platforms) */
  address: `0x${string}`;
  /** Contract interface used by this vault */
  kind: PlatformKind;
  /**
   * Per-vault chain override.
   * When set, takes precedence over PlatformConfig.chainId for all on-chain
   * calls and block-explorer links for this vault. Useful for platforms that
   * span multiple networks (e.g. Morpho vaults on Ethereum + Base).
   */
  chainId?: number;
  /**
   * Supported deposit/redeem assets for this vault.
   * Configured statically — avoids expensive event-log discovery.
   */
  assets?: AssetConfig[];

  // ── Midas-only fields ──────────────────────────────────────────────────────
  /** Midas Deposit Vault contract address */
  depositVaultAddress?: `0x${string}`;
  /** Midas Redemption Vault contract address */
  redemptionVaultAddress?: `0x${string}`;
  /**
   * Midas REST API token key (lowercase) as returned by:
   *   https://api-prod.midas.app/api/data/apys
   *   https://api-prod.midas.app/api/data/prices
   * e.g. "mmev", "mtbill", "mbasis"
   */
  midasApiKey?: string;
};

export type PlatformConfig = {
  id: string;
  label: string;
  description: string;
  kind: PlatformKind;
  /**
   * EVM chain ID for all vaults in this platform.
   * Passed to every useReadContracts call so wagmi queries the correct chain
   * regardless of which chain the user's wallet is connected to.
   * Defaults to 1 (Ethereum mainnet) when not set.
   */
  chainId: number;
  vaults: PlatformVaultEntry[];
};

// ── Helpers ───────────────────────────────────────────────────────────────────

function parseAddresses(env: string | undefined): `0x${string}`[] {
  if (!env) return [];
  return env
    .split(",")
    .map((a) => a.trim())
    .filter((a) => /^0x[0-9a-fA-F]{40}$/.test(a)) as `0x${string}`[];
}

function parseChainId(env: string | undefined, fallback: number): number {
  const n = parseInt(env ?? "", 10);
  return isNaN(n) ? fallback : n;
}

/**
 * Parses a comma-separated list of vault addresses that may carry an optional
 * per-vault chain suffix in the form `address@chainId`.
 *
 * Examples:
 *   "0xBEEF@1,0xeE8F@8453"   → [{address: "0xBEEF", chainId: 1}, {address: "0xeE8F", chainId: 8453}]
 *   "0xBEEF,0xeE8F"          → [{address: "0xBEEF"}, {address: "0xeE8F"}]  (chainId undefined)
 */
function parseAddressesWithOptionalChain(
  env: string | undefined
): Array<{ address: `0x${string}`; chainId?: number }> {
  if (!env) return [];
  return env
    .split(",")
    .flatMap((part) => {
      const [rawAddr, chainStr] = part.trim().split("@");
      const address = rawAddr.trim();
      if (!/^0x[0-9a-fA-F]{40}$/.test(address)) return [];
      const chainId = chainStr ? parseInt(chainStr.trim(), 10) : undefined;
      return [{ address: address as `0x${string}`, chainId: chainId && !isNaN(chainId) ? chainId : undefined }];
    });
}

// ── UltraYield static asset config ────────────────────────────────────────────

/**
 * Static asset configuration for UltraYield vaults, keyed by lowercase address.
 *
 * To add a new UltraYield vault:
 *   1. Set NEXT_PUBLIC_ULTRAYIELD_VAULT_ADDR in .env.local
 *   2. Add a matching entry here
 */
const ULTRAYIELD_ASSET_CONFIG: Record<string, Pick<PlatformVaultEntry, "assets">> = {
  // ── UltraYield USD (0x5463...bca1) ────────────────────────────────────────
  "0x546329a16dcedc46e93f7b03a65f49a84700bca1": {
    assets: [
      {
        address: "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48",
        symbol: "USDC",
        decimals: 6,
        isPegged: false,
      },
      {
        address: "0xdAC17F958D2ee523a2206206994597C13D831ec7",
        symbol: "USDT",
        decimals: 6,
        isPegged: true,
      },
    ],
  },
};

// ── Midas static vault config ─────────────────────────────────────────────────

/**
 * Static configuration for known Midas token vaults on Ethereum mainnet.
 *
 * Each entry maps the share-token address → Midas-specific fields:
 *   depositVaultAddress   — calls depositInstant(tokenIn, amountToken18, 0, referrerId)
 *   redemptionVaultAddress — calls redeemInstant / redeemRequest
 *   midasApiKey           — lowercase key used in /api/data/apys and /api/data/prices
 *   assets                — optional static payment-token list; if omitted, the hook
 *                           falls back to getPaymentTokens() on the deposit vault
 *
 * To add a new vault:
 *   1. Add its share-token address to NEXT_PUBLIC_MIDAS_VAULT_ADDR in .env.local
 *   2. Add an entry here (contract addresses are published by Midas at deploy time)
 *
 * Source: https://ludicrous-rate-748.notion.site/Midas-Vaults-Integration-Public
 * All addresses below are Ethereum mainnet (chainId 1).
 */
const MIDAS_VAULT_CONFIG: Record<
  string,
  Pick<PlatformVaultEntry, "depositVaultAddress" | "redemptionVaultAddress" | "midasApiKey" | "assets">
> = {
  // ── mTBILL — Midas T-Bill token ───────────────────────────────────────────
  "0xdd629e5241cbc5919847783e6c96b2de4754e438": {
    depositVaultAddress:    "0x99361435420711723aF805F08187c9E6bF796683",
    redemptionVaultAddress: "0x0312A9D1Ff2372DDEdCBB21e4B6389aFc919aC4b",
    midasApiKey: "mtbill",
    assets: [
      { address: "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48", symbol: "USDC", decimals: 6, isPegged: false },
      { address: "0xdAC17F958D2ee523a2206206994597C13D831ec7", symbol: "USDT", decimals: 6, isPegged: true  },
    ],
  },

  // ── mBASIS — Midas Basis Trading token ───────────────────────────────────
  "0x2a8c22e3b10036f3aef5875d04f8441d4188b656": {
    depositVaultAddress:    "0x986C7d0fF6D54AC87BDdb5EdeF53C5B0c3Aa6045",
    redemptionVaultAddress: "0x7bd3C30dDEbB17F9C5DfCa2fB3f5AB7bB56CD3F",
    midasApiKey: "mbasis",
    assets: [
      { address: "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48", symbol: "USDC", decimals: 6, isPegged: false },
      { address: "0xdAC17F958D2ee523a2206206994597C13D831ec7", symbol: "USDT", decimals: 6, isPegged: true  },
    ],
  },

  // ── mMEV — Midas MEV Capture token ───────────────────────────────────────
  // Addresses shared by Midas at deployment — replace if rotated.
  // "0x<mmev_share_token>": {
  //   depositVaultAddress:    "0x<mev_deposit_vault>",
  //   redemptionVaultAddress: "0x<mev_redemption_vault>",
  //   midasApiKey: "mmev",
  //   assets: [
  //     { address: "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48", symbol: "USDC", decimals: 6, isPegged: false },
  //     { address: "0xdAC17F958D2ee523a2206206994597C13D831ec7", symbol: "USDT", decimals: 6, isPegged: true  },
  //   ],
  // },
};

// ── Morpho static vault config ────────────────────────────────────────────────

/**
 * Morpho MetaMorpho vaults are pure ERC-4626 — no extra fields needed.
 * APY is pulled from the Morpho GraphQL API using the vault address as key.
 *
 * To add a Morpho vault:
 *   1. Add its address to NEXT_PUBLIC_MORPHO_VAULT_ADDR in .env.local
 *   2. Optionally add static asset config below if getPaymentTokens is unavailable
 */
const MORPHO_ASSET_CONFIG: Record<string, Pick<PlatformVaultEntry, "assets">> = {
  // "0x<morpho_vault>": {
  //   assets: [
  //     { address: "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48", symbol: "USDC", decimals: 6, isPegged: false },
  //   ],
  // },
};

// ── Central platform + vault registry ────────────────────────────────────────

export const VAULT_PLATFORMS: PlatformConfig[] = [
  // ── UltraYield ──────────────────────────────────────────────────────────────
  // Set NEXT_PUBLIC_ULTRAYIELD_CHAIN_ID (default: 1 = Ethereum mainnet)
  {
    id: "ultrayield",
    label: "UltraYield Vaults",
    description: "Institutional-grade yield vaults with async redemptions (ERC-7540)",
    kind: "ultrayield",
    chainId: parseChainId(process.env.NEXT_PUBLIC_ULTRAYIELD_CHAIN_ID, 1),
    vaults: parseAddresses(process.env.NEXT_PUBLIC_ULTRAYIELD_VAULT_ADDR).map(
      (address) => ({
        address,
        kind: "ultrayield" as const,
        ...ULTRAYIELD_ASSET_CONFIG[address.toLowerCase()],
      })
    ),
  },

  // ── Morpho ──────────────────────────────────────────────────────────────────
  // Vaults may span multiple networks. Use address@chainId syntax in
  // NEXT_PUBLIC_MORPHO_VAULT_ADDR to specify per-vault chains, e.g.:
  //   0xBEEF@1,0xeE8F@8453
  // NEXT_PUBLIC_MORPHO_CHAIN_ID is used as the fallback when no @chainId is given.
  {
    id: "morpho",
    label: "Morpho Vaults",
    description: "Permissionless ERC-4626 lending vaults curated on Morpho Blue",
    kind: "morpho",
    chainId: parseChainId(process.env.NEXT_PUBLIC_MORPHO_CHAIN_ID, 1),
    vaults: parseAddressesWithOptionalChain(process.env.NEXT_PUBLIC_MORPHO_VAULT_ADDR).map(
      ({ address, chainId }) => ({
        address,
        kind: "morpho" as const,
        ...(chainId !== undefined ? { chainId } : {}),
        ...MORPHO_ASSET_CONFIG[address.toLowerCase()],
      })
    ),
  },

  // ── Midas ───────────────────────────────────────────────────────────────────
  // Set NEXT_PUBLIC_MIDAS_CHAIN_ID (default: 1 = Ethereum mainnet)
  {
    id: "midas",
    label: "Midas Vaults",
    description: "Real-world asset tokens with instant and async redemptions",
    kind: "midas",
    chainId: parseChainId(process.env.NEXT_PUBLIC_MIDAS_CHAIN_ID, 1),
    vaults: parseAddresses(process.env.NEXT_PUBLIC_MIDAS_VAULT_ADDR).map(
      (address) => ({
        address,
        kind: "midas" as const,
        ...MIDAS_VAULT_CONFIG[address.toLowerCase()],
      })
    ),
  },
];
