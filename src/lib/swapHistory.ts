/**
 * swapHistory — localStorage persistence for in-flight and recent swaps.
 *
 * Stores up to MAX_ENTRIES swap records keyed by depositAddress.
 * This lets users track swaps that were submitted before cbBTC (or any
 * destination asset) arrived, even after the swap modal is closed.
 */
import type { SavedSwap } from "@/types/swap";

const STORAGE_KEY = "openyield_swap_history";
const MAX_ENTRIES = 20;

function load(): SavedSwap[] {
  if (typeof window === "undefined") return [];
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "[]") as SavedSwap[];
  } catch {
    return [];
  }
}

function save(entries: SavedSwap[]) {
  if (typeof window === "undefined") return;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(entries.slice(0, MAX_ENTRIES)));
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
