/**
 * GET /api/swap/tokens
 *
 * Proxies the NEAR Intents 1Click API tokens endpoint.
 * Returns all tokens supported for cross-chain swaps.
 * Cached for 5 minutes since the token list rarely changes.
 */
import { NextRequest, NextResponse } from "next/server";
import { checkRateLimit, getClientIp } from "@/lib/rateLimiter";

const ONE_CLICK_BASE = "https://1click.chaindefuser.com";

export const revalidate = 300; // 5-minute ISR cache

// Token list rarely changes; 10 calls per IP per minute is generous
const RATE_LIMIT = 10;
const WINDOW_SEC = 60;

export async function GET(req: NextRequest) {
  const ip = getClientIp(req);
  const rl = await checkRateLimit(ip, "swap:tokens", RATE_LIMIT, WINDOW_SEC);
  if (rl.exceeded) {
    return NextResponse.json(
      { error: "Too many requests. Please wait before trying again." },
      { status: 429, headers: { "Retry-After": String(rl.retryAfter ?? WINDOW_SEC) } }
    );
  }
  try {
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
    };
    const jwt = process.env.ONECLICK_JWT_TOKEN;
    if (jwt) headers["Authorization"] = `Bearer ${jwt}`;

    const res = await fetch(`${ONE_CLICK_BASE}/v0/tokens`, { headers });
    if (!res.ok) {
      const text = await res.text();
      return NextResponse.json({ error: text }, { status: res.status });
    }
    const data = await res.json();
    return NextResponse.json(data);
  } catch (err) {
    console.error("[swap/tokens] unexpected error", err);
    return NextResponse.json({ error: "Failed to fetch swap tokens" }, { status: 500 });
  }
}
