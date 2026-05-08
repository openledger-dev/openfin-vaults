/**
 * GET /api/midas/prices
 *
 * Returns a map of lowercase Midas token symbol → USD price
 * (e.g. { mtbill: 1.094, mbasis: 1.032 }).
 * Result is cached in Redis for TTL.PRICE seconds (10 minutes).
 *
 * On Redis unavailability, falls back to fetching directly from the Midas API.
 */

import { NextResponse } from "next/server";
import { cachedFetch, TTL, redisKey } from "@/lib/redis";
import { fetchMidasPrices } from "@/lib/midasApi";

export async function GET() {
  try {
    const data = await cachedFetch(redisKey("midas:prices"), TTL.PRICE, fetchMidasPrices);
    return NextResponse.json(data);
  } catch (err) {
    console.error("[/api/midas/prices]", err);
    return NextResponse.json(
      { error: "Failed to fetch Midas prices" },
      { status: 502 }
    );
  }
}
