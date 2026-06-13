/**
 * Global middleware — per-request CSP nonce + Content-Security-Policy header
 * + structured HTTP access logging.
 *
 * Runs in Node.js runtime (not Edge) so the pino logger is available.
 * Covers all HTML pages and API routes. Static assets under /_next/static are
 * excluded via matcher to avoid unnecessary nonce churn on hashed bundles.
 */
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { buildContentSecurityPolicy, isCspReportOnly } from "@/lib/csp";
import { getLogger } from "@/lib/logger";

export const runtime = "nodejs";

const log = getLogger("http");

export function middleware(request: NextRequest) {
  const start = Date.now();
  const { method, nextUrl } = request;

  const nonce = Buffer.from(crypto.randomUUID()).toString("base64");
  const isDev = process.env.NODE_ENV === "development";

  const csp = buildContentSecurityPolicy({ nonce, isDev });
  const cspHeaderName = isCspReportOnly()
    ? "Content-Security-Policy-Report-Only"
    : "Content-Security-Policy";

  const requestHeaders = new Headers(request.headers);
  // Next.js reads this header and applies the nonce to its inline scripts.
  requestHeaders.set("x-nonce", nonce);

  const response = NextResponse.next({
    request: { headers: requestHeaders },
  });

  response.headers.set(cspHeaderName, csp);

  log.info({ method, path: nextUrl.pathname, ms: Date.now() - start }, "request");

  return response;
}

export const config = {
  matcher: [
    /*
     * Match all request paths except:
     *  - _next/static  (immutable hashed assets — no nonce needed)
     *  - _next/image   (image optimization)
     *  - favicon.ico
     */
    {
      source: "/((?!_next/static|_next/image|favicon.ico).*)",
    },
  ],
};
