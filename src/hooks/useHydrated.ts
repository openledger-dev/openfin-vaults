"use client";

import { useSyncExternalStore } from "react";

/**
 * True after the client has hydrated; false during SSR and the first server pass.
 * Use instead of useEffect(() => setMounted(true), []) to avoid setState-in-effect.
 */
export function useHydrated(): boolean {
  return useSyncExternalStore(
    () => () => {},
    () => true,
    () => false,
  );
}
