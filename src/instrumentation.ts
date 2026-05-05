/**
 * Next.js Instrumentation Hook
 * https://nextjs.org/docs/app/building-your-application/optimizing/instrumentation
 *
 * `register()` runs once at server start. We keep it completely dependency-free
 * (no imports, no require) so webpack never has to resolve Node.js built-ins.
 *
 * Connectivity proof comes from the first API call — cachedFetch() already
 * logs "[Redis] HIT" or "[Redis] MISS → fetching from origin" on every request.
 */

export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;

  const LINE = "─".repeat(52);
  const url  = process.env.REDIS_URL;

  console.log(`\n${LINE}`);
  if (url) {
    console.log(`  Redis  ●  Configured`);
    console.log(`         ↳  ${url}`);
    console.log(`         ↳  Connectivity confirmed on first cached request`);
  } else {
    console.log(`  Redis  ○  Not configured — caching disabled`);
    console.log(`         ↳  Set REDIS_URL in .env.local to enable caching`);
  }
  console.log(`${LINE}\n`);
}
