/** A single transaction link returned in swapDetails */
export interface SwapTxDetails {
  hash: string;
  explorerUrl: string;
}

/**
 * swapDetails from GET /api/swap/status
 * Contains on-chain proof: source/destination tx hashes + settled amounts.
 */
export interface SwapDetails {
  intentHashes: string[];
  nearTxHashes: string[];
  originChainTxHashes: SwapTxDetails[];
  destinationChainTxHashes: SwapTxDetails[];
  amountIn?: string;
  amountInFormatted?: string;
  amountInUsd?: string;
  amountOut?: string;
  amountOutFormatted?: string;
  amountOutUsd?: string;
  slippage?: number;
  refundedAmount?: string;
  refundedAmountFormatted?: string;
  refundReason?: string;
  depositedAmount?: string;
  depositedAmountFormatted?: string;
}

/** Full response from GET /api/swap/status */
export interface SwapStatusResponse {
  correlationId: string;
  status: "KNOWN_DEPOSIT_TX" | "PENDING_DEPOSIT" | "INCOMPLETE_DEPOSIT" | "PROCESSING" | "SUCCESS" | "REFUNDED" | "FAILED";
  updatedAt: string;
  quoteResponse: SwapQuoteResponse;
  swapDetails: SwapDetails;
}

/** Persisted swap entry stored in localStorage */
export interface SavedSwap {
  depositAddress: string;
  savedAt: number;           // timestamp ms
  originSymbol: string;
  destinationSymbol: string;
  amountIn: string;          // human-readable
  recipient: string;
  lastStatus?: string;
  lastCheckedAt?: number;
  destinationTxUrl?: string;
}

/**
 * A single transaction returned by GET /api/swap/history
 * (proxies the NEAR Intents Explorer API)
 */
export interface ExplorerTransaction {
  originAsset: string;
  destinationAsset: string;
  depositAddress: string;
  depositMemo: string | null;
  recipient: string;
  status: "SUCCESS" | "FAILED" | "INCOMPLETE_DEPOSIT" | "PENDING_DEPOSIT" | "PROCESSING" | "REFUNDED";
  createdAt: string;           // ISO 8601
  createdAtTimestamp: number;  // Unix seconds
  amountInFormatted: string;
  amountOutFormatted: string;
  amountInUsd: string;
  amountOutUsd: string;
  senders: string[];
  originChainTxHashes: string[];
  destinationChainTxHashes: string[];
  nearTxHashes: string[];
  intentHashes: string | null;
  referral: string | null;
  refundReason: string | null;
  refundFeeFormatted: string | null;
}

/** Response envelope from GET /api/swap/history (transactions-pages) */
export interface ExplorerHistoryResponse {
  transactions: ExplorerTransaction[];
  totalCount: number;
  page: number;
  perPage: number;
}

/** Token returned by GET /api/swap/tokens (mirrors 1Click API) */
export interface SwapToken {
  assetId: string;          // e.g. "nep141:arb-0xaf88...omft.near"
  symbol: string;
  decimals: number;
  blockchain: string;       // e.g. "eth", "arb", "base", "near", "sol"
  price: number | null;
  priceUpdatedAt: string | null;
  contractAddress: string | null;
}

/**
 * The nested Quote object inside QuoteResponse.
 * Contains financial data and the deposit address.
 */
export interface SwapQuoteInner {
  depositAddress?: string;      // only present when dry=false
  depositMemo?: string | null;
  amountIn: string;             // raw units of originAsset
  amountInFormatted: string;
  amountInUsd: string;
  minAmountIn: string;
  amountOut: string;            // raw units of destinationAsset
  amountOutFormatted: string;
  amountOutUsd: string;
  minAmountOut: string;         // raw units (after slippage)
  deadline?: string;            // only present when dry=false
  timeWhenInactive?: string;
  timeEstimate: number;         // seconds
  refundFee?: string;
}

/** Original request echoed back in QuoteResponse */
export interface SwapQuoteRequest {
  originAsset: string;
  destinationAsset: string;
  amount: string;
  swapType: string;
  depositType: string;
  recipient: string;
  recipientType: string;
  refundTo: string;
  refundType: string;
  deadline: string;
  slippageTolerance: number;
  dry: boolean;
}

/** Full response from POST /api/swap/quote (mirrors 1Click API QuoteResponse) */
export interface SwapQuoteResponse {
  correlationId: string;
  timestamp: string;
  signature: string;
  quoteRequest: SwapQuoteRequest;   // echoed input — originAsset lives here
  quote: SwapQuoteInner;
  /** Present on 400 error from 1Click API */
  message?: string;
}
