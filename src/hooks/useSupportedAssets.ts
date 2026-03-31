"use client";

/**
 * Returns the payment / deposit assets supported by a vault.
 *
 * Strategy (in priority order):
 *   1. Static config from vaultConfig.ts (zero RPC calls, always preferred when set)
 *   2. On-chain getPaymentTokens() on the Midas Deposit Vault — used as a live
 *      fallback when the static config for a Midas vault has no assets defined.
 *      The hook then fetches ERC-20 symbol + decimals for each returned address.
 *
 * For UltraYield / Morpho vaults the static config is the only source.
 */

import { useMemo } from "react";
import { useReadContracts } from "wagmi";
import { VAULT_PLATFORMS } from "@/lib/vaultConfig";
import type { AssetConfig } from "@/lib/vaultConfig";

export type SupportedAsset = AssetConfig;

// Midas Deposit Vault ABI — only the read we need
const GET_PAYMENT_TOKENS_ABI = [
  {
    name: "getPaymentTokens",
    type: "function",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "address[]" }],
  },
] as const;

const ERC20_META_ABI = [
  { name: "symbol",   type: "function", stateMutability: "view", inputs: [], outputs: [{ type: "string" }] },
  { name: "decimals", type: "function", stateMutability: "view", inputs: [], outputs: [{ type: "uint8"  }] },
] as const;

export function useSupportedAssets(vaultAddress: `0x${string}` | undefined): {
  assets: SupportedAsset[];
  isLoading: boolean;
} {
  // ── 1. Look up static config ──────────────────────────────────────────────
  const staticEntry = useMemo(() => {
    if (!vaultAddress) return null;
    const lower = vaultAddress.toLowerCase();
    for (const platform of VAULT_PLATFORMS) {
      const entry = platform.vaults.find((v) => v.address.toLowerCase() === lower);
      if (entry) return { entry, chainId: entry.chainId ?? platform.chainId };
    }
    return null;
  }, [vaultAddress]);

  const staticAssets: SupportedAsset[] = staticEntry?.entry.assets ?? [];
  const hasStaticAssets = staticAssets.length > 0;

  // ── 2. On-chain fallback — only for Midas with no static asset list ───────
  const depositVaultAddress = staticEntry?.entry.kind === "midas" && !hasStaticAssets
    ? staticEntry.entry.depositVaultAddress
    : undefined;
  const onChainChainId = staticEntry?.chainId;

  const { data: tokenListData, isLoading: listLoading } = useReadContracts({
    contracts: depositVaultAddress
      ? [{ address: depositVaultAddress, abi: GET_PAYMENT_TOKENS_ABI, functionName: "getPaymentTokens" as const, chainId: onChainChainId }]
      : [],
    query: { enabled: !!depositVaultAddress },
  });

  const paymentTokenAddresses: `0x${string}`[] = useMemo(() => {
    const res = tokenListData?.[0];
    if (res?.status === "success") return res.result as `0x${string}`[];
    return [];
  }, [tokenListData]);

  // Fetch symbol + decimals for each discovered payment token
  const metaContracts = useMemo(
    () => paymentTokenAddresses.flatMap((addr) => [
      { address: addr, abi: ERC20_META_ABI, functionName: "symbol"   as const, chainId: onChainChainId },
      { address: addr, abi: ERC20_META_ABI, functionName: "decimals" as const, chainId: onChainChainId },
    ]),
    [paymentTokenAddresses, onChainChainId]
  );

  const { data: metaData, isLoading: metaLoading } = useReadContracts({
    contracts: metaContracts,
    query: { enabled: paymentTokenAddresses.length > 0 },
  });

  const onChainAssets: SupportedAsset[] = useMemo(() => {
    if (paymentTokenAddresses.length === 0 || !metaData) return [];
    return paymentTokenAddresses.flatMap((addr, i): SupportedAsset[] => {
      const symRes = metaData[i * 2];
      const decRes = metaData[i * 2 + 1];
      if (symRes?.status !== "success" || decRes?.status !== "success") return [];
      return [{
        address: addr,
        symbol:   symRes.result  as string,
        decimals: decRes.result  as number,
        isPegged: false,
      }];
    });
  }, [paymentTokenAddresses, metaData]);

  // ── Merge: static wins; on-chain used only when static is empty ───────────
  const assets: SupportedAsset[] = hasStaticAssets ? staticAssets : onChainAssets;
  const isLoading = !hasStaticAssets && (listLoading || metaLoading);

  return { assets, isLoading };
}
