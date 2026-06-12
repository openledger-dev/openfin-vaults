/**
 * GET /api/midas/tvl
 *
 * Returns a map of lowercase Midas token symbol -> TVL in USD
 * (e.g. { mtbill: 47628637, mre7: 14423063 }).
 * Result is cached in Redis for TTL.PRICE seconds (10 minutes).
 */

import { NextResponse } from "next/server";
import { cachedFetch, TTL, redisKey } from "@/lib/redis";
import { fetchMidasTvls } from "@/lib/midasApi";
import { getLogger } from "@/lib/logger";

const log = getLogger("api/midas/tvl");

export async function GET() {
  try {
    const data = await cachedFetch(redisKey("midas:tvl"), TTL.PRICE, fetchMidasTvls);
    return NextResponse.json(data);
  } catch (err) {
    log.error({ err }, "request failed");
    return NextResponse.json(
      { error: "Failed to fetch Midas TVL" },
      { status: 502 }
    );
  }
}
