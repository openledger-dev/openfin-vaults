"use client";

/**
 * Adapter for UltraYield vaults.
 *
 * Uses a 3-stage wagmi multicall:
 *   1. UltraVault view functions (name, symbol, asset, totalAssets, totalSupply,
 *      paused, getFees, oracle, rateProvider, decimals)
 *   2. Underlying asset ERC-20 (symbol, decimals)
 *   3. User share balanceOf (only when wallet connected)
 *
 * APY is fetched from the UltraYield REST API via /api/ultrayield/apys
 * (cached in Redis for 5 min). On-chain PriceUpdated event-log scan is
 * used as fallback in the detail page via use7dApy.
 */

import { useReadContracts } from "wagmi";
import { useQuery } from "@tanstack/react-query";
import { VAULT_READ_ABI, ERC20_ABI } from "@/lib/vaultAbi";
import type { PlatformConfig } from "@/lib/vaultConfig";
import type { VaultOnChainData } from "@/hooks/useVaultData";

const VAULT_FIELDS = [
  "name",         // 0
  "symbol",       // 1
  "asset",        // 2 — ERC-4626 base asset address
  "totalAssets",  // 3
  "totalSupply",  // 4
  "paused",       // 5
  "getFees",      // 6
  "oracle",       // 7 — UltraVault.oracle() → IPriceSource address
  "rateProvider", // 8 — IUltraVaultRateProvider
  "decimals",     // 9 — share token decimals
] as const;

type VaultField = (typeof VAULT_FIELDS)[number];
const VAULT_FIELD_COUNT = VAULT_FIELDS.length;

export function useUltraYieldVaultData(
  platforms: PlatformConfig[],
  userAddress?: `0x${string}`
): { vaults: VaultOnChainData[]; isLoading: boolean } {
  const allVaults = platforms
    .filter((p) => p.kind === "ultrayield")
    .flatMap((p) =>
      p.vaults.map((v) => ({
        ...v,
        platformId: p.id,
        platformLabel: p.label,
        // vault-level chainId (set via address@chainId in env) takes precedence
        chainId: v.chainId ?? p.chainId,
      }))
    );

  // ── Stage 1: vault metadata (chainId forces correct chain) ───────────────
  const stage1Contracts = allVaults.flatMap((v) =>
    VAULT_FIELDS.map((fn) => ({
      address: v.address,
      abi: VAULT_READ_ABI,
      functionName: fn as VaultField,
      chainId: v.chainId,
    }))
  );

  const { data: stage1Data, isLoading: s1Loading } = useReadContracts({
    contracts: stage1Contracts,
    query: { enabled: allVaults.length > 0 },
  });

  const assetAddresses: (`0x${string}` | undefined)[] = allVaults.map((_, i) => {
    const r = stage1Data?.[i * VAULT_FIELD_COUNT + 2];
    return r?.status === "success" ? (r.result as `0x${string}`) : undefined;
  });

  const hasAllAssets = assetAddresses.length > 0 && assetAddresses.every(Boolean);

  // ── Stage 2: asset token symbol + decimals ────────────────────────────────
  const stage2Contracts = hasAllAssets
    ? assetAddresses.flatMap((addr, i) => [
        { address: addr!, abi: ERC20_ABI, functionName: "symbol"   as const, chainId: allVaults[i].chainId },
        { address: addr!, abi: ERC20_ABI, functionName: "decimals" as const, chainId: allVaults[i].chainId },
      ])
    : [];

  const { data: stage2Data, isLoading: s2Loading } = useReadContracts({
    contracts: stage2Contracts,
    query: { enabled: hasAllAssets },
  });

  // ── Stage 3: user share balances ──────────────────────────────────────────
  const stage3Contracts = (userAddress && hasAllAssets ? allVaults : []).map((v) => ({
    address: v.address,
    abi: ERC20_ABI,
    functionName: "balanceOf" as const,
    args: [userAddress!] as [`0x${string}`],
    chainId: v.chainId,
  }));

  const { data: stage3Data, isLoading: s3Loading } = useReadContracts({
    contracts: stage3Contracts,
    query: { enabled: !!userAddress && hasAllAssets },
  });

  // ── Stage 4: pending + claimable redeem state per vault ───────────────────
  const stage4Contracts = (userAddress && hasAllAssets ? allVaults : []).flatMap((v, i) => {
    const addr = assetAddresses[i];
    if (!addr) return [];
    return [
      { address: v.address, abi: VAULT_READ_ABI, functionName: "getPendingRedeemForAsset"   as const, args: [addr, userAddress!] as [`0x${string}`, `0x${string}`], chainId: v.chainId },
      { address: v.address, abi: VAULT_READ_ABI, functionName: "getClaimableRedeemForAsset" as const, args: [addr, userAddress!] as [`0x${string}`, `0x${string}`], chainId: v.chainId },
    ];
  });

  const { data: stage4Data, isLoading: s4Loading } = useReadContracts({
    contracts: stage4Contracts,
    query: { enabled: !!userAddress && hasAllAssets },
  });

  // ── UltraYield REST API APYs ──────────────────────────────────────────────
  const slugs = allVaults
    .map((v) => v.ultrayieldApiSlug)
    .filter((s): s is string => !!s);

  const { data: apyMap } = useQuery<Record<string, number | null>>({
    queryKey: ["ultrayieldApys", slugs.join(",")],
    enabled: slugs.length > 0,
    staleTime: 5 * 60 * 1_000,
    gcTime:    15 * 60 * 1_000,
    queryFn: async () => {
      const params = new URLSearchParams({ slugs: slugs.join(",") });
      const res = await fetch(`/api/ultrayield/apys?${params}`);
      if (!res.ok) throw new Error(`UltraYield APYs API error: ${res.status}`);
      return res.json() as Promise<Record<string, number | null>>;
    },
  });

  // ── Assemble ──────────────────────────────────────────────────────────────
  const vaults: VaultOnChainData[] = allVaults.map((vault, i) => {
    const base = i * VAULT_FIELD_COUNT;
    const nameRes         = stage1Data?.[base + 0];
    const symbolRes       = stage1Data?.[base + 1];
    const assetRes        = stage1Data?.[base + 2];
    const totalAssetsRes  = stage1Data?.[base + 3];
    const totalSupplyRes  = stage1Data?.[base + 4];
    const pausedRes       = stage1Data?.[base + 5];
    const feesRes         = stage1Data?.[base + 6];
    const oracleRes       = stage1Data?.[base + 7];
    const rateProviderRes = stage1Data?.[base + 8];
    const decimalsRes     = stage1Data?.[base + 9];

    const assetAddress = assetRes?.status === "success"
      ? (assetRes.result as `0x${string}`)
      : undefined;

    const assetSymbolRes   = stage2Data?.[i * 2 + 0];
    const assetDecimalsRes = stage2Data?.[i * 2 + 1];

    const fees = feesRes?.status === "success"
      ? (feesRes.result as {
          performanceFee: bigint; managementFee: bigint; withdrawalFee: bigint;
          lastUpdateTimestamp: bigint; highwaterMark: bigint;
        })
      : undefined;

    const totalAssets  = totalAssetsRes?.status  === "success" ? (totalAssetsRes.result  as bigint) : undefined;
    const totalSupply  = totalSupplyRes?.status  === "success" ? (totalSupplyRes.result  as bigint) : undefined;
    const userSharesRaw = stage3Data?.[i];
    const userShares   = userSharesRaw?.status === "success" ? (userSharesRaw.result as bigint) : undefined;

    const pendingRedeemRes   = stage4Data?.[i * 2 + 0];
    const claimableRedeemRes = stage4Data?.[i * 2 + 1];
    const pendingRedeem   = pendingRedeemRes?.status   === "success"
      ? (pendingRedeemRes.result   as { shares: bigint; requestTime: bigint }) : undefined;
    const claimableRedeem = claimableRedeemRes?.status === "success"
      ? (claimableRedeemRes.result as { assets: bigint; shares: bigint })      : undefined;

    const userAssetsRaw =
      userShares !== undefined && totalAssets !== undefined &&
      totalSupply !== undefined && totalSupply > BigInt(0)
        ? (userShares * totalAssets) / totalSupply
        : undefined;

    return {
      address: vault.address,
      kind: "ultrayield",
      platformId: vault.platformId,
      platformLabel: vault.platformLabel,
      chainId: vault.chainId,
      name: nameRes?.status === "success"
        ? (nameRes.result as string)
        : (vault.displayName ?? `${vault.address.slice(0, 6)}…${vault.address.slice(-4)}`),
      symbol: symbolRes?.status === "success" ? (symbolRes.result as string) : "—",
      decimals: decimalsRes?.status === "success" ? (decimalsRes.result as number) : 18,
      assetAddress,
      assetSymbol: assetSymbolRes?.status === "success" ? (assetSymbolRes.result as string) : undefined,
      assetDecimals: assetDecimalsRes?.status === "success" ? (assetDecimalsRes.result as number) : undefined,
      totalAssets,
      totalSupply,
      isPaused: pausedRes?.status === "success" ? (pausedRes.result as boolean) : false,
      performanceFee: fees?.performanceFee,
      managementFee: fees?.managementFee,
      withdrawalFee: fees?.withdrawalFee,
      oracleAddress: oracleRes?.status === "success" ? (oracleRes.result as `0x${string}`) : undefined,
      rateProviderAddress: rateProviderRes?.status === "success" ? (rateProviderRes.result as `0x${string}`) : undefined,
      liquidityRaw: undefined,
      sharePrice:
        totalAssets !== undefined && totalSupply !== undefined && totalSupply > BigInt(0)
          ? (totalAssets * BigInt(1e18)) / totalSupply
          : undefined,
      userShares,
      userAssetsRaw,
      apyPrefetched: vault.ultrayieldApiSlug
        ? (apyMap?.[vault.ultrayieldApiSlug] ?? null)
        : null,
      ultrayieldApiSlug: vault.ultrayieldApiSlug,
      pendingShares:      pendingRedeem?.shares,
      pendingRequestTime: pendingRedeem?.requestTime,
      claimableAssets:    claimableRedeem?.assets,
      claimableShares:    claimableRedeem?.shares,
      depositVaultAddress: undefined,
      redemptionVaultAddress: undefined,
      midasApiKey: undefined,
      isLoading: s1Loading || s2Loading || s3Loading || s4Loading,
      isError: nameRes?.status === "failure" || assetRes?.status === "failure",
    };
  });

  return { vaults, isLoading: s1Loading || s2Loading || s3Loading || s4Loading };
}
