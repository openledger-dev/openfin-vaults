/**
 * GET /api/swap/status?depositAddress=<address>
 *
 * Proxies the NEAR Intents 1Click API execution status endpoint.
 * Status values: PENDING_DEPOSIT | KNOWN_DEPOSIT_TX | PROCESSING |
 *                SUCCESS | INCOMPLETE_DEPOSIT | REFUNDED | FAILED
 */
import { NextRequest, NextResponse } from "next/server";
import { checkRateLimit, getClientIp } from "@/lib/rateLimiter";
import { isEVMAddress } from "@/lib/swapValidation";

const ONE_CLICK_BASE = "https://1click.chaindefuser.com";

// 60 status polls per IP per minute (polling every ~1 s is reasonable)
const RATE_LIMIT = 60;
const WINDOW_SEC = 60;

export async function GET(req: NextRequest) {
  const ip = getClientIp(req);
  const rl = await checkRateLimit(ip, "swap:status", RATE_LIMIT, WINDOW_SEC);
  if (rl.exceeded) {
    return NextResponse.json(
      { error: "Too many requests. Please wait before trying again." },
      { status: 429, headers: { "Retry-After": String(rl.retryAfter ?? WINDOW_SEC) } }
    );
  }

  try {
    const depositAddress = req.nextUrl.searchParams.get("depositAddress");
    if (!depositAddress || !isEVMAddress(depositAddress)) {
      return NextResponse.json({ error: "depositAddress must be a valid EVM address" }, { status: 400 });
    }

    const headers: Record<string, string> = {
      "Content-Type": "application/json",
    };
    const jwt = process.env.ONECLICK_JWT_TOKEN;
    if (jwt) headers["Authorization"] = `Bearer ${jwt}`;

    const url = `${ONE_CLICK_BASE}/v0/status?depositAddress=${encodeURIComponent(depositAddress)}`;
    const res = await fetch(url, { headers });
    const data = await res.json();
    return NextResponse.json(data, { status: res.status });
  } catch (err) {
    console.error("[swap/status] unexpected error", err);
    return NextResponse.json({ error: "Failed to fetch swap status" }, { status: 500 });
  }
}
