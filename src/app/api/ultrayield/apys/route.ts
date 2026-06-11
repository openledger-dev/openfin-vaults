/**
 * GET /api/ultrayield/apys?slugs=ultrayield-usd,ultrayield-btc
 *
 * Fetches 7D APY for one or more UltraYield vaults from the UltraYield REST API:
 *   https://api.ultrayield.app/api/v2/vaults/{slug}/apy_history?limit=1
 *
 * Returns a map of slug → APY as a decimal fraction (0.05 = 5%).
 * Cached in Redis for TTL.APY seconds (5 minutes by default).
 *
 * Response (200):
 *   { "ultrayield-usd": 0.05295, "ultrayield-btc": null }
 *
 * Slugs with no data or fetch errors are returned as null rather than
 * failing the entire request.
 */

import { NextResponse } from "next/server";
import { cachedFetch, TTL, redisKey, sanitizeKeySegment } from "@/lib/redis";
import { MAX_LIST_SIZE } from "@/lib/rateLimiter";

const ULTRAYIELD_API = "https://api.ultrayield.app/api/v2/vaults";

type ApyHistoryResponse = {
  data?: {
    slug?: string;
    data?: Array<{ ts: string; apy_7d: string }>;
  };
};

async function fetchSlugApy(slug: string): Promise<number | null> {
  const u = new URL(`${ULTRAYIELD_API}/${encodeURIComponent(slug)}/apy_history`);
  u.searchParams.set("limit", "1");
  u.searchParams.set("skip_cache", "false");
  const res = await fetch(u.toString(), { next: { revalidate: 300 } } as RequestInit);
  if (!res.ok) return null;
  const json = (await res.json()) as ApyHistoryResponse;
  const latest = json.data?.data?.[0];
  if (!latest?.apy_7d) return null;
  const apy = parseFloat(latest.apy_7d);
  return isNaN(apy) ? null : apy;
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const raw = searchParams.get("slugs") ?? "";
  const slugs = raw
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)
    .slice(0, MAX_LIST_SIZE);

  if (slugs.length === 0) {
    return NextResponse.json({});
  }

  try {
    const entries = await Promise.all(
      slugs.map(async (slug) => {
        const cacheKey = redisKey(`uy:apy:slug:${sanitizeKeySegment(slug)}`);
        const apy = await cachedFetch(cacheKey, TTL.APY, () => fetchSlugApy(slug));
        return [slug, apy] as [string, number | null];
      })
    );

    return NextResponse.json(Object.fromEntries(entries));
  } catch (err) {
    console.error("[/api/ultrayield/apys]", err);
    return NextResponse.json({ error: "Failed to fetch UltraYield APYs" }, { status: 502 });
  }
}
