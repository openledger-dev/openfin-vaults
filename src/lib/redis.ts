// Prevent this module from ever being imported in browser / Edge bundles.
// Any accidental client-side import will throw a build-time error.
import "server-only";

/**
 * Redis client singleton (ioredis).
 *
 * Uses a module-level global in development to reuse the connection across
 * hot reloads. In production (serverless), a new client is created per
 * module load (one connection per instance).
 *
 * Configure via .env.local (server-only — no NEXT_PUBLIC_ prefix needed):
 *   REDIS_URL=redis://localhost:6379             (local)
 *   REDIS_URL=rediss://:<password>@host:6380     (Upstash / Redis Cloud TLS)
 *
 * All TTLs are overridable via env vars (values in seconds):
 *   REDIS_TTL_META     default 3600   — vault name, decimals, fees, oracle
 *   REDIS_TTL_STATE    default 30     — TVL, totalSupply, paused flag
 *   REDIS_TTL_APY      default 300    — off-chain APY (Morpho / Midas APIs)
 *   REDIS_TTL_APY_7D   default 86400  — UltraYield 7D APY (eth_getLogs scan)
 *   REDIS_TTL_PRICE    default 600    — Midas token prices
 *   REDIS_TTL_PENDING  default 60     — user-specific pending redemptions
 */

import Redis from "ioredis";

// ── TTL helpers ───────────────────────────────────────────────────────────────

function envTtl(key: string, fallback: number): number {
  const raw = process.env[key];
  if (!raw) return fallback;
  const n = parseInt(raw, 10);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

// ── TTL values (read once at module load) ─────────────────────────────────────

export const TTL = {
  META:    envTtl("REDIS_TTL_META",    3_600),   // default 1 hour
  STATE:   envTtl("REDIS_TTL_STATE",   30),       // default 30 sec
  APY:     envTtl("REDIS_TTL_APY",     300),      // default 5 min
  APY_7D:  envTtl("REDIS_TTL_APY_7D",  86_400),   // default 24 hours
  PRICE:   envTtl("REDIS_TTL_PRICE",   600),      // default 10 min
  PENDING: envTtl("REDIS_TTL_PENDING", 60),       // default 1 min
};

// ── Key namespace ─────────────────────────────────────────────────────────────

const KEY_PREFIX = process.env.REDIS_KEY_PREFIX
  ? `${process.env.REDIS_KEY_PREFIX}:`
  : "";

/**
 * Prepend the REDIS_KEY_PREFIX namespace (if set) to a cache key.
 * Use this for every Redis key to isolate environments that share one instance.
 *
 * @example
 *   REDIS_KEY_PREFIX=openvault  →  redisKey("midas:apys") === "openvault:midas:apys"
 *   REDIS_KEY_PREFIX unset      →  redisKey("midas:apys") === "midas:apys"
 */
export function redisKey(key: string): string {
  return `${KEY_PREFIX}${key}`;
}

// ── Singleton connection ──────────────────────────────────────────────────────

declare global {
  // Prevent duplicate connections during Next.js dev hot-reloads
  // eslint-disable-next-line no-var
  var __redis: Redis | undefined;
}

function createRedisClient(): Redis {
  const url = process.env.REDIS_URL;
  const client = url ? new Redis(url) : new Redis(); // default: localhost:6379
  client.on("error", (err: Error) => console.error("[Redis]", err.message));
  return client;
}

/**
 * Returns a shared Redis client.
 *   - Development: reuses one connection across hot reloads (global singleton).
 *   - Production:  creates a new client per module load (per serverless instance).
 */
export function getRedis(): Redis {
  if (process.env.NODE_ENV === "production") {
    return createRedisClient();
  }
  if (!global.__redis) {
    global.__redis = createRedisClient();
  }
  return global.__redis;
}

// ── BigInt-safe JSON serialization ────────────────────────────────────────────

const BIGINT_TAG = "\x00bigint\x00";

/**
 * JSON.stringify with BigInt support.
 * BigInt values are stored as "<BIGINT_TAG><decimal_string>" and restored by `deserialize`.
 */
export function serialize(value: unknown): string {
  return JSON.stringify(value, (_, v) =>
    typeof v === "bigint" ? `${BIGINT_TAG}${v.toString()}` : v
  );
}

/** JSON.parse that restores BigInt values written by `serialize`. */
export function deserialize<T>(raw: string): T {
  return JSON.parse(raw, (_, v) => {
    if (typeof v === "string" && v.startsWith(BIGINT_TAG)) {
      return BigInt(v.slice(BIGINT_TAG.length));
    }
    return v;
  }) as T;
}

// ── cachedFetch ───────────────────────────────────────────────────────────────

/**
 * Read `key` from Redis. On a cache miss (or Redis error), call `fetcher()`,
 * store the result with the given TTL, and return it.
 *
 * Redis failures are non-fatal: the fetcher runs transparently as a fallback.
 *
 * @param key     Redis cache key (use a namespaced pattern, e.g. "midas:apys")
 * @param ttl     Time-to-live in seconds (use TTL constants above)
 * @param fetcher Async function that produces the value on a cache miss
 */
export async function cachedFetch<T>(
  key: string,
  ttl: number,
  fetcher: () => Promise<T>
): Promise<T> {
  const redis = getRedis();

  try {
    const cached = await redis.get(key);
    if (cached !== null) {
      console.log(`[Redis] HIT  ${key}`);
      return deserialize<T>(cached);
    }
  } catch (err) {
    console.warn(`[Redis] GET failed (${key}), bypassing cache:`, err);
  }

  console.log(`[Redis] MISS ${key} → fetching from origin`);
  const t0   = Date.now();
  const data = await fetcher();
  const ms   = Date.now() - t0;

  try {
    await redis.set(key, serialize(data), "EX", ttl);
    console.log(`[Redis] SET  ${key}  (ttl ${ttl}s, fetched in ${ms}ms)`);
  } catch (err) {
    console.warn(`[Redis] SET failed (${key}):`, err);
  }

  return data;
}

/**
 * Invalidate a cache key.
 * Silently ignores Redis errors.
 */
export async function invalidate(key: string): Promise<void> {
  try {
    await getRedis().del(key);
  } catch (err) {
    console.warn("[Redis] DEL failed:", err);
  }
}
