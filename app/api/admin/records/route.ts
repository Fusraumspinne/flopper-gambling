import { NextResponse } from "next/server";
import { connectMongoDB } from "@/lib/mongodb";
import HighestProfit from "@/models/highestProfit";
import HighestMultiplier from "@/models/highestMultiplier";
import HighestLoss from "@/models/highestLoss";

const recordMap = {
  profit: { model: HighestProfit, field: "profit" },
  multiplier: { model: HighestMultiplier, field: "multiplier" },
  loss: { model: HighestLoss, field: "loss" },
} as const;

type RecordType = keyof typeof recordMap;

function getRecordType(value: unknown): RecordType | null {
  if (value === "profit" || value === "multiplier" || value === "loss") return value;
  return null;
}

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const type = getRecordType(url.searchParams.get("type"));
    const game = (url.searchParams.get("game") ?? "").trim();

    await connectMongoDB();

    const query = game ? { game } : {};

    if (type) {
      const { model } = recordMap[type];
      const items = await model.find(query).sort({ updatedAt: -1 }).lean();
      const res = NextResponse.json({ [type]: items });
      res.headers.set("Cache-Control", "no-store");
      return res;
    }

    const [profit, multiplier, loss] = await Promise.all([
      HighestProfit.find(query).sort({ updatedAt: -1 }).lean(),
      HighestMultiplier.find(query).sort({ updatedAt: -1 }).lean(),
      HighestLoss.find(query).sort({ updatedAt: -1 }).lean(),
    ]);

    const res = NextResponse.json({ profit, multiplier, loss });
    res.headers.set("Cache-Control", "no-store");
    return res;
  } catch (error) {
    console.error("Error fetching records (admin):", error);
    return NextResponse.json({ message: "Error fetching records" }, { status: 500 });
  }
}

export async function PATCH(req: Request) {
  try {
    const body = await req.json();
    const type = getRecordType(body?.type);
    const game = typeof body?.game === "string" ? body.game.trim() : "";
    const username = typeof body?.username === "string" ? body.username.trim() : "";
    const value = typeof body?.value === "number" ? body.value : null;

    if (!type || !game || !username || value === null) {
      return NextResponse.json({ message: "Invalid payload" }, { status: 400 });
    }

    await connectMongoDB();

    const { model, field } = recordMap[type];

    const item = await model.findOneAndUpdate(
      { game },
      { $set: { game, username, [field]: value } },
      { new: true, upsert: true }
    );

    const res = NextResponse.json({ item });
    res.headers.set("Cache-Control", "no-store");
    return res;
  } catch (error) {
    console.error("Error updating record (admin):", error);
    return NextResponse.json({ message: "Error updating record" }, { status: 500 });
  }
}

export async function DELETE(req: Request) {
  try {
    const body = await req.json();
    const type = getRecordType(body?.type);
    const game = typeof body?.game === "string" ? body.game.trim() : "";

    if (!type || !game) {
      return NextResponse.json({ message: "Invalid payload" }, { status: 400 });
    }

    await connectMongoDB();

    const { model } = recordMap[type];
    await model.deleteOne({ game });

    const res = NextResponse.json({ success: true });
    res.headers.set("Cache-Control", "no-store");
    return res;
  } catch (error) {
    console.error("Error deleting record (admin):", error);
    return NextResponse.json({ message: "Error deleting record" }, { status: 500 });
  }
}
