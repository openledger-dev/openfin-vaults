/**
 * Thin wrapper around the Morpho public GraphQL API.
 *
 * Endpoint: https://blue-api.morpho.org/graphql
 *
 * Supports both Morpho Vaults V1 (MetaMorpho) and V2.
 * We query `weeklyNetApy` for a 7-day smoothed APY to match the UltraYield
 * 7D APY metric already shown in the table.
 *
 * Docs: https://docs.morpho.org/tools/offchain/api/morpho-vaults/
 */

const MORPHO_GRAPHQL = "https://blue-api.morpho.org/graphql";

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
  /** Performance fee as a decimal (0.05 = 5%). Fallback if on-chain fee() call fails. */
  fee: number | null;
};

const VAULT_APY_QUERY = /* graphql */ `
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

/**
 * Fetches APY and TVL for a list of Morpho Vault V1 addresses on a given chain.
 * Returns a map of lowercase address → { weeklyNetApy, totalAssetsUsd }.
 */
export async function fetchMorphoVaultApys(
  addresses: string[],
  chainId: number
): Promise<Record<string, MorphoVaultApy>> {
  if (addresses.length === 0) return {};

  const res = await fetch(MORPHO_GRAPHQL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      query: VAULT_APY_QUERY,
      variables: { addresses, chainId },
    }),
    next: { revalidate: 300 },
  });

  if (!res.ok) throw new Error(`Morpho API fetch failed: ${res.status}`);

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

  if (json.errors?.length) {
    console.warn("[morphoApi] GraphQL errors:", json.errors);
  }

  const result: Record<string, MorphoVaultApy> = {};
  for (const item of json.data?.vaults?.items ?? []) {
    result[item.address.toLowerCase()] = {
      address: item.address,
      name: item.name ?? null,
      symbol: item.symbol ?? null,
      fee: item.state?.fee ?? null,
      weeklyNetApy: item.state?.weeklyNetApy ?? null,
      totalAssetsUsd: item.state?.totalAssetsUsd ?? null,
    };
  }
  return result;
}
