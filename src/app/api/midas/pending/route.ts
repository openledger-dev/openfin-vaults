/**
 * GET /api/midas/pending?chainId=1&token=0x...&address=0x...
 *
 * Returns an array of pending standard (async) redemption requests for a
 * given Midas share token.
 *
 * Query params:
 *   chainId   — EVM chain ID (default: 1)
 *   token     — Share token contract address (required)
 *   address   — Wallet address to filter by (optional; omit for all pending)
 *
 * Result is cached in Redis for TTL.PENDING seconds (60 seconds).
 * User-specific requests (with `address`) are cached under a per-user key.
 *
 * On Redis unavailability, falls back to the Midas REST API directly.
 */

import { NextResponse } from "next/server";
import { cachedFetch, invalidate, TTL, redisKey } from "@/lib/redis";
import { fetchMidasPendingRedemptions } from "@/lib/midasApi";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const chainId = parseInt(searchParams.get("chainId") ?? "1", 10);
  const token   = searchParams.get("token");
  const address = searchParams.get("address") ?? undefined;
  const bust    = searchParams.get("bust") === "1";

  if (!token || !/^0x[0-9a-fA-F]{40}$/.test(token)) {
    return NextResponse.json(
      { error: "Missing or invalid required param: token" },
      { status: 400 }
    );
  }

  const wallet = address?.toLowerCase() ?? "all";
  const cacheKey = redisKey(`midas:pending:${chainId}:${token.toLowerCase()}:${wallet}`);

  try {
    if (bust) {
      // Skip Redis read — fetch fresh from Midas and repopulate the cache.
      await invalidate(cacheKey);
    }
    const data = await cachedFetch(cacheKey, TTL.PENDING, () =>
      fetchMidasPendingRedemptions(chainId, token, address)
    );
    return NextResponse.json(data);
  } catch (err) {
    console.error("[/api/midas/pending]", err);
    return NextResponse.json(
      { error: "Failed to fetch Midas pending redemptions" },
      { status: 502 }
    );
  }
}
