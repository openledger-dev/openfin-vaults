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
export type MidasTvlMap   = Record<string, number>;

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

/** Raw shape returned by GET /api/data/requests/pending */
type RawMidasPendingItem = {
  mToken:                    string;
  amountMToken:              string;
  tokenOut?:                 string;
  createdAt?:                string; // Unix timestamp seconds
  creationTransactionHash?:  string;
  user?:                     string;
};

type RawMidasPendingResponse = {
  redemptions: RawMidasPendingItem[];
};

type RawMidasTvlResponse = {
  tokenTvl?: Record<string, number | { usd?: number; native?: number }>;
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

/** Returns a map of lowercase symbol -> TVL in USD (e.g. { mre7: 14423063 }). */
export async function fetchMidasTvls(): Promise<MidasTvlMap> {
  const res = await fetch(`${BASE}/tvl`, { next: { revalidate: 600 } });
  if (!res.ok) throw new Error(`Midas TVL fetch failed: ${res.status}`);

  const raw = (await res.json()) as RawMidasTvlResponse;
  const tokenTvl = raw.tokenTvl ?? {};

  return Object.fromEntries(
    Object.entries(tokenTvl).map(([k, v]) => {
      const usd =
        typeof v === "number"
          ? v
          : typeof v?.usd === "number"
            ? v.usd
            : 0;
      return [k.toLowerCase(), usd];
    })
  );
}

/**
 * Returns pending standard redemption requests for a Midas token.
 *
 * Uses GET /api/data/requests/pending?address=...&networkId=...
 * which returns all pending redemptions for the wallet, filtered here by mToken.
 *
 * @param chainId      EVM chain ID (e.g. 1 for Ethereum mainnet)
 * @param tokenAddress Share token contract address — used to filter results
 * @param userAddress  Wallet address (required; without it the endpoint returns nothing useful)
 */
export async function fetchMidasPendingRedemptions(
  chainId: number,
  tokenAddress: string,
  userAddress?: string
): Promise<MidasPendingRedemption[]> {
  if (!userAddress) return [];

  const url = `${BASE}/requests/pending?address=${userAddress}&networkId=${chainId}`;
  const res = await fetch(url, { next: { revalidate: 60 } });
  if (!res.ok) {
    console.warn(`[midasApi] Pending redemptions fetch failed: ${res.status}`);
    return [];
  }

  const json = (await res.json()) as RawMidasPendingResponse;
  const all: RawMidasPendingItem[] = json.redemptions ?? [];

  return all
    .filter((r) => r.mToken.toLowerCase() === tokenAddress.toLowerCase())
    .map((r): MidasPendingRedemption => ({
      tokenAddress:  r.mToken,
      amount:        r.amountMToken,
      paymentToken:  r.tokenOut,
      // API returns Unix timestamp in seconds — convert to ISO for UI display
      createdAt:     r.createdAt
        ? new Date(parseInt(r.createdAt, 10) * 1_000).toISOString()
        : undefined,
      txHash:        r.creationTransactionHash,
      sender:        r.user,
    }));
}
