/**
 * Feature flags from environment variables.
 *
 * SHOW_ALLOCATION — set to "true" or "1" to show vault allocation breakdowns.
 *   Build-time (client): NEXT_PUBLIC_SHOW_ALLOCATION or SHOW_ALLOCATION
 *   Runtime (server API): SHOW_ALLOCATION
 */

function parseEnvFlag(value: string | undefined): boolean {
  return value === "true" || value === "1";
}

/** Client-visible flag (inlined at build). */
export const SHOW_ALLOCATION = parseEnvFlag(process.env.NEXT_PUBLIC_SHOW_ALLOCATION);

/** Server routes may also read SHOW_ALLOCATION at runtime. */
export function isAllocationEnabled(): boolean {
  return parseEnvFlag(process.env.SHOW_ALLOCATION ?? process.env.NEXT_PUBLIC_SHOW_ALLOCATION);
}
