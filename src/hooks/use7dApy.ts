"use client";

/**
 * Derives 7-day APY for UltraYield vaults by calling the server-side
 * /api/ultrayield/apy route, which caches the result in Redis for 24 hours.
 *
 * WHY server-side + 24h cache?
 *   The APY requires an eth_getLogs scan over ~50,000 blocks (~7 days on
 *   Ethereum mainnet). This is slow on any RPC and pointless to repeat on
 *   every page load — the figure barely moves within a day.
 *
 * WHY not useChainId() anymore?
 *   We accept an explicit `chainId` prop so the correct chain is always used
 *   regardless of which network the user's wallet is connected to.
 */

import { useQuery } from "@tanstack/react-query";
import { useChainId } from "wagmi";

export type ApyResult = {
  /** Annualised percentage return (e.g. 5.23 means 5.23%) */
  apy: number | null;
  /** Actual number of days covered by the calculation */
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
): ApyResult {
  const connectedChainId = useChainId();
  const chainId = vaultChainId ?? connectedChainId;

  const enabled = !!oracleAddress && !!vaultAddress && !!assetAddress;

  const { data, isLoading, isError } = useQuery({
    queryKey: ["7dApy", chainId, oracleAddress, vaultAddress, assetAddress],
    enabled,
    // Align with the server cache TTL — no point re-fetching before the server
    // cache expires. The API route itself handles the 24h Redis expiry.
    staleTime: 24 * 60 * 60 * 1_000,
    gcTime:    25 * 60 * 60 * 1_000,
    queryFn: async (): Promise<{ apy: number; daysBack: number } | null> => {
      if (!oracleAddress || !vaultAddress || !assetAddress) return null;

      const params = new URLSearchParams({
        chainId: String(chainId),
        oracle:  oracleAddress,
        vault:   vaultAddress,
        asset:   assetAddress,
      });

      const res = await fetch(`/api/ultrayield/apy?${params}`);

      if (res.status === 204) return null; // insufficient oracle history
      if (!res.ok) throw new Error(`UltraYield APY API error: ${res.status}`);

      return res.json() as Promise<{ apy: number; daysBack: number }>;
    },
  });

  if (!enabled || isLoading) {
    return { apy: null, daysBack: null, label: "7D APY", isLoading: true,  isError: false };
  }
  if (isError || data === null || data === undefined) {
    return { apy: null, daysBack: null, label: "7D APY", isLoading: false, isError: !!isError };
  }

  const days        = data.daysBack ?? 7;
  const roundedDays = Math.round(days);
  const label       = roundedDays >= 6 ? "7D APY" : `${roundedDays}D APY`;

  return { apy: data.apy, daysBack: data.daysBack, label, isLoading: false, isError: false };
}
