"use client";

/**
 * NearSwapModal
 *
 * Cross-chain swap powered by NEAR Intents / 1Click API.
 *
 * Swap flow:
 *  1. User picks origin token (EVM chain) + amount + destination token + recipient
 *  2. "Get Quote" → calls POST /api/swap/quote
 *  3. Quote summary shown (estimated out, min out, deadline)
 *  4. "Swap" → dispatches EVM tx to depositAddress
 *     - Native ETH/BNB: sendTransaction
 *     - ERC-20: transfer(depositAddress, amount)
 *  5. Polls /api/swap/status until SUCCESS / REFUNDED / FAILED
 */
import React, { useState, useEffect, useMemo, useCallback } from "react";
import { formatUnits } from "viem";
import type { Address } from "viem";
import { useAccount, useBalance, useReadContract } from "wagmi";
import { useAppKit } from "@reown/appkit/react";
import { HiOutlineArrowDown, HiOutlineRefresh, HiOutlineExternalLink, HiOutlineClipboard, HiOutlineClock } from "react-icons/hi";
import { useSwap, EVM_CHAINS, parseEvmAsset } from "@/hooks/useSwap";
import type { SwapToken, SwapStatusResponse, ExplorerTransaction, ExplorerHistoryResponse } from "@/types/swap";
import { getTxExplorerLink } from "@/lib/chains";

const NEAR_INTENTS_EXPLORER = "https://explorer.near-intents.org";

// ── EVM blockchains supported as origin ──────────────────────────────────────
const EVM_BLOCKCHAINS = new Set(Object.keys(EVM_CHAINS));

// ── CSS helpers (matches rest of app) ────────────────────────────────────────
const INPUT_CLASS =
  "min-w-0 flex-1 border-0 bg-transparent px-1 py-2.5 text-base font-medium text-zinc-900 placeholder:text-zinc-400 [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none focus:outline-none focus:ring-0 disabled:opacity-60 dark:text-zinc-100 dark:placeholder:text-zinc-500";
const SELECT_CLASS =
  "w-full rounded-xl border border-zinc-300 bg-white/95 px-3 py-2.5 text-sm font-medium text-zinc-900 focus:outline-none focus:ring-1 focus:ring-zinc-400 disabled:opacity-60 dark:border-[#1b1b1f] dark:bg-[#0b0c10] dark:text-zinc-100";
const BTN_PRIMARY =
  "w-full max-w-none rounded-xl border border-transparent bg-zinc-900 px-5 py-3.5 text-base font-semibold text-white hover:bg-zinc-800 disabled:bg-zinc-400/70 disabled:text-zinc-200 dark:border-[#1b1b1f] dark:bg-[#ffffff] dark:text-[#141417] dark:hover:bg-[#afafb2] dark:disabled:border-[#1b1b1f] dark:disabled:bg-[#27272b] dark:disabled:text-[#afafb2] transition";
const BTN_SECONDARY =
  "w-full rounded-xl border border-zinc-200 bg-[#F1F2F0] px-5 py-3 text-sm font-semibold text-zinc-700 hover:bg-zinc-200 dark:border-[#1b1b1f] dark:bg-[#1a1a1f] dark:text-[#afafb2] dark:hover:bg-[#27272b] transition";

// ── Status badge style ────────────────────────────────────────────────────────
function statusBadge(status: string) {
  switch (status) {
    case "success":         return "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300";
    case "refunded":        return "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300";
    case "failed":
    case "error":           return "bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300";
    case "processing":
    case "known_deposit":   return "bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300";
    default:                return "bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300";
  }
}

function statusLabel(status: string) {
  const map: Record<string, string> = {
    idle:             "Ready",
    quoting:          "Fetching quote…",
    quote_ready:      "Quote ready",
    awaiting_wallet:  "Confirm in wallet…",
    pending_deposit:  "Waiting for deposit…",
    known_deposit:    "Deposit detected…",
    processing:       "Executing swap…",
    success:          "Swap complete",
    refunded:         "Refunded",
    failed:           "Swap failed",
    error:            "Error",
  };
  return map[status] ?? status;
}

// ── Token select component ────────────────────────────────────────────────────
interface TokenSelectProps {
  label: string;
  tokens: SwapToken[];
  value: SwapToken | null;
  onChange: (t: SwapToken) => void;
  disabled?: boolean;
  filterFn?: (t: SwapToken) => boolean;
}

function TokenSelect({ label, tokens, value, onChange, disabled, filterFn }: TokenSelectProps) {
  const filtered = filterFn ? tokens.filter(filterFn) : tokens;

  return (
    <div>
      <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-zinc-500 dark:text-[#afafb2]">
        {label}
      </label>
      <select
        disabled={disabled || filtered.length === 0}
        value={value?.assetId ?? ""}
        onChange={(e) => {
          const t = filtered.find((x) => x.assetId === e.target.value);
          if (t) onChange(t);
        }}
        className={SELECT_CLASS}
      >
        <option value="">Select token…</option>
        {filtered.map((t) => (
          <option key={t.assetId} value={t.assetId}>
            {t.symbol} — {t.blockchain.toUpperCase()}
            {t.price ? ` ($${t.price.toFixed(2)})` : ""}
          </option>
        ))}
      </select>
    </div>
  );
}

// ── Status colour for saved swaps ─────────────────────────────────────────────
function savedStatusDot(status?: string) {
  if (status === "SUCCESS")  return "bg-emerald-500";
  if (status === "REFUNDED") return "bg-amber-500";
  if (status === "FAILED" || status === "INCOMPLETE_DEPOSIT") return "bg-red-500";
  if (status === "PROCESSING" || status === "KNOWN_DEPOSIT_TX") return "bg-blue-500";
  return "bg-zinc-400";
}

// ── Helpers for TrackPanel ────────────────────────────────────────────────────
function assetLabel(assetId: string): string {
  const id = assetId.replace("nep141:", "");
  // chain-prefixed: "eth-0x...", "base-0x...", "arb-0x..." etc.
  const chainMatch = id.match(/^([a-z0-9]+)-0x/i);
  if (chainMatch) return chainMatch[1].toUpperCase();
  // known NEAR tokens by keyword
  if (/usdt/i.test(id)) return "USDT";
  if (/usdc/i.test(id)) return "USDC";
  if (/btc/i.test(id)) return "BTC";
  if (/near/i.test(id)) return "NEAR";
  if (/eth/i.test(id)) return "ETH";
  return id.slice(0, 6).toUpperCase();
}

function relativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60_000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

// ── Track Panel ──────────────────────────────────────────────────────────────
function TrackPanel({ walletAddress }: { walletAddress?: string }) {
  const [txs, setTxs] = useState<ExplorerTransaction[]>([]);
  const [loading, setLoading] = useState(false);
  const [noJwt, setNoJwt] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [totalCount, setTotalCount] = useState(0);
  const [page, setPage] = useState(1);
  const perPage = 10;

  const explorerUrl = walletAddress
    ? `${NEAR_INTENTS_EXPLORER}/?search=${walletAddress}`
    : NEAR_INTENTS_EXPLORER;

  const fetchHistory = useCallback(async (pageNum: number) => {
    if (!walletAddress) return;
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({
        search: walletAddress,
        page: String(pageNum),
        perPage: String(perPage),
      });
      const res = await fetch(`/api/swap/history?${params.toString()}`);
      if (res.status === 401) { setNoJwt(true); return; }
      const data: ExplorerHistoryResponse = await res.json();
      if (!res.ok) { setError((data as { error?: string }).error ?? "Failed to load history"); return; }
      setTxs(data.transactions ?? []);
      setTotalCount(data.totalCount ?? 0);
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  }, [walletAddress]);

  useEffect(() => {
    setPage(1);
    void fetchHistory(1);
  }, [fetchHistory]);

  const totalPages = Math.max(1, Math.ceil(totalCount / perPage));

  function handlePage(next: number) {
    setPage(next);
    void fetchHistory(next);
  }

  return (
    <div className="space-y-3">

      {/* Connected wallet + explorer link */}
      <div className="flex items-center justify-between gap-2 rounded-xl border border-[#E1E5E1] bg-[#F1F2F0] px-3 py-2.5 dark:border-[#1b1b1f] dark:bg-[#101014]">
        <div className="min-w-0">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-zinc-400 dark:text-zinc-500">
            Connected wallet
          </p>
          {walletAddress ? (
            <p className="truncate font-mono text-xs font-medium text-zinc-800 dark:text-zinc-200">
              {walletAddress}
            </p>
          ) : (
            <p className="text-xs text-zinc-400 dark:text-zinc-500">Not connected</p>
          )}
        </div>
        <a
          href={explorerUrl}
          target="_blank"
          rel="noopener noreferrer"
          title="View all on NEAR Intents Explorer"
          className="shrink-0 inline-flex items-center gap-1 rounded-lg border border-zinc-300 bg-white px-2.5 py-1.5 text-[11px] font-semibold text-zinc-700 hover:bg-zinc-50 dark:border-[#2a2a2e] dark:bg-[#0b0c10] dark:text-zinc-300 dark:hover:bg-[#16171c]"
        >
          Explorer <HiOutlineExternalLink className="h-3 w-3" />
        </a>
      </div>

      {/* No JWT warning */}
      {noJwt && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2.5 dark:border-amber-800/50 dark:bg-amber-900/20">
          <p className="text-xs font-semibold text-amber-700 dark:text-amber-400">Set ONECLICK_JWT_TOKEN to load history</p>
          <p className="mt-0.5 text-xs text-amber-600/80 dark:text-amber-400/70">
            Add your JWT token in <code className="rounded bg-amber-100 px-1 dark:bg-amber-900/40">.env.local</code> to fetch your full transaction history from the NEAR Intents Explorer.
            Until then, use the Explorer button above.
          </p>
        </div>
      )}

      {/* Loading */}
      {loading && (
        <div className="flex items-center justify-center py-8 gap-2 text-sm text-zinc-400">
          <HiOutlineRefresh className="h-4 w-4 animate-spin" />
          Loading transactions…
        </div>
      )}

      {/* Error */}
      {error && !loading && (
        <p className="py-4 text-center text-xs text-red-500">{error}</p>
      )}

      {/* No wallet */}
      {!walletAddress && !loading && (
        <p className="py-6 text-center text-sm text-zinc-400 dark:text-zinc-600">
          Connect your wallet to see your swap history.
        </p>
      )}

      {/* Transaction list */}
      {!loading && !noJwt && txs.length > 0 && (
        <>
          <div className="space-y-2">
            {txs.map((tx) => (
              <div
                key={tx.depositAddress}
                className="rounded-xl border border-zinc-200 bg-[#F1F2F0] p-3 dark:border-[#1b1b1f] dark:bg-[#0f1014]"
              >
                {/* Row 1: status dot + pair + status badge + time */}
                <div className="flex items-center gap-2">
                  <span className={`h-2 w-2 shrink-0 rounded-full ${savedStatusDot(tx.status)}`} />
                  <span className="flex-1 text-xs font-semibold text-zinc-800 dark:text-zinc-200">
                    {assetLabel(tx.originAsset)} → {assetLabel(tx.destinationAsset)}
                  </span>
                  <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide ${
                    tx.status === "SUCCESS"
                      ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400"
                      : tx.status === "REFUNDED"
                      ? "bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400"
                      : tx.status === "FAILED"
                      ? "bg-red-100 text-red-600 dark:bg-red-900/30 dark:text-red-400"
                      : "bg-zinc-200 text-zinc-600 dark:bg-zinc-700 dark:text-zinc-300"
                  }`}>
                    {tx.status.replace("_", " ")}
                  </span>
                </div>

                {/* Row 2: amounts + time */}
                <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[11px] text-zinc-500 dark:text-zinc-400">
                  <span>
                    <span className="font-medium text-zinc-700 dark:text-zinc-300">{tx.amountInFormatted}</span>
                    {tx.amountInUsd && <span className="ml-1 text-zinc-400">(${parseFloat(tx.amountInUsd).toFixed(2)})</span>}
                    {" → "}
                    <span className="font-medium text-zinc-700 dark:text-zinc-300">{tx.amountOutFormatted}</span>
                    {tx.amountOutUsd && <span className="ml-1 text-zinc-400">(${parseFloat(tx.amountOutUsd).toFixed(2)})</span>}
                  </span>
                  <span className="ml-auto flex items-center gap-1">
                    <HiOutlineClock className="h-3 w-3" />
                    {relativeTime(tx.createdAt)}
                  </span>
                </div>

                {/* Refund reason */}
                {tx.refundReason && (
                  <p className="mt-1 text-[10px] text-amber-600 dark:text-amber-400">
                    Refund reason: {tx.refundReason.replace(/_/g, " ")}
                  </p>
                )}

                {/* Links */}
                <div className="mt-1.5 flex flex-wrap gap-x-3 gap-y-1">
                  <a
                    href={`${NEAR_INTENTS_EXPLORER}/?search=${tx.depositAddress}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 text-[11px] text-zinc-400 underline hover:text-zinc-700 dark:hover:text-zinc-200"
                  >
                    View on Explorer <HiOutlineExternalLink className="h-2.5 w-2.5" />
                  </a>
                </div>
              </div>
            ))}
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between pt-1 text-xs text-zinc-500">
              <button
                type="button"
                disabled={page <= 1}
                onClick={() => handlePage(page - 1)}
                className="rounded-lg border border-zinc-200 px-3 py-1.5 disabled:opacity-40 hover:bg-zinc-100 dark:border-[#2a2a2e] dark:hover:bg-[#16171c]"
              >
                ← Prev
              </button>
              <span>Page {page} / {totalPages} · {totalCount} total</span>
              <button
                type="button"
                disabled={page >= totalPages}
                onClick={() => handlePage(page + 1)}
                className="rounded-lg border border-zinc-200 px-3 py-1.5 disabled:opacity-40 hover:bg-zinc-100 dark:border-[#2a2a2e] dark:hover:bg-[#16171c]"
              >
                Next →
              </button>
            </div>
          )}
        </>
      )}

      {/* Empty state */}
      {!loading && !noJwt && walletAddress && txs.length === 0 && !error && (
        <p className="py-6 text-center text-sm text-zinc-400 dark:text-zinc-600">
          No swap transactions found for this wallet.
        </p>
      )}
    </div>
  );
}

// ── Swap status card (used in manual lookup result) ───────────────────────────
interface SwapStatusCardProps {
  depositAddress: string;
  statusData: SwapStatusResponse;
  onRecheck: () => void;
  isChecking: boolean;
}

function SwapStatusCard({ statusData, onRecheck, isChecking }: SwapStatusCardProps) {
  const { status, swapDetails, updatedAt } = statusData;
  const badgeClass = {
    SUCCESS: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300",
    REFUNDED: "bg-amber-100 text-amber-700",
    FAILED: "bg-red-100 text-red-700",
    PROCESSING: "bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300",
    KNOWN_DEPOSIT_TX: "bg-blue-100 text-blue-700",
    PENDING_DEPOSIT: "bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300",
    INCOMPLETE_DEPOSIT: "bg-red-100 text-red-700",
  }[status ?? ""] ?? "bg-zinc-100 text-zinc-600";

  // API may return no status field if the deposit address is not found
  if (!status) {
    return (
      <div className="rounded-xl border border-zinc-200 bg-zinc-50 px-3 py-3 text-sm text-zinc-500 dark:border-[#1b1b1f] dark:bg-[#0f1014] dark:text-zinc-400">
        <div className="flex items-center justify-between">
          <span className="font-medium">Deposit address not found</span>
          <button type="button" onClick={onRecheck} disabled={isChecking} className="text-xs underline opacity-70 hover:opacity-100">
            {isChecking ? "Checking…" : "Retry"}
          </button>
        </div>
        <p className="mt-1 text-xs opacity-70">
          The deposit address may be invalid, or the swap has not been submitted yet.
        </p>
      </div>
    );
  }

  return (
    <div className={`rounded-xl border px-3 py-3 text-sm ${badgeClass}`}>
      <div className="flex items-center justify-between">
        <span className="font-semibold">{status.replace(/_/g, " ")}</span>
        <button type="button" onClick={onRecheck} disabled={isChecking} className="text-xs underline opacity-70 hover:opacity-100">
          {isChecking ? "Checking…" : "Refresh"}
        </button>
      </div>
      {updatedAt && (
        <p className="mt-0.5 text-xs opacity-70">
          Last updated: {new Date(updatedAt).toLocaleString()}
        </p>
      )}
      {swapDetails?.amountOutFormatted && (
        <p className="mt-1 text-xs font-medium">
          Received: {swapDetails.amountOutFormatted}
          {swapDetails.amountOutUsd ? ` ($${swapDetails.amountOutUsd})` : ""}
        </p>
      )}
      {swapDetails?.destinationChainTxHashes?.map((tx) => (
        <a
          key={tx.hash}
          href={tx.explorerUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="mt-1 inline-flex items-center gap-1 text-xs font-semibold underline"
        >
          View destination tx <HiOutlineExternalLink className="h-3 w-3" />
        </a>
      ))}
      {swapDetails?.refundedAmountFormatted && (
        <p className="mt-1 text-xs">
          Refunded: {swapDetails.refundedAmountFormatted}
          {swapDetails.refundReason ? ` (${swapDetails.refundReason})` : ""}
        </p>
      )}
      {swapDetails?.originChainTxHashes?.map((tx) => (
        <a
          key={tx.hash}
          href={tx.explorerUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="mt-1 inline-flex items-center gap-1 text-xs font-semibold underline"
        >
          View origin tx <HiOutlineExternalLink className="h-3 w-3" />
        </a>
      ))}
    </div>
  );
}

// ── Swap content (used both as a page and can be embedded anywhere) ───────────
export function SwapContent() {
  const { address: userAddress, isConnected } = useAccount();
  const { open: openWallet } = useAppKit();

  // ── Modal tab state ────────────────────────────────────────────────────────
  const [activeTab, setActiveTab] = useState<"swap" | "track">("swap");

  // ── Tokens from 1Click API ─────────────────────────────────────────────────
  const [tokens, setTokens] = useState<SwapToken[]>([]);
  const [tokensLoading, setTokensLoading] = useState(false);
  const [tokensError, setTokensError] = useState<string | null>(null);

  const fetchTokens = useCallback(async () => {
    setTokensLoading(true);
    setTokensError(null);
    try {
      const res = await fetch("/api/swap/tokens");
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to fetch tokens");
      setTokens(Array.isArray(data) ? data : []);
    } catch (e) {
      setTokensError(e instanceof Error ? e.message : String(e));
    } finally {
      setTokensLoading(false);
    }
  }, []);

  useEffect(() => {
    if (tokens.length === 0) void fetchTokens();
  }, [tokens.length, fetchTokens]);

  // ── Swap form state ────────────────────────────────────────────────────────
  const [fromToken, setFromToken] = useState<SwapToken | null>(null);
  const [toToken, setToToken] = useState<SwapToken | null>(null);
  const [amount, setAmount] = useState("");
  const [recipient, setRecipient] = useState("");

  // Default recipient to connected address when wallet connects
  useEffect(() => {
    if (userAddress && !recipient) setRecipient(userAddress);
  }, [userAddress, recipient]);

  // ── Swap hook ──────────────────────────────────────────────────────────────
  const {
    swapStatus,
    quote,
    swapDetails,
    quoteError,
    txHash,
    isBusy,
    requestQuote,
    executeDeposit,
    reset,
  } = useSwap();

  // ── Derived values ─────────────────────────────────────────────────────────
  const formattedAmountOut = useMemo(() => {
    if (!quote?.quote?.amountOut || !toToken) return null;
    try {
      return formatUnits(BigInt(quote.quote.amountOut), toToken.decimals);
    } catch {
      return null;
    }
  }, [quote, toToken]);

  const formattedMinOut = useMemo(() => {
    if (!quote?.quote?.minAmountOut || !toToken) return null;
    try {
      return formatUnits(BigInt(quote.quote.minAmountOut), toToken.decimals);
    } catch {
      return null;
    }
  }, [quote, toToken]);

  const originChainId = useMemo(() => {
    if (!fromToken) return null;
    return EVM_CHAINS[fromToken.blockchain] ?? null;
  }, [fromToken]);

  const { evmChainId: depositChainId, contractAddress: fromTokenContract, isNative: fromTokenIsNative } = fromToken
    ? parseEvmAsset(fromToken.assetId)
    : { evmChainId: null, contractAddress: null, isNative: false };

  // ── Wallet balance for selected fromToken ──────────────────────────────────
  // Native token balance (ETH, BNB, etc.)
  const { data: nativeBalance } = useBalance({
    address: userAddress as Address | undefined,
    chainId: originChainId ?? undefined,
    query: { enabled: !!userAddress && !!fromToken && fromTokenIsNative },
  });

  // ERC-20 token balance via balanceOf
  const { data: erc20BalanceRaw } = useReadContract({
    address: fromTokenContract as Address | undefined,
    abi: [{ name: "balanceOf", type: "function", stateMutability: "view", inputs: [{ name: "account", type: "address" }], outputs: [{ name: "", type: "uint256" }] }] as const,
    functionName: "balanceOf",
    args: userAddress ? [userAddress as Address] : undefined,
    chainId: originChainId ?? undefined,
    query: { enabled: !!userAddress && !!fromToken && !fromTokenIsNative && !!fromTokenContract },
  });

  const walletBalance = useMemo(() => {
    if (!fromToken) return null;
    if (fromTokenIsNative && nativeBalance) {
      return { value: nativeBalance.value, decimals: nativeBalance.decimals };
    }
    if (!fromTokenIsNative && erc20BalanceRaw !== undefined) {
      return { value: erc20BalanceRaw as bigint, decimals: fromToken.decimals };
    }
    return null;
  }, [fromToken, fromTokenIsNative, nativeBalance, erc20BalanceRaw]);

  const formattedBalance = useMemo(() => {
    if (!walletBalance) return null;
    const val = parseFloat(formatUnits(walletBalance.value, walletBalance.decimals));
    if (val === 0) return "0";
    if (val < 0.000001) return "< 0.000001";
    if (val < 1) return val.toFixed(6);
    if (val < 1000) return val.toFixed(4);
    return val.toLocaleString(undefined, { maximumFractionDigits: 4 });
  }, [walletBalance]);

  // Recipient address format depends on the destination chain
  const recipientHint = useMemo(() => {
    if (!toToken) return null;
    const chain = toToken.blockchain;
    if (EVM_BLOCKCHAINS.has(chain)) return "0x… EVM address";
    if (chain === "near")   return "NEAR account ID (e.g. alice.near)";
    if (chain === "sol")    return "Solana base58 address";
    if (chain === "btc")    return "Bitcoin address";
    if (chain === "stellar") return "Stellar public key";
    return `${chain.toUpperCase()} address`;
  }, [toToken]);

  const isQuoteExpired = useMemo(() => {
    if (!quote?.quote?.deadline) return false;
    return new Date(quote.quote.deadline) < new Date();
  }, [quote]);

  // Minimum USD value to avoid "Failed to get quote" from market makers
  const MIN_USD_VALUE = 5;
  const belowMinimum = useMemo(() => {
    if (!fromToken?.price || !amount || parseFloat(amount) <= 0) return false;
    return fromToken.price * parseFloat(amount) < MIN_USD_VALUE;
  }, [fromToken, amount]);

  const recipientReady = toToken && !EVM_BLOCKCHAINS.has(toToken.blockchain)
    ? !!recipient   // non-EVM: must have typed a recipient
    : !!userAddress; // EVM: just need wallet connected

  const canGetQuote =
    !!fromToken && !!toToken && !!amount && parseFloat(amount) > 0 && recipientReady && !isBusy && !belowMinimum;

  const canExecute =
    swapStatus === "quote_ready" && !isBusy && !isQuoteExpired && isConnected;

  const isTerminal = ["success", "refunded", "failed", "error"].includes(swapStatus);

  // ── Handlers ───────────────────────────────────────────────────────────────
  async function handleGetQuote() {
    if (!fromToken || !toToken || !amount) return;
    // For EVM destinations always use the connected wallet; for non-EVM use the typed recipient
    const resolvedRecipient = EVM_BLOCKCHAINS.has(toToken.blockchain)
      ? (userAddress ?? "")
      : recipient;
    if (!resolvedRecipient) return;
    await requestQuote({ originAsset: fromToken, destinationAsset: toToken, amount, recipient: resolvedRecipient });
  }

  function handleSwapTokens() {
    const tmp = fromToken;
    setFromToken(toToken && EVM_BLOCKCHAINS.has(toToken.blockchain) ? toToken : null);
    setToToken(tmp);
    setAmount("");
    reset();
  }

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div className="mx-auto w-full max-w-[560px]">

          {/* ── Header ───────────────────────────────────────────────────────── */}
          <div className="mb-4">
            <h2 className="text-xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-100">
              Cross-Chain Swap
            </h2>
            <p className="mt-0.5 text-xs text-zinc-500 dark:text-[#afafb2]">
              Powered by{" "}
              <a
                href="https://near-intents.org"
                target="_blank"
                rel="noopener noreferrer"
                className="underline hover:text-zinc-700 dark:hover:text-zinc-300"
              >
                NEAR Intents
              </a>
            </p>
          </div>

          {/* ── Tabs ─────────────────────────────────────────────────────────── */}
          <div className="mb-5 inline-flex w-full gap-1 rounded-xl border border-[#E1E5E1] bg-[#F1F2F0] p-1 dark:border-[#1b1b1f] dark:bg-[#101014]">
            {(["swap", "track"] as const).map((tab) => (
              <button
                key={tab}
                type="button"
                onClick={() => setActiveTab(tab)}
                className={
                  "flex-1 rounded-lg px-4 py-2 text-sm capitalize transition " +
                  (activeTab === tab
                    ? "bg-white font-semibold text-zinc-900 shadow-sm ring-1 ring-zinc-200 dark:bg-[#25262d] dark:text-[#ffffff] dark:ring-[#1b1b1f]"
                    : "text-zinc-500 hover:bg-zinc-200/70 hover:text-zinc-700 dark:text-[#afafb2] dark:hover:bg-[#1a1a21] dark:hover:text-[#ffffff]")
                }
              >
                {tab === "track" ? (
                  <span className="flex items-center justify-center gap-1.5">
                    <HiOutlineClock className="h-3.5 w-3.5" /> Track
                  </span>
                ) : "Swap"}
              </button>
            ))}
          </div>

          {activeTab === "track" ? (
            <TrackPanel walletAddress={userAddress} />
          ) : !isConnected ? (
            <div className="rounded-xl border border-dashed border-[#e1e5e1] bg-[#f1f2f0] px-4 py-12 text-center dark:border-[#1b1b1f] dark:bg-[#141417]">
              <p className="mb-6 text-base text-zinc-500 dark:text-zinc-400">
                Connect your wallet to use the swap
              </p>
              <button
                type="button"
                onClick={() => openWallet()}
                className="rounded-lg bg-zinc-900 px-8 py-3 text-sm font-semibold text-white transition hover:bg-zinc-800 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-200"
              >
                Connect Wallet
              </button>
            </div>
          ) : (
            <>
              {/* ── Token loading / error ─────────────────────────────────────── */}
              {tokensLoading && (
                <p className="mb-4 text-sm text-zinc-400 dark:text-zinc-500">Loading tokens…</p>
              )}
              {tokensError && (
                <div className="mb-4 rounded-xl border border-red-200 bg-red-50 px-3 py-2 dark:border-red-800 dark:bg-red-900/30">
                  <p className="text-xs text-red-700 dark:text-red-300">
                    Failed to load tokens: {tokensError}
                  </p>
                  <button
                    type="button"
                    onClick={fetchTokens}
                    className="mt-1 text-xs font-semibold text-red-800 underline dark:text-red-200"
                  >
                    Retry
                  </button>
                </div>
              )}

              {/* ── Status banner ─────────────────────────────────────────────── */}
              {swapStatus !== "idle" && (
                <div className={`mb-4 rounded-xl px-3 py-2.5 text-sm font-medium ${statusBadge(swapStatus)}`}>
                  <div className="flex items-center gap-2">
                    <span className="flex-1">{statusLabel(swapStatus)}</span>
                    {quote?.quote?.depositAddress && (
                      <a
                        href={`${NEAR_INTENTS_EXPLORER}/?search=${quote.quote.depositAddress}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center gap-1 text-xs underline opacity-80 hover:opacity-100"
                      >
                        Explorer <HiOutlineExternalLink className="h-3.5 w-3.5" />
                      </a>
                    )}
                  </div>

                  {/* ── SUCCESS: show settled amounts + destination tx ──────── */}
                  {swapStatus === "success" && swapDetails && (
                    <div className="mt-2 space-y-1.5 border-t border-current/20 pt-2">
                      {swapDetails.amountOutFormatted && (
                        <p className="text-xs">
                          Received:{" "}
                          <strong>{swapDetails.amountOutFormatted} {toToken?.symbol}</strong>
                          {swapDetails.amountOutUsd ? ` ($${swapDetails.amountOutUsd})` : ""}
                        </p>
                      )}
                      {swapDetails.destinationChainTxHashes?.map((tx: { hash: string; explorerUrl: string }) => (
                        <a
                          key={tx.hash}
                          href={tx.explorerUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 text-xs font-semibold underline"
                        >
                          View on {toToken?.blockchain.toUpperCase()} explorer{" "}
                          <HiOutlineExternalLink className="h-3 w-3" />
                        </a>
                      ))}
                    </div>
                  )}

                  {/* ── REFUNDED ───────────────────────────────────────────── */}
                  {swapStatus === "refunded" && swapDetails && (
                    <div className="mt-2 space-y-1 border-t border-current/20 pt-2">
                      {swapDetails.refundedAmountFormatted && (
                        <p className="text-xs">
                          Refunded:{" "}
                          <strong>{swapDetails.refundedAmountFormatted} {fromToken?.symbol}</strong>
                        </p>
                      )}
                      {swapDetails.refundReason && (
                        <p className="text-xs opacity-80">Reason: {swapDetails.refundReason}</p>
                      )}
                      {swapDetails.originChainTxHashes?.map((tx: { hash: string; explorerUrl: string }) => (
                        <a
                          key={tx.hash}
                          href={tx.explorerUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 text-xs font-semibold underline"
                        >
                          View refund tx <HiOutlineExternalLink className="h-3 w-3" />
                        </a>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* ── Error banner ──────────────────────────────────────────────── */}
              {quoteError && (
                <div className="mb-4 rounded-xl border border-red-200 bg-red-50 px-3 py-2 dark:border-red-800 dark:bg-red-900/30">
                  <p className="text-xs font-semibold text-red-700 dark:text-red-300">
                    {quoteError.includes("Failed to get quote")
                      ? "No quote available"
                      : "Error"}
                  </p>
                  <p className="text-xs text-red-700/80 dark:text-red-300/80">
                    {quoteError.includes("Failed to get quote")
                      ? "No market maker is quoting this pair right now. Try a larger amount (min ~$5), a different token pair, or retry in a few seconds."
                      : quoteError.slice(0, 200)}
                  </p>
                </div>
              )}

              {/* ── Tx hash (on-chain send confirmed) ─────────────────────────── */}
              {txHash && originChainId && (
                <div className="mb-4 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 dark:border-emerald-800 dark:bg-emerald-900/30">
                  <p className="text-xs font-semibold text-emerald-700 dark:text-emerald-300">
                    Deposit transaction sent
                  </p>
                  <a
                    href={getTxExplorerLink(txHash, originChainId)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="mt-0.5 inline-flex items-center gap-1 text-xs font-medium text-emerald-800 underline dark:text-emerald-300"
                  >
                    {txHash.slice(0, 10)}… <HiOutlineExternalLink className="h-3 w-3" />
                  </a>
                </div>
              )}

              {/* ── Swap form ─────────────────────────────────────────────────── */}
              <div className="space-y-3">
                {/* From */}
                <div className="rounded-2xl border border-[#E1E5E1] bg-[#F1F2F0] p-4 dark:border-[#1b1b1f] dark:bg-[#0f1014]">
                  <TokenSelect
                    label="You send"
                    tokens={tokens}
                    value={fromToken}
                    onChange={(t) => { setFromToken(t); reset(); }}
                    disabled={isBusy || tokensLoading}
                    filterFn={(t) => EVM_BLOCKCHAINS.has(t.blockchain)}
                  />
                  {/* Balance row */}
                  {fromToken && (
                    <div className="mt-2 flex items-center justify-between">
                      <span className="text-xs text-zinc-500 dark:text-zinc-400">
                        Balance:{" "}
                        <span className="font-medium text-zinc-700 dark:text-zinc-300">
                          {formattedBalance !== null ? `${formattedBalance} ${fromToken.symbol}` : "—"}
                        </span>
                      </span>
                      {formattedBalance !== null && formattedBalance !== "0" && (
                        <button
                          type="button"
                          onClick={() => {
                            if (walletBalance) {
                              setAmount(formatUnits(walletBalance.value, walletBalance.decimals));
                              reset();
                            }
                          }}
                          disabled={isBusy}
                          className="rounded-md border border-zinc-200 bg-zinc-100 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-zinc-600 transition hover:bg-zinc-200 disabled:opacity-50 dark:border-[#2a2a32] dark:bg-[#1f2027] dark:text-zinc-300 dark:hover:bg-[#2a2a3a]"
                        >
                          Max
                        </button>
                      )}
                    </div>
                  )}

                  <div className="mt-2 flex items-center rounded-xl border border-zinc-300 bg-white/95 px-3 py-1.5 shadow-sm dark:border-[#1b1b1f] dark:bg-[#0b0c10]">
                    <input
                      type="number"
                      min="0"
                      placeholder="0.00"
                      value={amount}
                      onChange={(e) => { setAmount(e.target.value); reset(); }}
                      disabled={isBusy || !fromToken}
                      className={INPUT_CLASS}
                    />
                    {fromToken && (
                      <span className="shrink-0 rounded-md border border-zinc-200 bg-zinc-100 px-2.5 py-1 text-xs font-semibold uppercase tracking-wide text-zinc-700 dark:border-[#2a2a32] dark:bg-[#1f2027] dark:text-[#ffffff]">
                        {fromToken.symbol}
                      </span>
                    )}
                  </div>
                  {fromToken?.price && amount && parseFloat(amount) > 0 && (
                    <p className={`mt-1.5 text-xs ${belowMinimum ? "font-semibold text-amber-600 dark:text-amber-400" : "text-zinc-500 dark:text-zinc-400"}`}>
                      ≈ ${(fromToken.price * parseFloat(amount)).toFixed(2)}
                      {belowMinimum && ` — minimum ~$${MIN_USD_VALUE} required`}
                    </p>
                  )}
                </div>

                {/* Swap direction button */}
                <div className="flex justify-center">
                  <button
                    type="button"
                    onClick={handleSwapTokens}
                    disabled={isBusy}
                    title="Swap direction"
                    className="rounded-full border border-zinc-200 bg-white p-2 shadow-sm transition hover:bg-zinc-50 disabled:opacity-50 dark:border-[#1b1b1f] dark:bg-[#141417] dark:hover:bg-[#1a1a1f]"
                  >
                    <HiOutlineArrowDown className="h-4 w-4 text-zinc-600 dark:text-zinc-300" />
                  </button>
                </div>

                {/* To */}
                <div className="rounded-2xl border border-[#E1E5E1] bg-[#F1F2F0] p-4 dark:border-[#1b1b1f] dark:bg-[#0f1014]">
                  <TokenSelect
                    label="You receive"
                    tokens={tokens}
                    value={toToken}
                    onChange={(t) => {
                      setToToken(t);
                      reset();
                      // Clear recipient when switching to a non-EVM destination
                      // so the user is prompted to enter the correct address format
                      if (!EVM_BLOCKCHAINS.has(t.blockchain)) setRecipient("");
                      else setRecipient(userAddress ?? "");
                    }}
                    disabled={isBusy || tokensLoading}
                  />
                  {formattedAmountOut && (
                    <div className="mt-3 flex items-center rounded-xl border border-zinc-300 bg-white/95 px-3 py-2.5 shadow-sm dark:border-[#1b1b1f] dark:bg-[#0b0c10]">
                      <span className="flex-1 text-base font-medium text-zinc-900 dark:text-zinc-100">
                        {parseFloat(formattedAmountOut).toFixed(6)}
                      </span>
                      {toToken && (
                        <span className="shrink-0 rounded-md border border-zinc-200 bg-zinc-100 px-2.5 py-1 text-xs font-semibold uppercase tracking-wide text-zinc-700 dark:border-[#2a2a32] dark:bg-[#1f2027] dark:text-[#ffffff]">
                          {toToken.symbol}
                        </span>
                      )}
                    </div>
                  )}
                </div>

                {/* Recipient */}
                <div>
                  <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-zinc-500 dark:text-[#afafb2]">
                    Recipient
                  </label>

                  {/* EVM destination → read-only connected wallet */}
                  {(!toToken || EVM_BLOCKCHAINS.has(toToken.blockchain)) ? (
                    <div className="flex items-center gap-2 rounded-xl border border-zinc-200 bg-[#F1F2F0] px-3 py-2.5 dark:border-[#1b1b1f] dark:bg-[#101014]">
                      <span className="min-w-0 flex-1 truncate font-mono text-sm text-zinc-700 dark:text-zinc-300">
                        {userAddress ?? "—"}
                      </span>
                      <span className="shrink-0 rounded-md bg-zinc-200 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-zinc-500 dark:bg-[#27272b] dark:text-[#afafb2]">
                        Connected
                      </span>
                    </div>
                  ) : (
                    /* Non-EVM destination → editable input */
                    <>
                      <input
                        type="text"
                        placeholder={recipientHint ?? "Destination address"}
                        value={recipient}
                        onChange={(e) => setRecipient(e.target.value)}
                        disabled={isBusy}
                        className="w-full rounded-xl border border-zinc-300 bg-white/95 px-3 py-2.5 text-sm font-medium text-zinc-900 placeholder:text-zinc-400 focus:outline-none focus:ring-1 focus:ring-zinc-400 disabled:opacity-60 dark:border-[#1b1b1f] dark:bg-[#0b0c10] dark:text-zinc-100 dark:placeholder:text-zinc-600"
                      />
                      <p className="mt-1 text-xs text-amber-600 dark:text-amber-400">
                        Enter your {toToken.blockchain.toUpperCase()} address — your EVM address won&apos;t work here.
                      </p>
                    </>
                  )}
                </div>
              </div>

              {/* ── Quote details ─────────────────────────────────────────────── */}
              {quote?.quote && swapStatus === "quote_ready" && (
                <div className="mt-4 rounded-2xl border border-zinc-200 bg-[#F1F2F0] p-4 dark:border-[#1b1b1f] dark:bg-[#101014]">
                  <p className="mb-2.5 text-xs font-semibold uppercase tracking-wide text-zinc-500 dark:text-[#afafb2]">
                    Quote details
                  </p>
                  <div className="space-y-1.5 text-sm">
                    <div className="flex justify-between">
                      <span className="text-zinc-500 dark:text-zinc-400">Estimated output</span>
                      <span className="font-semibold text-zinc-900 dark:text-zinc-100">
                        {formattedAmountOut ? `${parseFloat(formattedAmountOut).toFixed(6)} ${toToken?.symbol}` : "—"}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-zinc-500 dark:text-zinc-400">Minimum received</span>
                      <span className="font-medium text-zinc-700 dark:text-zinc-300">
                        {formattedMinOut ? `${parseFloat(formattedMinOut).toFixed(6)} ${toToken?.symbol}` : "—"}
                      </span>
                    </div>
                    {depositChainId && (
                      <div className="flex justify-between">
                        <span className="text-zinc-500 dark:text-zinc-400">Deposit on</span>
                        <span className="font-medium text-zinc-700 dark:text-zinc-300">
                          {fromToken?.blockchain.toUpperCase()} (Chain {depositChainId})
                        </span>
                      </div>
                    )}
                    <div className="flex justify-between">
                      <span className="text-zinc-500 dark:text-zinc-400">Expires</span>
                      <span className={`font-medium ${isQuoteExpired ? "text-red-600" : "text-zinc-700 dark:text-zinc-300"}`}>
                        {quote.quote.deadline ? new Date(quote.quote.deadline).toLocaleTimeString() : "—"}
                        {isQuoteExpired && " (expired)"}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-zinc-500 dark:text-zinc-400">Deposit address</span>
                      <a
                        href={`${NEAR_INTENTS_EXPLORER}/?search=${quote.quote.depositAddress}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="truncate max-w-[180px] text-xs font-mono text-zinc-600 underline dark:text-zinc-400"
                      >
                        {quote.quote.depositAddress?.slice(0, 8)}…{quote.quote.depositAddress?.slice(-6)}
                      </a>
                    </div>
                  </div>
                </div>
              )}

              {/* ── Action buttons ────────────────────────────────────────────── */}
              <div className="mt-5 space-y-2.5">
                {/* Get Quote */}
                {(swapStatus === "idle" || swapStatus === "error" || isQuoteExpired) && (
                  <button
                    type="button"
                    onClick={handleGetQuote}
                    disabled={!canGetQuote}
                    className={BTN_PRIMARY}
                  >
                    {swapStatus === "quoting" ? "Fetching quote…" : isQuoteExpired ? "Refresh Quote" : "Get Quote"}
                  </button>
                )}

                {/* Quoting spinner */}
                {swapStatus === "quoting" && (
                  <button type="button" disabled className={BTN_PRIMARY}>
                    Fetching quote…
                  </button>
                )}

                {/* Swap (execute deposit) */}
                {swapStatus === "quote_ready" && !isQuoteExpired && (
                  <button
                    type="button"
                    onClick={executeDeposit}
                    disabled={!canExecute}
                    className={BTN_PRIMARY}
                  >
                    {isBusy ? "Confirm in wallet…" : `Swap ${fromToken?.symbol} → ${toToken?.symbol}`}
                  </button>
                )}

                {/* Refresh quote if expired */}
                {swapStatus === "quote_ready" && isQuoteExpired && (
                  <button
                    type="button"
                    onClick={handleGetQuote}
                    disabled={!canGetQuote}
                    className={BTN_PRIMARY}
                  >
                    <HiOutlineRefresh className="mr-2 inline h-4 w-4" />
                    Refresh Quote
                  </button>
                )}

                {/* Polling in progress */}
                {["pending_deposit", "known_deposit", "processing"].includes(swapStatus) && (
                  <div className="rounded-xl border border-blue-200 bg-blue-50 px-4 py-3 dark:border-blue-800/40 dark:bg-blue-900/20">
                    <p className="text-sm font-medium text-blue-700 dark:text-blue-300">
                      {statusLabel(swapStatus)}
                    </p>
                    <p className="mt-0.5 text-xs text-blue-600/80 dark:text-blue-300/70">
                      Cross-chain swaps may take up to 15 minutes. You can close this modal safely.
                    </p>
                    {quote?.quote?.depositAddress && (
                      <a
                        href={`${NEAR_INTENTS_EXPLORER}/?search=${quote.quote.depositAddress}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="mt-1 inline-flex items-center gap-1 text-xs font-semibold text-blue-700 underline dark:text-blue-300"
                      >
                        Track on NEAR Intents Explorer <HiOutlineExternalLink className="h-3 w-3" />
                      </a>
                    )}
                  </div>
                )}

                {/* Terminal state — New swap */}
                {isTerminal && (
                  <button type="button" onClick={reset} className={BTN_SECONDARY}>
                    New Swap
                  </button>
                )}

                {/* Reset / cancel quote */}
                {swapStatus === "quote_ready" && (
                  <button type="button" onClick={reset} className={BTN_SECONDARY}>
                    Cancel
                  </button>
                )}
              </div>

              {/* ── Footer note ───────────────────────────────────────────────── */}
              <p className="mt-4 text-center text-[10px] text-zinc-400 dark:text-zinc-600">
                Swap is executed by{" "}
                <a
                  href="https://docs.near-intents.org/integration/distribution-channels/1click-api/about-1click-api"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="underline"
                >
                  NEAR Intents 1Click API
                </a>
                . No testnet — use small amounts.
              </p>
            </>
          )}
    </div>
  );
}

