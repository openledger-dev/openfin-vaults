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
import { getLogger } from "@/lib/logger";

const log = getLogger("api/ultrayield/allocation");
import { isAllocationEnabled } from "@/lib/featureFlags";
import { cachedFetch, TTL, redisKey, sanitizeKeySegment } from "@/lib/redis";
import { fetchUltraYieldAllocation } from "@/lib/ultrayieldApi";
import { isVaultSlug } from "@/lib/apiValidation";

export async function GET(request: Request) {
  if (!isAllocationEnabled()) {
    return NextResponse.json({ error: "Allocation feature is disabled" }, { status: 404 });
  }

  const { searchParams } = new URL(request.url);
  const slug = searchParams.get("slug")?.trim();

  if (!slug || !isVaultSlug(slug)) {
    return NextResponse.json(
      { error: "Missing or invalid required param: slug (must be lowercase alphanumeric with hyphens)" },
      { status: 400 }
    );
  }

  const cacheKey = redisKey(`uy:allocation:${sanitizeKeySegment(slug)}`);

  try {
    const data = await cachedFetch(cacheKey, TTL.ALLOCATION, () =>
      fetchUltraYieldAllocation(slug)
    );
    return NextResponse.json(data);
  } catch (err) {
    log.error({ err }, "request failed");
    return NextResponse.json(
      { error: "Failed to fetch UltraYield allocation data" },
      { status: 502 }
    );
  }
}
