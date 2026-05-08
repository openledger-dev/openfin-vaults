/**
 * Lightweight client-side audit trail for Terms of Use acceptance.
 *
 * Records are written to localStorage under "openvault:terms_log".
 * Each entry contains:
 *   - wallet   — connected wallet address at the time of acceptance
 *   - vault    — vault contract address the user was interacting with
 *   - ts       — ISO-8601 timestamp
 *   - version  — terms version string (bump when T&C content changes)
 *
 * This provides a user-side record that can be cross-referenced with
 * on-chain transaction timestamps during disputes or audits.
 */

const STORAGE_KEY    = "openvault:terms_log";
export const TERMS_VERSION = "1.0"; // bump whenever Terms of Use content changes

export type TermsEntry = {
  wallet:  string;
  vault:   string;
  ts:      string;
  version: string;
};

/** Append a new acceptance record. Silently ignores storage errors. */
export function recordTermsAcceptance(wallet: string, vault: string): void {
  try {
    const existing = readTermsLog();
    const entry: TermsEntry = {
      wallet:  wallet.toLowerCase(),
      vault:   vault.toLowerCase(),
      ts:      new Date().toISOString(),
      version: TERMS_VERSION,
    };
    existing.push(entry);
    // Keep only the last 200 records to avoid unbounded growth
    const trimmed = existing.slice(-200);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(trimmed));
  } catch {
    // quota exceeded or SSR — ignore
  }
}

/** Returns all stored acceptance records. */
export function readTermsLog(): TermsEntry[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    return JSON.parse(raw) as TermsEntry[];
  } catch {
    return [];
  }
}

/**
 * Returns true if this wallet has already accepted the current terms version
 * for this vault in the current browser session (localStorage).
 * Used to pre-check the checkbox on revisit.
 */
export function hasAcceptedTerms(wallet: string, vault: string): boolean {
  const log = readTermsLog();
  const w = wallet.toLowerCase();
  const v = vault.toLowerCase();
  return log.some((e) => e.wallet === w && e.vault === v && e.version === TERMS_VERSION);
}
