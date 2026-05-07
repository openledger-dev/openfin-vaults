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

const ONE_CLICK_BASE = "https://1click.chaindefuser.com";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();

    const headers: Record<string, string> = {
      "Content-Type": "application/json",
    };
    const jwt = process.env.ONECLICK_JWT_TOKEN;
    if (jwt) headers["Authorization"] = `Bearer ${jwt}`;

    const res = await fetch(`${ONE_CLICK_BASE}/v0/quote`, {
      method: "POST",
      headers,
      body: JSON.stringify(body),
    });

    const data = await res.json();

    if (!res.ok) {
      // Log upstream error details for debugging
      console.error("[swap/quote] 1Click API error", {
        status: res.status,
        body: JSON.stringify(body),
        response: JSON.stringify(data),
      });
    }

    return NextResponse.json(data, { status: res.status });
  } catch (err) {
    console.error("[swap/quote] unexpected error", err);
    return NextResponse.json({ message: "Failed to fetch swap quote" }, { status: 500 });
  }
}
