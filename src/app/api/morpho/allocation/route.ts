/**
 * GET /api/morpho/allocation?address=0x...&chainId=1
 *
 * Fetches the current allocation breakdown for a single Morpho V2 vault
 * using the Morpho GraphQL API (api.morpho.org/graphql), then caches the
 * normalised result in Redis for TTL.ALLOCATION seconds (default 4 hours).
 *
 * Query params:
 *   address  — Vault share token address (required, 0x…)
 *   chainId  — EVM chain ID (default: 1)
 *
 * Response (200):
 *   MorphoV2Allocation — { address, totalAssetsUsd, idleAssetsUsd, items[] }
 *
 * Response (400): invalid/missing address
 * Response (404): vault not found in Morpho V2 API
 * Response (502): upstream GraphQL error
 */

import { NextResponse } from "next/server";
import { isAllocationEnabled } from "@/lib/featureFlags";
import { cachedFetch, TTL, redisKey } from "@/lib/redis";
import { fetchMorphoV2Allocation } from "@/lib/morphoApi";

function isAddress(v: string | null): v is string {
  return !!v && /^0x[0-9a-fA-F]{40}$/.test(v);
}

export async function GET(request: Request) {
  if (!isAllocationEnabled()) {
    return NextResponse.json({ error: "Allocation feature is disabled" }, { status: 404 });
  }

  const { searchParams } = new URL(request.url);
  const address = searchParams.get("address");
  const chainId = parseInt(searchParams.get("chainId") ?? "1", 10);

  if (!isAddress(address)) {
    return NextResponse.json(
      { error: "Missing or invalid required param: address (must be 0x…)" },
      { status: 400 }
    );
  }

  const cacheKey = redisKey(`morpho:allocation:v2:${chainId}:${address.toLowerCase()}`);

  try {
    const data = await cachedFetch(cacheKey, TTL.ALLOCATION, () =>
      fetchMorphoV2Allocation(address, chainId)
    );

    if (data === null) {
      return NextResponse.json(
        { error: "Vault not found in Morpho V2 API" },
        { status: 404 }
      );
    }

    return NextResponse.json(data);
  } catch (err) {
    console.error("[/api/morpho/allocation]", err);
    return NextResponse.json(
      { error: "Failed to fetch Morpho V2 allocation data" },
      { status: 502 }
    );
  }
}
