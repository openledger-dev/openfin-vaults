/**
 * GET /api/vaults/metadata?address=0x...&chainId=1&kind=ultrayield
 *
 * Returns static vault metadata read from the blockchain via multicall.
 * Cached in Redis for TTL.META seconds (1 hour) — data rarely changes.
 *
 * Response includes BigInt values serialized as decimal strings
 * (e.g. performanceFee, managementFee, withdrawalFee, totalSupply).
 *
 * Query params:
 *   address — Vault contract address (required)
 *   chainId — EVM chain ID (default: 1)
 *   kind    — "ultrayield" | "morpho" | "midas" (default: "ultrayield")
 *
 * Fields returned depend on `kind`:
 *   All:          name, symbol, decimals, totalSupply
 *   morpho/ultra: assetAddress, assetSymbol, assetDecimals
 *   ultrayield:   performanceFee, managementFee, withdrawalFee,
 *                 fundsHolder, oracleAddress, feeRecipient, rateProviderAddress
 */

import { NextResponse } from "next/server";
import { getLogger } from "@/lib/logger";

const log = getLogger("api/vaults/metadata");
import { cachedFetch, TTL, serialize, redisKey } from "@/lib/redis";
import { fetchOnChainMeta } from "@/lib/onchain";
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

  const rawKind = searchParams.get("kind") ?? "ultrayield";
  const kindResult = parsePlatformKind(rawKind);
  if (!kindResult.ok) {
    return NextResponse.json({ error: kindResult.error }, { status: 400 });
  }
  const kind = (kindResult.value ?? "ultrayield") as PlatformKind;

  if (!address || !/^0x[0-9a-fA-F]{40}$/.test(address)) {
    return NextResponse.json({ error: "Invalid or missing vault address" }, { status: 400 });
  }

  if (!isAllowedVault(address)) {
    return NextResponse.json({ error: "Unknown vault address" }, { status: 403 });
  }

  const cacheKey = redisKey(`vault:meta:${chainId}:${address.toLowerCase()}`);

  try {
    const data = await cachedFetch(cacheKey, TTL.META, () =>
      fetchOnChainMeta(chainId, address, kind)
    );
    // Use bigint-safe serializer so fee/supply values survive JSON encoding
    return new Response(serialize(data), {
      headers: { "Content-Type": "application/json" },
    });
  } catch (err) {
    log.error({ err }, "request failed");
    return NextResponse.json({ error: "Failed to fetch vault metadata" }, { status: 502 });
  }
}
