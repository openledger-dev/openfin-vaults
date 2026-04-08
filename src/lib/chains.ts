/**
 * Static chain metadata — no RPC calls needed.
 *
 * Add entries here as new networks are supported.
 * NEXT_PUBLIC_*_CHAIN_ID env vars reference these IDs.
 */

export type ChainMeta = {
  name: string;
  shortName: string;
  explorerUrl: string;
};

export const CHAINS: Record<number, ChainMeta> = {
  1:     { name: "Ethereum",         shortName: "Ethereum",  explorerUrl: "https://etherscan.io"           },
  10:    { name: "OP Mainnet",        shortName: "Optimism",  explorerUrl: "https://optimistic.etherscan.io" },
  8453:  { name: "Base",             shortName: "Base",      explorerUrl: "https://basescan.org"           },
  42161: { name: "Arbitrum One",     shortName: "Arbitrum",  explorerUrl: "https://arbiscan.io"            },
  137:   { name: "Polygon",          shortName: "Polygon",   explorerUrl: "https://polygonscan.com"        },
  56:    { name: "BNB Chain",        shortName: "BNB",       explorerUrl: "https://bscscan.com"            },
  43114: { name: "Avalanche",        shortName: "Avalanche", explorerUrl: "https://snowtrace.io"           },
};

export function getChainName(chainId: number): string {
  return CHAINS[chainId]?.name ?? `Chain ${chainId}`;
}

export function getChainShortName(chainId: number): string {
  return CHAINS[chainId]?.shortName ?? `Chain ${chainId}`;
}

export function getExplorerUrl(chainId: number): string {
  return CHAINS[chainId]?.explorerUrl ?? "https://etherscan.io";
}

export function getAddressExplorerLink(address: string, chainId: number): string {
  return `${getExplorerUrl(chainId)}/address/${address}`;
}

export function getTxExplorerLink(txHash: string, chainId: number): string {
  return `${getExplorerUrl(chainId)}/tx/${txHash}`;
}
