import { NextResponse } from "next/server";
import { connectMongoDB } from "@/lib/mongodb";
import User from "@/models/user";
import { fetchJsonCached } from "@/lib/fetchCache";

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    await connectMongoDB();
    const users = await User.find();

    const normalizeMoney = (value: number): number => {
      if (!Number.isFinite(value)) return 0;
      const rounded = Math.round((value + Number.EPSILON) * 100) / 100;
      return Object.is(rounded, -0) ? 0 : rounded;
    };

    const computeInvestmentValue = (principal: number, startedAtMs: number) => {
      if (!Number.isFinite(principal) || principal <= 0) return 0;
      const HOUR_MS = 60 * 60 * 1000;
      const RATE_PER_HOUR = 0.01;
      const cappedPrincipal = Math.min(principal, 100000);
      const nonInterestPrincipal = principal - cappedPrincipal;
      const elapsedMs = Math.max(0, Date.now() - startedAtMs);
      const hours = elapsedMs / HOUR_MS;
      const interestValue = cappedPrincipal * (1 + RATE_PER_HOUR * hours);
      return normalizeMoney(interestValue + nonInterestPrincipal);
    };

    // get BTC price (cached) so leaderboard includes crypto holdings value
    let btcPrice = 0;
    try {
      const p = await fetchJsonCached('binance:btc_price', async () => {
        const r = await fetch('https://api.binance.com/api/v3/ticker/price?symbol=BTCUSDT');
        const j = await r.json();
        return Number(j.price);
      }, 30_000);
      btcPrice = Number(p) || 0;
    } catch (e) {
      btcPrice = 0;
    }

    const mapped = users
      .map((user) => {
        // fetch BTC price (cached) to include crypto holdings in leaderboard
        // note: fetched once per request below
        const principal = Number(user?.invest ?? 0);
        const startedAtMs = Number(user?.lastCheckedInvest ?? Date.now());
        const investmentValue = computeInvestmentValue(principal, startedAtMs);
        const btcHoldings = Number(user?.btcHoldings ?? 0);
        const btcUsdValue = normalizeMoney(btcHoldings * btcPrice);
        const balance = Number(user?.balance ?? 0);
        return {
          _id: user._id,
          name: user.name,
          balance: normalizeMoney(balance + investmentValue + (btcUsdValue || 0)),
        };
      })
      .sort((a, b) => b.balance - a.balance);

    const res = NextResponse.json(mapped);
    res.headers.set("Cache-Control", "no-store, max-age=0");
    return res;
  } catch (error) {
    return NextResponse.json({ message: "Error fetching leaderboard" }, { status: 500 });
  }
}
