/**
 * Thin wrapper around the Morpho public GraphQL API.
 *
 * V1 endpoint: https://blue-api.morpho.org/graphql  (MetaMorpho / legacy vaults)
 * V2 endpoint: https://api.morpho.org/graphql        (Morpho Vaults V2)
 *
 * fetchMorphoVaultApys tries V1 first, then automatically falls back to V2
 * for any addresses not found in the V1 index.
 *
 * Docs: https://docs.morpho.org/tools/offchain/api/morpho-vaults/
 */

const MORPHO_GRAPHQL_V1 = "https://blue-api.morpho.org/graphql";
const MORPHO_GRAPHQL_V2 = "https://api.morpho.org/graphql";

export type MorphoVaultApy = {
  address: string;
  /** Vault name from the Morpho API (used as fallback when on-chain name() fails). */
  name: string | null;
  /** Vault symbol from the Morpho API. */
  symbol: string | null;
  /** Weekly net APY as a decimal (0.05 = 5%). Null if not available. */
  weeklyNetApy: number | null;
  /** Total assets in the vault (as USD string) */
  totalAssetsUsd: number | null;
  /**
   * Performance fee as a decimal (0.05 = 5%).
   * For V1: from state.fee. For V2: performanceFee field.
   * Fallback if on-chain fee() call fails.
   */
  fee: number | null;
  /** Management fee (V2 only). Decimal fraction (0.01 = 1%). */
  managementFee: number | null;
  /**
   * Available liquidity in raw asset units (string to preserve precision).
   * V2: from API `liquidity` field (immediately withdrawable amount).
   * V1: read on-chain via totalIdle(); this field is null for V1 entries.
   */
  liquidity: string | null;
};

// ── Morpho V1 (MetaMorpho / blue-api) ────────────────────────────────────────

const VAULT_APY_QUERY_V1 = /* graphql */ `
  query VaultApys($addresses: [String!]!, $chainId: Int!) {
    vaults(
      first: 200
      where: { address_in: $addresses, chainId_in: [$chainId] }
    ) {
      items {
        address
        name
        symbol
        state {
          weeklyNetApy: avgNetApy(lookback: SEVEN_DAYS)
          totalAssetsUsd
          fee
        }
      }
    }
  }
`;

async function fetchV1Apys(
  addresses: string[],
  chainId: number
): Promise<Record<string, MorphoVaultApy>> {
  const res = await fetch(MORPHO_GRAPHQL_V1, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      query: VAULT_APY_QUERY_V1,
      variables: { addresses, chainId },
    }),
    next: { revalidate: 300 },
  });
  if (!res.ok) throw new Error(`Morpho V1 API fetch failed: ${res.status}`);

  const json = (await res.json()) as {
    data?: {
      vaults?: {
        items?: Array<{
          address: string;
          name?: string | null;
          symbol?: string | null;
          state?: {
            weeklyNetApy?: number | null;
            totalAssetsUsd?: number | null;
            fee?: number | null;
          } | null;
        }>;
      };
    };
    errors?: unknown[];
  };

  if (json.errors?.length) console.warn("[morphoApi V1] GraphQL errors:", json.errors);

  const result: Record<string, MorphoVaultApy> = {};
  for (const item of json.data?.vaults?.items ?? []) {
    result[item.address.toLowerCase()] = {
      address: item.address,
      name: item.name ?? null,
      symbol: item.symbol ?? null,
      fee: item.state?.fee ?? null,
      managementFee: null,
      liquidity: null,
      weeklyNetApy: item.state?.weeklyNetApy ?? null,
      totalAssetsUsd: item.state?.totalAssetsUsd ?? null,
    };
  }
  return result;
}

// ── Morpho V2 (api.morpho.org) ────────────────────────────────────────────────

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
        totalAssetsUsd
        performanceFee
        managementFee
        liquidity
      }
    }
  }
`;

async function fetchV2Apys(
  addresses: string[],
  chainId: number
): Promise<Record<string, MorphoVaultApy>> {
  const res = await fetch(MORPHO_GRAPHQL_V2, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      query: VAULT_APY_QUERY_V2,
      variables: { addresses, chainId },
    }),
    next: { revalidate: 300 },
  });
  if (!res.ok) throw new Error(`Morpho V2 API fetch failed: ${res.status}`);

  const json = (await res.json()) as {
    data?: {
      vaultV2s?: {
        items?: Array<{
          address: string;
          name?: string | null;
          symbol?: string | null;
          avgNetApy?: number | null;
          totalAssetsUsd?: number | null;
          performanceFee?: number | null;
          managementFee?: number | null;
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
      fee: item.performanceFee ?? null,
      managementFee: item.managementFee ?? null,
      liquidity: item.liquidity != null ? String(item.liquidity) : null,
      weeklyNetApy: item.avgNetApy ?? null,
      totalAssetsUsd: item.totalAssetsUsd ?? null,
    };
  }
  return result;
}

// ── Public API — tries V1 then fills missing addresses from V2 ────────────────

/**
 * Fetches APY and TVL for a list of Morpho vault addresses.
 * Queries V1 (MetaMorpho) first; any addresses not found there are then
 * looked up in the V2 API automatically.
 *
 * Returns a map of lowercase address → MorphoVaultApy.
 */
export async function fetchMorphoVaultApys(
  addresses: string[],
  chainId: number
): Promise<Record<string, MorphoVaultApy>> {
  if (addresses.length === 0) return {};

  // Query both V1 and V2 in parallel
  const [v1Result, v2Result] = await Promise.all([
    fetchV1Apys(addresses, chainId).catch((err) => {
      console.warn("[morphoApi] V1 fetch failed, falling back to V2 only:", err);
      return {} as Record<string, MorphoVaultApy>;
    }),
    fetchV2Apys(addresses, chainId).catch((err) => {
      console.warn("[morphoApi] V2 fetch failed:", err);
      return {} as Record<string, MorphoVaultApy>;
    }),
  ]);

  // V1 takes precedence; V2 fills any gaps
  return { ...v2Result, ...v1Result };
}
