/**
 * POST /api/swap/submit
 *
 * Proxies the NEAR Intents 1Click API deposit/submit endpoint.
 * Notifies the service of the deposit transaction hash to speed up processing.
 *
 * Body: { depositAddress: string; txHash: string }
 */
import { NextRequest, NextResponse } from "next/server";

const ONE_CLICK_BASE = "https://1click.chaindefuser.com";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();

    const headers: Record<string, string> = {
      "Content-Type": "application/json",
    };
    const jwt = process.env.ONECLICK_JWT_TOKEN;
    if (jwt) headers["Authorization"] = `Bearer ${jwt}`;

    const res = await fetch(`${ONE_CLICK_BASE}/v0/deposit/submit`, {
      method: "POST",
      headers,
      body: JSON.stringify(body),
    });

    // 200 or 204 — just forward status
    if (res.status === 204 || res.headers.get("content-length") === "0") {
      return new NextResponse(null, { status: res.status });
    }
    const data = await res.json().catch(() => null);
    return NextResponse.json(data, { status: res.status });
  } catch (err) {
    console.error("[swap/submit] unexpected error", err);
    return NextResponse.json({ error: "Failed to submit swap deposit" }, { status: 500 });
  }
}
