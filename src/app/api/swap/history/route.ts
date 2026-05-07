/**
 * GET /api/swap/history?search=<walletAddress>&page=1&perPage=20
 *
 * Proxies the NEAR Intents Explorer API to fetch historical swap transactions
 * for a given wallet address (sender, recipient, or deposit address).
 * Requires ONECLICK_JWT_TOKEN to be set.
 */
import { NextRequest, NextResponse } from "next/server";
import { checkRateLimit, getClientIp } from "@/lib/rateLimiter";

const EXPLORER_API = "https://explorer.near-intents.org/api/v0";

// 30 history requests per IP per minute
const RATE_LIMIT = 30;
const WINDOW_SEC = 60;
// Guard against excessively large page sizes
const MAX_PER_PAGE = 100;

export async function GET(req: NextRequest) {
  const ip = getClientIp(req);
  const rl = await checkRateLimit(ip, "swap:history", RATE_LIMIT, WINDOW_SEC);
  if (rl.exceeded) {
    return NextResponse.json(
      { error: "Too many requests. Please wait before trying again." },
      { status: 429, headers: { "Retry-After": String(rl.retryAfter ?? WINDOW_SEC) } }
    );
  }

  const jwt = process.env.ONECLICK_JWT_TOKEN;
  if (!jwt) {
    return NextResponse.json(
      { error: "ONECLICK_JWT_TOKEN is not configured. Set it in .env.local to enable transaction history." },
      { status: 401 }
    );
  }

  try {
    const { searchParams } = req.nextUrl;
    const search = searchParams.get("search") ?? "";
    const pageRaw   = parseInt(searchParams.get("page")    ?? "1",  10);
    const perPageRaw = parseInt(searchParams.get("perPage") ?? "20", 10);
    // Clamp values to prevent abuse
    const page    = Math.max(1, isNaN(pageRaw)    ? 1  : pageRaw);
    const perPage = Math.min(MAX_PER_PAGE, Math.max(1, isNaN(perPageRaw) ? 20 : perPageRaw));

    const params = new URLSearchParams({ page, perPage });
    if (search) params.set("search", search);

    const url = `${EXPLORER_API}/transactions-pages?${params.toString()}`;
    const res = await fetch(url, {
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${jwt}`,
      },
      // Don't cache — always return fresh data
      cache: "no-store",
    });

    const data = await res.json();
    return NextResponse.json(data, { status: res.status });
  } catch (err) {
    console.error("[swap/history] unexpected error", err);
    return NextResponse.json({ error: "Failed to fetch swap history" }, { status: 500 });
  }
}
