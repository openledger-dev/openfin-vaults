/**
 * GET /api/swap/status?depositAddress=<address>
 *
 * Proxies the NEAR Intents 1Click API execution status endpoint.
 * Status values: PENDING_DEPOSIT | KNOWN_DEPOSIT_TX | PROCESSING |
 *                SUCCESS | INCOMPLETE_DEPOSIT | REFUNDED | FAILED
 */
import { NextRequest, NextResponse } from "next/server";

const ONE_CLICK_BASE = "https://1click.chaindefuser.com";

export async function GET(req: NextRequest) {
  try {
    const depositAddress = req.nextUrl.searchParams.get("depositAddress");
    if (!depositAddress) {
      return NextResponse.json({ error: "depositAddress is required" }, { status: 400 });
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
