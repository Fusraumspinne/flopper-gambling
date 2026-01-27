import { NextResponse } from "next/server";

export async function GET() {
  try {
    const res = await fetch("https://api.binance.com/api/v3/ticker/price?symbol=BTCUSDT");
    if (!res.ok) return NextResponse.json({ message: "Failed to fetch price" }, { status: 502 });
    const data = await res.json();
    const price = Number(data.price || data.PRICE || data.P || 0);
    if (!Number.isFinite(price)) return NextResponse.json({ message: "Invalid price" }, { status: 502 });
    const r = NextResponse.json({ success: true, price });
    r.headers.set("Cache-Control", "s-maxage=5, stale-while-revalidate=10");
    return r;
  } catch (error) {
    console.error("/api/crypto/price error", error);
    return NextResponse.json({ message: "Internal error" }, { status: 500 });
  }
}
