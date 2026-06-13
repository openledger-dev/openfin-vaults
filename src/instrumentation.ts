/**
 * Next.js Instrumentation Hook
 * https://nextjs.org/docs/app/building-your-application/optimizing/instrumentation
 *
 * `register()` runs once at server start. The logger is imported dynamically
 * so that webpack only resolves it in the Node.js runtime — never in the Edge
 * or browser bundles.
 *
 * Connectivity proof comes from the first API call — cachedFetch() already
 * logs { key } cache hit / cache miss on every request.
 */

export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;

  const { getLogger } = await import("@/lib/logger");
  const log = getLogger("instrumentation");

  const url = process.env.REDIS_URL;
  if (url) {
    log.info({ redisUrl: url }, "Redis configured — connectivity confirmed on first cached request");
  } else {
    log.warn("Redis not configured — caching disabled (set REDIS_URL in .env.local to enable)");
  }
}
