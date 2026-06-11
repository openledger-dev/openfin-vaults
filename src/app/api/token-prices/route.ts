/**
 * GET /api/token-prices
 *
 * Returns USD spot prices for BTC and ETH via CoinGecko's free public API.
 * Response is cached in Redis for TTL.PRICE seconds (10 min by default).
 *
 * Response shape:
 *   { "bitcoin": 67334.12, "ethereum": 3812.50 }
 *
 * Symbol aliases (WBTC, cbBTC, tBTC → "bitcoin"; WETH → "ethereum") are
 * resolved on the client side using COINGECKO_ID_MAP exported below.
 */

import { NextResponse } from "next/server";
import { cachedFetch, TTL, redisKey } from "@/lib/redis";
import { fetchWithTimeout } from "@/lib/fetchWithTimeout";

type CoinGeckoResponse = Record<string, { usd: number }>;

async function fetchTokenPrices(): Promise<Record<string, number>> {
  const url =
    "https://api.coingecko.com/api/v3/simple/price?ids=bitcoin,ethereum&vs_currencies=usd";
  const res = await fetchWithTimeout(url, { next: { revalidate: 600 } } as RequestInit);
  if (!res.ok) throw new Error(`CoinGecko error: ${res.status}`);
  const json = (await res.json()) as CoinGeckoResponse;
  const out: Record<string, number> = {};
  for (const [id, v] of Object.entries(json)) {
    if (typeof v?.usd === "number") out[id] = v.usd;
  }
  return out;
}

export async function GET() {
  try {
    const data = await cachedFetch(
      redisKey("token-prices"),
      TTL.PRICE,
      fetchTokenPrices
    );
    return NextResponse.json(data);
  } catch (err) {
    console.error("[/api/token-prices]", err);
    return NextResponse.json(
      { error: "Failed to fetch token prices" },
      { status: 502 }
    );
  }
}
