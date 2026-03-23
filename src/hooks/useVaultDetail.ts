"use client";

import { useReadContracts } from "wagmi";
import { formatUnits } from "viem";
import { VAULT_READ_ABI, ERC20_ABI } from "@/lib/vaultAbi";

export type VaultDetail = {
  // Identity
  address: `0x${string}`;
  name: string;
  symbol: string;
  decimals: number;
  // ERC-4626
  assetAddress: `0x${string}` | undefined;
  assetSymbol: string | undefined;
  assetDecimals: number | undefined;
  totalAssets: bigint | undefined;
  totalSupply: bigint | undefined;
  /** Value of 1 share in asset units (convertToAssets(10^decimals)) */
  sharePrice: bigint | undefined;
  sharePriceFormatted: string;
  tvlFormatted: string;
  totalSupplyFormatted: string;
  // State
  isPaused: boolean;
  // Fees (verified against IUltraVault.sol — all 5 struct fields)
  performanceFee: bigint | undefined;
  managementFee: bigint | undefined;
  withdrawalFee: bigint | undefined;
  highwaterMark: bigint | undefined;
  performanceFeePercent: number | undefined;
  managementFeePercent: number | undefined;
  withdrawalFeePercent: number | undefined;
  // UltraVault addresses
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
  pendingShares: bigint | undefined;
  pendingRequestTime: bigint | undefined;
  claimableAssets: bigint | undefined;
  claimableShares: bigint | undefined;
  // Meta
  isLoading: boolean;
  isError: boolean;
};

function fmt(raw: bigint | undefined, dec: number, sym?: string): string {
  if (raw === undefined) return "—";
  const n = parseFloat(formatUnits(raw, dec));
  const suffix = sym ? ` ${sym}` : "";
  if (n >= 1_000_000_000) return `${(n / 1_000_000_000).toFixed(4)}B${suffix}`;
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(4)}M${suffix}`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(4)}K${suffix}`;
  return `${n.toFixed(6)}${suffix}`;
}

/**
 * Fetches complete on-chain detail for a single UltraVault.
 *
 * Each `useReadContracts` batch uses a single ABI — mixing VAULT_READ_ABI and
 * ERC20_ABI in one call breaks wagmi/viem's inferred `functionName` types.
 */
export function useVaultDetail(
  vaultAddress: `0x${string}` | undefined,
  userAddress?: `0x${string}`
): VaultDetail {
  const enabled = !!vaultAddress;

  // ── Stage 1a: vault view calls only ───────────────────────────────────────
  const { data: s1, isLoading: s1Loading } = useReadContracts({
    contracts: [
      { address: vaultAddress!, abi: VAULT_READ_ABI, functionName: "name" },
      { address: vaultAddress!, abi: VAULT_READ_ABI, functionName: "symbol" },
      { address: vaultAddress!, abi: VAULT_READ_ABI, functionName: "decimals" },
      { address: vaultAddress!, abi: VAULT_READ_ABI, functionName: "totalSupply" },
      { address: vaultAddress!, abi: VAULT_READ_ABI, functionName: "asset" },
      { address: vaultAddress!, abi: VAULT_READ_ABI, functionName: "totalAssets" },
      { address: vaultAddress!, abi: VAULT_READ_ABI, functionName: "paused" },
      { address: vaultAddress!, abi: VAULT_READ_ABI, functionName: "getFees" },
      { address: vaultAddress!, abi: VAULT_READ_ABI, functionName: "fundsHolder" },
      { address: vaultAddress!, abi: VAULT_READ_ABI, functionName: "oracle" },
      { address: vaultAddress!, abi: VAULT_READ_ABI, functionName: "feeRecipient" },
      { address: vaultAddress!, abi: VAULT_READ_ABI, functionName: "rateProvider" },
    ],
    query: { enabled },
  });

  // ── Stage 1b: user vault-share balance + allowance (ERC-20 on vault) ─────
  const { data: s1Shares, isLoading: s1SharesLoading } = useReadContracts({
    contracts:
      userAddress && vaultAddress
        ? [
            { address: vaultAddress, abi: ERC20_ABI, functionName: "balanceOf" as const, args: [userAddress] },
            { address: vaultAddress, abi: ERC20_ABI, functionName: "allowance" as const, args: [userAddress, vaultAddress] },
          ]
        : [],
    query: { enabled: enabled && !!userAddress },
  });

  // Extract asset address from stage 1
  const assetAddress: `0x${string}` | undefined =
    s1?.[4]?.status === "success" ? (s1[4].result as `0x${string}`) : undefined;

  const hasAsset = !!assetAddress;

  // ── Stage 2a: asset symbol + decimals (fixed shape — no conditional spread)
  const { data: s2Meta, isLoading: s2MetaLoading } = useReadContracts({
    contracts: assetAddress
      ? [
          { address: assetAddress, abi: ERC20_ABI, functionName: "symbol" },
          { address: assetAddress, abi: ERC20_ABI, functionName: "decimals" },
        ]
      : [],
    query: { enabled: hasAsset },
  });

  // ── Stage 2a′: user balance + allowance on underlying asset ───────────────
  const { data: s2AssetUser, isLoading: s2AssetUserLoading } = useReadContracts({
    contracts:
      assetAddress && userAddress && vaultAddress
        ? [
            { address: assetAddress, abi: ERC20_ABI, functionName: "balanceOf" as const, args: [userAddress] },
            { address: assetAddress, abi: ERC20_ABI, functionName: "allowance" as const, args: [userAddress, vaultAddress] },
          ]
        : [],
    query: { enabled: hasAsset && !!userAddress },
  });

  // ── Stage 2b: async redeem state (vault ABI only) ─────────────────────────
  const { data: s2Redeem, isLoading: s2RedeemLoading } = useReadContracts({
    contracts:
      userAddress && assetAddress && vaultAddress
        ? [
            {
              address: vaultAddress,
              abi: VAULT_READ_ABI,
              functionName: "getPendingRedeemForAsset" as const,
              args: [assetAddress, userAddress],
            },
            {
              address: vaultAddress,
              abi: VAULT_READ_ABI,
              functionName: "getClaimableRedeemForAsset" as const,
              args: [assetAddress, userAddress],
            },
          ]
        : [],
    query: { enabled: hasAsset && !!userAddress },
  });

  // ── Assemble ─────────────────────────────────────────────────────────────

  const name    = s1?.[0]?.status === "success" ? (s1[0].result as string) : (vaultAddress ?? "—");
  const symbol  = s1?.[1]?.status === "success" ? (s1[1].result as string) : "—";
  const vDec    = s1?.[2]?.status === "success" ? (s1[2].result as number) : 18;
  const totalSupply = s1?.[3]?.status === "success" ? (s1[3].result as bigint) : undefined;
  const totalAssets = s1?.[5]?.status === "success" ? (s1[5].result as bigint) : undefined;
  const isPaused = s1?.[6]?.status === "success" ? (s1[6].result as boolean) : false;

  const fees = s1?.[7]?.status === "success"
    ? (s1[7].result as {
        performanceFee: bigint; managementFee: bigint; withdrawalFee: bigint;
        lastUpdateTimestamp: bigint; highwaterMark: bigint;
      })
    : undefined;

  const fundsHolder  = s1?.[8]?.status === "success"  ? (s1[8].result  as `0x${string}`) : undefined;
  const oracle       = s1?.[9]?.status === "success"  ? (s1[9].result  as `0x${string}`) : undefined;
  const feeRecipient = s1?.[10]?.status === "success" ? (s1[10].result as `0x${string}`) : undefined;
  const rateProvider = s1?.[11]?.status === "success" ? (s1[11].result as `0x${string}`) : undefined;

  const userShares =
    s1Shares?.[0]?.status === "success" ? (s1Shares[0].result as bigint) : undefined;
  const userShareAllowance =
    s1Shares?.[1]?.status === "success" ? (s1Shares[1].result as bigint) : undefined;

  // ERC-4626: userAssets = userShares × totalAssets / totalSupply
  const userAssetsRaw = userShares !== undefined && totalAssets !== undefined && totalSupply !== undefined && totalSupply > BigInt(0)
    ? (userShares * totalAssets) / totalSupply : undefined;

  // Share price = convertToAssets(10^vaultDecimals) via ERC-4626 math
  const sharePrice = totalAssets !== undefined && totalSupply !== undefined && totalSupply > BigInt(0)
    ? (BigInt(10 ** vDec) * totalAssets) / totalSupply : undefined;

  const assetSymbol =
    s2Meta?.[0]?.status === "success" ? (s2Meta[0].result as string) : undefined;
  const assetDecimals =
    s2Meta?.[1]?.status === "success" ? (s2Meta[1].result as number) : undefined;
  const aDec = assetDecimals ?? 18;

  const userAssetBalance =
    s2AssetUser?.[0]?.status === "success" ? (s2AssetUser[0].result as bigint) : undefined;
  const userAssetAllowance =
    s2AssetUser?.[1]?.status === "success" ? (s2AssetUser[1].result as bigint) : undefined;

  // Stage 2b: redeem structs
  const pendingRedeem =
    userAddress && s2Redeem?.[0]?.status === "success"
      ? (s2Redeem[0].result as { shares: bigint; requestTime: bigint })
      : undefined;
  const claimableRedeem =
    userAddress && s2Redeem?.[1]?.status === "success"
      ? (s2Redeem[1].result as { assets: bigint; shares: bigint })
      : undefined;

  return {
    address: vaultAddress ?? "0x0000000000000000000000000000000000000000",
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
    tvlFormatted: fmt(totalAssets, aDec, assetSymbol),
    totalSupplyFormatted: fmt(totalSupply, vDec, symbol),
    isPaused,
    performanceFee: fees?.performanceFee,
    managementFee: fees?.managementFee,
    withdrawalFee: fees?.withdrawalFee,
    highwaterMark: fees?.highwaterMark,
    performanceFeePercent: fees ? Number(fees.performanceFee) / 1e16 : undefined,
    managementFeePercent: fees ? Number(fees.managementFee) / 1e16 : undefined,
    withdrawalFeePercent: fees ? Number(fees.withdrawalFee) / 1e16 : undefined,
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
    pendingShares: pendingRedeem?.shares,
    pendingRequestTime: pendingRedeem?.requestTime,
    claimableAssets: claimableRedeem?.assets,
    claimableShares: claimableRedeem?.shares,
    isLoading:
      s1Loading || s1SharesLoading || s2MetaLoading || s2AssetUserLoading || s2RedeemLoading,
    isError: s1?.[0]?.status === "failure" || s1?.[4]?.status === "failure",
  };
}
