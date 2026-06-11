/**
 * AbortController-based fetch timeout utility (OPE-25).
 *
 * Without a timeout, a slow or hung upstream holds a Node.js server worker
 * open indefinitely. Under load this exhausts the thread pool and cascades
 * into latency for all other requests.
 *
 * Usage — drop-in replacement for fetch:
 *   const res = await fetchWithTimeout(url, options);              // 10 s default
 *   const res = await fetchWithTimeout(url, options, 15_000);     // 15 s override
 *
 * Next.js cache options (next: { revalidate }) are forwarded as-is because
 * this wrapper spreads `options` into the underlying fetch call.
 *
 * On timeout, throws an Error with name "TimeoutError".
 * Callers should let it propagate to their existing error handler, which
 * will return a 502/500 to the client — the same as any other upstream failure.
 */

/** Default deadline for every outbound request (15 seconds). */
export const DEFAULT_TIMEOUT_MS = 15_000;

/**
 * Slightly longer deadline for heavyweight upstream calls
 * (GraphQL scans, multi-step allocation endpoints).
 */
export const HEAVY_TIMEOUT_MS = 20_000;

/**
 * Drop-in replacement for `fetch` that aborts after `timeoutMs`.
 *
 * @param url        Request URL string or URL object.
 * @param options    Standard RequestInit (including Next.js `next` cache options).
 * @param timeoutMs  Abort deadline in milliseconds (default: DEFAULT_TIMEOUT_MS).
 *
 * @throws {Error}   name === "TimeoutError" when the deadline is exceeded.
 */
export async function fetchWithTimeout(
  url: string | URL,
  options: RequestInit = {},
  timeoutMs: number = DEFAULT_TIMEOUT_MS,
): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } catch (err) {
    if (err instanceof Error && err.name === "AbortError") {
      const host =
        typeof url === "string"
          ? (() => { try { return new URL(url).hostname; } catch { return url; } })()
          : url.hostname;
      const te = new Error(`Upstream timed out after ${timeoutMs}ms (${host})`);
      te.name = "TimeoutError";
      throw te;
    }
    throw err;
  } finally {
    clearTimeout(timer);
  }
}
