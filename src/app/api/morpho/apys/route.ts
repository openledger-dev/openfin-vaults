/**
 * GET /api/morpho/apys?addresses=0xA,0xB&chainId=1
 *
 * Returns a map of lowercase vault address → MorphoVaultApy (Morpho Vaults V2).
 * Includes avgNetApy, performanceFee, managementFee, liquidity, totalAssetsUsd, name, symbol.
 * Result is cached in Redis for TTL.APY seconds (5 minutes).
 *
 * Query params:
 *   addresses — Comma-separated vault addresses (required)
 *   chainId   — EVM chain ID (default: 1)
 *
 * On Redis unavailability, falls back to the Morpho GraphQL API directly.
 */

import { NextResponse } from "next/server";
import { cachedFetch, TTL, redisKey } from "@/lib/redis";
import { fetchMorphoVaultApys } from "@/lib/morphoApi";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const rawAddresses = searchParams.get("addresses") ?? "";
  const chainId      = parseInt(searchParams.get("chainId") ?? "1", 10);

  const addresses = rawAddresses
    .split(",")
    .map((a) => a.trim())
    .filter((a) => /^0x[0-9a-fA-F]{40}$/.test(a));

  if (addresses.length === 0) {
    return NextResponse.json({});
  }

  // Stable cache key: sort addresses so order doesn't create duplicate entries
  const sorted   = [...addresses].map((a) => a.toLowerCase()).sort().join(",");
  const cacheKey = redisKey(`morpho:apys:${chainId}:${sorted}`);

  try {
    const data = await cachedFetch(cacheKey, TTL.APY, () =>
      fetchMorphoVaultApys(addresses, chainId)
    );
    return NextResponse.json(data);
  } catch (err) {
    console.error("[/api/morpho/apys]", err);
    return NextResponse.json(
      { error: "Failed to fetch Morpho APYs" },
      { status: 502 }
    );
  }
}
