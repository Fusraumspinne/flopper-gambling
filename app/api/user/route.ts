import { NextResponse } from "next/server";
import { connectMongoDB } from "@/lib/mongodb";
import User from "@/models/user";
import HighestProfit from "@/models/highestProfit";
import HighestMultiplier from "@/models/highestMultiplier";
import HighestLoss from "@/models/highestLoss";

function normalizeMoney(value: number): number {
  if (!Number.isFinite(value)) return 0;
  const rounded = Math.round((value + Number.EPSILON) * 100) / 100;
  return Object.is(rounded, -0) ? 0 : rounded;
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { name, balance, createOnly } = body ?? {};
    if (typeof name !== "string") {
      return NextResponse.json({ message: "Invalid name" }, { status: 400 });
    }

    await connectMongoDB();

    if (createOnly) {
      const existing = await User.findOne({ name });
      if (existing) {
        return NextResponse.json({ message: "Name already exists" }, { status: 409 });
      }
      const created = await User.create({ name, balance: typeof balance === 'number' ? balance : 0 });
      return NextResponse.json(created, { status: 201 });
    }

    const nextBalance = typeof balance === "number" ? normalizeMoney(balance) : undefined;
    const user = await User.findOneAndUpdate(
      { name },
      typeof nextBalance === "number" ? { balance: nextBalance } : {},
      { new: true, upsert: true }
    );

    const updates: Array<{ game: unknown; profit?: unknown; multi?: unknown; loss?: unknown }> =
      Array.isArray(body?.updates)
        ? body.updates
        : typeof body?.game === "string" && body.game.trim()
          ? [{ game: body.game, profit: body.profit, multi: body.multi, loss: body.loss }]
          : [];

    for (const rawUpd of updates) {
      const gameRaw = typeof rawUpd?.game === "string" ? rawUpd.game.trim() : "";
      if (!gameRaw || gameRaw === "unknown") continue;

      const multiValue = typeof rawUpd?.multi === "number" ? normalizeMoney(rawUpd.multi) : null;
      const profitValue = typeof rawUpd?.profit === "number" ? normalizeMoney(rawUpd.profit) : null;
      const lossValue = typeof rawUpd?.loss === "number" ? normalizeMoney(rawUpd.loss) : null;

      const scoreValue = profitValue ?? 0;

      const [profitDoc, multiDoc, lossDoc] = await Promise.all([
        HighestProfit.findOne({ game: gameRaw }),
        HighestMultiplier.findOne({ game: gameRaw }),
        HighestLoss.findOne({ game: gameRaw }),
      ]);

      const ops: Promise<any>[] = [];

      if (scoreValue > 0 && (!profitDoc || scoreValue > (typeof profitDoc.profit === "number" ? profitDoc.profit : 0))) {
        ops.push(
          HighestProfit.findOneAndUpdate(
            { game: gameRaw },
            { game: gameRaw, username: name, profit: scoreValue },
            { upsert: true, new: true }
          )
        );
      }

      if (
        multiValue !== null &&
        multiValue > 0 &&
        (!multiDoc || multiValue > (typeof multiDoc.multiplier === "number" ? multiDoc.multiplier : 0))
      ) {
        ops.push(
          HighestMultiplier.findOneAndUpdate(
            { game: gameRaw },
            { game: gameRaw, username: name, multiplier: multiValue },
            { upsert: true, new: true }
          )
        );
      }

      if (
        lossValue !== null &&
        lossValue > 0 &&
        (!lossDoc || lossValue > (typeof lossDoc.loss === "number" ? lossDoc.loss : 0))
      ) {
        ops.push(
          HighestLoss.findOneAndUpdate(
            { game: gameRaw },
            { game: gameRaw, username: name, loss: lossValue },
            { upsert: true, new: true }
          )
        );
      }

      if (ops.length) await Promise.all(ops);
    }

    const res = NextResponse.json(user);
    res.headers.set("Cache-Control", "private, no-store");
    return res;
  } catch (error) {
    console.error("Error updating user:", error);
    return NextResponse.json({ message: "Error updating user" }, { status: 500 });
  }
}

export async function PATCH(req: Request) {
  try {
    const { oldName, newName } = await req.json();
    if (typeof oldName !== "string" || typeof newName !== "string") {
      return NextResponse.json({ message: "Invalid name" }, { status: 400 });
    }

    const from = oldName.trim();
    const to = newName.trim();
    if (!from || !to) {
      return NextResponse.json({ message: "Invalid name" }, { status: 400 });
    }
    if (from === to) {
      return NextResponse.json({ message: "No changes" }, { status: 200 });
    }

    await connectMongoDB();

    const existing = await User.findOne({ name: to });
    if (existing) {
      return NextResponse.json({ message: "Name already exists" }, { status: 409 });
    }

    const updated = await User.findOneAndUpdate(
      { name: from },
      { name: to },
      { new: true }
    );

    if (!updated) {
      return NextResponse.json({ message: "User not found" }, { status: 404 });
    }

    const res = NextResponse.json(updated);
    res.headers.set("Cache-Control", "private, no-store");
    return res;
  } catch (error: any) {
    if (error?.code === 11000) {
      return NextResponse.json({ message: "Name already exists" }, { status: 409 });
    }
    console.error("Error renaming user:", error);
    return NextResponse.json({ message: "Error renaming user" }, { status: 500 });
  }
}

export async function DELETE(req: Request) {
  try {
    const { name } = await req.json();
    if (typeof name !== "string" || !name.trim()) {
      return NextResponse.json({ message: "Invalid name" }, { status: 400 });
    }

    await connectMongoDB();
    const deleted = await User.findOneAndDelete({ name: name.trim() });
    const res = NextResponse.json({ deleted: Boolean(deleted) });
    res.headers.set("Cache-Control", "private, no-store");
    return res;
  } catch (error) {
    console.error("Error deleting user:", error);
    return NextResponse.json({ message: "Error deleting user" }, { status: 500 });
  }
}
