/**
 * Server-side allowlist of known vault + asset addresses.
 *
 * Prevents the Infura / RPC key from being used as a free blockchain proxy
 * by rejecting API calls that reference unknown contract addresses.
 *
 * The allowlist is derived at module-load time from:
 *   - VAULT_PLATFORMS  → vault share-token addresses
 *   - Per-vault assets → underlying asset addresses (USDC, USDT, cbBTC …)
 *
 * Both sets are lowercased for comparison.
 */

import { VAULT_PLATFORMS } from "@/lib/vaultConfig";

function buildAllowlists() {
  const vaults = new Set<string>();
  const assets  = new Set<string>();

  for (const platform of VAULT_PLATFORMS) {
    for (const vault of platform.vaults) {
      vaults.add(vault.address.toLowerCase());

      // Collect every statically-configured deposit asset
      if (vault.assets) {
        for (const asset of vault.assets) {
          assets.add(asset.address.toLowerCase());
        }
      }

      // Midas vaults expose deposit/redemption helper contracts
      if (vault.depositVaultAddress)    vaults.add(vault.depositVaultAddress.toLowerCase());
      if (vault.redemptionVaultAddress) vaults.add(vault.redemptionVaultAddress.toLowerCase());
    }
  }

  return { vaults, assets };
}

const { vaults: ALLOWED_VAULTS, assets: ALLOWED_ASSETS } = buildAllowlists();

/** Returns true if the address belongs to a known vault share-token. */
export function isAllowedVault(address: string): boolean {
  return ALLOWED_VAULTS.has(address.toLowerCase());
}

/**
 * Returns true if the address is either:
 *   - a known vault share-token address, OR
 *   - a known underlying asset address
 *
 * Used for the asset / oracle parameters where the caller may supply an
 * asset address that also doubles as a vault address in other contexts.
 */
export function isAllowedAsset(address: string): boolean {
  const lower = address.toLowerCase();
  return ALLOWED_ASSETS.has(lower) || ALLOWED_VAULTS.has(lower);
}
