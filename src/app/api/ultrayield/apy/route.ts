/**
 * GET /api/ultrayield/apy?chainId=1&vault=0x...&asset=0x...
 *
 * Returns the UltraYield 7-day APY derived from on-chain PriceUpdated oracle
 * events. The oracle address is derived server-side from vault.oracle() and is
 * never accepted from the caller (OPE-18: SSRF / RPC-amplification fix).
 * Cached in Redis for TTL.APY_7D seconds (24 hours).
 *
 * Why 24-hour cache?
 *   Computing the APY requires an eth_getLogs scan over ~50,000 blocks
 *   (~7 days on Ethereum mainnet). This is expensive on any RPC provider.
 *   The 7D APY figure changes slowly — a daily refresh is more than sufficient.
 *
 * Query params:
 *   chainId — EVM chain ID (default: 1)
 *   vault   — Vault share token address; must be in the server-side allowlist (required)
 *   asset   — Underlying asset address; must be in the server-side allowlist (required)
 *
 * Response (200):
 *   { apy: number, daysBack: number }   — APY as a percentage (e.g. 5.23)
 *
 * Response (204 No Content):
 *   Insufficient oracle history to compute APY (< 2 PriceUpdated events).
 */

import { NextResponse } from "next/server";
import { cachedFetch, TTL, redisKey } from "@/lib/redis";
import { fetchUltraYieldApy, fetchVaultOracle } from "@/lib/onchain";
import { isAllowedVault, isAllowedAsset } from "@/lib/allowlist";
import { parseChainId } from "@/lib/apiValidation";
import type { Address } from "viem";

function isAddress(v: string | null): v is Address {
  return !!v && /^0x[0-9a-fA-F]{40}$/.test(v);
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const chainIdResult = parseChainId(searchParams.get("chainId"));
  if (!chainIdResult.ok) {
    return NextResponse.json({ error: chainIdResult.error }, { status: 400 });
  }
  const chainId = chainIdResult.value;
  const vault   = searchParams.get("vault");
  const asset   = searchParams.get("asset");

  if (!isAddress(vault) || !isAddress(asset)) {
    return NextResponse.json(
      { error: "Missing or invalid required params: vault, asset (must be 0x addresses)" },
      { status: 400 }
    );
  }

  if (!isAllowedVault(vault)) {
    return NextResponse.json({ error: "Unknown vault address" }, { status: 403 });
  }

  if (!isAllowedAsset(asset)) {
    return NextResponse.json({ error: "Unknown asset address" }, { status: 403 });
  }

  // oracle is derived inside the cached fetcher so it is never caller-supplied.
  // The cache key is keyed on vault + asset only; oracle is uniquely determined
  // by vault.oracle() so there is no poisoning risk.
  const cacheKey = redisKey(`uy:apy:${chainId}:${vault.toLowerCase()}:${asset.toLowerCase()}`);

  try {
    const data = await cachedFetch(cacheKey, TTL.APY_7D, async () => {
      const oracle = await fetchVaultOracle(chainId, vault);
      return fetchUltraYieldApy(chainId, oracle, vault, asset);
    });

    if (data === null) {
      // Not enough oracle history — return 204 so the client falls back gracefully
      return new Response(null, { status: 204 });
    }

    return NextResponse.json(data);
  } catch (err) {
    console.error("[/api/ultrayield/apy]", err);
    return NextResponse.json(
      { error: "Failed to compute UltraYield APY" },
      { status: 502 }
    );
  }
}
