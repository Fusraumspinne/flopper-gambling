import { NextResponse } from "next/server";
import { connectMongoDB } from "@/lib/mongodb";
import User from "@/models/user";

const HOUR_MS = 60 * 60 * 1000;
const AMOUNT_PER_HOUR = 100;

function normalizeMoney(value: number): number {
  if (!Number.isFinite(value)) return 0;
  const rounded = Math.round((value + Number.EPSILON) * 100) / 100;
  return Object.is(rounded, -0) ? 0 : rounded;
}

export async function POST(req: Request) {
  try {
    const { name } = await req.json();
    if (typeof name !== "string" || !name.trim()) {
      return NextResponse.json({ message: "Invalid name" }, { status: 400 });
    }

    await connectMongoDB();

    const user = await User.findOne({ name: name.trim() });
    if (!user) {
      return NextResponse.json({ message: "User not found" }, { status: 404 });
    }

    const nowMs = Date.now();
    const lastMs = user.lastDailyReward ? new Date(user.lastDailyReward).getTime() : 0;
    const diff = Math.max(0, nowMs - lastMs);
    const hours = Math.floor(diff / HOUR_MS);
    const amount = normalizeMoney(hours * AMOUNT_PER_HOUR);

    if (amount <= 0) {
      return NextResponse.json({ success: false, amount: 0, lastDailyReward: lastMs });
    }

    try {
      user.balance = normalizeMoney((typeof user.balance === 'number' ? user.balance : 0) + amount) as any;
      user.lastDailyReward = new Date(nowMs) as any;
      const saved = await user.save();

      const res = NextResponse.json({
        success: true,
        amount,
        balance: saved.balance,
        lastDailyReward: nowMs,
      });
      res.headers.set("Cache-Control", "private, no-store");
      return res;
    } catch (err) {
      console.error('Daily reward save failed, falling back to atomic update:', err);
      const updated = await User.findOneAndUpdate(
        { _id: user._id, lastDailyReward: user.lastDailyReward },
        { $inc: { balance: amount }, $set: { lastDailyReward: new Date(nowMs) } },
        { new: true }
      );

      if (!updated) {
        return NextResponse.json({ success: false, amount: 0, error: "Already claimed." }, { status: 409 });
      }

      const res = NextResponse.json({ success: true, amount, balance: updated.balance, lastDailyReward: nowMs });
      res.headers.set("Cache-Control", "private, no-store");
      return res;
    }
  } catch (error) {
    console.error("Error claiming daily reward:", error);
    return NextResponse.json({ message: "Error claiming daily reward" }, { status: 500 });
  }
}
