/**
 * Redis-backed sliding-window rate limiter for Next.js API routes.
 *
 * Uses the standard Redis INCR + EXPIRE pattern:
 *   1. INCR the key (creates it with value 1 if it doesn't exist yet)
 *   2. On first creation (result === 1) set the TTL to the window duration
 *   3. If the count exceeds the limit, reject the request
 *
 * Falls back to allowing the request if Redis is unavailable —
 * rate limiting is a best-effort defence layer, not a hard gate.
 * The fail-open path is logged as an error so a Redis outage that
 * silently disables rate limiting is visible in monitoring (OPE-19).
 *
 * Feature flag:
 *   RATE_LIMIT_ENABLED=false   — disable globally (e.g. local dev)
 *   RATE_LIMIT_ENABLED=true    — enable (default in production)
 *   Omitting the variable      — enabled by default
 *
 * Usage:
 *   const ip = getClientIp(req);
 *   const limited = await checkRateLimit(ip, "swap:quote", 15, 60);
 *   if (limited.exceeded) return NextResponse.json(..., { status: 429 });
 */

import "server-only";
import { getRedis } from "@/lib/redis";

/**
 * Maximum number of items accepted in any list/multi-value query parameter
 * (e.g. `addresses`, `slugs`). Enforced in every list endpoint to prevent
 * unbounded result sets that degrade performance and memory use.
 */
export const MAX_LIST_SIZE = 100;

/** True unless RATE_LIMIT_ENABLED is explicitly set to "false". */
const RATE_LIMITING_ENABLED =
  process.env.RATE_LIMIT_ENABLED?.toLowerCase() !== "false";

export type RateLimitResult = {
  /** True when the caller has sent too many requests. */
  exceeded:   boolean;
  /** How many requests remain in the current window. */
  remaining:  number;
  /** Seconds until the window resets (only set when exceeded). */
  retryAfter?: number;
};

/**
 * @param identifier  Client identifier — either the IP from getClientIp() or a
 *                    validated wallet/deposit address for per-wallet bucketing.
 * @param action      Route identifier used as part of the Redis key (e.g. "swap:quote").
 * @param limit       Maximum requests allowed per window.
 * @param windowSec   Window duration in seconds.
 */
export async function checkRateLimit(
  identifier: string,
  action: string,
  limit: number,
  windowSec: number,
): Promise<RateLimitResult> {
  // Bypass entirely when disabled via env
  if (!RATE_LIMITING_ENABLED) {
    return { exceeded: false, remaining: limit };
  }

  const key = `rl:${action}:${identifier}`;

  try {
    const redis  = getRedis();
    const count  = await redis.incr(key);

    // Set the TTL only on the very first increment so the window resets correctly
    if (count === 1) {
      await redis.expire(key, windowSec);
    }

    if (count > limit) {
      const ttl = await redis.ttl(key);
      return { exceeded: true, remaining: 0, retryAfter: ttl > 0 ? ttl : windowSec };
    }

    return { exceeded: false, remaining: limit - count };
  } catch (err) {
    // Redis unavailable — fail open so a Redis outage does not take down the API.
    // Logged as ERROR (not warn) so a Redis outage that disables rate limiting is
    // visible in monitoring dashboards and alerting rules (OPE-19).
    console.error("[rateLimiter] Redis unavailable — rate limiting bypassed for action:", action, err);
    return { exceeded: false, remaining: limit };
  }
}

/**
 * Extract the client's real IP address, preferring Cloudflare's trusted headers.
 *
 * Header priority (OPE-19 fix — CWE-290 / CWE-348):
 *   1. CF-Connecting-IP  — set by Cloudflare at the edge; Cloudflare strips any
 *                          client-sent version of this header before forwarding,
 *                          so it cannot be spoofed by an attacker.
 *   2. True-Client-IP    — Cloudflare Business/Enterprise alias for CF-Connecting-IP.
 *   3. X-Forwarded-For   — fallback for local dev / non-Cloudflare environments only.
 *                          This header IS client-spoofable when no trusted upstream
 *                          proxy strips and rewrites it — do NOT rely on it in production.
 *
 * The first comma-separated entry of XFF is used as a last resort to preserve
 * backwards-compatible behaviour in environments without Cloudflare.
 */
export function getClientIp(req: Request): string {
  const headers = req.headers as Headers;

  // Cloudflare edge-set headers — cannot be forged by the client
  const cf = headers.get("cf-connecting-ip") ?? headers.get("true-client-ip");
  if (cf?.trim()) return cf.trim();

  // Last resort: XFF (trustworthy only when an upstream proxy you control rewrites it)
  const xff = headers.get("x-forwarded-for");
  if (xff) return xff.split(",")[0].trim();

  return "unknown";
}
