"use client";

/**
 * Adapter for Morpho MetaMorpho vaults (V1 and V2).
 *
 * Morpho vaults are pure ERC-4626 — the multicall reads are identical to
 * UltraYield minus the UltraYield-specific calls (oracle, rateProvider, getFees).
 *
 * WHY chainId per contract:
 *   useReadContracts defaults to the wallet's connected chain. Morpho vaults
 *   are often on Base (8453) while the wallet may be on mainnet (1). Passing
 *   chainId to each contract entry forces wagmi to query the correct chain
 *   regardless of what the user's wallet is connected to.
 *
 * APY comes from the Morpho GraphQL API (weeklyNetApy), not event logs.
 */

import { useReadContracts } from "wagmi";
import { useQuery } from "@tanstack/react-query";
import { ERC20_ABI } from "@/lib/vaultAbi";
import type { PlatformConfig } from "@/lib/vaultConfig";
import type { VaultOnChainData } from "@/hooks/useVaultData";
import { fetchMorphoVaultApys } from "@/lib/morphoApi";
import type { MorphoVaultApy } from "@/lib/morphoApi";

// MetaMorpho read ABI — ERC-4626 standard + totalIdle (MetaMorpho-specific)
const ERC4626_READ_ABI = [
  { name: "name",        type: "function", stateMutability: "view", inputs: [], outputs: [{ type: "string"  }] },
  { name: "symbol",      type: "function", stateMutability: "view", inputs: [], outputs: [{ type: "string"  }] },
  { name: "decimals",    type: "function", stateMutability: "view", inputs: [], outputs: [{ type: "uint8"   }] },
  { name: "totalSupply", type: "function", stateMutability: "view", inputs: [], outputs: [{ type: "uint256" }] },
  { name: "asset",       type: "function", stateMutability: "view", inputs: [], outputs: [{ type: "address" }] },
  { name: "totalAssets", type: "function", stateMutability: "view", inputs: [], outputs: [{ type: "uint256" }] },
  { name: "totalIdle",   type: "function", stateMutability: "view", inputs: [], outputs: [{ type: "uint256" }] },
] as const;

const FIELD_COUNT = ERC4626_READ_ABI.length; // 7
type MorphoField = (typeof ERC4626_READ_ABI)[number]["name"];

export function useMorphoVaultData(
  platforms: PlatformConfig[],
  userAddress?: `0x${string}`
): { vaults: VaultOnChainData[]; isLoading: boolean } {
  const morphoPlatforms = platforms.filter((p) => p.kind === "morpho");

  const allVaults = morphoPlatforms.flatMap((p) =>
    p.vaults.map((v) => ({
      ...v,
      platformId: p.id,
      platformLabel: p.label,
      // vault-level chainId (set via address@chainId in env) takes precedence
      chainId: v.chainId ?? p.chainId,
    }))
  );

  // ── Stage 1: ERC-4626 metadata (chainId forces correct chain) ────────────
  const stage1Contracts = allVaults.flatMap((v) =>
    ERC4626_READ_ABI.map((fn) => ({
      address: v.address,
      abi: ERC4626_READ_ABI,
      functionName: fn.name as MorphoField,
      chainId: v.chainId,
    }))
  );

  const { data: stage1Data, isLoading: s1Loading } = useReadContracts({
    contracts: stage1Contracts,
    query: { enabled: allVaults.length > 0 },
  });

  const assetAddresses: (`0x${string}` | undefined)[] = allVaults.map((_, i) => {
    const r = stage1Data?.[i * FIELD_COUNT + 4]; // index 4 = "asset"
    return r?.status === "success" ? (r.result as `0x${string}`) : undefined;
  });

  const hasAllAssets = assetAddresses.length > 0 && assetAddresses.every(Boolean);

  // ── Stage 2: asset symbol + decimals ─────────────────────────────────────
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

  // ── Morpho GraphQL APY (per vault chainId) ───────────────────────────────
  // Group vault addresses by their resolved chainId (vault-level overrides platform).
  const chainGroups = allVaults.reduce<Record<number, string[]>>((acc, v) => {
    if (!acc[v.chainId]) acc[v.chainId] = [];
    acc[v.chainId].push(v.address);
    return acc;
  }, {});

  const { data: apyMap, isLoading: apyLoading } = useQuery({
    queryKey: ["morphoApys", JSON.stringify(chainGroups)],
    enabled: allVaults.length > 0,
    staleTime: 5 * 60 * 1_000,
    gcTime: 15 * 60 * 1_000,
    queryFn: async () => {
      const results: Record<string, MorphoVaultApy> = {};
      await Promise.all(
        Object.entries(chainGroups).map(async ([chainIdStr, addresses]) => {
          const data = await fetchMorphoVaultApys(addresses, parseInt(chainIdStr, 10));
          Object.assign(results, data);
        })
      );
      return results;
    },
  });

  // ── Assemble ──────────────────────────────────────────────────────────────
  const vaults: VaultOnChainData[] = allVaults.map((vault, i) => {
    const base = i * FIELD_COUNT;
    const nameRes        = stage1Data?.[base + 0];
    const symbolRes      = stage1Data?.[base + 1];
    const decimalsRes    = stage1Data?.[base + 2];
    const totalSupplyRes = stage1Data?.[base + 3];
    const assetRes       = stage1Data?.[base + 4];
    const totalAssetsRes = stage1Data?.[base + 5];
    const totalIdleRes   = stage1Data?.[base + 6];

    const assetAddress     = assetRes?.status     === "success" ? (assetRes.result     as `0x${string}`) : undefined;
    const assetSymbolRes   = stage2Data?.[i * 2 + 0];
    const assetDecimalsRes = stage2Data?.[i * 2 + 1];
    const userSharesRaw    = stage3Data?.[i];

    const totalAssets  = totalAssetsRes?.status === "success" ? (totalAssetsRes.result as bigint) : undefined;
    const totalSupply  = totalSupplyRes?.status === "success" ? (totalSupplyRes.result as bigint) : undefined;
    const liquidityRaw = totalIdleRes?.status   === "success" ? (totalIdleRes.result   as bigint) : undefined;
    const userShares   = userSharesRaw?.status  === "success" ? (userSharesRaw.result  as bigint) : undefined;

    const userAssetsRaw =
      userShares !== undefined && totalAssets !== undefined &&
      totalSupply !== undefined && totalSupply > BigInt(0)
        ? (userShares * totalAssets) / totalSupply
        : undefined;

    const apiEntry = apyMap?.[vault.address.toLowerCase()];

    return {
      address: vault.address,
      kind: "morpho",
      platformId: vault.platformId,
      platformLabel: vault.platformLabel,
      chainId: vault.chainId,
      name:   nameRes?.status   === "success" ? (nameRes.result   as string) : (apiEntry?.name   ?? vault.address),
      symbol: symbolRes?.status === "success" ? (symbolRes.result as string) : (apiEntry?.symbol ?? "—"),
      decimals: decimalsRes?.status === "success" ? (decimalsRes.result as number) : 18,
      assetAddress,
      assetSymbol:   assetSymbolRes?.status   === "success" ? (assetSymbolRes.result   as string) : undefined,
      assetDecimals: assetDecimalsRes?.status === "success" ? (assetDecimalsRes.result as number) : undefined,
      totalAssets,
      totalSupply,
      liquidityRaw,
      isPaused: false,
      performanceFee: undefined,
      managementFee: undefined,
      withdrawalFee: undefined,
      oracleAddress: undefined,
      rateProviderAddress: undefined,
      sharePrice:
        totalAssets !== undefined && totalSupply !== undefined && totalSupply > BigInt(0)
          ? (totalAssets * BigInt(1e18)) / totalSupply
          : undefined,
      userShares,
      userAssetsRaw,
      apyPrefetched: apiEntry?.weeklyNetApy ?? null,
      pendingShares: undefined,
      pendingRequestTime: undefined,
      claimableAssets: undefined,
      claimableShares: undefined,
      depositVaultAddress: undefined,
      redemptionVaultAddress: undefined,
      midasApiKey: undefined,
      isLoading: s1Loading || s2Loading || s3Loading || apyLoading,
      isError: nameRes?.status === "failure" || assetRes?.status === "failure",
    };
  });

  return { vaults, isLoading: s1Loading || s2Loading || s3Loading || apyLoading };
}
