/**
 * Structured logger (pino) — OPE-25 remediation.
 *
 * All server-side code should obtain a child logger via getLogger() rather
 * than calling console.* directly. This provides:
 *   - Consistent JSON output that log collectors can parse and index
 *   - Explicit log levels (trace / debug / info / warn / error / fatal)
 *   - Automatic field-based serialization — no manual string interpolation
 *   - Built-in error serialiser (prints err.message + err.stack as fields)
 *   - Control-character safety: pino JSON-encodes all string values, so
 *     newlines and other control chars in user-derived values cannot forge
 *     additional log lines (CWE-117 / CWE-134).
 *
 * Log level hierarchy (lowest → highest):
 *   trace < debug < info < warn < error < fatal
 *
 * Override at runtime with LOG_LEVEL env var (e.g. LOG_LEVEL=debug).
 * Default: "debug" in development, "info" in production.
 *
 * Development pretty-printing:
 *   Pipe the Next.js process through pino-pretty for human-readable output:
 *     npm run dev 2>&1 | npx pino-pretty
 *
 * Usage:
 *   import { getLogger } from "@/lib/logger";
 *   const log = getLogger("api/ultrayield/apy");
 *
 *   log.info({ chainId, vault }, "APY request");
 *   log.error({ err }, "failed to compute APY");
 *   log.warn({ key, ttl }, "cache SET failed");
 */

import pino from "pino";

const rootLogger = pino({
  level: process.env.LOG_LEVEL ?? (process.env.NODE_ENV === "production" ? "info" : "debug"),
  base: { service: "openfin-vaults" },
  timestamp: pino.stdTimeFunctions.isoTime,
  serializers: {
    err: pino.stdSerializers.err,
  },
});

/**
 * Returns a child logger pre-populated with a `module` field.
 * Call once at the top of each server-side file:
 *
 *   const log = getLogger("lib/redis");
 */
export function getLogger(module: string) {
  return rootLogger.child({ module });
}
