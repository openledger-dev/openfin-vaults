/**
 * CORS preflight helper for API routes that accept non-GET methods.
 *
 * Background
 * ──────────
 * next.config.ts headers() attaches CORS headers to every matching response,
 * but it does NOT make Next.js respond to OPTIONS preflight requests — those
 * still return 405 Method Not Allowed unless the route exports an OPTIONS
 * handler.  Without a proper 204 preflight response the browser will never
 * send the actual POST, silently breaking the swap flows in production when
 * the app is loaded from the canonical origin.
 *
 * Usage
 * ─────
 * In any route that exports POST (or PUT/PATCH/DELETE), also export:
 *
 *   export { OPTIONS } from "@/lib/cors";
 */

import { NextResponse } from "next/server";

const APP_ORIGIN =
  process.env.NEXT_PUBLIC_APP_URL ?? "https://openfin.openledger.xyz";

/**
 * Handles CORS preflight (OPTIONS) requests.
 * Returns 204 No Content with the same CORS headers that next.config.ts
 * attaches to regular responses.
 */
export function OPTIONS(): NextResponse {
  return new NextResponse(null, {
    status: 204,
    headers: {
      "Access-Control-Allow-Origin":  APP_ORIGIN,
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
      "Access-Control-Max-Age":       "86400", // cache preflight 24 h
      "Vary":                         "Origin",
    },
  });
}
