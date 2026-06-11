/**
 * GET /api/swap/history?address=<walletAddress>&page=1&perPage=20
 *
 * Proxies the NEAR Intents Explorer API to fetch historical swap transactions
 * for a given wallet address (sender, recipient, or deposit address).
 * Requires ONECLICK_JWT_TOKEN to be set.
 *
 * Security:
 *  - `address` must be a valid EVM address (0x + 40 hex chars).
 *  - The X-Wallet-Address request header must match the `address` query param.
 *    This prevents one browser session from querying another user's history,
 *    while keeping the check lightweight (no signature verification needed
 *    for public blockchain data, but it raises the bar significantly).
 *  - Rate-limited to 30 req / IP / min (IP from CF-Connecting-IP).
 *  - Secondary rate limit keyed by wallet address (30 req / wallet / min).
 *    An attacker rotating source IPs while using the same wallet is still throttled.
 */
import { NextRequest, NextResponse } from "next/server";
import { checkRateLimit, getClientIp } from "@/lib/rateLimiter";
import { isEVMAddress } from "@/lib/swapValidation";

const EXPLORER_API = "https://explorer.near-intents.org/api/v0";

const RATE_LIMIT  = 30;
const WINDOW_SEC  = 60;
const MAX_PER_PAGE = 100;

export async function GET(req: NextRequest) {
  // ── Rate limit ───────────────────────────────────────────────────────────
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
      { error: "ONECLICK_JWT_TOKEN is not configured." },
      { status: 401 }
    );
  }

  // ── Validate address param ───────────────────────────────────────────────
  const address = req.nextUrl.searchParams.get("address") ?? "";
  if (!isEVMAddress(address)) {
    return NextResponse.json(
      { error: "address must be a valid EVM address (0x + 40 hex chars)" },
      { status: 400 }
    );
  }

  // ── Secondary rate limit: per wallet address (OPE-19) ───────────────────
  // Keying by wallet ensures that an attacker rotating source IPs while
  // using the same wallet address is still constrained to RATE_LIMIT/min.
  const walletRl = await checkRateLimit(address.toLowerCase(), "swap:history:wallet", RATE_LIMIT, WINDOW_SEC);
  if (walletRl.exceeded) {
    return NextResponse.json(
      { error: "Too many requests. Please wait before trying again." },
      { status: 429, headers: { "Retry-After": String(walletRl.retryAfter ?? WINDOW_SEC) } }
    );
  }

  // ── Verify the caller is requesting their own history ────────────────────
  // The client sends X-Wallet-Address with the connected wallet address.
  // We compare it (case-insensitively) to the `address` query param so that
  // a request forged by a third party — or a script without a wallet —
  // cannot fetch another user's swap history.
  const headerAddress = req.headers.get("x-wallet-address") ?? "";
  if (headerAddress.toLowerCase() !== address.toLowerCase()) {
    return NextResponse.json(
      { error: "Forbidden: address mismatch" },
      { status: 403 }
    );
  }

  try {
    const { searchParams } = req.nextUrl;
    const pageRaw    = parseInt(searchParams.get("page")    ?? "1",  10);
    const perPageRaw = parseInt(searchParams.get("perPage") ?? "20", 10);
    const page    = Math.max(1, isNaN(pageRaw)    ? 1  : pageRaw);
    const perPage = Math.min(MAX_PER_PAGE, Math.max(1, isNaN(perPageRaw) ? 20 : perPageRaw));

    const u = new URL(`${EXPLORER_API}/transactions-pages`);
    u.searchParams.set("page",    String(page));
    u.searchParams.set("perPage", String(perPage));
    u.searchParams.set("search",  address);
    const url = u.toString();
    const res = await fetch(url, {
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${jwt}`,
      },
      cache: "no-store",
    });

    const data = await res.json();
    return NextResponse.json(data, { status: res.status });
  } catch (err) {
    console.error("[swap/history] unexpected error", err);
    return NextResponse.json({ error: "Failed to fetch swap history" }, { status: 500 });
  }
}
