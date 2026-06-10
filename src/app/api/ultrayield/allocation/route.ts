/**
 * GET /api/ultrayield/allocation?slug=ultrayield-btc
 *
 * Proxies the UltraYield allocation snapshot and caches it in Redis
 * for TTL.ALLOCATION seconds (default 4 hours).
 *
 * Query params:
 *   slug — UltraYield vault slug (e.g. "ultrayield-btc", "ultrayield-usd")
 *
 * Response (200):
 *   UltraYieldAllocation — { vault_slug, date, allocation[] }
 *
 * Response (400): missing slug param
 * Response (502): upstream API error
 */

import { NextResponse } from "next/server";
import { isAllocationEnabled } from "@/lib/featureFlags";
import { cachedFetch, TTL, redisKey } from "@/lib/redis";
import { fetchUltraYieldAllocation } from "@/lib/ultrayieldApi";

export async function GET(request: Request) {
  if (!isAllocationEnabled()) {
    return NextResponse.json({ error: "Allocation feature is disabled" }, { status: 404 });
  }

  const { searchParams } = new URL(request.url);
  const slug = searchParams.get("slug")?.trim();

  if (!slug) {
    return NextResponse.json(
      { error: "Missing required param: slug" },
      { status: 400 }
    );
  }

  const cacheKey = redisKey(`uy:allocation:${slug}`);

  try {
    const data = await cachedFetch(cacheKey, TTL.ALLOCATION, () =>
      fetchUltraYieldAllocation(slug)
    );
    return NextResponse.json(data);
  } catch (err) {
    console.error("[/api/ultrayield/allocation]", err);
    return NextResponse.json(
      { error: "Failed to fetch UltraYield allocation data" },
      { status: 502 }
    );
  }
}
