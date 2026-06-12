"use client";

/**
 * Returns the 7-day APY for a single UltraYield vault.
 *
 * Source priority:
 *   1. UltraYield REST API (/api/ultrayield/apys?slugs=…) when `slug` is
 *      provided — fast, 5-min Redis cache, no RPC cost.
 *   2. On-chain PriceUpdated event-log scan (/api/ultrayield/apy) when no
 *      slug is available — slow eth_getLogs scan, 24-hour Redis cache.
 */

import { useQuery } from "@tanstack/react-query";
import { useChainId } from "wagmi";

export type ApyResult = {
  /** Annualised percentage return (e.g. 5.23 means 5.23%) */
  apy: number | null;
  /** Actual number of days covered by the calculation (null when from REST API) */
  daysBack: number | null;
  /** Human-readable label: "7D APY", "3D APY", etc. */
  label: string;
  isLoading: boolean;
  isError: boolean;
};

export function use7dApy(
  oracleAddress: `0x${string}` | undefined,
  vaultAddress:  `0x${string}` | undefined,
  assetAddress:  `0x${string}` | undefined,
  /** Explicit chain ID for the vault. Falls back to the connected wallet's chain. */
  vaultChainId?: number,
  /** UltraYield REST API slug (e.g. "ultrayield-usd"). When provided, the REST
   *  API is used instead of the on-chain event-log scan. */
  slug?: string,
): ApyResult {
  const connectedChainId = useChainId();
  const chainId = vaultChainId ?? connectedChainId;

  // ── Path A: REST API (fast, preferred when slug is available) ─────────────
  const restEnabled = !!slug;

  const { data: restData, isLoading: restLoading, isError: restError } = useQuery({
    queryKey: ["7dApyRest", slug],
    enabled: restEnabled,
    staleTime: 5 * 60 * 1_000,
    gcTime:    15 * 60 * 1_000,
    queryFn: async (): Promise<number | null> => {
      const params = new URLSearchParams({ slugs: slug! });
      const res = await fetch(`/api/ultrayield/apys?${params}`);
      if (!res.ok) throw new Error(`UltraYield APYs API error: ${res.status}`);
      const map = (await res.json()) as Record<string, number | null>;
      return map[slug!] ?? null;
    },
  });

  // ── Path B: On-chain event-log scan (fallback when no slug) ───────────────
  const onchainEnabled = !restEnabled && !!oracleAddress && !!vaultAddress && !!assetAddress;

  const { data: onchainData, isLoading: onchainLoading, isError: onchainError } = useQuery({
    // oracle is derived server-side (OPE-18); exclude it from the cache key.
    queryKey: ["7dApy", chainId, vaultAddress, assetAddress],
    enabled: onchainEnabled,
    staleTime: 24 * 60 * 60 * 1_000,
    gcTime:    25 * 60 * 60 * 1_000,
    queryFn: async (): Promise<{ apy: number; daysBack: number } | null> => {
      if (!vaultAddress || !assetAddress) return null;
      const params = new URLSearchParams({
        chainId: String(chainId),
        vault:   vaultAddress,
        asset:   assetAddress,
      });
      const res = await fetch(`/api/ultrayield/apy?${params}`);
      if (res.status === 204) return null;
      if (!res.ok) throw new Error(`UltraYield APY API error: ${res.status}`);
      return res.json() as Promise<{ apy: number; daysBack: number }>;
    },
  });

  // ── Resolve ───────────────────────────────────────────────────────────────
  if (restEnabled) {
    if (restLoading) return { apy: null, daysBack: null, label: "7D APY", isLoading: true,  isError: false };
    if (restError || restData === undefined) return { apy: null, daysBack: null, label: "7D APY", isLoading: false, isError: !!restError };
    const apy = restData !== null ? restData * 100 : null;
    return { apy, daysBack: 7, label: "7D APY", isLoading: false, isError: false };
  }

  if (!onchainEnabled || onchainLoading) {
    return { apy: null, daysBack: null, label: "7D APY", isLoading: onchainLoading, isError: false };
  }
  if (onchainError || onchainData === null || onchainData === undefined) {
    return { apy: null, daysBack: null, label: "7D APY", isLoading: false, isError: !!onchainError };
  }

  const days        = onchainData.daysBack ?? 7;
  const roundedDays = Math.round(days);
  const label       = roundedDays >= 6 ? "7D APY" : `${roundedDays}D APY`;

  return { apy: onchainData.apy, daysBack: onchainData.daysBack, label, isLoading: false, isError: false };
}
