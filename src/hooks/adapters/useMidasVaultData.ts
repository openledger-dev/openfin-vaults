"use client";

/**
 * Adapter for Midas token vaults.
 *
 * Midas tokens are NOT ERC-4626. Each token comes with a separate Deposit
 * Vault and Redemption Vault. This adapter:
 *
 *   1. Reads the share token's ERC-20 metadata (name, symbol, decimals,
 *      totalSupply) and the user's share balance.
 *   2. Fetches APY and token price from the Midas REST API.
 *   3. Derives TVL as totalSupply × sharePrice (price in USD terms).
 *
 * Because Midas vaults don't implement ERC-4626's `asset()` / `totalAssets()`,
 * we set assetAddress to the first configured payment token and compute
 * totalAssets from the price API (totalSupply × price = TVL in USD).
 *
 * Note: depositInstant / redeemInstant always take amounts with 18 decimals
 * regardless of the payment token's decimals — handled in MidasVaultActionModal.
 */

import { useReadContracts } from "wagmi";
import { useQuery } from "@tanstack/react-query";
import { ERC20_ABI } from "@/lib/vaultAbi";
import type { PlatformConfig } from "@/lib/vaultConfig";
import type { VaultOnChainData } from "@/hooks/useVaultData";
import type { MidasApyMap, MidasPriceMap, MidasTvlMap } from "@/lib/midasApi";

// USDC has 6 decimals — we use it as the "display asset" for Midas tokens
// since most Midas tokens accept USDC as a payment token.
const USDC_DECIMALS = 6;

export function useMidasVaultData(
  platforms: PlatformConfig[],
  userAddress?: `0x${string}`
): { vaults: VaultOnChainData[]; isLoading: boolean } {
  const allVaults = platforms
    .filter((p) => p.kind === "midas")
    .flatMap((p) =>
      p.vaults.map((v) => ({ ...v, platformId: p.id, platformLabel: p.label, chainId: p.chainId }))
    );

  // ── Stage 1: share token ERC-20 metadata (chainId forces correct chain) ──
  const stage1Contracts = allVaults.flatMap((v) => [
    { address: v.address, abi: ERC20_ABI, functionName: "name"        as const, chainId: v.chainId },
    { address: v.address, abi: ERC20_ABI, functionName: "symbol"      as const, chainId: v.chainId },
    { address: v.address, abi: ERC20_ABI, functionName: "decimals"    as const, chainId: v.chainId },
    { address: v.address, abi: ERC20_ABI, functionName: "totalSupply" as const, chainId: v.chainId },
  ]);

  const FIELD_COUNT = 4;
  const { data: stage1Data, isLoading: s1Loading } = useReadContracts({
    contracts: stage1Contracts,
    query: { enabled: allVaults.length > 0 },
  });

  // ── Stage 2: user share balance ───────────────────────────────────────────
  const stage2Contracts = (userAddress ? allVaults : []).map((v) => ({
    address: v.address,
    abi: ERC20_ABI,
    functionName: "balanceOf" as const,
    args: [userAddress!] as [`0x${string}`],
    chainId: v.chainId,
  }));

  const { data: stage2Data, isLoading: s2Loading } = useReadContracts({
    contracts: stage2Contracts,
    query: { enabled: !!userAddress && allVaults.length > 0 },
  });

  // ── Midas REST: APYs + prices (via Redis-cached API routes) ──────────────
  const { data: midasApys, isLoading: apyLoading } = useQuery({
    queryKey: ["midasApys"],
    enabled: allVaults.length > 0,
    staleTime: 5 * 60 * 1_000,
    gcTime:   15 * 60 * 1_000,
    queryFn: () =>
      fetch("/api/midas/apys").then((r) => {
        if (!r.ok) throw new Error(`Midas APY API error: ${r.status}`);
        return r.json() as Promise<MidasApyMap>;
      }),
  });

  const { data: midasPrices, isLoading: priceLoading } = useQuery({
    queryKey: ["midasPrices"],
    enabled: allVaults.length > 0,
    staleTime: 10 * 60 * 1_000,
    gcTime:   20 * 60 * 1_000,
    queryFn: () =>
      fetch("/api/midas/prices").then((r) => {
        if (!r.ok) throw new Error(`Midas prices API error: ${r.status}`);
        return r.json() as Promise<MidasPriceMap>;
      }),
  });

  const { data: midasTvls, isLoading: tvlLoading } = useQuery({
    queryKey: ["midasTvls"],
    enabled: allVaults.length > 0,
    staleTime: 10 * 60 * 1_000,
    gcTime:   20 * 60 * 1_000,
    queryFn: () =>
      fetch("/api/midas/tvl").then((r) => {
        if (!r.ok) throw new Error(`Midas TVL API error: ${r.status}`);
        return r.json() as Promise<MidasTvlMap>;
      }),
  });

  // ── Assemble ──────────────────────────────────────────────────────────────
  const vaults: VaultOnChainData[] = allVaults.map((vault, i) => {
    const base = i * FIELD_COUNT;
    const nameRes        = stage1Data?.[base + 0];
    const symbolRes      = stage1Data?.[base + 1];
    const decimalsRes    = stage1Data?.[base + 2];
    const totalSupplyRes = stage1Data?.[base + 3];
    const userSharesRaw  = stage2Data?.[i];

    const totalSupply = totalSupplyRes?.status === "success" ? (totalSupplyRes.result as unknown as bigint) : undefined;
    const userShares  = userSharesRaw?.status  === "success" ? (userSharesRaw.result  as unknown as bigint) : undefined;
    const vaultDec    = decimalsRes?.status    === "success" ? (decimalsRes.result    as unknown as number) : 18;

    // Use explicit midasApiKey, with symbol fallback for newly listed tokens.
    const symbolFromChain =
      symbolRes?.status === "success" ? String(symbolRes.result).toLowerCase() : undefined;
    const apiKey = vault.midasApiKey?.toLowerCase() ?? symbolFromChain;
    const apy    = apiKey && midasApys  ? (midasApys[apiKey]   ?? null) : null;
    const price  = apiKey && midasPrices ? (midasPrices[apiKey] ?? null) : null;
    const tvlUsd = apiKey && midasTvls ? (midasTvls[apiKey] ?? null) : null;

    // Derive totalAssets in the primary payment token's unit.
    // price is USD per share (18-decimal token) → scale to 6-decimal USDC units.
    // totalAssets ≈ totalSupply × price × 10^(USDC_decimals) / 10^(share_decimals)
    const totalAssets = totalSupply !== undefined && price !== null
      ? BigInt(
          Math.round(
            (Number(totalSupply) / 10 ** vaultDec) * price * 10 ** USDC_DECIMALS
          )
        )
      : tvlUsd !== null
        ? BigInt(Math.round(tvlUsd * 10 ** USDC_DECIMALS))
        : undefined;

    const userAssetsRaw =
      userShares !== undefined && price !== null
        ? BigInt(Math.round(
            (Number(userShares) / 10 ** vaultDec) * price * 10 ** USDC_DECIMALS
          ))
        : undefined;

    // Primary display asset = first configured payment token (or USDC fallback)
    const primaryAsset = vault.assets?.[0];

    return {
      address: vault.address,
      kind: "midas",
      platformId: vault.platformId,
      platformLabel: vault.platformLabel,
      chainId: vault.chainId,
      name:
        nameRes?.status === "success"
          ? (nameRes.result as string)
          : vault.displayName ?? vault.address,
      symbol: symbolRes?.status === "success" ? (symbolRes.result as string) : "—",
      decimals: vaultDec,
      assetAddress: primaryAsset?.address,
      assetSymbol: primaryAsset?.symbol ?? "USD",
      assetDecimals: primaryAsset?.decimals ?? USDC_DECIMALS,
      totalAssets,
      totalSupply,
      isPaused: false,
      performanceFee: undefined,
      managementFee: undefined,
      withdrawalFee: undefined,
      oracleAddress: undefined,
      rateProviderAddress: undefined,
      liquidityRaw: undefined,
      sharePrice:
        price !== null
          ? BigInt(Math.round(price * 10 ** USDC_DECIMALS))
          : undefined,
      userShares,
      userAssetsRaw,
      apyPrefetched: apy,
      pendingShares: undefined,
      pendingRequestTime: undefined,
      claimableAssets: undefined,
      claimableShares: undefined,
      depositVaultAddress: vault.depositVaultAddress,
      redemptionVaultAddress: vault.redemptionVaultAddress,
      midasApiKey: vault.midasApiKey,
      ultrayieldApiSlug: undefined,
      isLoading: s1Loading || s2Loading || apyLoading || priceLoading || tvlLoading,
      isError: nameRes?.status === "failure",
    };
  });

  return { vaults, isLoading: s1Loading || s2Loading || apyLoading || priceLoading || tvlLoading };
}
