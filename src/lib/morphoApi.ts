/**
 * Thin wrapper around the Morpho Vaults V2 GraphQL API.
 *
 * Endpoint: https://api.morpho.org/graphql
 *
 * Docs: https://docs.morpho.org/tools/offchain/api/morpho-vaults/
 */

import { fetchWithTimeout, HEAVY_TIMEOUT_MS } from "@/lib/fetchWithTimeout";

const MORPHO_GRAPHQL_V2 = "https://api.morpho.org/graphql";

export type MorphoVaultApy = {
  address: string;
  /** Vault name from the Morpho API (used as fallback when on-chain name() fails). */
  name: string | null;
  /** Vault symbol from the Morpho API. */
  symbol: string | null;
  /** Net APY as a decimal (0.05 = 5%). From GraphQL avgNetApy. */
  weeklyNetApy: number | null;
  /** Net APY excluding reward incentives. From GraphQL avgNetApyExcludingRewards. */
  avgNetApyExcludingRewards: number | null;
  /** Total assets in the vault (USD). */
  totalAssetsUsd: number | null;
  /**
   * Performance fee as a decimal fraction (0.05 = 5%).
   * GraphQL: performanceFee. Fallback when on-chain performanceFee() is unavailable.
   */
  performanceFee: number | null;
  /** Management fee as a decimal fraction (0.01 = 1%). GraphQL: managementFee. */
  managementFee: number | null;
  /** Max rate cap (WAD-scaled bigint from API). */
  maxRate: string | null;
  /**
   * Available liquidity in raw asset units (string to preserve precision).
   * GraphQL: liquidity (immediately withdrawable amount).
   */
  liquidity: string | null;
};

/** Convert Morpho API fee decimal (0.05 = 5%) to on-chain WAD (1e18 = 100%). */
export function morphoApiFeeToWad(fee: number): bigint {
  return BigInt(Math.round(fee * 1e18));
}

/** Prefer Morpho GraphQL fee (authoritative for V2); fall back to on-chain WAD. */
export function resolveMorphoFee(
  apiFee: number | null | undefined,
  onChainWad: bigint | undefined,
): bigint | undefined {
  if (apiFee != null) return morphoApiFeeToWad(apiFee);
  return onChainWad;
}

// ── Morpho Vaults V2 (api.morpho.org) ────────────────────────────────────────

const VAULT_APY_QUERY_V2 = /* graphql */ `
  query VaultV2Apys($addresses: [String!]!, $chainId: Int!) {
    vaultV2s(
      first: 200
      where: { address_in: $addresses, chainId_in: [$chainId] }
    ) {
      items {
        address
        name
        symbol
        avgNetApy
        avgNetApyExcludingRewards
        totalAssetsUsd
        performanceFee
        managementFee
        maxRate
        liquidity
      }
    }
  }
`;

async function fetchV2Apys(
  addresses: string[],
  chainId: number
): Promise<Record<string, MorphoVaultApy>> {
  const res = await fetchWithTimeout(
    MORPHO_GRAPHQL_V2,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        query: VAULT_APY_QUERY_V2,
        variables: { addresses, chainId },
      }),
      next: { revalidate: 300 },
    } as RequestInit,
    HEAVY_TIMEOUT_MS,
  );
  if (!res.ok) throw new Error(`Morpho V2 API fetch failed: ${res.status}`);

  const json = (await res.json()) as {
    data?: {
      vaultV2s?: {
        items?: Array<{
          address: string;
          name?: string | null;
          symbol?: string | null;
          avgNetApy?: number | null;
          avgNetApyExcludingRewards?: number | null;
          totalAssetsUsd?: number | null;
          performanceFee?: number | null;
          managementFee?: number | null;
          maxRate?: number | string | null;
          liquidity?: number | string | null;
        }>;
      };
    };
    errors?: unknown[];
  };

  if (json.errors?.length) console.warn("[morphoApi V2] GraphQL errors:", json.errors);

  const result: Record<string, MorphoVaultApy> = {};
  for (const item of json.data?.vaultV2s?.items ?? []) {
    result[item.address.toLowerCase()] = {
      address: item.address,
      name: item.name ?? null,
      symbol: item.symbol ?? null,
      performanceFee: item.performanceFee ?? null,
      managementFee: item.managementFee ?? null,
      maxRate: item.maxRate != null ? String(item.maxRate) : null,
      liquidity: item.liquidity != null ? String(item.liquidity) : null,
      weeklyNetApy: item.avgNetApy ?? null,
      avgNetApyExcludingRewards: item.avgNetApyExcludingRewards ?? null,
      totalAssetsUsd: item.totalAssetsUsd ?? null,
    };
  }
  return result;
}

// ── Morpho V2 Allocation ──────────────────────────────────────────────────────

/**
 * A single normalised row in the allocation table.
 *
 * Display rules (per Morpho docs):
 *   MorphoMarketV1Adapter — expand into per-position rows using
 *     position.state.supplyAssetsUsd; do NOT also count adapter.assetsUsd.
 *   MetaMorphoAdapter / MorphoVaultV2Adapter — one row per adapter using
 *     adapter.assetsUsd.
 *   Idle — one row using vault.idleAssetsUsd.
 */
export type MorphoAllocationItem = {
  /** Human-readable label for the row */
  name: string;
  /** USD notional value */
  assetsUsd: number;
  /** Adapter/row category for optional badge/colour differentiation */
  type: "market" | "meta_vault" | "inner_vault" | "idle";
  /** Morpho market ID — present only for type === "market" */
  marketId?: string;
};

export type MorphoV2Allocation = {
  address: string;
  totalAssetsUsd: number;
  idleAssetsUsd: number;
  items: MorphoAllocationItem[];
};

const VAULT_ALLOCATION_QUERY_V2 = /* graphql */ `
  query VaultV2Allocation($address: String!, $chainId: Int!) {
    vaultV2ByAddress(address: $address, chainId: $chainId) {
      address
      totalAssetsUsd
      idleAssetsUsd
      adapters(first: 20) {
        items {
          __typename
          address
          assets
          assetsUsd
          type
          ... on MorphoMarketV1Adapter {
            positions(first: 50) {
              items {
                market {
                  marketId
                  collateralAsset { symbol }
                  loanAsset { symbol }
                }
                state {
                  supplyAssets
                  supplyAssetsUsd
                }
              }
            }
          }
          ... on MetaMorphoAdapter {
            metaMorpho {
              address
              name
              asset { symbol }
            }
          }
          ... on MorphoVaultV2Adapter {
            innerVault {
              address
              name
              asset { symbol }
            }
          }
        }
      }
    }
  }
`;

type GqlPosition = {
  market: {
    marketId: string;
    collateralAsset?: { symbol: string } | null;
    loanAsset?: { symbol: string } | null;
  };
  state: { supplyAssets?: string | null; supplyAssetsUsd?: number | null };
};

type GqlAdapter = {
  __typename: string;
  address: string;
  assetsUsd?: number | null;
  type?: string | null;
  // MorphoMarketV1Adapter
  positions?: { items?: GqlPosition[] } | null;
  // MetaMorphoAdapter
  metaMorpho?: { address: string; name?: string | null; asset?: { symbol: string } | null } | null;
  // MorphoVaultV2Adapter
  innerVault?: { address: string; name?: string | null; asset?: { symbol: string } | null } | null;
};

/**
 * Fetch allocation data for a single Morpho V2 vault.
 * Normalises all adapter types into a flat list of MorphoAllocationItem rows.
 */
export async function fetchMorphoV2Allocation(
  address: string,
  chainId: number
): Promise<MorphoV2Allocation | null> {
  const res = await fetchWithTimeout(
    MORPHO_GRAPHQL_V2,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        query: VAULT_ALLOCATION_QUERY_V2,
        variables: { address, chainId },
      }),
      next: { revalidate: 14_400 }, // 4 hours — matches TTL.ALLOCATION
    } as RequestInit,
    HEAVY_TIMEOUT_MS,
  );
  if (!res.ok) throw new Error(`Morpho V2 allocation API failed: ${res.status}`);

  const json = (await res.json()) as {
    data?: {
      vaultV2ByAddress?: {
        address: string;
        totalAssetsUsd?: number | null;
        idleAssetsUsd?: number | null;
        adapters?: { items?: GqlAdapter[] } | null;
      } | null;
    };
    errors?: unknown[];
  };

  if (json.errors?.length) console.warn("[morphoApi] allocation GraphQL errors:", json.errors);

  const vault = json.data?.vaultV2ByAddress;
  if (!vault) return null;

  const totalAssetsUsd = vault.totalAssetsUsd ?? 0;
  const idleAssetsUsd  = vault.idleAssetsUsd  ?? 0;
  const items: MorphoAllocationItem[] = [];

  for (const adapter of vault.adapters?.items ?? []) {
    if (adapter.__typename === "MorphoMarketV1Adapter") {
      // Expand into per-position rows — do NOT also add adapter.assetsUsd
      for (const pos of adapter.positions?.items ?? []) {
        const collateral = pos.market.collateralAsset?.symbol ?? "?";
        const loan       = pos.market.loanAsset?.symbol       ?? "?";
        items.push({
          name:      `${collateral} / ${loan}`,
          assetsUsd: pos.state.supplyAssetsUsd ?? 0,
          type:      "market",
          marketId:  pos.market.marketId,
        });
      }
    } else if (adapter.__typename === "MetaMorphoAdapter") {
      const name = adapter.metaMorpho?.name ?? adapter.metaMorpho?.address ?? adapter.address;
      items.push({
        name,
        assetsUsd: adapter.assetsUsd ?? 0,
        type:      "meta_vault",
      });
    } else if (adapter.__typename === "MorphoVaultV2Adapter") {
      const name = adapter.innerVault?.name ?? adapter.innerVault?.address ?? adapter.address;
      items.push({
        name,
        assetsUsd: adapter.assetsUsd ?? 0,
        type:      "inner_vault",
      });
    }
  }

  // Append idle as a separate row
  if (idleAssetsUsd > 0) {
    items.push({ name: "Idle Cash", assetsUsd: idleAssetsUsd, type: "idle" });
  }

  return { address: vault.address, totalAssetsUsd, idleAssetsUsd, items };
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Fetches APY, fees, and TVL for a list of Morpho Vault V2 addresses.
 * Returns a map of lowercase address → MorphoVaultApy.
 */
export async function fetchMorphoVaultApys(
  addresses: string[],
  chainId: number
): Promise<Record<string, MorphoVaultApy>> {
  if (addresses.length === 0) return {};
  return fetchV2Apys(addresses, chainId);
}
