/**
 * UltraYield REST API helpers — server-side only.
 *
 * Allocation endpoint:
 *   GET https://api.ultrayield.app/api/v1/vaults/{slug}/allocation
 *   → { vault_slug, date, allocation: AllocationItem[] }
 *
 * Each AllocationItem describes one strategy/venue the vault is deployed to:
 *   name            — human-readable venue label
 *   value_pct       — % of vault NAV as a decimal string (e.g. "9.39")
 *   value_usd       — USD value as a decimal string
 *   value_underlying — amount in the vault's underlying token
 */

export type UltraYieldAllocationItem = {
  name: string;
  /** Percentage of vault NAV (e.g. "9.392709…") */
  value_pct: string;
  /** USD notional value */
  value_usd: string;
  /** Amount in the vault's underlying token */
  value_underlying: string;
};

export type UltraYieldAllocation = {
  vault_slug: string;
  /** ISO-8601 date the snapshot was taken */
  date: string;
  allocation: UltraYieldAllocationItem[];
};

/**
 * Fetch the current allocation snapshot from the UltraYield API.
 * Called exclusively from server-side API routes — never from the browser.
 */
export async function fetchUltraYieldAllocation(
  slug: string
): Promise<UltraYieldAllocation> {
  const res = await fetch(
    `https://api.ultrayield.app/api/v1/vaults/${encodeURIComponent(slug)}/allocation`,
    { next: { revalidate: 14_400 } } // 4 hours — matches TTL.ALLOCATION
  );
  if (!res.ok) {
    throw new Error(`UltraYield allocation API error: ${res.status}`);
  }
  return res.json() as Promise<UltraYieldAllocation>;
}
