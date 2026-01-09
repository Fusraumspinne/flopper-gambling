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
    const { name, balance, createOnly, game, profit, multi, payout, loss } = await req.json();
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

    const user = await User.findOneAndUpdate(
      { name },
      { balance },
      { new: true, upsert: true }
    );

    if (typeof game === "string" && game.trim()) {
      const gameId = game.trim();
      const multiValue = typeof multi === "number" ? normalizeMoney(multi) : null;
      const profitValue = typeof profit === "number" ? normalizeMoney(profit) : null;
      const lossValue = typeof loss === "number" ? normalizeMoney(loss) : null;

      const scoreValue = profitValue ?? 0;

      if (gameId !== "unknown") {
        const [profitDoc, multiDoc, lossDoc] = await Promise.all([
          HighestProfit.findOne({ game: gameId }),
          HighestMultiplier.findOne({ game: gameId }),
          HighestLoss.findOne({ game: gameId }),
        ]);

        const ops: Promise<any>[] = [];

        if (scoreValue > 0 && (!profitDoc || scoreValue > (typeof profitDoc.profit === "number" ? profitDoc.profit : 0))) {
          ops.push(
            HighestProfit.findOneAndUpdate(
              { game: gameId },
              { game: gameId, username: name, profit: scoreValue },
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
              { game: gameId },
              { game: gameId, username: name, multiplier: multiValue },
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
              { game: gameId },
              { game: gameId, username: name, loss: lossValue },
              { upsert: true, new: true }
            )
          );
        }

        if (ops.length) {
          await Promise.all(ops);
        }
      }
    }

    return NextResponse.json(user);
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

    return NextResponse.json(updated);
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
    return NextResponse.json({ deleted: Boolean(deleted) });
  } catch (error) {
    console.error("Error deleting user:", error);
    return NextResponse.json({ message: "Error deleting user" }, { status: 500 });
  }
}
