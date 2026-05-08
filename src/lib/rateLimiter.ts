/**
 * Redis-backed sliding-window rate limiter for Next.js API routes.
 *
 * Uses the standard Redis INCR + EXPIRE pattern:
 *   1. INCR the key (creates it with value 1 if it doesn't exist yet)
 *   2. On first creation (result === 1) set the TTL to the window duration
 *   3. If the count exceeds the limit, reject the request
 *
 * Falls back to allowing the request if Redis is unavailable —
 * rate limiting is a best-effort defense layer, not a hard gate.
 *
 * Feature flag:
 *   RATE_LIMIT_ENABLED=false   — disable globally (e.g. local dev)
 *   RATE_LIMIT_ENABLED=true    — enable (default in production)
 *   Omitting the variable      — enabled by default
 *
 * Usage:
 *   const ip = req.headers.get("x-forwarded-for") ?? "unknown";
 *   const limited = await checkRateLimit(ip, "swap:quote", 15, 60);
 *   if (limited.exceeded) return NextResponse.json(..., { status: 429 });
 */

import "server-only";
import { getRedis } from "@/lib/redis";

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
 * @param ip         Client identifier (IP or wallet address).
 * @param action     Route identifier used as part of the Redis key (e.g. "swap:quote").
 * @param limit      Maximum requests allowed per window.
 * @param windowSec  Window duration in seconds.
 */
export async function checkRateLimit(
  ip: string,
  action: string,
  limit: number,
  windowSec: number,
): Promise<RateLimitResult> {
  // Bypass entirely when disabled via env
  if (!RATE_LIMITING_ENABLED) {
    return { exceeded: false, remaining: limit };
  }

  const key = `rl:${action}:${ip}`;

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
    // Redis unavailable — allow the request (fail open)
    console.warn("[rateLimiter] Redis error, bypassing rate limit:", err);
    return { exceeded: false, remaining: limit };
  }
}

/**
 * Extract the best-effort client IP from a Next.js request.
 * Handles Vercel's x-forwarded-for header (comma-separated list).
 */
export function getClientIp(req: Request): string {
  const forwarded = (req.headers as Headers).get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0].trim();
  return "unknown";
}
