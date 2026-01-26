import { NextResponse } from "next/server";
import { connectMongoDB } from "@/lib/mongodb";
import User from "@/models/user";

function normalizeMoney(value: number): number {
  if (!Number.isFinite(value)) return 0;
  const rounded = Math.round((value + Number.EPSILON) * 100) / 100;
  return Object.is(rounded, -0) ? 0 : rounded;
}

function computeInvestmentValue(principal: number, startedAtMs: number, nowMs: number): number {
  if (!Number.isFinite(principal) || principal <= 0) return 0;
  const HOUR_MS = 60 * 60 * 1000;
  const RATE_PER_HOUR = 0.01 / 24;
  const elapsedMs = Math.max(0, nowMs - startedAtMs);
  const hours = elapsedMs / HOUR_MS;
  const totalValue = principal * (1 + RATE_PER_HOUR * hours);
  return normalizeMoney(totalValue);
}

export async function POST(req: Request) {
  try {
    const { name, action, amount } = await req.json();
    if (typeof name !== "string" || !name.trim()) {
      return NextResponse.json({ message: "Invalid name" }, { status: 400 });
    }
    if (action !== "deposit" && action !== "withdraw") {
      return NextResponse.json({ message: "Invalid action" }, { status: 400 });
    }

    const rawAmount = normalizeMoney(Number(amount));
    if (!Number.isFinite(rawAmount) || rawAmount <= 0) {
      return NextResponse.json({ message: "Invalid amount" }, { status: 400 });
    }

    await connectMongoDB();

    const user = await User.findOne({ name: name.trim() });
    if (!user) {
      return NextResponse.json({ message: "User not found" }, { status: 404 });
    }

    const nowMs = Date.now();
    const rawPrincipal = typeof user.invest === "number" ? user.invest : 0;
    const rawStartedAtMs =
      typeof user.lastCheckedInvest === "number" && Number.isFinite(user.lastCheckedInvest)
        ? user.lastCheckedInvest
        : nowMs;
    const currentValue = computeInvestmentValue(rawPrincipal, rawStartedAtMs, nowMs);

    if (action === "deposit") {
      if (rawAmount > (typeof user.balance === "number" ? user.balance : 0)) {
        return NextResponse.json({ message: "Not enough balance" }, { status: 400 });
      }

      const nextPrincipal = normalizeMoney(currentValue + rawAmount);
      const updated = await User.findOneAndUpdate(
        { _id: user._id, balance: user.balance, invest: user.invest, lastCheckedInvest: user.lastCheckedInvest },
        { $inc: { balance: -rawAmount }, $set: { invest: nextPrincipal, lastCheckedInvest: nowMs } },
        { new: true }
      );

      if (!updated) {
        return NextResponse.json({ message: "Investment changed, retry." }, { status: 409 });
      }

      const res = NextResponse.json({
        success: true,
        amount: rawAmount,
        balanceDelta: -rawAmount,
        investment: { principal: nextPrincipal, startedAtMs: nowMs },
      });
      res.headers.set("Cache-Control", "private, no-store");
      return res;
    }

    if (rawAmount > currentValue) {
      return NextResponse.json({ message: "Not enough available to withdraw" }, { status: 400 });
    }

    const nextPrincipal = normalizeMoney(currentValue - rawAmount);
    const updated = await User.findOneAndUpdate(
      { _id: user._id, invest: user.invest, lastCheckedInvest: user.lastCheckedInvest },
      { $inc: { balance: rawAmount }, $set: { invest: nextPrincipal, lastCheckedInvest: nowMs } },
      { new: true }
    );

    if (!updated) {
      return NextResponse.json({ message: "Investment changed, retry." }, { status: 409 });
    }

    const res = NextResponse.json({
      success: true,
      amount: rawAmount,
      balanceDelta: rawAmount,
      investment: { principal: nextPrincipal, startedAtMs: nowMs },
    });
    res.headers.set("Cache-Control", "private, no-store");
    return res;
  } catch (error) {
    console.error("Error updating investment:", error);
    return NextResponse.json({ message: "Error updating investment" }, { status: 500 });
  }
}
