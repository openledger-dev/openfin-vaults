/**
 * POST /api/swap/submit
 *
 * Proxies the NEAR Intents 1Click API deposit/submit endpoint.
 * Notifies the service of the deposit transaction hash to speed up processing.
 *
 * Body: { depositAddress: string; txHash: string }
 */
import { NextRequest, NextResponse } from "next/server";
import { validateSubmitBody } from "@/lib/swapValidation";
import { checkRateLimit, getClientIp } from "@/lib/rateLimiter";
import { fetchWithTimeout } from "@/lib/fetchWithTimeout";

const ONE_CLICK_BASE = "https://1click.chaindefuser.com";

// 10 submit calls per IP per minute (one per real swap)
const RATE_LIMIT = 10;
const WINDOW_SEC = 60;

export async function POST(req: NextRequest) {
  // ── Rate limit ───────────────────────────────────────────────────────────
  const ip = getClientIp(req);
  const rl = await checkRateLimit(ip, "swap:submit", RATE_LIMIT, WINDOW_SEC);
  if (rl.exceeded) {
    return NextResponse.json(
      { error: "Too many requests. Please wait before trying again." },
      { status: 429, headers: { "Retry-After": String(rl.retryAfter ?? WINDOW_SEC) } }
    );
  }

  try {
    const raw = await req.json().catch(() => null);

    // ── Validate + sanitize body ─────────────────────────────────────────
    const result = validateSubmitBody(raw);
    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: 400 });
    }

    const headers: Record<string, string> = {
      "Content-Type": "application/json",
    };
    const jwt = process.env.ONECLICK_JWT_TOKEN;
    if (jwt) headers["Authorization"] = `Bearer ${jwt}`;

    // Forward only the validated, sanitized body — never the raw input
    const res = await fetchWithTimeout(`${ONE_CLICK_BASE}/v0/deposit/submit`, {
      method: "POST",
      headers,
      body: JSON.stringify(result.value),
    });

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
