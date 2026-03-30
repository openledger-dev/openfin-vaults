/**
 * Thin wrapper around the Midas public REST API.
 *
 * Endpoints (cached ~10 min by Midas):
 *   GET https://api-prod.midas.app/api/data/apys
 *     → { [symbol]: apy_decimal }   e.g. { "mmev": 0.0443 }
 *
 *   GET https://api-prod.midas.app/api/data/prices
 *     → { [symbol]: price_string }  e.g. { "mMEV": "1.11386751" }
 *
 * Rate limit: 18 req / 10s per user.
 *
 * APY values are already fractional (0.05 = 5%). The keys are lowercase
 * for APYs and mixed-case for prices; we normalise to lowercase when reading.
 */

const BASE = "https://api-prod.midas.app/api/data";

export type MidasApyMap   = Record<string, number>;
export type MidasPriceMap = Record<string, number>;

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
