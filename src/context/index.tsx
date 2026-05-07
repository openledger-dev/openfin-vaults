"use client";

import { wagmiAdapter, projectId, networks } from "@/config";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createAppKit } from "@reown/appkit/react";
import { mainnet } from "@reown/appkit/networks";
import React, { type ReactNode, useEffect, useRef } from "react";
import { WagmiProvider, type Config } from "wagmi";

// ── In-memory stale times ──────────────────────────────────────────────────
// These prevent useReadContracts (and every useQuery) from immediately
// refetching on re-render or soft navigation while the data is still fresh.
//   on-chain state  (TVL, totalSupply, paused)  → 30 s
//   on-chain meta   (name, fees, oracle addr)   → 60 s
//   APY / prices                                → 5 min  (overridden per-query where needed)
const STALE_ONCHAIN = 30_000;      // 30 s
const GC_TIME       = 5 * 60_000; // keep unused entries in memory 5 min

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: STALE_ONCHAIN,
      gcTime:    GC_TIME,
      // Don't retry on-chain read failures more than once —
      // wagmi already handles RPC retries internally.
      retry: 1,
      // Show cached data while quietly re-fetching in the background
      // instead of showing a full loading spinner.
      refetchOnWindowFocus: false,
    },
  },
});

if (!projectId) {
  throw new Error("NEXT_PUBLIC_REOWN_PROJECT_ID is not defined");
}

// ── App URL — used for Reown metadata and domain locking ──────────────────
// Set NEXT_PUBLIC_APP_URL in .env.local to match the canonical origin.
// IMPORTANT: Also add this URL to the "Allowed Origins" list in the Reown
// Cloud dashboard (https://cloud.reown.com) to prevent other sites from
// using your project ID and exhausting your WalletConnect relay quota.
const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? "https://openfin.openledger.xyz";

if (process.env.NODE_ENV === "development" && !process.env.NEXT_PUBLIC_APP_URL) {
  console.warn(
    "[Reown] NEXT_PUBLIC_APP_URL is not set. " +
    "Set it to your canonical domain and add it to the Allowed Origins list at " +
    "https://cloud.reown.com to prevent project ID abuse."
  );
}

const metadata = {
  name: "Open Vault",
  description: "Ethereum DeFi Vaults",
  url: APP_URL,
  icons: ["https://avatars.githubusercontent.com/u/179229932"],
};

createAppKit({
  adapters: [wagmiAdapter],
  projectId,
  networks,
  defaultNetwork: mainnet,
  metadata,
  features: {
    analytics: true,
  },
});

// ── localStorage cache persister ──────────────────────────────────────────
// Survives hard refreshes (F5 / Ctrl+R).  Stored under a versioned key so
// a code deploy with schema changes automatically invalidates the old cache.
const CACHE_KEY     = "openvault:qcache:v1";
const CACHE_MAX_AGE = 5 * 60_000; // discard entries older than 5 min
const BIGINT_TAG    = "\x00bi\x00";  // same approach as redis.ts

function cacheStringify(value: unknown): string {
  return JSON.stringify(value, (_, v) =>
    typeof v === "bigint" ? `${BIGINT_TAG}${v.toString()}` : v
  );
}

function cacheParse(raw: string): unknown {
  return JSON.parse(raw, (_, v) => {
    if (typeof v === "string" && v.startsWith(BIGINT_TAG)) {
      return BigInt(v.slice(BIGINT_TAG.length));
    }
    return v;
  });
}

function saveCache() {
  try {
    const dehydrated: Record<string, { data: unknown; ts: number }> = {};
    queryClient.getQueryCache().getAll().forEach((q) => {
      if (q.state.status !== "success" || q.state.data === undefined) return;
      try {
        const keyStr = JSON.stringify(q.queryKey);
        dehydrated[keyStr] = { data: q.state.data, ts: Date.now() };
      } catch {
        // skip non-serialisable query keys
      }
    });
    localStorage.setItem(CACHE_KEY, cacheStringify(dehydrated));
  } catch {
    // quota exceeded or SSR — ignore
  }
}

function restoreCache() {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    if (!raw) return;
    const saved = cacheParse(raw) as Record<string, { data: unknown; ts: number }>;
    const now = Date.now();
    Object.entries(saved).forEach(([keyStr, { data, ts }]) => {
      if (now - ts > CACHE_MAX_AGE) return; // too old
      try {
        const queryKey = JSON.parse(keyStr) as unknown[];
        queryClient.setQueryData(queryKey, data);
      } catch {
        // malformed entry — skip
      }
    });
  } catch {
    // corrupt storage — ignore
  }
}

export function ContextProvider({
  children,
}: {
  children: ReactNode;
  cookies?: string | null;
}) {
  const restored = useRef(false);

  useEffect(() => {
    // Restore once on first mount (browser-only)
    if (!restored.current) {
      restoreCache();
      restored.current = true;
    }

    // Persist cache whenever any query updates
    const unsubscribe = queryClient.getQueryCache().subscribe(() => {
      saveCache();
    });

    return () => unsubscribe();
  }, []);

  return (
    <WagmiProvider config={wagmiAdapter.wagmiConfig as Config}>
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    </WagmiProvider>
  );
}
