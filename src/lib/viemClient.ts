/**
 * Standalone viem public clients — one per chain, cached at module level.
 *
 * WHY this file exists:
 *   @reown/appkit's createAppKit() replaces the wagmi transport at runtime
 *   with its own WalletConnect relay (rpc.walletconnect.org). That endpoint:
 *     - Blocks CORS from localhost (ERR_FAILED / 504 in dev)
 *     - Rate-limits free-tier projects
 *   As a result, usePublicClient() from wagmi is unsuitable for eth_getLogs
 *   calls (7-day APY history, multi-asset discovery).
 *
 *   These clients are created directly with viem and are NEVER touched by
 *   AppKit. They use the RPC URL from the environment (if set) or fall back
 *   to the chain's built-in public endpoint (e.g. cloudflare-eth.com for
 *   mainnet) which has no CORS restriction.
 *
 * Configuration (.env.local):
 *   NEXT_PUBLIC_RPC_URL_1=https://eth-mainnet.g.alchemy.com/v2/YOUR_KEY
 *   NEXT_PUBLIC_RPC_URL_42161=https://arb-mainnet.g.alchemy.com/v2/YOUR_KEY
 *   NEXT_PUBLIC_RPC_URL_8453=https://base-mainnet.g.alchemy.com/v2/YOUR_KEY
 *   NEXT_PUBLIC_RPC_URL_10=https://opt-mainnet.g.alchemy.com/v2/YOUR_KEY
 */

import { createPublicClient, http, fallback } from "viem";
import { mainnet, arbitrum, base, optimism } from "viem/chains";
import type { Chain } from "viem";

const SUPPORTED_CHAINS: Record<number, Chain> = {
  1:     mainnet,
  42161: arbitrum,
  8453:  base,
  10:    optimism,
};

const RPC_OVERRIDES: Record<number, string | undefined> = {
  1:     process.env.NEXT_PUBLIC_RPC_URL_1,
  42161: process.env.NEXT_PUBLIC_RPC_URL_42161,
  8453:  process.env.NEXT_PUBLIC_RPC_URL_8453,
  10:    process.env.NEXT_PUBLIC_RPC_URL_10,
};

/**
 * Public RPC fallback chain per chain ID.
 *
 * Cloudflare (viem's built-in mainnet default) rejects eth_getLogs with
 * fromBlock:"earliest", which means we can never fetch full event history
 * from it.
 *
 * LlamaRPC (https://eth.llamarpc.com) supports full-history getLogs from
 * block 0 without authentication, making it suitable as the public fallback.
 * drpc.org is listed as a second public fallback.
 */
const PUBLIC_FALLBACKS: Record<number, string[]> = {
  1:     ["https://eth.llamarpc.com", "https://eth.drpc.org"],
  42161: ["https://arbitrum.llamarpc.com", "https://arbitrum.drpc.org"],
  8453:  ["https://base.llamarpc.com", "https://base.drpc.org"],
  10:    ["https://optimism.llamarpc.com", "https://optimism.drpc.org"],
};

// Module-level cache — same client instance reused across all hook calls
const clientCache = new Map<number, ReturnType<typeof createPublicClient>>();

/**
 * Returns a viem PublicClient for the given chain ID.
 * Defaults to mainnet (1) if the chain is not in SUPPORTED_CHAINS.
 *
 * Transport priority:
 *  1. NEXT_PUBLIC_RPC_URL_{chainId} — private Alchemy/Infura key (best)
 *  2. LlamaRPC public endpoint — supports eth_getLogs from earliest
 *  3. drpc.org public endpoint — secondary public fallback
 */
export function getPublicClient(chainId: number = 1) {
  if (clientCache.has(chainId)) return clientCache.get(chainId)!;

  const chain    = SUPPORTED_CHAINS[chainId] ?? mainnet;
  const override = RPC_OVERRIDES[chainId];
  const publics  = PUBLIC_FALLBACKS[chainId] ?? PUBLIC_FALLBACKS[1];

  const transport = override
    ? http(override)
    : fallback(publics.map((url) => http(url)));

  const client = createPublicClient({ chain, transport });

  clientCache.set(chainId, client);
  return client;
}
