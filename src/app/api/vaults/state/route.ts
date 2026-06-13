/**
 * GET /api/vaults/state?address=0x...&chainId=1&kind=ultrayield
 *
 * Returns dynamic vault state read from the blockchain via multicall.
 * Cached in Redis for TTL.STATE seconds (30 seconds) — changes every block.
 *
 * Response includes BigInt values serialized as decimal strings
 * (e.g. totalAssets, totalSupply, liquidityRaw).
 *
 * Query params:
 *   address — Vault contract address (required)
 *   chainId — EVM chain ID (default: 1)
 *   kind    — "ultrayield" | "morpho" | "midas" (optional; affects which
 *             extra fields are fetched — isPaused for ultra, totalIdle for morpho)
 *
 * Fields returned:
 *   All:        totalAssets (undefined for midas), totalSupply
 *   morpho:     + liquidityRaw (totalIdle)
 *   ultrayield: + isPaused
 */

import { NextResponse } from "next/server";
import { getLogger } from "@/lib/logger";

const log = getLogger("api/vaults/state");
import { cachedFetch, TTL, serialize, redisKey } from "@/lib/redis";
import { fetchOnChainState } from "@/lib/onchain";
import { isAllowedVault } from "@/lib/allowlist";
import { parseChainId, parsePlatformKind } from "@/lib/apiValidation";
import type { PlatformKind } from "@/lib/vaultConfig";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const address = searchParams.get("address") as `0x${string}` | null;

  const chainIdResult = parseChainId(searchParams.get("chainId"));
  if (!chainIdResult.ok) {
    return NextResponse.json({ error: chainIdResult.error }, { status: 400 });
  }
  const chainId = chainIdResult.value;

  const kindResult = parsePlatformKind(searchParams.get("kind"));
  if (!kindResult.ok) {
    return NextResponse.json({ error: kindResult.error }, { status: 400 });
  }
  const kind = kindResult.value as PlatformKind | undefined;

  if (!address || !/^0x[0-9a-fA-F]{40}$/.test(address)) {
    return NextResponse.json({ error: "Invalid or missing vault address" }, { status: 400 });
  }

  if (!isAllowedVault(address)) {
    return NextResponse.json({ error: "Unknown vault address" }, { status: 403 });
  }

  const cacheKey = redisKey(`vault:state:${chainId}:${address.toLowerCase()}`);

  try {
    const data = await cachedFetch(cacheKey, TTL.STATE, () =>
      fetchOnChainState(chainId, address, kind)
    );
    return new Response(serialize(data), {
      headers: { "Content-Type": "application/json" },
    });
  } catch (err) {
    log.error({ err }, "request failed");
    return NextResponse.json({ error: "Failed to fetch vault state" }, { status: 502 });
  }
}
