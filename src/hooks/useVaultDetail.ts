"use client";

import { useReadContracts } from "wagmi";
import { formatUnits } from "viem";
import { VAULT_READ_ABI, ERC20_ABI } from "@/lib/vaultAbi";
import type { PlatformKind } from "@/lib/vaultConfig";

export type VaultDetail = {
  // Identity
  address: `0x${string}`;
  kind: PlatformKind;
  name: string;
  symbol: string;
  decimals: number;
  // ERC-4626
  assetAddress: `0x${string}` | undefined;
  assetSymbol: string | undefined;
  assetDecimals: number | undefined;
  totalAssets: bigint | undefined;
  totalSupply: bigint | undefined;
  sharePrice: bigint | undefined;
  sharePriceFormatted: string;
  tvlFormatted: string;
  totalSupplyFormatted: string;
  // State
  isPaused: boolean;
  // Fees — performanceFee available for both UltraYield (getFees) and Morpho (fee())
  performanceFee: bigint | undefined;
  managementFee: bigint | undefined;
  withdrawalFee: bigint | undefined;
  highwaterMark: bigint | undefined;
  performanceFeePercent: number | undefined;
  managementFeePercent: number | undefined;
  withdrawalFeePercent: number | undefined;
  // UltraVault-only addresses
  fundsHolder: `0x${string}` | undefined;
  oracle: `0x${string}` | undefined;
  feeRecipient: `0x${string}` | undefined;
  rateProvider: `0x${string}` | undefined;
  // User state (undefined when wallet not connected)
  userShares: bigint | undefined;
  userSharesFormatted: string;
  userAssetsRaw: bigint | undefined;
  userAssetsFormatted: string;
  userAssetBalance: bigint | undefined;
  userAssetBalanceFormatted: string;
  userAssetAllowance: bigint | undefined;
  userShareAllowance: bigint | undefined;
  // UltraYield async redeem (undefined for Morpho)
  pendingShares: bigint | undefined;
  pendingRequestTime: bigint | undefined;
  claimableAssets: bigint | undefined;
  claimableShares: bigint | undefined;
  // Meta
  isLoading: boolean;
  isError: boolean;
};

// MetaMorpho-specific ABI (fee + feeRecipient)
const METAMORPHO_READ_ABI = [
  { name: "fee",          type: "function", stateMutability: "view", inputs: [], outputs: [{ type: "uint96"  }] },
  { name: "feeRecipient", type: "function", stateMutability: "view", inputs: [], outputs: [{ type: "address" }] },
] as const;

function fmt(raw: bigint | undefined, dec: number, sym?: string): string {
  if (raw === undefined) return "—";
  const n = parseFloat(formatUnits(raw, dec));
  const suffix = sym ? ` ${sym}` : "";
  if (n === 0) return `0${suffix}`;
  if (n >= 1_000_000_000) return `${(n / 1_000_000_000).toFixed(4)}B${suffix}`;
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(4)}M${suffix}`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(4)}K${suffix}`;
  const dp = dec >= 8 ? 8 : 6;
  const fixed = n.toFixed(dp);
  // If the value is too small for the default precision, show the first significant digit
  if (parseFloat(fixed) === 0) {
    const sigPos = -Math.floor(Math.log10(n));
    return `${n.toFixed(sigPos)}${suffix}`;
  }
  return `${fixed}${suffix}`;
}

/**
 * Fetches on-chain detail for a single vault.
 *
 * chainId MUST be passed — it is used on every contract call to ensure wagmi
 * queries the correct chain regardless of the user's connected wallet chain.
 *
 * kind drives which platform-specific reads are performed:
 *   ultrayield → getFees, oracle, fundsHolder, rateProvider, async redeem state
 *   morpho     → MetaMorpho fee() + feeRecipient()
 */
export function useVaultDetail(
  vaultAddress: `0x${string}` | undefined,
  userAddress: `0x${string}` | undefined,
  chainId = 1,
  kind: PlatformKind = "ultrayield",
): VaultDetail {
  const enabled = !!vaultAddress;

  // ── Stage 1a: common ERC-20 + ERC-4626 reads ─────────────────────────────
  // All six functions exist on VAULT_READ_ABI; ERC20_ABI omits name/totalSupply.
  const { data: s1Common, isLoading: s1CommonLoading } = useReadContracts({
    contracts: [
      { address: vaultAddress!, abi: VAULT_READ_ABI, functionName: "name"        as const, chainId },
      { address: vaultAddress!, abi: VAULT_READ_ABI, functionName: "symbol"      as const, chainId },
      { address: vaultAddress!, abi: VAULT_READ_ABI, functionName: "decimals"    as const, chainId },
      { address: vaultAddress!, abi: VAULT_READ_ABI, functionName: "totalSupply" as const, chainId },
      { address: vaultAddress!, abi: VAULT_READ_ABI, functionName: "asset"       as const, chainId },
      { address: vaultAddress!, abi: VAULT_READ_ABI, functionName: "totalAssets" as const, chainId },
    ],
    query: { enabled },
  });

  // ── Stage 1b: UltraYield-specific reads ───────────────────────────────────
  const { data: s1UY, isLoading: s1UYLoading } = useReadContracts({
    contracts: kind === "ultrayield"
      ? [
          { address: vaultAddress!, abi: VAULT_READ_ABI, functionName: "paused"       as const, chainId },
          { address: vaultAddress!, abi: VAULT_READ_ABI, functionName: "getFees"      as const, chainId },
          { address: vaultAddress!, abi: VAULT_READ_ABI, functionName: "fundsHolder"  as const, chainId },
          { address: vaultAddress!, abi: VAULT_READ_ABI, functionName: "oracle"       as const, chainId },
          { address: vaultAddress!, abi: VAULT_READ_ABI, functionName: "feeRecipient" as const, chainId },
          { address: vaultAddress!, abi: VAULT_READ_ABI, functionName: "rateProvider" as const, chainId },
        ]
      : [],
    query: { enabled: enabled && kind === "ultrayield" },
  });

  // ── Stage 1c: Morpho MetaMorpho-specific reads ────────────────────────────
  const { data: s1MO, isLoading: s1MOLoading } = useReadContracts({
    contracts: kind === "morpho"
      ? [
          { address: vaultAddress!, abi: METAMORPHO_READ_ABI, functionName: "fee"          as const, chainId },
          { address: vaultAddress!, abi: METAMORPHO_READ_ABI, functionName: "feeRecipient" as const, chainId },
        ]
      : [],
    query: { enabled: enabled && kind === "morpho" },
  });

  // ── Stage 1d: user vault-share balance + allowance ────────────────────────
  const { data: s1Shares, isLoading: s1SharesLoading } = useReadContracts({
    contracts: userAddress && vaultAddress
      ? [
          { address: vaultAddress, abi: ERC20_ABI, functionName: "balanceOf" as const, args: [userAddress], chainId },
          { address: vaultAddress, abi: ERC20_ABI, functionName: "allowance" as const, args: [userAddress, vaultAddress], chainId },
        ]
      : [],
    query: { enabled: enabled && !!userAddress },
  });

  // Extract asset address from common stage
  const assetAddress: `0x${string}` | undefined =
    s1Common?.[4]?.status === "success" ? (s1Common[4].result as `0x${string}`) : undefined;
  const hasAsset = !!assetAddress;

  // ── Stage 2a: asset ERC-20 metadata ──────────────────────────────────────
  const { data: s2Meta, isLoading: s2MetaLoading } = useReadContracts({
    contracts: assetAddress
      ? [
          { address: assetAddress, abi: ERC20_ABI, functionName: "symbol"   as const, chainId },
          { address: assetAddress, abi: ERC20_ABI, functionName: "decimals" as const, chainId },
        ]
      : [],
    query: { enabled: hasAsset },
  });

  // ── Stage 2b: user balance + allowance on underlying asset ────────────────
  const { data: s2AssetUser, isLoading: s2AssetUserLoading } = useReadContracts({
    contracts: assetAddress && userAddress && vaultAddress
      ? [
          { address: assetAddress, abi: ERC20_ABI, functionName: "balanceOf" as const, args: [userAddress], chainId },
          { address: assetAddress, abi: ERC20_ABI, functionName: "allowance" as const, args: [userAddress, vaultAddress], chainId },
        ]
      : [],
    query: { enabled: hasAsset && !!userAddress },
  });

  // ── Stage 2c: UltraYield async-redeem state ───────────────────────────────
  const { data: s2Redeem, isLoading: s2RedeemLoading } = useReadContracts({
    contracts: kind === "ultrayield" && userAddress && assetAddress && vaultAddress
      ? [
          { address: vaultAddress, abi: VAULT_READ_ABI, functionName: "getPendingRedeemForAsset"   as const, args: [assetAddress, userAddress], chainId },
          { address: vaultAddress, abi: VAULT_READ_ABI, functionName: "getClaimableRedeemForAsset" as const, args: [assetAddress, userAddress], chainId },
        ]
      : [],
    query: { enabled: kind === "ultrayield" && hasAsset && !!userAddress },
  });

  // ── Assemble ──────────────────────────────────────────────────────────────

  const name         = s1Common?.[0]?.status === "success" ? (s1Common[0].result as string) : (vaultAddress ?? "—");
  const symbol       = s1Common?.[1]?.status === "success" ? (s1Common[1].result as string) : "—";
  const vDec         = s1Common?.[2]?.status === "success" ? (s1Common[2].result as number) : 18;
  const totalSupply  = s1Common?.[3]?.status === "success" ? (s1Common[3].result as bigint) : undefined;
  const totalAssets  = s1Common?.[5]?.status === "success" ? (s1Common[5].result as bigint) : undefined;

  // UltraYield-specific fields
  const isPaused     = s1UY?.[0]?.status === "success"  ? (s1UY[0].result  as boolean)       : false;
  const fees         = s1UY?.[1]?.status === "success"
    ? (s1UY[1].result as { performanceFee: bigint; managementFee: bigint; withdrawalFee: bigint; lastUpdateTimestamp: bigint; highwaterMark: bigint; })
    : undefined;
  const fundsHolder  = s1UY?.[2]?.status === "success"  ? (s1UY[2].result  as `0x${string}`) : undefined;
  const oracle       = s1UY?.[3]?.status === "success"  ? (s1UY[3].result  as `0x${string}`) : undefined;
  const feeRecipientUY = s1UY?.[4]?.status === "success" ? (s1UY[4].result as `0x${string}`) : undefined;
  const rateProvider = s1UY?.[5]?.status === "success"  ? (s1UY[5].result  as `0x${string}`) : undefined;

  // Morpho-specific fields
  const morphoFee          = s1MO?.[0]?.status === "success" ? (s1MO[0].result as bigint) : undefined;
  const feeRecipientMO     = s1MO?.[1]?.status === "success" ? (s1MO[1].result as `0x${string}`) : undefined;

  const feeRecipient = kind === "morpho" ? feeRecipientMO : feeRecipientUY;

  // Consolidate fees: UltraYield uses getFees struct; Morpho uses fee()
  const performanceFee = kind === "morpho" ? morphoFee : fees?.performanceFee;
  const managementFee  = kind === "morpho" ? undefined : fees?.managementFee;
  const withdrawalFee  = kind === "morpho" ? undefined : fees?.withdrawalFee;

  const userShares         = s1Shares?.[0]?.status === "success" ? (s1Shares[0].result as bigint) : undefined;
  const userShareAllowance = s1Shares?.[1]?.status === "success" ? (s1Shares[1].result as bigint) : undefined;

  const userAssetsRaw =
    userShares !== undefined && totalAssets !== undefined && totalSupply !== undefined && totalSupply > BigInt(0)
      ? (userShares * totalAssets) / totalSupply
      : undefined;

  const sharePrice =
    totalAssets !== undefined && totalSupply !== undefined && totalSupply > BigInt(0)
      ? (BigInt(10 ** vDec) * totalAssets) / totalSupply
      : undefined;

  const assetSymbol   = s2Meta?.[0]?.status === "success" ? (s2Meta[0].result as string) : undefined;
  const assetDecimals = s2Meta?.[1]?.status === "success" ? (s2Meta[1].result as number) : undefined;
  const aDec = assetDecimals ?? 18;

  const userAssetBalance   = s2AssetUser?.[0]?.status === "success" ? (s2AssetUser[0].result as bigint) : undefined;
  const userAssetAllowance = s2AssetUser?.[1]?.status === "success" ? (s2AssetUser[1].result as bigint) : undefined;

  const pendingRedeem   = s2Redeem?.[0]?.status === "success"
    ? (s2Redeem[0].result as { shares: bigint; requestTime: bigint }) : undefined;
  const claimableRedeem = s2Redeem?.[1]?.status === "success"
    ? (s2Redeem[1].result as { assets: bigint; shares: bigint }) : undefined;

  const isLoading =
    s1CommonLoading || s1UYLoading || s1MOLoading || s1SharesLoading ||
    s2MetaLoading || s2AssetUserLoading || s2RedeemLoading;

  return {
    address: vaultAddress ?? "0x0000000000000000000000000000000000000000",
    kind,
    name,
    symbol,
    decimals: vDec,
    assetAddress,
    assetSymbol,
    assetDecimals,
    totalAssets,
    totalSupply,
    sharePrice,
    sharePriceFormatted: fmt(sharePrice, aDec, assetSymbol),
    tvlFormatted:        fmt(totalAssets, aDec, assetSymbol),
    totalSupplyFormatted: fmt(totalSupply, vDec, symbol),
    isPaused,
    performanceFee,
    managementFee,
    withdrawalFee,
    highwaterMark: fees?.highwaterMark,
    performanceFeePercent: performanceFee !== undefined ? Number(performanceFee) / 1e16 : undefined,
    managementFeePercent:  managementFee  !== undefined ? Number(managementFee)  / 1e16 : undefined,
    withdrawalFeePercent:  withdrawalFee  !== undefined ? Number(withdrawalFee)  / 1e16 : undefined,
    fundsHolder,
    oracle,
    feeRecipient,
    rateProvider,
    userShares,
    userSharesFormatted: fmt(userShares, vDec, symbol),
    userAssetsRaw,
    userAssetsFormatted: fmt(userAssetsRaw, aDec, assetSymbol),
    userAssetBalance,
    userAssetBalanceFormatted: fmt(userAssetBalance, aDec, assetSymbol),
    userAssetAllowance,
    userShareAllowance,
    pendingShares:    pendingRedeem?.shares,
    pendingRequestTime: pendingRedeem?.requestTime,
    claimableAssets:  claimableRedeem?.assets,
    claimableShares:  claimableRedeem?.shares,
    isLoading,
    isError: s1Common?.[0]?.status === "failure",
  };
}
