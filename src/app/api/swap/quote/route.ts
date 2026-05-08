/**
 * POST /api/swap/quote
 *
 * Proxies the NEAR Intents 1Click API quote endpoint.
 * Requests a cross-chain swap quote. Keeps the JWT token server-side.
 *
 * Body shape (mirrors QuoteRequest from the 1Click API):
 * {
 *   dry: boolean,
 *   swapType: "EXACT_INPUT" | "EXACT_OUTPUT",
 *   slippageTolerance: number,   // basis points (100 = 1%)
 *   originAsset: string,         // nep141:... assetId
 *   depositType: "ORIGIN_CHAIN" | "INTENTS",
 *   destinationAsset: string,    // nep141:... assetId
 *   amount: string,              // in smallest units
 *   recipient: string,
 *   recipientType: "DESTINATION_CHAIN" | "INTENTS",
 *   refundTo: string,
 *   refundType: "ORIGIN_CHAIN" | "INTENTS",
 *   deadline: string,            // ISO 8601
 * }
 */
import { NextRequest, NextResponse } from "next/server";
import { validateQuoteBody } from "@/lib/swapValidation";
import { checkRateLimit, getClientIp } from "@/lib/rateLimiter";

const ONE_CLICK_BASE = "https://1click.chaindefuser.com";

// 20 quote requests per IP per minute
const RATE_LIMIT = 20;
const WINDOW_SEC = 60;

export async function POST(req: NextRequest) {
  // ── Rate limit ───────────────────────────────────────────────────────────
  const ip = getClientIp(req);
  const rl = await checkRateLimit(ip, "swap:quote", RATE_LIMIT, WINDOW_SEC);
  if (rl.exceeded) {
    return NextResponse.json(
      { error: "Too many requests. Please wait before trying again." },
      { status: 429, headers: { "Retry-After": String(rl.retryAfter ?? WINDOW_SEC) } }
    );
  }

  try {
    const raw = await req.json().catch(() => null);

    // ── Validate + sanitize body ─────────────────────────────────────────
    const result = validateQuoteBody(raw);
    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: 400 });
    }

    const headers: Record<string, string> = {
      "Content-Type": "application/json",
    };
    const jwt = process.env.ONECLICK_JWT_TOKEN;
    if (jwt) headers["Authorization"] = `Bearer ${jwt}`;

    // Forward only the validated, sanitized body — never the raw input
    const res = await fetch(`${ONE_CLICK_BASE}/v0/quote`, {
      method: "POST",
      headers,
      body: JSON.stringify(result.value),
    });

    const data = await res.json();

    if (!res.ok) {
      console.error("[swap/quote] 1Click API error", {
        status: res.status,
        response: JSON.stringify(data),
      });
    }

    return NextResponse.json(data, { status: res.status });
  } catch (err) {
    console.error("[swap/quote] unexpected error", err);
    return NextResponse.json({ message: "Failed to fetch swap quote" }, { status: 500 });
  }
}
