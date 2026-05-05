"use client";

/**
 * Central vault data orchestrator.
 *
 * Delegates to per-platform adapters and merges their results into a single
 * normalized VaultOnChainData[]. Components consume this array without knowing
 * which protocol each vault belongs to.
 *
 * Adapter routing:
 *   "ultrayield" → useUltraYieldVaultData  (multicall + PriceUpdated event APY)
 *   "morpho"     → useMorphoVaultData      (ERC-4626 multicall + Morpho GraphQL)
 *   "midas"      → useMidasVaultData       (ERC-20 reads + Midas REST API)
 */

import { useMemo } from "react";
import type { PlatformConfig, PlatformKind } from "@/lib/vaultConfig";
import { useUltraYieldVaultData } from "./adapters/useUltraYieldVaultData";
import { useMorphoVaultData }     from "./adapters/useMorphoVaultData";
import { useMidasVaultData }      from "./adapters/useMidasVaultData";

// ── Normalized vault shape (platform-agnostic) ────────────────────────────────

export type VaultOnChainData = {
  address: `0x${string}`;
  /** Contract interface type — drives adapter, modal, and APY source */
  kind: PlatformKind;
  platformId: string;
  platformLabel: string;
  /** EVM chain ID this vault is deployed on. Used for network name display and explorer links. */
  chainId: number;
  /** Vault share token name */
  name: string;
  /** Vault share token symbol */
  symbol: string;
  /** Vault share token decimals */
  decimals: number;
  /** Underlying asset contract address */
  assetAddress: `0x${string}` | undefined;
  /** Underlying asset symbol */
  assetSymbol: string | undefined;
  /** Underlying asset decimals */
  assetDecimals: number | undefined;
  /** Raw totalAssets (in asset units, unscaled) */
  totalAssets: bigint | undefined;
  /** Raw totalSupply of vault shares */
  totalSupply: bigint | undefined;
  /**
   * Idle liquidity available for immediate withdrawal.
   * Morpho only (MetaMorpho totalIdle()). Undefined for other platforms.
   */
  liquidityRaw: bigint | undefined;
  /** Whether the vault is paused */
  isPaused: boolean;
  /** Performance fee (1e18 = 100%) */
  performanceFee: bigint | undefined;
  /** Management fee (1e18 = 100%) */
  managementFee: bigint | undefined;
  /** Withdrawal fee (1e18 = 100%) */
  withdrawalFee: bigint | undefined;
  /** UltraVaultOracle address (UltraYield only) */
  oracleAddress: `0x${string}` | undefined;
  /** IUltraVaultRateProvider address (UltraYield only) */
  rateProviderAddress: `0x${string}` | undefined;
  /** Current share price: totalAssets × 1e18 / totalSupply */
  sharePrice: bigint | undefined;
  /** Connected user's raw share balance */
  userShares: bigint | undefined;
  /** User's position in underlying asset units */
  userAssetsRaw: bigint | undefined;
  /**
   * Pre-fetched APY as a decimal fraction (0.05 = 5%).
   * Populated by Midas and Morpho adapters. Null for UltraYield (event-derived).
   */
  apyPrefetched: number | null;
  // ── UltraYield async redeem state ─────────────────────────────────────────
  /** Shares currently escrowed in a pending (unfulfilled) redeem request */
  pendingShares: bigint | undefined;
  /** Unix timestamp when the redeem request was submitted */
  pendingRequestTime: bigint | undefined;
  /** Claimable asset amount after operator fulfilment */
  claimableAssets: bigint | undefined;
  /** Share tokens locked against claimable assets */
  claimableShares: bigint | undefined;
  // ── Midas-only ────────────────────────────────────────────────────────────
  depositVaultAddress: `0x${string}` | undefined;
  redemptionVaultAddress: `0x${string}` | undefined;
  midasApiKey: string | undefined;
  /** True while any data is still loading */
  isLoading: boolean;
  /** True if a critical on-chain read failed */
  isError: boolean;
};

// ── Orchestrator ──────────────────────────────────────────────────────────────

export function useVaultData(
  platforms: PlatformConfig[],
  userAddress?: `0x${string}`
): {
  vaults: VaultOnChainData[];
  isLoading: boolean;
} {
  const ultraYield = useUltraYieldVaultData(platforms, userAddress);
  const morpho     = useMorphoVaultData(platforms, userAddress);
  const midas      = useMidasVaultData(platforms, userAddress);

  const vaults = useMemo(
    () => [...ultraYield.vaults, ...morpho.vaults, ...midas.vaults],
    [ultraYield.vaults, morpho.vaults, midas.vaults]
  );

  const isLoading = ultraYield.isLoading || morpho.isLoading || midas.isLoading;

  return { vaults, isLoading };
}
