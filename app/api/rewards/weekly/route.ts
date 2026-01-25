import { NextResponse } from "next/server";
import { connectMongoDB } from "@/lib/mongodb";
import User from "@/models/user";

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

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
    const lastMs = user.lastWeeklyPayback ? new Date(user.lastWeeklyPayback).getTime() : 0;
    if (nowMs - lastMs < WEEK_MS) {
      return NextResponse.json({ success: false, amount: 0, error: "7 Tage Sperre aktiv." });
    }

    const amount = normalizeMoney(typeof user.weeklyPayback === "number" ? user.weeklyPayback : 0);
    if (amount <= 0) {
      return NextResponse.json({ success: false, amount: 0, error: "Pot ist leer." });
    }

    const updated = await User.findOneAndUpdate(
      { _id: user._id, lastWeeklyPayback: user.lastWeeklyPayback, weeklyPayback: user.weeklyPayback },
      { $inc: { balance: amount }, $set: { weeklyPayback: 0, lastWeeklyPayback: new Date(nowMs) } },
      { new: true }
    );

    if (!updated) {
      return NextResponse.json({ success: false, amount: 0, error: "Already claimed." }, { status: 409 });
    }

    const res = NextResponse.json({
      success: true,
      amount,
      balance: updated.balance,
      weeklyPayback: updated.weeklyPayback,
      lastWeeklyPayback: nowMs,
    });
    res.headers.set("Cache-Control", "private, no-store");
    return res;
  } catch (error) {
    console.error("Error claiming weekly payback:", error);
    return NextResponse.json({ message: "Error claiming weekly payback" }, { status: 500 });
  }
}
