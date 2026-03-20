"use client";

/**
 * Derives 7-day APY from on-chain oracle events.
 *
 * Source: UltraVaultOracle emits `PriceUpdated(indexed base, indexed quote, price, targetPrice, timestampForFullVesting)`
 * on every price update (both instant and vested). By fetching events from
 * ~7 days ago we get the historical share price and can annualise the return.
 *
 * Why not a single contract call?
 * The UltraVaultOracle stores only the CURRENT Price struct — there is no
 * on-chain history array. Historical data lives exclusively in event logs.
 */

import { useQuery } from "@tanstack/react-query";
import { usePublicClient, useBlockNumber } from "wagmi";
import { parseAbi } from "viem";

// PriceUpdated event from IUltraVaultOracle.sol
const ORACLE_ABI = parseAbi([
  "event PriceUpdated(address indexed base, address indexed quote, uint256 price, uint256 targetPrice, uint256 timestampForFullVesting)",
]);

// Approximate block times (seconds) per chain ID
const SECONDS_PER_BLOCK: Record<number, number> = {
  1:     12,   // Ethereum mainnet
  11155111: 12, // Sepolia
  42161: 0.25, // Arbitrum One (very fast — APY from short window only)
  421614: 0.25, // Arbitrum Sepolia
  8453:  2,    // Base
  84532: 2,    // Base Sepolia
  10:    2,    // Optimism
  11155420: 2, // Optimism Sepolia
};

const SECONDS_PER_BLOCK_DEFAULT = 12;

// Maximum blocks to query in a single eth_getLogs call.
// Most public RPCs (Alchemy free tier, Infura) support up to 10k–50k.
const MAX_QUERY_BLOCKS = 50_000n;

// Minimum days of history required to report an APY
const MIN_DAYS = 0.5;

export type ApyResult = {
  /** Annualised percentage return (e.g. 5.23 means 5.23%) */
  apy: number | null;
  /** Actual number of days covered by the calculation */
  daysBack: number | null;
  /** Human-readable label: "7D APY", "3D APY", "< 1D (insufficient history)", etc. */
  label: string;
  isLoading: boolean;
  isError: boolean;
};

export function use7dApy(
  oracleAddress: `0x${string}` | undefined,
  /** vault address == base token in the oracle (vault IS the share token) */
  vaultAddress: `0x${string}` | undefined,
  assetAddress: `0x${string}` | undefined,
): ApyResult {
  const publicClient = usePublicClient();
  const { data: currentBlock } = useBlockNumber({ watch: false });

  const chainId: number = (publicClient as { chain?: { id: number } })?.chain?.id ?? 1;
  const secondsPerBlock = SECONDS_PER_BLOCK[chainId] ?? SECONDS_PER_BLOCK_DEFAULT;
  const blocksPerDay = Math.floor(86_400 / secondsPerBlock);

  const enabled =
    !!publicClient &&
    !!oracleAddress &&
    !!vaultAddress &&
    !!assetAddress &&
    currentBlock !== undefined;

  const { data, isLoading, isError } = useQuery({
    queryKey: ["7dApy", chainId, oracleAddress, vaultAddress, assetAddress, currentBlock?.toString()],
    enabled,
    staleTime: 5 * 60 * 1_000,  // 5 minutes
    gcTime: 15 * 60 * 1_000,
    queryFn: async (): Promise<{ apy: number; daysBack: number } | null> => {
      if (!publicClient || !oracleAddress || !vaultAddress || !assetAddress || currentBlock === undefined) return null;

      // How many blocks cover 7 days? Cap at MAX_QUERY_BLOCKS.
      const blocks7d = BigInt(blocksPerDay * 7);
      const queryRange = blocks7d < MAX_QUERY_BLOCKS ? blocks7d : MAX_QUERY_BLOCKS;
      const fromBlock = currentBlock > queryRange ? currentBlock - queryRange : 0n;

      // Fetch all PriceUpdated events for this (vault, asset) pair in the window
      const logs = await publicClient.getLogs({
        address: oracleAddress,
        event: ORACLE_ABI[0],
        args: { base: vaultAddress, quote: assetAddress },
        fromBlock,
        toBlock: currentBlock,
      });

      if (logs.length < 2) {
        // Need at least 2 data points (start + end) to compute a return.
        // With only 0 or 1 events there is not enough price history.
        return null;
      }

      // Oldest event = starting price; newest = ending price
      const oldestLog = logs[0];
      const newestLog = logs[logs.length - 1];

      const priceStart = oldestLog.args.price;
      const priceEnd   = newestLog.args.price;

      if (!priceStart || !priceEnd || priceStart === 0n) return null;

      // Blocks actually covered — convert to days
      const blocksCovered = Number(newestLog.blockNumber - oldestLog.blockNumber);
      const actualDays = (blocksCovered * secondsPerBlock) / 86_400;

      if (actualDays < MIN_DAYS) return null;

      // Annualise: APY = ((priceEnd / priceStart)^(365 / actualDays) - 1) × 100
      const ratio = Number(priceEnd) / Number(priceStart);
      const apy = (Math.pow(ratio, 365 / actualDays) - 1) * 100;

      // Sanity guard: ignore implausibly large values (likely data artefact)
      if (!isFinite(apy) || Math.abs(apy) > 10_000) return null;

      return { apy, daysBack: actualDays };
    },
  });

  if (!enabled || isLoading) {
    return { apy: null, daysBack: null, label: "7D APY", isLoading: true, isError: false };
  }
  if (isError || data === null || data === undefined) {
    return { apy: null, daysBack: null, label: "7D APY", isLoading: false, isError: !!isError };
  }

  const days = data.daysBack ?? 7;
  const roundedDays = Math.round(days);
  const label = roundedDays >= 6 ? "7D APY" : `${roundedDays}D APY`;

  return {
    apy: data.apy,
    daysBack: data.daysBack,
    label,
    isLoading: false,
    isError: false,
  };
}
