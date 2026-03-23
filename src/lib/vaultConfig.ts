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
  address: `0x${string}`;
  /**
   * Supported deposit/redeem assets for this vault.
   * These are the assets registered in the vault's IUltraVaultRateProvider.
   *
   * Why static? Discovering assets on-chain requires fetching event logs
   * from the rateProvider going back to the contract's deployment — expensive
   * and unreliable across public RPCs. Configuring them here is instant,
   * free, and always accurate.
   */
  assets?: AssetConfig[];
};

export type PlatformConfig = {
  id: string;
  label: string;
  description: string;
  vaults: PlatformVaultEntry[];
};

function parseAddresses(env: string | undefined): `0x${string}`[] {
  if (!env) return [];
  return env
    .split(",")
    .map((a) => a.trim())
    .filter((a) => /^0x[0-9a-fA-F]{40}$/.test(a)) as `0x${string}`[];
}

/**
 * Static asset configuration for each vault, keyed by lowercase vault address.
 * Must be declared BEFORE VAULT_PLATFORMS to avoid a temporal dead zone error.
 *
 * To add assets for a new vault:
 *   "0x<vault_address_lowercase>": {
 *     assets: [
 *       { address: "0x...", symbol: "USDC", decimals: 6, isPegged: false },
 *       { address: "0x...", symbol: "USDT", decimals: 6, isPegged: true },
 *     ],
 *   },
 */
const VAULT_ASSET_CONFIG: Record<string, { assets: AssetConfig[] }> = {
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

  // ── UltraYield vault 2 (0xc46e...7908) ────────────────────────────────────
  // "0xc46efcc8e39c8f02425e367423871cd4633b7908": {
  //   assets: [
  //     { address: "0x...", symbol: "WETH", decimals: 18, isPegged: false },
  //   ],
  // },

  // ── UltraYield vault 3 (0x4724...914F) ────────────────────────────────────
  // "0x472425cc95be779126afa4aa17980210d299914f": {
  //   assets: [
  //     { address: "0x...", symbol: "WBTC", decimals: 8, isPegged: false },
  //   ],
  // },
};

/**
 * Central platform + vault registry.
 *
 * Adding a vault:
 *   1. Add its address to NEXT_PUBLIC_ULTRAYIELD_VAULT_ADDR in .env.local
 *   2. Add a matching entry in VAULT_ASSET_CONFIG above for the same address
 *
 * Adding a new platform (e.g. Morpho):
 *   Uncomment and fill in the morpho block below, then set
 *   NEXT_PUBLIC_MORPHO_VAULT_ADDR in .env.local.
 */
export const VAULT_PLATFORMS: PlatformConfig[] = [
  {
    id: "ultrayield",
    label: "UltraYield Vaults",
    description:
      "Institutional-grade yield vaults with async redemptions (ERC-7540)",
    vaults: parseAddresses(
      process.env.NEXT_PUBLIC_ULTRAYIELD_VAULT_ADDR
    ).map((address) => ({
      address,
      ...VAULT_ASSET_CONFIG[address.toLowerCase()],
    })),
  },
  // {
  //   id: "morpho",
  //   label: "Morpho Vaults",
  //   description: "Permissionless lending markets on Morpho Blue.",
  //   vaults: parseAddresses(process.env.NEXT_PUBLIC_MORPHO_VAULT_ADDR).map(
  //     (address) => ({ address, ...VAULT_ASSET_CONFIG[address.toLowerCase()] })
  //   ),
  // },
];
