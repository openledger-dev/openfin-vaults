"use client";

import { useReadContracts } from "wagmi";
import { VAULT_READ_ABI, ERC20_ABI } from "@/lib/vaultAbi";
import type { PlatformConfig } from "@/lib/vaultConfig";

export type VaultOnChainData = {
  address: `0x${string}`;
  platformId: string;
  platformLabel: string;
  /** Vault share token name, e.g. "UltraYield USD" */
  name: string;
  /** Vault share token symbol */
  symbol: string;
  /** Vault share token decimals (ERC-20 `decimals()` on the vault contract) */
  decimals: number;
  /** Underlying asset contract address (ERC-4626 primary/base asset) */
  assetAddress: `0x${string}` | undefined;
  /** Underlying asset symbol (USDC / WETH / WBTC …) */
  assetSymbol: string | undefined;
  /** Underlying asset decimals */
  assetDecimals: number | undefined;
  /** Raw totalAssets from the vault (in asset units, unscaled) */
  totalAssets: bigint | undefined;
  /** Raw totalSupply of vault shares */
  totalSupply: bigint | undefined;
  /** Whether the vault is paused */
  isPaused: boolean;
  /** Performance fee (1e18 = 100%) — from Fees.performanceFee */
  performanceFee: bigint | undefined;
  /** Management fee (1e18 = 100%) — from Fees.managementFee */
  managementFee: bigint | undefined;
  /** Withdrawal fee (1e18 = 100%) — from Fees.withdrawalFee */
  withdrawalFee: bigint | undefined;
  /** UltraVaultOracle contract address — needed for 7-day APY log queries */
  oracleAddress: `0x${string}` | undefined;
  /**
   * IUltraVaultRateProvider address — needed to discover all supported deposit
   * assets (USDC, USDT, etc.) via AssetAdded / AssetRemoved event logs.
   */
  rateProviderAddress: `0x${string}` | undefined;
  /**
   * Current share price in oracle units: totalAssets × 1e18 / totalSupply.
   * Used as the "current price" reference for 7-day APY computation.
   */
  sharePrice: bigint | undefined;
  /** Connected user's raw share balance (undefined when wallet not connected) */
  userShares: bigint | undefined;
  /**
   * User's position expressed in underlying asset units.
   * Derived as: userShares × totalAssets / totalSupply (ERC-4626 formula).
   */
  userAssetsRaw: bigint | undefined;
  /** True while any on-chain data is still loading */
  isLoading: boolean;
  /** True if the on-chain read encountered an error */
  isError: boolean;
};

const VAULT_FIELDS = [
  "name",         // 0
  "symbol",       // 1
  "asset",        // 2 — ERC-4626 base asset address
  "totalAssets",  // 3
  "totalSupply",  // 4
  "paused",       // 5
  "getFees",      // 6
  "oracle",       // 7 — UltraVault.oracle() → IPriceSource address
  "rateProvider", // 8 — IUltraVaultRateProvider (for multi-asset discovery)
  "decimals",     // 9 — share token decimals (must match balanceOf / totalSupply scale)
] as const;

type VaultField = (typeof VAULT_FIELDS)[number];
const VAULT_FIELD_COUNT = VAULT_FIELDS.length;

/**
 * Fetches on-chain data for every vault in every platform.
 *
 * Three-stage multicall:
 *  1. Vault metadata (name, symbol, asset, totalAssets, totalSupply, paused, fees)
 *  2. Asset token metadata (symbol, decimals) — requires Stage 1 asset addresses
 *  3. User share balances — only when userAddress is provided (wallet connected)
 */
export function useVaultData(
  platforms: PlatformConfig[],
  userAddress?: `0x${string}`
): {
  vaults: VaultOnChainData[];
  isLoading: boolean;
} {
  const allVaults = platforms.flatMap((p) =>
    p.vaults.map((v) => ({ ...v, platformId: p.id, platformLabel: p.label }))
  );

  // ── Stage 1: read vault metadata ────────────────────────────────────────────
  const stage1Contracts = allVaults.flatMap((v) =>
    VAULT_FIELDS.map((fn) => ({
      address: v.address,
      abi: VAULT_READ_ABI,
      functionName: fn as VaultField,
    }))
  );

  const { data: stage1Data, isLoading: s1Loading } = useReadContracts({
    contracts: stage1Contracts,
    query: { enabled: allVaults.length > 0 },
  });

  // Extract asset addresses once stage 1 has resolved
  const assetAddresses: (`0x${string}` | undefined)[] = allVaults.map((_, i) => {
    const assetResult = stage1Data?.[i * VAULT_FIELD_COUNT + 2]; // index 2 = "asset"
    if (assetResult?.status === "success") {
      return assetResult.result as `0x${string}`;
    }
    return undefined;
  });

  const hasAllAssets =
    assetAddresses.length > 0 && assetAddresses.every(Boolean);

  // ── Stage 2: read asset token symbol + decimals ──────────────────────────────
  const stage2Contracts = (hasAllAssets ? assetAddresses : []).flatMap(
    (addr) => [
      { address: addr!, abi: ERC20_ABI, functionName: "symbol" as const },
      { address: addr!, abi: ERC20_ABI, functionName: "decimals" as const },
    ]
  );

  const { data: stage2Data, isLoading: s2Loading } = useReadContracts({
    contracts: stage2Contracts,
    query: { enabled: hasAllAssets },
  });

  // ── Stage 3: read user share balances (wallet connected only) ────────────────
  const stage3Contracts = (userAddress && hasAllAssets ? allVaults : []).map(
    (v) => ({
      address: v.address,
      abi: ERC20_ABI,
      functionName: "balanceOf" as const,
      args: [userAddress!] as [`0x${string}`],
    })
  );

  const { data: stage3Data, isLoading: s3Loading } = useReadContracts({
    contracts: stage3Contracts,
    query: { enabled: !!userAddress && hasAllAssets },
  });

  // ── Assemble final array ─────────────────────────────────────────────────────
  const vaults: VaultOnChainData[] = allVaults.map((vault, i) => {
    const base = i * VAULT_FIELD_COUNT;
    const nameRes          = stage1Data?.[base + 0];
    const symbolRes        = stage1Data?.[base + 1];
    const assetRes         = stage1Data?.[base + 2];
    const totalAssetsRes   = stage1Data?.[base + 3];
    const totalSupplyRes   = stage1Data?.[base + 4];
    const pausedRes        = stage1Data?.[base + 5];
    const feesRes          = stage1Data?.[base + 6];
    const oracleRes        = stage1Data?.[base + 7];
    const rateProviderRes  = stage1Data?.[base + 8];
    const decimalsRes      = stage1Data?.[base + 9];

    const assetAddress =
      assetRes?.status === "success"
        ? (assetRes.result as `0x${string}`)
        : undefined;

    const assetSymbolRes = stage2Data?.[i * 2 + 0];
    const assetDecimalsRes = stage2Data?.[i * 2 + 1];

    // Full Fees struct from IUltraVault.sol:
    // { performanceFee, managementFee, withdrawalFee, lastUpdateTimestamp, highwaterMark }
    const fees =
      feesRes?.status === "success"
        ? (feesRes.result as {
            performanceFee: bigint;
            managementFee: bigint;
            withdrawalFee: bigint;
            lastUpdateTimestamp: bigint;
            highwaterMark: bigint;
          })
        : undefined;

    const totalAssets =
      totalAssetsRes?.status === "success"
        ? (totalAssetsRes.result as bigint)
        : undefined;
    const totalSupply =
      totalSupplyRes?.status === "success"
        ? (totalSupplyRes.result as bigint)
        : undefined;

    // Stage 3: user balance
    const userSharesRes = stage3Data?.[i];
    const userShares =
      userSharesRes?.status === "success"
        ? (userSharesRes.result as bigint)
        : undefined;

    // ERC-4626 conversion: userAssets = userShares × totalAssets / totalSupply
    const userAssetsRaw =
      userShares !== undefined &&
      totalAssets !== undefined &&
      totalSupply !== undefined &&
      totalSupply > BigInt(0)
        ? (userShares * totalAssets) / totalSupply
        : undefined;

    return {
      address: vault.address,
      platformId: vault.platformId,
      platformLabel: vault.platformLabel,
      name:
        nameRes?.status === "success"
          ? (nameRes.result as string)
          : vault.address,
      symbol:
        symbolRes?.status === "success" ? (symbolRes.result as string) : "—",
      decimals:
        decimalsRes?.status === "success"
          ? (decimalsRes.result as number)
          : 18,
      assetAddress,
      assetSymbol:
        assetSymbolRes?.status === "success"
          ? (assetSymbolRes.result as string)
          : undefined,
      assetDecimals:
        assetDecimalsRes?.status === "success"
          ? (assetDecimalsRes.result as number)
          : undefined,
      totalAssets,
      totalSupply,
      isPaused:
        pausedRes?.status === "success"
          ? (pausedRes.result as boolean)
          : false,
      performanceFee: fees?.performanceFee,
      managementFee: fees?.managementFee,
      withdrawalFee: fees?.withdrawalFee,
      oracleAddress:
        oracleRes?.status === "success" ? (oracleRes.result as `0x${string}`) : undefined,
      rateProviderAddress:
        rateProviderRes?.status === "success" ? (rateProviderRes.result as `0x${string}`) : undefined,
      sharePrice:
        totalAssets !== undefined && totalSupply !== undefined && totalSupply > BigInt(0)
          ? (totalAssets * BigInt(1e18)) / totalSupply
          : undefined,
      userShares,
      userAssetsRaw,
      isLoading: s1Loading || s2Loading || s3Loading,
      isError:
        nameRes?.status === "failure" || assetRes?.status === "failure",
    };
  });

  return { vaults, isLoading: s1Loading || s2Loading || s3Loading };
}
