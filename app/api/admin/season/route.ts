import { NextResponse } from "next/server";
import { connectMongoDB } from "@/lib/mongodb";
import User from "@/models/user";
import Gift from "@/models/gift";

export async function POST() {
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
      const RATE_PER_HOUR = 0.01 / 24;
      const cappedPrincipal = Math.min(principal, 100000);
      const nonInterestPrincipal = principal - cappedPrincipal;
      const elapsedMs = Math.max(0, Date.now() - startedAtMs);
      const hours = elapsedMs / HOUR_MS;
      const interestValue = cappedPrincipal * (1 + RATE_PER_HOUR * hours);
      return normalizeMoney(interestValue + nonInterestPrincipal);
    };

    const mapped = users
      .map((user) => {
        const principal = Number(user?.invest ?? 0);
        const startedAtMs = Number(user?.lastCheckedInvest ?? Date.now());
        const investmentValue = computeInvestmentValue(principal, startedAtMs);
        const btcUsdValue = Number(user?.portfolioUsd ?? 0);
        const balance = Number(user?.balance ?? 0);
        return {
          _id: user._id,
          name: user.name,
          totalBalance: balance + investmentValue + (btcUsdValue || 0),
        };
      })
      .sort((a, b) => b.totalBalance - a.totalBalance);

    if (mapped.length === 0) {
      return NextResponse.json({ message: "No users found" }, { status: 400 });
    }

    if (mapped[0]) await User.findByIdAndUpdate(mapped[0]._id, { $push: { seasons: "first" } });
    if (mapped[1]) await User.findByIdAndUpdate(mapped[1]._id, { $push: { seasons: "second" } });
    if (mapped[2]) await User.findByIdAndUpdate(mapped[2]._id, { $push: { seasons: "third" } });

    if (mapped.length > 3) {
      const last = mapped[mapped.length - 1];
      await User.findByIdAndUpdate(last._id, { $push: { seasons: "last" } });
    }

    const resetTimestamp = new Date();
    await User.updateMany(
      {},
      {
        $set: {
          balance: 10000,
          invest: 0,
          lastCheckedInvest: Date.now(),
          lastDailyReward: resetTimestamp,
          weeklyPayback: 0,
          lastWeeklyPayback: resetTimestamp,
          btcHoldings: 0,
          btcCostUsd: 0,
          portfolioUsd: 0,
        },
      }
    );

    await Gift.deleteMany({});

    return NextResponse.json({ message: "Season rewards processed and accounts reset successfully" });
  } catch (error) {
    console.error("Season Error:", error);
    return NextResponse.json({ message: "Error processing season rewards" }, { status: 500 });
  }
}
