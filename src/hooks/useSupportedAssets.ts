"use client";

/**
 * Returns the supported deposit/redeem assets for a given vault address.
 *
 * Assets are configured statically in src/lib/vaultConfig.ts alongside
 * the vault address — no RPC calls, no event-log queries needed.
 */

import { useMemo } from "react";
import { VAULT_PLATFORMS } from "@/lib/vaultConfig";
import type { AssetConfig } from "@/lib/vaultConfig";

export type SupportedAsset = AssetConfig;

export function useSupportedAssets(vaultAddress: `0x${string}` | undefined): {
  assets: SupportedAsset[];
  isLoading: false;
} {
  const assets = useMemo<SupportedAsset[]>(() => {
    if (!vaultAddress) return [];
    const lower = vaultAddress.toLowerCase();
    for (const platform of VAULT_PLATFORMS) {
      const entry = platform.vaults.find(
        (v) => v.address.toLowerCase() === lower
      );
      if (entry?.assets && entry.assets.length > 0) return entry.assets;
    }
    return [];
  }, [vaultAddress]);

  return { assets, isLoading: false };
}
