/**
 * GET /api/swap/tokens
 *
 * Proxies the NEAR Intents 1Click API tokens endpoint.
 * Returns all tokens supported for cross-chain swaps.
 * Cached for 5 minutes since the token list rarely changes.
 */
import { NextResponse } from "next/server";

const ONE_CLICK_BASE = "https://1click.chaindefuser.com";

export const revalidate = 300; // 5-minute ISR cache

export async function GET() {
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
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
