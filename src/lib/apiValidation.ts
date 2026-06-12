/**
 * Shared route-boundary validators for API query parameters (OPE-4).
 *
 * Every public API route must parse and validate all request-derived inputs
 * before they reach cache-key construction, logging, or downstream fetchers.
 * These helpers provide a consistent validation layer used by all routes.
 */

import type { PlatformKind } from "@/lib/vaultConfig";

// ── Result type (mirrors swapValidation.ts) ───────────────────────────────────

export type ValidationResult<T> =
  | { ok: true;  value: T }
  | { ok: false; error: string };

// ── chainId ───────────────────────────────────────────────────────────────────

/**
 * Parse and validate a chainId query parameter.
 *
 * Accepts only non-empty strings of decimal digits in the range [1, 2^31-1].
 * Rejects `NaN`, negative values, floats ("1.5"), and mixed strings ("1abc")
 * that `parseInt` would otherwise silently truncate.
 *
 * Returns the default value (1) when `raw` is `null` or an empty string.
 */
export function parseChainId(
  raw: string | null,
  defaultValue = 1,
): ValidationResult<number> {
  if (raw === null || raw === "") {
    return { ok: true, value: defaultValue };
  }
  if (!/^\d+$/.test(raw.trim())) {
    return { ok: false, error: "chainId must be a positive integer" };
  }
  const n = parseInt(raw.trim(), 10);
  if (n < 1 || n > 0x7fff_ffff) {
    return { ok: false, error: "chainId must be a positive integer" };
  }
  return { ok: true, value: n };
}

// ── PlatformKind ──────────────────────────────────────────────────────────────

const PLATFORM_KINDS: readonly PlatformKind[] = ["ultrayield", "morpho", "midas"];

/**
 * Parse and validate a `kind` query parameter against the known PlatformKind
 * enum. Returns `undefined` when `raw` is absent (null/empty) — callers that
 * treat `kind` as optional may still receive `undefined` without error.
 */
export function parsePlatformKind(
  raw: string | null,
): ValidationResult<PlatformKind | undefined> {
  if (raw === null || raw === "") {
    return { ok: true, value: undefined };
  }
  if (!PLATFORM_KINDS.includes(raw as PlatformKind)) {
    return {
      ok: false,
      error: `kind must be one of: ${PLATFORM_KINDS.join(", ")}`,
    };
  }
  return { ok: true, value: raw as PlatformKind };
}

// ── Vault slug ────────────────────────────────────────────────────────────────

/**
 * Returns true for strings that look like a valid UltraYield vault slug:
 * lowercase alphanumerics and hyphens, 2–128 characters, no leading/trailing
 * hyphens.
 *
 * Examples:  "ultrayield-btc"  ✓   "ultrayield-usd"  ✓
 *            "../secret"       ✗   ""                 ✗
 */
export function isVaultSlug(s: string): boolean {
  return /^[a-z0-9][a-z0-9-]{1,126}[a-z0-9]$/.test(s);
}
