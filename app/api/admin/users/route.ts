import { NextResponse } from "next/server";
import { connectMongoDB } from "@/lib/mongodb";
import User from "@/models/user";
import HighestProfit from "@/models/highestProfit";
import HighestMultiplier from "@/models/highestMultiplier";
import HighestLoss from "@/models/highestLoss";
import Gift from "@/models/gift";

function toNumber(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const q = (url.searchParams.get("q") ?? "").trim();

    await connectMongoDB();

    const filter = q ? { name: new RegExp(q, "i") } : {};

    const users = await User.find(filter)
      .sort({ updatedAt: -1 })
      .select("name balance invest lastCheckedInvest lastDailyReward weeklyPayback lastWeeklyPayback btcHoldings btcCostUsd portfolioUsd createdAt updatedAt")
      .lean();

    const res = NextResponse.json({ users });
    res.headers.set("Cache-Control", "no-store");
    return res;
  } catch (error) {
    console.error("Error fetching users (admin):", error);
    return NextResponse.json({ message: "Error fetching users" }, { status: 500 });
  }
}

export async function PATCH(req: Request) {
  try {
    const body = await req.json();
    const id = typeof body?.id === "string" ? body.id : null;
    const name = typeof body?.name === "string" ? body.name.trim() : null;

    if (!id && !name) {
      return NextResponse.json({ message: "Missing id or name" }, { status: 400 });
    }

    const update: Record<string, any> = {};
    const set: Record<string, any> = {};

    const fields = [
      "balance",
      "invest",
      "lastCheckedInvest",
      "weeklyPayback",
      "lastDailyReward",
      "lastWeeklyPayback",
      "btcHoldings",
      "btcCostUsd",
      "portfolioUsd",
    ];

    for (const field of fields) {
      const num = toNumber(body?.[field]);
      if (typeof num === "number") set[field] = num;
    }

    if (typeof body?.lastDailyReward === "number") {
      set.lastDailyReward = new Date(body.lastDailyReward);
    }
    if (typeof body?.lastWeeklyPayback === "number") {
      set.lastWeeklyPayback = new Date(body.lastWeeklyPayback);
    }

    if (typeof body?.name === "string" && body?.newName) {
      const newName = String(body.newName).trim();
      if (newName && newName !== name) {
        set.name = newName;
      }
    }

    if (Object.keys(set).length) update.$set = set;

    await connectMongoDB();

    const user = await User.findOneAndUpdate(id ? { _id: id } : { name }, update, {
      new: true,
    });

    if (!user) {
      return NextResponse.json({ message: "User not found" }, { status: 404 });
    }

    const res = NextResponse.json({ user });
    res.headers.set("Cache-Control", "no-store");
    return res;
  } catch (error) {
    console.error("Error updating user (admin):", error);
    return NextResponse.json({ message: "Error updating user" }, { status: 500 });
  }
}

export async function DELETE(req: Request) {
  try {
    const body = await req.json();
    const id = typeof body?.id === "string" ? body.id : null;
    const name = typeof body?.name === "string" ? body.name.trim() : null;

    if (!id && !name) {
      return NextResponse.json({ message: "Missing id or name" }, { status: 400 });
    }

    await connectMongoDB();

    const user = id ? await User.findById(id) : await User.findOne({ name });
    if (!user) {
      return NextResponse.json({ message: "User not found" }, { status: 404 });
    }

    const username = user.name;

    await User.deleteOne({ _id: user._id });
    await Promise.all([
      HighestProfit.deleteMany({ username }),
      HighestMultiplier.deleteMany({ username }),
      HighestLoss.deleteMany({ username }),
      Gift.deleteMany({ sender: username }),
      Gift.deleteMany({ recipient: username }),
    ]);

    const res = NextResponse.json({ success: true });
    res.headers.set("Cache-Control", "no-store");
    return res;
  } catch (error) {
    console.error("Error deleting user (admin):", error);
    return NextResponse.json({ message: "Error deleting user" }, { status: 500 });
  }
}
