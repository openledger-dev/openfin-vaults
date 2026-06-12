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
import { getLogger } from "@/lib/logger";

const log = getLogger("api/midas/apys");

export async function GET() {
  try {
    const data = await cachedFetch(redisKey("midas:apys"), TTL.APY, fetchMidasApys);
    return NextResponse.json(data);
  } catch (err) {
    log.error({ err }, "request failed");
    return NextResponse.json(
      { error: "Failed to fetch Midas APYs" },
      { status: 502 }
    );
  }
}
