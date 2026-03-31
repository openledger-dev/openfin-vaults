/**
 * Thin wrapper around the Midas public REST API.
 *
 * Endpoints (cached ~10 min by Midas, rate-limit 18 req/10s per user):
 *
 *   GET /api/data/apys
 *     → { [symbol_lower]: apy_decimal }  e.g. { "mmev": 0.0443 }
 *
 *   GET /api/data/prices
 *     → { [symbol_mixed]: price_string } e.g. { "mMEV": "1.11386751" }
 *
 *   GET /api/data/requests/pending/redemptions/:chainId/:tokenAddress
 *     → { data: PendingRedemption[] }
 *     Optional query param: ?address=0x… to filter by user wallet.
 *
 * APY values are already fractional (0.05 = 5%). Symbol keys are lowercase
 * for APYs and mixed-case for prices; we normalise to lowercase when reading.
 *
 * Docs: https://ludicrous-rate-748.notion.site/Midas-Vaults-Integration-Public
 */

const BASE = "https://api-prod.midas.app/api/data";

export type MidasApyMap   = Record<string, number>;
export type MidasPriceMap = Record<string, number>;

export type MidasPendingRedemption = {
  /** Midas token address being redeemed */
  tokenAddress: string;
  /** Amount of Midas tokens being redeemed (18-decimal units) */
  amount: string;
  /** Payment token requested */
  paymentToken?: string;
  /** Request timestamp (ISO string) */
  createdAt?: string;
  /** Request tx hash */
  txHash?: string;
  /** Requestor wallet address */
  sender?: string;
};

export type MidasPendingRedemptionsResponse = {
  data: MidasPendingRedemption[];
};

/** Returns a map of lowercase symbol → APY decimal (e.g. { mmev: 0.0443 }). */
export async function fetchMidasApys(): Promise<MidasApyMap> {
  const res = await fetch(`${BASE}/apys`, { next: { revalidate: 600 } });
  if (!res.ok) throw new Error(`Midas APY fetch failed: ${res.status}`);
  return res.json() as Promise<MidasApyMap>;
}

/** Returns a map of lowercase symbol → price in USD (e.g. { mmev: 1.114 }). */
export async function fetchMidasPrices(): Promise<MidasPriceMap> {
  const res = await fetch(`${BASE}/prices`, { next: { revalidate: 600 } });
  if (!res.ok) throw new Error(`Midas price fetch failed: ${res.status}`);
  const raw = (await res.json()) as Record<string, string>;
  return Object.fromEntries(
    Object.entries(raw).map(([k, v]) => [k.toLowerCase(), parseFloat(v)])
  );
}

/**
 * Returns pending (standard / async) redemption requests for a Midas token.
 *
 * @param chainId     EVM chain ID (e.g. 1 for Ethereum mainnet)
 * @param tokenAddress Share token contract address
 * @param userAddress  Optional — filter to a specific wallet address
 */
export async function fetchMidasPendingRedemptions(
  chainId: number,
  tokenAddress: string,
  userAddress?: string
): Promise<MidasPendingRedemption[]> {
  let url = `${BASE}/requests/pending/redemptions/${chainId}/${tokenAddress}`;
  if (userAddress) url += `?address=${userAddress}`;

  const res = await fetch(url, { next: { revalidate: 60 } });
  if (!res.ok) {
    console.warn(`[midasApi] Pending redemptions fetch failed: ${res.status}`);
    return [];
  }
  const json = (await res.json()) as MidasPendingRedemptionsResponse | MidasPendingRedemption[];
  // API may return { data: [...] } or a bare array
  if (Array.isArray(json)) return json;
  return json.data ?? [];
}
