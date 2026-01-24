import { NextResponse } from "next/server";
import { connectMongoDB } from "@/lib/mongodb";
import User from "@/models/user";
import UserMeta from "@/models/userMeta";

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    await connectMongoDB();
    const users = await User.find();
    const metas = await UserMeta.find();
    const metaByName = new Map(metas.map((m) => [m.name, m]));

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

    const mapped = users
      .map((user) => {
        const meta = metaByName.get(user.name);
        const principal = Number(meta?.investment?.principal ?? 0);
        const startedAtMs = Number(meta?.investment?.startedAtMs ?? Date.now());
        const investmentValue = computeInvestmentValue(principal, startedAtMs);
        const balance = Number(user?.balance ?? 0);
        return {
          _id: user._id,
          name: user.name,
          balance: normalizeMoney(balance + investmentValue),
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
