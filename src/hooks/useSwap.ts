"use client";

/**
 * useSwap — NEAR Intents cross-chain swap via 1Click API
 *
 * Flow:
 *  1. requestQuote()  → fetches a deposit address + expected output
 *  2. executeDeposit() → sends tokens to the deposit address on-chain
 *  3. Polls /api/swap/status until terminal state
 *
 * EVM token classification from 1Click assetId:
 *   nep141:eth.omft.near              → native ETH on Ethereum
 *   nep141:arb-0xCONTRACT.omft.near   → ERC-20 on Arbitrum
 *   nep141:usdt.tether-token.near      → NEAR-native (not EVM, skip deposit)
 */
import { useState, useCallback, useRef } from "react";
import { parseUnits, type Address } from "viem";
import {
  useAccount,
  useSendTransaction,
  useWriteContract,
  useWaitForTransactionReceipt,
  useSwitchChain,
} from "wagmi";
import type { SwapToken, SwapQuoteResponse, SwapDetails, SwapStatusResponse } from "@/types/swap";
import { saveSwap, updateSwap } from "@/lib/swapHistory";

// ── Chain mapping: 1Click blockchain label → EVM chainId ─────────────────────
export const EVM_CHAINS: Record<string, number> = {
  eth:     1,
  arb:     42161,
  base:    8453,
  op:      10,
  polygon: 137,
  bnb:     56,
  avax:    43114,
  zksync:  324,
  linea:   59144,
  scroll:  534352,
  mantle:  5000,
  gnosis:  100,
  aurora:  1313161554,
};

export type SwapStatus =
  | "idle"
  | "quoting"
  | "quote_ready"
  | "awaiting_wallet"
  | "pending_deposit"
  | "known_deposit"
  | "processing"
  | "success"
  | "refunded"
  | "failed"
  | "error";

const TERMINAL_STATUSES: SwapStatus[] = ["success", "refunded", "failed", "error"];

// ── Minimal ERC-20 transfer ABI ───────────────────────────────────────────────
const ERC20_TRANSFER_ABI = [
  {
    name: "transfer",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [
      { name: "to", type: "address" },
      { name: "amount", type: "uint256" },
    ],
    outputs: [{ type: "bool" }],
  },
] as const;

/** Parse an EVM asset's contract address from a 1Click assetId. */
export function parseEvmAsset(assetId: string): {
  contractAddress: Address | null;
  isNative: boolean;
  evmChainId: number | null;
} {
  // e.g. "nep141:arb-0xaf88d065e77c8cc2239327c5edb3a432268e5831.omft.near"
  const erc20Match = assetId.match(/^nep141:([a-z]+)-0x([0-9a-fA-F]+)\.omft\.near$/);
  if (erc20Match) {
    const chainLabel = erc20Match[1];
    const contractHex = erc20Match[2];
    return {
      contractAddress: `0x${contractHex}` as Address,
      isNative: false,
      evmChainId: EVM_CHAINS[chainLabel] ?? null,
    };
  }

  // e.g. "nep141:eth.omft.near", "nep141:bnb.omft.near"
  const nativeMatch = assetId.match(/^nep141:([a-z]+)\.omft\.near$/);
  if (nativeMatch) {
    const chainLabel = nativeMatch[1];
    return {
      contractAddress: null,
      isNative: true,
      evmChainId: EVM_CHAINS[chainLabel] ?? null,
    };
  }

  return { contractAddress: null, isNative: false, evmChainId: null };
}

export function useSwap() {
  const { address: userAddress, chainId: walletChainId } = useAccount();
  const { switchChainAsync } = useSwitchChain();

  // wagmi write hooks
  const {
    sendTransactionAsync,
    data: nativeTxHash,
    isPending: isNativePending,
    error: nativeError,
    reset: resetNative,
  } = useSendTransaction();

  const {
    writeContractAsync,
    data: erc20TxHash,
    isPending: isErc20Pending,
    error: erc20Error,
    reset: resetErc20,
  } = useWriteContract();

  const txHash = nativeTxHash ?? erc20TxHash;

  const { isLoading: isTxConfirming, isSuccess: isTxConfirmed } =
    useWaitForTransactionReceipt({ hash: txHash });

  // ── Local state ──────────────────────────────────────────────────────────────
  const [swapStatus, setSwapStatus] = useState<SwapStatus>("idle");
  const [quote, setQuote] = useState<SwapQuoteResponse | null>(null);
  const [swapDetails, setSwapDetails] = useState<SwapDetails | null>(null);
  const [quoteError, setQuoteError] = useState<string | null>(null);
  const [statusMessage, setStatusMessage] = useState<string>("");
  const pollRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Stores the exact raw amount the user entered (in token base units).
  // Compared against quote.quote.amountIn before dispatching the tx to detect
  // any server-side manipulation of the quoted amount.
  const expectedAmountRef = useRef<string>("");

  // ── Stop polling ──────────────────────────────────────────────────────────────
  const stopPolling = useCallback(() => {
    if (pollRef.current) {
      clearTimeout(pollRef.current);
      pollRef.current = null;
    }
  }, []);

  // ── Poll swap status ─────────────────────────────────────────────────────────
  // Using a ref to hold the latest poll function avoids stale-closure issues.
  const pollRef2 = useRef<((depositAddress: string, attempt?: number) => void) | undefined>(undefined);

  const pollStatus = useCallback(
    (depositAddress: string, attempt = 0) => {
      const delay = Math.min(5000 * Math.pow(1.4, attempt), 30_000); // exponential back-off, max 30s
      pollRef.current = setTimeout(async () => {
        try {
          const res = await fetch(
            `/api/swap/status?depositAddress=${encodeURIComponent(depositAddress)}`
          );
          const data: SwapStatusResponse = await res.json();
          const apiStatus: string = data?.status ?? "";

          const map: Record<string, SwapStatus> = {
            PENDING_DEPOSIT:    "pending_deposit",
            KNOWN_DEPOSIT_TX:   "known_deposit",
            PROCESSING:         "processing",
            SUCCESS:            "success",
            INCOMPLETE_DEPOSIT: "failed",
            REFUNDED:           "refunded",
            FAILED:             "failed",
          };
          const next = map[apiStatus];

          // Capture swap details whenever they arrive
          if (data?.swapDetails) {
            setSwapDetails(data.swapDetails);
          }

          if (next) {
            setSwapStatus(next);
            setStatusMessage(apiStatus);

            // Persist to localStorage for post-close tracking
            const destTxUrl = data?.swapDetails?.destinationChainTxHashes?.[0]?.explorerUrl;
            updateSwap(depositAddress, {
              lastStatus: apiStatus,
              lastCheckedAt: Date.now(),
              ...(destTxUrl ? { destinationTxUrl: destTxUrl } : {}),
            });

            if (!TERMINAL_STATUSES.includes(next)) {
              pollRef2.current?.(depositAddress, attempt + 1);
            }
          } else {
            // Unknown status — keep polling
            pollRef2.current?.(depositAddress, attempt + 1);
          }
        } catch {
          if (attempt < 10) pollRef2.current?.(depositAddress, attempt + 1);
          else setSwapStatus("error");
        }
      }, delay);
    },
    [] // no external deps — uses only setters and refs
  );

  // Keep ref in sync with the stable callback
  pollRef2.current = pollStatus;

  // ── Request quote ─────────────────────────────────────────────────────────────
  const requestQuote = useCallback(
    async (params: {
      originAsset: SwapToken;
      destinationAsset: SwapToken;
      amount: string;             // human-readable, e.g. "1.5"
      recipient: string;
      refundTo?: string;
      slippageBps?: number;
    }) => {
      setSwapStatus("quoting");
      setQuoteError(null);
      setQuote(null);
      stopPolling();

      try {
        const { originAsset, destinationAsset, amount, recipient, refundTo, slippageBps } = params;
        const amountRaw = parseUnits(amount, originAsset.decimals).toString();
        // Record the amount the user entered so we can verify the quote response
        expectedAmountRef.current = amountRaw;
        // Give 10 min deadline — enough for slow networks to mine the deposit tx
        const deadline = new Date(Date.now() + 10 * 60 * 1000).toISOString();

        // refundType is always ORIGIN_CHAIN since refundTo is the EVM sender address
        const resolvedRefundTo = refundTo ?? userAddress ?? recipient;

        const body = {
          dry: false,
          swapType: "EXACT_INPUT",
          slippageTolerance: slippageBps ?? 100,
          originAsset: originAsset.assetId,
          depositType: "ORIGIN_CHAIN",
          destinationAsset: destinationAsset.assetId,
          amount: amountRaw,
          recipient,
          recipientType: "DESTINATION_CHAIN",
          refundTo: resolvedRefundTo,
          refundType: "ORIGIN_CHAIN",
          deadline,
          quoteWaitingTimeMs: 3000, // give market makers 3s to respond; 0 returns immediately with no quote
        };

        const res = await fetch("/api/swap/quote", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
        const data: SwapQuoteResponse = await res.json();

        // 1Click API returns { message: "..." } on 400 errors
        if (!res.ok) {
          throw new Error(data.message ?? `Quote request failed (HTTP ${res.status})`);
        }
        setQuote(data);
        setSwapStatus("quote_ready");
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        setQuoteError(msg);
        // "no quote" is a retriable condition — keep status as idle so the
        // Get Quote button stays visible without requiring a manual reset
        setSwapStatus(msg.includes("Failed to get quote") ? "idle" : "error");
      }
    },
    [userAddress, stopPolling]
  );

  // ── Execute deposit ───────────────────────────────────────────────────────────
  const executeDeposit = useCallback(async () => {
    if (!quote?.quote?.depositAddress) return;
    if (!userAddress) return;

    const depositAddress = quote.quote.depositAddress as Address;
    // originAsset lives in quoteRequest (the echoed input), not in the nested quote object
    const originAssetId = quote.quoteRequest.originAsset;
    const amountIn = quote.quote.amountIn;
    const { contractAddress, isNative, evmChainId } = parseEvmAsset(originAssetId);

    // ── Amount integrity check ──────────────────────────────────────────────
    // Verify the amount the API says to send matches what the user originally
    // entered. A mismatch could indicate a tampered quote response.
    const expected = expectedAmountRef.current;
    if (expected && BigInt(amountIn) !== BigInt(expected)) {
      setQuoteError(
        `Quote amount mismatch: expected ${expected} but server returned ${amountIn}. Please request a new quote.`
      );
      setSwapStatus("error");
      return;
    }

    setSwapStatus("awaiting_wallet");
    setQuoteError(null);

    try {
      // Switch chain if needed
      if (evmChainId && walletChainId !== evmChainId) {
        await switchChainAsync({ chainId: evmChainId });
      }

      let sentTxHash: `0x${string}`;

      if (isNative) {
        sentTxHash = await sendTransactionAsync({
          to: depositAddress,
          value: BigInt(amountIn),
          chainId: evmChainId ?? undefined,
        });
      } else if (contractAddress) {
        sentTxHash = await writeContractAsync({
          address: contractAddress,
          abi: ERC20_TRANSFER_ABI,
          functionName: "transfer",
          args: [depositAddress, BigInt(amountIn)],
          chainId: evmChainId ?? undefined,
        });
      } else {
        throw new Error("Origin asset is not an EVM token. Please send tokens manually.");
      }

      // Optionally notify 1Click for faster processing
      fetch("/api/swap/submit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ depositAddress, txHash: sentTxHash }),
      }).catch(() => undefined);

      // Persist to localStorage so the swap can be tracked after modal close
      if (quote) {
        saveSwap({
          depositAddress,
          savedAt: Date.now(),
          originSymbol: quote.quoteRequest.originAsset.split(":")[1]?.split(".")[0]?.toUpperCase() ?? "?",
          destinationSymbol: quote.quoteRequest.destinationAsset.split(":")[1]?.split(".")[0]?.toUpperCase() ?? "?",
          amountIn: quote.quote.amountInFormatted,
          recipient: quote.quoteRequest.recipient,
          lastStatus: "PENDING_DEPOSIT",
          lastCheckedAt: Date.now(),
        });
      }

      setSwapStatus("pending_deposit");
      pollStatus(depositAddress);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setQuoteError(msg);
      setSwapStatus("error");
    }
  }, [quote, userAddress, walletChainId, switchChainAsync, sendTransactionAsync, writeContractAsync, pollStatus]);

  // ── Reset ─────────────────────────────────────────────────────────────────────
  const reset = useCallback(() => {
    stopPolling();
    setSwapStatus("idle");
    setQuote(null);
    setSwapDetails(null);
    setQuoteError(null);
    setStatusMessage("");
    expectedAmountRef.current = "";
    resetNative();
    resetErc20();
  }, [stopPolling, resetNative, resetErc20]);

  const isBusy =
    swapStatus === "quoting" ||
    swapStatus === "awaiting_wallet" ||
    isNativePending ||
    isErc20Pending ||
    isTxConfirming;

  return {
    swapStatus,
    quote,
    swapDetails,
    quoteError: quoteError ?? (nativeError?.message ?? erc20Error?.message ?? null),
    statusMessage,
    txHash,
    isTxConfirmed,
    isBusy,
    requestQuote,
    executeDeposit,
    reset,
  };
}
