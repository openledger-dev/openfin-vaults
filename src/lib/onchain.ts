import "server-only";

/**
 * Server-side on-chain data fetchers using viem.
 *
 * These functions mirror the client-side wagmi adapter hooks
 * (useReadContracts / multicall) but are safe to call from:
 *   - Next.js API routes
 *   - Server components
 *   - Background jobs / cron tasks
 *
 * RPC configuration (env vars — server-only, NO NEXT_PUBLIC_ prefix):
 *   RPC_URL_1     — Ethereum mainnet (fallback: LlamaRPC public endpoint)
 *   RPC_URL_8453  — Base            (fallback: LlamaRPC public endpoint)
 *   RPC_URL_10    — Optimism        (fallback: LlamaRPC public endpoint)
 *   RPC_URL_42161 — Arbitrum One    (fallback: LlamaRPC public endpoint)
 *
 * Add more chains by extending CHAIN_MAP and RPC_FALLBACKS below.
 *
 * ── fetchOnChainMeta ──────────────────────────────────────────────────────────
 *   Reads static vault metadata that rarely changes (cache TTL: 1 hour).
 *   Includes: name, symbol, decimals, assetAddress/symbol/decimals, fees, oracle.
 *
 * ── fetchOnChainState ─────────────────────────────────────────────────────────
 *   Reads dynamic state that changes every block (cache TTL: 30 seconds).
 *   Includes: totalAssets, totalSupply, isPaused, liquidityRaw (Morpho totalIdle).
 *
 * ── fetchPending ──────────────────────────────────────────────────────────────
 *   Reads UltraYield pending/claimable redeem positions for a specific user.
 *   User-specific — use a short TTL (60 seconds).
 *   Note: Re7 pending redemptions come from the REST API, not on-chain.
 */

import { createPublicClient, http, parseAbi, type Address } from "viem";
import { mainnet, base, optimism, arbitrum } from "viem/chains";

// ── Chain configuration ───────────────────────────────────────────────────────

const CHAIN_MAP = {
  1:     mainnet,
  8453:  base,
  10:    optimism,
  42161: arbitrum,
} as const;

const RPC_FALLBACKS: Record<number, string> = {
  1:     "https://eth.llamarpc.com",
  8453:  "https://base.llamarpc.com",
  10:    "https://optimism.llamarpc.com",
  42161: "https://arbitrum.llamarpc.com",
};

function getRpcUrl(chainId: number): string {
  return process.env[`RPC_URL_${chainId}`] ?? RPC_FALLBACKS[chainId] ?? "";
}

/** Returns a viem public client for the given chain. Throws for unsupported chains. */
export function getPublicClient(chainId: number) {
  const chain = CHAIN_MAP[chainId as keyof typeof CHAIN_MAP];
  if (!chain) throw new Error(`[onchain] Unsupported chainId: ${chainId}`);
  return createPublicClient({ chain, transport: http(getRpcUrl(chainId)) });
}

// ── ABI fragments (server-side copies — avoids importing wagmi/react files) ──

const ERC20_META_ABI = [
  { name: "name",        type: "function", stateMutability: "view", inputs: [],                                    outputs: [{ type: "string"  }] },
  { name: "symbol",      type: "function", stateMutability: "view", inputs: [],                                    outputs: [{ type: "string"  }] },
  { name: "decimals",    type: "function", stateMutability: "view", inputs: [],                                    outputs: [{ type: "uint8"   }] },
  { name: "totalSupply", type: "function", stateMutability: "view", inputs: [],                                    outputs: [{ type: "uint256" }] },
] as const;

const ERC4626_ABI = [
  { name: "asset",       type: "function", stateMutability: "view", inputs: [],                                    outputs: [{ type: "address" }] },
  { name: "totalAssets", type: "function", stateMutability: "view", inputs: [],                                    outputs: [{ type: "uint256" }] },
  { name: "totalIdle",   type: "function", stateMutability: "view", inputs: [],                                    outputs: [{ type: "uint256" }] },
] as const;

const PAUSABLE_ABI = [
  { name: "paused",      type: "function", stateMutability: "view", inputs: [],                                    outputs: [{ type: "bool"    }] },
] as const;

const FEES_ABI = [
  {
    name: "getFees",
    type: "function",
    stateMutability: "view",
    inputs: [],
    outputs: [{
      type: "tuple",
      components: [
        { name: "performanceFee",      type: "uint64"  },
        { name: "managementFee",       type: "uint64"  },
        { name: "withdrawalFee",       type: "uint64"  },
        { name: "lastUpdateTimestamp", type: "uint64"  },
        { name: "highwaterMark",       type: "uint256" },
      ],
    }],
  },
] as const;

const ULTRAYIELD_ADDR_ABI = [
  { name: "fundsHolder",  type: "function", stateMutability: "view", inputs: [], outputs: [{ type: "address" }] },
  { name: "oracle",       type: "function", stateMutability: "view", inputs: [], outputs: [{ type: "address" }] },
  { name: "feeRecipient", type: "function", stateMutability: "view", inputs: [], outputs: [{ type: "address" }] },
  { name: "rateProvider", type: "function", stateMutability: "view", inputs: [], outputs: [{ type: "address" }] },
] as const;

const PENDING_ABI = [
  {
    name: "getPendingRedeemForAsset",
    type: "function",
    stateMutability: "view",
    inputs: [{ name: "asset", type: "address" }, { name: "controller", type: "address" }],
    outputs: [{ type: "tuple", components: [{ name: "shares", type: "uint256" }, { name: "requestTime", type: "uint256" }] }],
  },
  {
    name: "getClaimableRedeemForAsset",
    type: "function",
    stateMutability: "view",
    inputs: [{ name: "asset", type: "address" }, { name: "controller", type: "address" }],
    outputs: [{ type: "tuple", components: [{ name: "assets", type: "uint256" }, { name: "shares", type: "uint256" }] }],
  },
] as const;

// ── Return types ──────────────────────────────────────────────────────────────

export type OnChainMeta = {
  name:     string;
  symbol:   string;
  decimals: number;
  totalSupply?:  bigint;
  // ERC-4626 asset
  assetAddress?:        Address;
  assetSymbol?:         string;
  assetDecimals?:       number;
  // UltraYield fee struct (100% = 1e18)
  performanceFee?:      bigint;
  managementFee?:       bigint;
  withdrawalFee?:       bigint;
  // UltraYield contract addresses
  fundsHolder?:         Address;
  oracleAddress?:       Address;
  feeRecipient?:        Address;
  rateProviderAddress?: Address;
};

export type OnChainState = {
  totalAssets?:  bigint;
  totalSupply?:  bigint;
  liquidityRaw?: bigint;  // Morpho: totalIdle
  isPaused?:     boolean; // UltraYield: paused flag
};

export type PendingInfo = {
  pendingShares?:      bigint;
  pendingRequestTime?: bigint;
  claimableAssets?:    bigint;
  claimableShares?:    bigint;
};

// ── fetchOnChainMeta ──────────────────────────────────────────────────────────

/**
 * Reads static vault metadata via on-chain multicall.
 * Safe to cache with a long TTL (e.g. 1 hour) — data only changes on upgrades.
 *
 * Fetches:
 *   - ERC-20: name, symbol, decimals, totalSupply
 *   - ERC-4626 (morpho/ultrayield): asset address, assetSymbol, assetDecimals
 *   - UltraYield extras: performanceFee, managementFee, withdrawalFee,
 *                        fundsHolder, oracle, feeRecipient, rateProvider
 */
export async function fetchOnChainMeta(
  chainId: number,
  vaultAddress: Address,
  kind: "ultrayield" | "morpho" | "midas"
): Promise<OnChainMeta> {
  const client = getPublicClient(chainId);

  // ── Batch 1: ERC-20 metadata ──────────────────────────────────────────────
  const erc20 = await client.multicall({
    contracts: [
      { address: vaultAddress, abi: ERC20_META_ABI, functionName: "name"        },
      { address: vaultAddress, abi: ERC20_META_ABI, functionName: "symbol"      },
      { address: vaultAddress, abi: ERC20_META_ABI, functionName: "decimals"    },
      { address: vaultAddress, abi: ERC20_META_ABI, functionName: "totalSupply" },
    ],
    allowFailure: true,
  });

  const meta: OnChainMeta = {
    name:        erc20[0].status === "success" ? String(erc20[0].result)            : vaultAddress,
    symbol:      erc20[1].status === "success" ? String(erc20[1].result)            : "—",
    decimals:    erc20[2].status === "success" ? Number(erc20[2].result)            : 18,
    totalSupply: erc20[3].status === "success" ? BigInt(erc20[3].result as bigint)  : undefined,
  };

  // Midas tokens are not ERC-4626 — no asset() or fee struct
  if (kind === "midas") return meta;

  // ── Batch 2: ERC-4626 asset address ──────────────────────────────────────
  const [assetRes] = await client.multicall({
    contracts: [{ address: vaultAddress, abi: ERC4626_ABI, functionName: "asset" }],
    allowFailure: true,
  });

  const assetAddress = assetRes.status === "success" ? (assetRes.result as Address) : undefined;
  if (assetAddress) {
    meta.assetAddress = assetAddress;

    // ── Batch 3: asset token ERC-20 metadata ────────────────────────────────
    const assetMeta = await client.multicall({
      contracts: [
        { address: assetAddress, abi: ERC20_META_ABI, functionName: "symbol"   },
        { address: assetAddress, abi: ERC20_META_ABI, functionName: "decimals" },
      ],
      allowFailure: true,
    });
    if (assetMeta[0].status === "success") meta.assetSymbol   = String(assetMeta[0].result);
    if (assetMeta[1].status === "success") meta.assetDecimals = Number(assetMeta[1].result);
  }

  // ── Batch 4: UltraYield-specific metadata ─────────────────────────────────
  if (kind === "ultrayield") {
    const [feesRes, fhRes, oracleRes, feeRecipRes, rateRes] = await client.multicall({
      contracts: [
        { address: vaultAddress, abi: FEES_ABI,             functionName: "getFees"      },
        { address: vaultAddress, abi: ULTRAYIELD_ADDR_ABI,  functionName: "fundsHolder"  },
        { address: vaultAddress, abi: ULTRAYIELD_ADDR_ABI,  functionName: "oracle"       },
        { address: vaultAddress, abi: ULTRAYIELD_ADDR_ABI,  functionName: "feeRecipient" },
        { address: vaultAddress, abi: ULTRAYIELD_ADDR_ABI,  functionName: "rateProvider" },
      ],
      allowFailure: true,
    });

    if (feesRes.status === "success") {
      const fees = feesRes.result as { performanceFee: bigint; managementFee: bigint; withdrawalFee: bigint };
      meta.performanceFee = fees.performanceFee;
      meta.managementFee  = fees.managementFee;
      meta.withdrawalFee  = fees.withdrawalFee;
    }
    if (fhRes.status       === "success") meta.fundsHolder          = fhRes.result       as Address;
    if (oracleRes.status   === "success") meta.oracleAddress        = oracleRes.result   as Address;
    if (feeRecipRes.status === "success") meta.feeRecipient         = feeRecipRes.result as Address;
    if (rateRes.status     === "success") meta.rateProviderAddress  = rateRes.result     as Address;
  }

  return meta;
}

// ── fetchOnChainState ─────────────────────────────────────────────────────────

/**
 * Reads dynamic vault state via on-chain multicall.
 * Cache with a short TTL (30 s) since TVL changes every block.
 *
 * Fetches:
 *   - totalAssets (ERC-4626, not available for Midas)
 *   - totalSupply (ERC-20)
 *   - liquidityRaw = totalIdle (Morpho-only)
 *   - isPaused (UltraYield-only)
 */
export async function fetchOnChainState(
  chainId: number,
  vaultAddress: Address,
  kind?: "ultrayield" | "morpho" | "midas"
): Promise<OnChainState> {
  const client = getPublicClient(chainId);

  if (kind === "midas") {
    // Midas tokens: only totalSupply is available on-chain
    const [supplyRes] = await client.multicall({
      contracts: [{ address: vaultAddress, abi: ERC20_META_ABI, functionName: "totalSupply" }],
      allowFailure: true,
    });
    return {
      totalSupply: supplyRes.status === "success" ? BigInt(supplyRes.result as bigint) : undefined,
    };
  }

  // ── Shared: totalAssets + totalSupply ─────────────────────────────────────
  const base = await client.multicall({
    contracts: [
      { address: vaultAddress, abi: ERC4626_ABI,   functionName: "totalAssets"  },
      { address: vaultAddress, abi: ERC20_META_ABI, functionName: "totalSupply" },
    ],
    allowFailure: true,
  });

  const state: OnChainState = {
    totalAssets: base[0].status === "success" ? BigInt(base[0].result as bigint) : undefined,
    totalSupply: base[1].status === "success" ? BigInt(base[1].result as bigint) : undefined,
  };

  // ── Morpho: totalIdle (uninvested liquidity) ──────────────────────────────
  if (kind === "morpho") {
    const [idleRes] = await client.multicall({
      contracts: [{ address: vaultAddress, abi: ERC4626_ABI, functionName: "totalIdle" }],
      allowFailure: true,
    });
    if (idleRes.status === "success") state.liquidityRaw = BigInt(idleRes.result as bigint);
  }

  // ── UltraYield: paused flag ───────────────────────────────────────────────
  if (kind === "ultrayield") {
    const [pausedRes] = await client.multicall({
      contracts: [{ address: vaultAddress, abi: PAUSABLE_ABI, functionName: "paused" }],
      allowFailure: true,
    });
    if (pausedRes.status === "success") state.isPaused = Boolean(pausedRes.result);
  }

  return state;
}

// ── fetchPending ──────────────────────────────────────────────────────────────

/**
 * Reads UltraYield pending and claimable redeem positions for a specific user.
 *
 * This is UltraYield-specific (ERC-7540 async redeem pattern).
 * Midas pending redemptions come from the REST API — see midasApi.ts.
 *
 * @param chainId       EVM chain ID of the vault
 * @param vaultAddress  UltraYield vault contract address
 * @param assetAddress  Asset token address (passed to getPendingRedeemForAsset)
 * @param userAddress   Controller / owner address to query
 */
export async function fetchPending(
  chainId: number,
  vaultAddress: Address,
  assetAddress: Address,
  userAddress: Address
): Promise<PendingInfo> {
  const client = getPublicClient(chainId);

  const [pendingRes, claimableRes] = await client.multicall({
    contracts: [
      {
        address: vaultAddress,
        abi: PENDING_ABI,
        functionName: "getPendingRedeemForAsset",
        args: [assetAddress, userAddress],
      },
      {
        address: vaultAddress,
        abi: PENDING_ABI,
        functionName: "getClaimableRedeemForAsset",
        args: [assetAddress, userAddress],
      },
    ],
    allowFailure: true,
  });

  const info: PendingInfo = {};

  if (pendingRes.status === "success") {
    const r = pendingRes.result as { shares: bigint; requestTime: bigint };
    info.pendingShares      = r.shares;
    info.pendingRequestTime = r.requestTime;
  }
  if (claimableRes.status === "success") {
    const r = claimableRes.result as { assets: bigint; shares: bigint };
    info.claimableAssets = r.assets;
    info.claimableShares = r.shares;
  }

  return info;
}

// ── fetchVaultOracle ──────────────────────────────────────────────────────────

/**
 * Reads the oracle address directly from the vault contract.
 *
 * Called server-side so the oracle address is never accepted from the caller
 * (OPE-18: prevents SSRF / RPC amplification via a caller-supplied oracle).
 *
 * @throws if the vault does not expose `oracle()` or the RPC call fails.
 */
export async function fetchVaultOracle(
  chainId: number,
  vaultAddress: Address,
): Promise<Address> {
  const client = getPublicClient(chainId);
  return client.readContract({
    address: vaultAddress,
    abi:     ULTRAYIELD_ADDR_ABI,
    functionName: "oracle",
  }) as Promise<Address>;
}

// ── fetchUltraYieldApy ────────────────────────────────────────────────────────

// PriceUpdated(address indexed base, address indexed quote, uint256 price, ...)
const ORACLE_ABI = parseAbi([
  "event PriceUpdated(address indexed base, address indexed quote, uint256 price, uint256 targetPrice, uint256 timestampForFullVesting)",
]);

// Approximate seconds per block by chain ID
const SECONDS_PER_BLOCK: Record<number, number> = {
  1:        12,    // Ethereum mainnet
  11155111: 12,    // Sepolia
  42161:    0.25,  // Arbitrum One
  421614:   0.25,  // Arbitrum Sepolia
  8453:     2,     // Base
  84532:    2,     // Base Sepolia
  10:       2,     // Optimism
  11155420: 2,     // Optimism Sepolia
};
const DEFAULT_SECONDS_PER_BLOCK = 12;

// Cap getLogs range so we never exceed public RPC limits (~50k blocks)
const MAX_QUERY_BLOCKS = BigInt(50_000);

// Minimum history window to report a meaningful APY
const MIN_DAYS = 0.5;

export type UltraYieldApyResult = {
  apy:      number;
  daysBack: number;
};

/**
 * Computes UltraYield 7-day APY from on-chain PriceUpdated oracle events.
 *
 * This is the server-side equivalent of the `use7dApy` React hook.
 * Suitable for caching with a long TTL (24 h) since:
 *   - It requires an eth_getLogs scan over ~50k blocks (expensive)
 *   - The 7-day APY figure changes slowly — daily updates are sufficient
 *
 * @param chainId       EVM chain ID of the oracle contract
 * @param oracleAddress UltraVaultOracle contract address
 * @param vaultAddress  Vault share token address (base token in oracle)
 * @param assetAddress  Underlying asset address (quote token in oracle)
 */
export async function fetchUltraYieldApy(
  chainId: number,
  oracleAddress: Address,
  vaultAddress:  Address,
  assetAddress:  Address
): Promise<UltraYieldApyResult | null> {
  const client = getPublicClient(chainId);
  const secondsPerBlock = SECONDS_PER_BLOCK[chainId] ?? DEFAULT_SECONDS_PER_BLOCK;
  const blocksPerDay    = Math.floor(86_400 / secondsPerBlock);

  const currentBlock = await client.getBlockNumber();
  const blocks7d     = BigInt(blocksPerDay * 7);
  const queryRange   = blocks7d < MAX_QUERY_BLOCKS ? blocks7d : MAX_QUERY_BLOCKS;
  const fromBlock    = currentBlock > queryRange ? currentBlock - queryRange : BigInt(0);

  const logs = await client.getLogs({
    address: oracleAddress,
    event:   ORACLE_ABI[0],
    args:    { base: vaultAddress, quote: assetAddress },
    fromBlock,
    toBlock: currentBlock,
  });

  if (logs.length < 2) return null;

  const sorted = [...logs].sort((a, b) => {
    if (a.blockNumber !== b.blockNumber) return a.blockNumber < b.blockNumber ? -1 : 1;
    return Number(a.logIndex - b.logIndex);
  });

  const priceStart = sorted[0].args.price;
  const priceEnd   = sorted[sorted.length - 1].args.price;

  if (!priceStart || !priceEnd || priceStart === BigInt(0)) return null;

  const blocksCovered = Number(sorted[sorted.length - 1].blockNumber - sorted[0].blockNumber);
  const actualDays    = (blocksCovered * secondsPerBlock) / 86_400;

  if (actualDays < MIN_DAYS) return null;

  const ratio = Number(priceEnd) / Number(priceStart);
  const apy   = (Math.pow(ratio, 365 / actualDays) - 1) * 100;

  if (!isFinite(apy) || Math.abs(apy) > 10_000) return null;

  return { apy, daysBack: actualDays };
}
