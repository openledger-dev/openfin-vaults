/**
 * GET /api/midas/tvl
 *
 * Returns a map of lowercase Midas token symbol -> TVL in USD
 * (e.g. { mtbill: 47628637, mre7: 14423063 }).
 * Result is cached in Redis for TTL.PRICE seconds (10 minutes).
 */

import { NextResponse } from "next/server";
import { cachedFetch, TTL } from "@/lib/redis";
import { fetchMidasTvls } from "@/lib/midasApi";

export async function GET() {
  try {
    const data = await cachedFetch("midas:tvl", TTL.PRICE, fetchMidasTvls);
    return NextResponse.json(data);
  } catch (err) {
    console.error("[/api/midas/tvl]", err);
    return NextResponse.json(
      { error: "Failed to fetch Midas TVL" },
      { status: 502 }
    );
  }
}
