/**
 * GET /api/swap/history?search=<walletAddress>&page=1&perPage=20
 *
 * Proxies the NEAR Intents Explorer API to fetch historical swap transactions
 * for a given wallet address (sender, recipient, or deposit address).
 * Requires ONECLICK_JWT_TOKEN to be set.
 */
import { NextRequest, NextResponse } from "next/server";

const EXPLORER_API = "https://explorer.near-intents.org/api/v0";

export async function GET(req: NextRequest) {
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
    const page = searchParams.get("page") ?? "1";
    const perPage = searchParams.get("perPage") ?? "20";

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
