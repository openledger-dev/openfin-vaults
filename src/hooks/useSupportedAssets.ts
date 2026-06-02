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
 * For UltraYield / Morpho (ERC-4626-style vaults): static entries are merged with
 * the vault contract's canonical asset() address + live ERC-20 metadata first,
 * so the UI matches what MetaMask/explorers show even if labels drift (e.g. BTC wrappers).
 */

import { useMemo } from "react";
import { useReadContracts } from "wagmi";
import { VAULT_READ_ABI } from "@/lib/vaultAbi";
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

  const erc4626VaultKind =
    staticEntry?.entry.kind === "ultrayield" || staticEntry?.entry.kind === "morpho";

  // ── 2a. ERC-4626 canonical underlying (UltraYield / Morpho) ──────────────
  const vaultChainId = staticEntry?.chainId;

  const { data: erc4626AssetData, isLoading: erc4626AssetLoading } = useReadContracts({
    contracts:
      vaultAddress && erc4626VaultKind && vaultChainId !== undefined
        ? [{ address: vaultAddress, abi: VAULT_READ_ABI, functionName: "asset" as const, chainId: vaultChainId }]
        : [],
    query: { enabled: !!vaultAddress && erc4626VaultKind && vaultChainId !== undefined },
  });

  const erc4626UnderlyingAddr =
    erc4626AssetData?.[0]?.status === "success"
      ? (erc4626AssetData[0].result as `0x${string}`)
      : undefined;

  const { data: erc4626UnderlyingMeta, isLoading: erc4626MetaLoading } = useReadContracts({
    contracts:
      erc4626UnderlyingAddr && vaultChainId !== undefined
        ? [
            { address: erc4626UnderlyingAddr, abi: ERC20_META_ABI, functionName: "symbol" as const, chainId: vaultChainId },
            { address: erc4626UnderlyingAddr, abi: ERC20_META_ABI, functionName: "decimals" as const, chainId: vaultChainId },
          ]
        : [],
    query: { enabled: !!erc4626UnderlyingAddr && erc4626VaultKind && vaultChainId !== undefined },
  });

  const erc4626UnderlyingAsset: SupportedAsset | undefined = useMemo(() => {
    if (!erc4626UnderlyingAddr || !erc4626UnderlyingMeta) return undefined;
    const symRes = erc4626UnderlyingMeta[0];
    const decRes = erc4626UnderlyingMeta[1];
    if (symRes?.status !== "success" || decRes?.status !== "success") return undefined;
    return {
      address: erc4626UnderlyingAddr,
      symbol: symRes.result as string,
      decimals: decRes.result as number,
      isPegged: false,
    };
  }, [erc4626UnderlyingAddr, erc4626UnderlyingMeta]);

  /** Canonical underlying first; keep extra static assets (e.g. USDT pegged to USDC vault). */
  const erc4626MergedAssets = useMemo((): SupportedAsset[] => {
    if (!erc4626UnderlyingAsset) return staticAssets;
    const lower = erc4626UnderlyingAsset.address.toLowerCase();
    const rest = staticAssets.filter((a) => a.address.toLowerCase() !== lower);
    return [erc4626UnderlyingAsset, ...rest];
  }, [erc4626UnderlyingAsset, staticAssets]);

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

  // ── Merge ─────────────────────────────────────────────────────────────────
  const assets: SupportedAsset[] = useMemo(() => {
    if (!staticEntry) return [];
    if (staticEntry.entry.kind === "midas") {
      return hasStaticAssets ? staticAssets : onChainAssets;
    }
    if (erc4626VaultKind) {
      return erc4626MergedAssets.length > 0 ? erc4626MergedAssets : staticAssets;
    }
    return staticAssets;
  }, [
    staticEntry,
    hasStaticAssets,
    staticAssets,
    onChainAssets,
    erc4626VaultKind,
    erc4626MergedAssets,
  ]);

  const isLoading =
    (!hasStaticAssets && staticEntry?.entry.kind === "midas" && (listLoading || metaLoading)) ||
    (!!erc4626VaultKind && (erc4626AssetLoading || erc4626MetaLoading));

  return { assets, isLoading };
}
