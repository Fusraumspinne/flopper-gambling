import { NextResponse } from "next/server";
import { connectMongoDB } from "@/lib/mongodb";
import HighestProfit from "@/models/highestProfit";
import HighestMultiplier from "@/models/highestMultiplier";
import HighestLoss from "@/models/highestLoss";

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const game = (url.searchParams.get("game") ?? "").trim();

    if (!game) {
      return NextResponse.json({ message: "Missing game" }, { status: 400 });
    }

    await connectMongoDB();

    const [profitDoc, multiDoc, lossDoc] = await Promise.all([
      HighestProfit.findOne({ game }).lean(),
      HighestMultiplier.findOne({ game }).lean(),
      HighestLoss.findOne({ game }).lean(),
    ]);

    const res = NextResponse.json({
      game,
      highestProfit: profitDoc ? { username: profitDoc.username, profit: profitDoc.profit } : null,
      highestMultiplier: multiDoc ? { username: multiDoc.username, multiplier: multiDoc.multiplier } : null,
      highestLoss: lossDoc ? { username: lossDoc.username, loss: lossDoc.loss } : null,
    });

    res.headers.set("Cache-Control", "public, s-maxage=60, stale-while-revalidate=300");
    return res;
  } catch (error) {
    console.error("Error fetching highscores:", error);
    return NextResponse.json({ message: "Error fetching highscores" }, { status: 500 });
  }
}
