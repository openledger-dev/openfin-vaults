export type PlatformVaultEntry = {
  address: `0x${string}`;
};

export type PlatformConfig = {
  id: string;
  label: string;
  description: string;
  vaults: PlatformVaultEntry[];
};

function parseAddresses(env: string | undefined): `0x${string}`[] {
  if (!env) return [];
  return env
    .split(",")
    .map((a) => a.trim())
    .filter((a) => /^0x[0-9a-fA-F]{40}$/.test(a)) as `0x${string}`[];
}

/**
 * Central platform registry.
 * To add a new platform (e.g. Morpho), add a new entry below and
 * define NEXT_PUBLIC_MORPHO_VAULT_ADDR in your .env.local.
 */
export const VAULT_PLATFORMS: PlatformConfig[] = [
  {
    id: "ultrayield",
    label: "UltraYield Vaults",
    description:
      "Institutional-grade yield vaults with async redemptions (ERC-7540)",
    vaults: parseAddresses(
      process.env.NEXT_PUBLIC_ULTRAYIELD_VAULT_ADDR
    ).map((address) => ({ address })),
  },
  // {
  //   id: "morpho",
  //   label: "Morpho Vaults",
  //   description: "Permissionless lending markets on Morpho Blue.",
  //   vaults: parseAddresses(process.env.NEXT_PUBLIC_MORPHO_VAULT_ADDR).map(
  //     (address) => ({ address })
  //   ),
  // },
];
