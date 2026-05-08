/**
 * swapHistory — sessionStorage persistence for in-flight and recent swaps.
 *
 * Uses sessionStorage (not localStorage) so swap records are scoped to the
 * current browser tab and cleared automatically when the tab is closed.
 * This limits the window of exposure to XSS attacks compared to localStorage,
 * which persists indefinitely across sessions.
 *
 * Stores up to MAX_ENTRIES swap records keyed by depositAddress.
 */
import type { SavedSwap } from "@/types/swap";

const STORAGE_KEY = "openyield_swap_history";
const MAX_ENTRIES = 20;

function load(): SavedSwap[] {
  if (typeof window === "undefined") return [];
  try {
    return JSON.parse(sessionStorage.getItem(STORAGE_KEY) ?? "[]") as SavedSwap[];
  } catch {
    return [];
  }
}

function save(entries: SavedSwap[]) {
  if (typeof window === "undefined") return;
  sessionStorage.setItem(STORAGE_KEY, JSON.stringify(entries.slice(0, MAX_ENTRIES)));
}

export function saveSwap(entry: SavedSwap) {
  const all = load().filter((e) => e.depositAddress !== entry.depositAddress);
  save([entry, ...all]);
}

export function updateSwap(depositAddress: string, patch: Partial<SavedSwap>) {
  const all = load().map((e) =>
    e.depositAddress === depositAddress ? { ...e, ...patch } : e
  );
  save(all);
}

export function loadSwaps(): SavedSwap[] {
  return load();
}

export function removeSwap(depositAddress: string) {
  save(load().filter((e) => e.depositAddress !== depositAddress));
}
