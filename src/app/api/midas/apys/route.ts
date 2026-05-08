/**
 * GET /api/midas/apys
 *
 * Returns a map of lowercase Midas token symbol → APY decimal (e.g. { mtbill: 0.054 }).
 * Result is cached in Redis for TTL.APY seconds (5 minutes).
 *
 * On Redis unavailability, falls back to fetching directly from the Midas API.
 */

import { NextResponse } from "next/server";
import { cachedFetch, TTL, redisKey } from "@/lib/redis";
import { fetchMidasApys } from "@/lib/midasApi";

export async function GET() {
  try {
    const data = await cachedFetch(redisKey("midas:apys"), TTL.APY, fetchMidasApys);
    return NextResponse.json(data);
  } catch (err) {
    console.error("[/api/midas/apys]", err);
    return NextResponse.json(
      { error: "Failed to fetch Midas APYs" },
      { status: 502 }
    );
  }
}
