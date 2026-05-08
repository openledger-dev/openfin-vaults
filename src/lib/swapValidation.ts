/**
 * Server-side validation for swap API route bodies.
 *
 * Validates and strips each request to only the fields the 1Click API
 * actually needs. Any extra fields supplied by a caller are discarded,
 * preventing parameter injection attacks.
 */

// ── Helpers ───────────────────────────────────────────────────────────────

export function isEVMAddress(v: unknown): v is string {
  return typeof v === "string" && /^0x[0-9a-fA-F]{40}$/.test(v);
}

export function isTxHash(v: unknown): v is string {
  return typeof v === "string" && /^0x[0-9a-fA-F]{64}$/.test(v);
}

/** Positive integer encoded as a decimal string (token amounts). */
function isPosIntString(v: unknown): v is string {
  return typeof v === "string" && /^\d+$/.test(v) && v !== "0";
}

const SWAP_TYPES    = ["EXACT_INPUT", "EXACT_OUTPUT"] as const;
const DEPOSIT_TYPES = ["ORIGIN_CHAIN", "INTENTS"] as const;
const REFUND_TYPES  = ["ORIGIN_CHAIN", "INTENTS"] as const;
const RECIPIENT_TYPES = ["DESTINATION_CHAIN", "INTENTS"] as const;

/** Max slippage we accept: 20 % (2000 basis points). */
const MAX_SLIPPAGE_BPS = 2_000;

// ── Quote body ────────────────────────────────────────────────────────────

export type ValidatedQuoteBody = {
  dry:              boolean;
  swapType:         "EXACT_INPUT" | "EXACT_OUTPUT";
  slippageTolerance: number;
  originAsset:      string;
  depositType:      "ORIGIN_CHAIN" | "INTENTS";
  destinationAsset: string;
  amount:           string;
  recipient:        string;
  recipientType:    "DESTINATION_CHAIN" | "INTENTS";
  refundTo:         string;
  refundType:       "ORIGIN_CHAIN" | "INTENTS";
  deadline:         string;
};

export type ValidationResult<T> =
  | { ok: true;  value: T }
  | { ok: false; error: string };

export function validateQuoteBody(raw: unknown): ValidationResult<ValidatedQuoteBody> {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return { ok: false, error: "Request body must be a JSON object" };
  }
  const b = raw as Record<string, unknown>;

  if (!SWAP_TYPES.includes(b.swapType as never))
    return { ok: false, error: `swapType must be one of: ${SWAP_TYPES.join(", ")}` };

  if (typeof b.slippageTolerance !== "number" ||
      b.slippageTolerance < 0 || b.slippageTolerance > MAX_SLIPPAGE_BPS)
    return { ok: false, error: `slippageTolerance must be a number between 0 and ${MAX_SLIPPAGE_BPS}` };

  if (!DEPOSIT_TYPES.includes(b.depositType as never))
    return { ok: false, error: `depositType must be one of: ${DEPOSIT_TYPES.join(", ")}` };

  if (!RECIPIENT_TYPES.includes(b.recipientType as never))
    return { ok: false, error: `recipientType must be one of: ${RECIPIENT_TYPES.join(", ")}` };

  if (!REFUND_TYPES.includes(b.refundType as never))
    return { ok: false, error: `refundType must be one of: ${REFUND_TYPES.join(", ")}` };

  if (!isPosIntString(b.amount))
    return { ok: false, error: "amount must be a positive integer string" };

  if (typeof b.originAsset !== "string" || !b.originAsset.trim())
    return { ok: false, error: "originAsset is required" };

  if (typeof b.destinationAsset !== "string" || !b.destinationAsset.trim())
    return { ok: false, error: "destinationAsset is required" };

  if (typeof b.recipient !== "string" || !b.recipient.trim())
    return { ok: false, error: "recipient is required" };

  if (typeof b.refundTo !== "string" || !b.refundTo.trim())
    return { ok: false, error: "refundTo is required" };

  if (typeof b.deadline !== "string" || isNaN(Date.parse(b.deadline)))
    return { ok: false, error: "deadline must be a valid ISO 8601 date string" };

  // Build a clean object — strip any extra fields the caller sent
  return {
    ok: true,
    value: {
      dry:               b.dry === true,
      swapType:          b.swapType          as ValidatedQuoteBody["swapType"],
      slippageTolerance: b.slippageTolerance as number,
      originAsset:       b.originAsset.trim(),
      depositType:       b.depositType       as ValidatedQuoteBody["depositType"],
      destinationAsset:  b.destinationAsset.trim(),
      amount:            b.amount,
      recipient:         b.recipient.trim(),
      recipientType:     b.recipientType     as ValidatedQuoteBody["recipientType"],
      refundTo:          b.refundTo.trim(),
      refundType:        b.refundType        as ValidatedQuoteBody["refundType"],
      deadline:          b.deadline,
    },
  };
}

// ── Submit body ───────────────────────────────────────────────────────────

export type ValidatedSubmitBody = {
  depositAddress: string;
  txHash:         string;
};

export function validateSubmitBody(raw: unknown): ValidationResult<ValidatedSubmitBody> {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return { ok: false, error: "Request body must be a JSON object" };
  }
  const b = raw as Record<string, unknown>;

  if (!isEVMAddress(b.depositAddress))
    return { ok: false, error: "depositAddress must be a valid EVM address (0x + 40 hex chars)" };

  if (!isTxHash(b.txHash))
    return { ok: false, error: "txHash must be a valid transaction hash (0x + 64 hex chars)" };

  return {
    ok: true,
    value: {
      depositAddress: (b.depositAddress as string).toLowerCase() as `0x${string}`,
      txHash:         b.txHash as string,
    },
  };
}
