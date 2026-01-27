export const runtime = "nodejs";

import { NextResponse } from "next/server";

export async function GET(req: Request) {
  try {
    const url = "https://api.binance.com/api/v3/klines?symbol=BTCUSDT&interval=15m&limit=96";
    const res = await fetch(url);
    if (!res.ok) return NextResponse.json({ message: "Failed to fetch klines" }, { status: 502 });
    const data = await res.json();
    const r = NextResponse.json({ success: true, klines: data });
    r.headers.set("Cache-Control", "s-maxage=60, stale-while-revalidate=300");
    return r;
  } catch (error) {
    console.error("/api/crypto/klines error", error);
    return NextResponse.json({ message: "Internal error" }, { status: 500 });
  }
}
