import { NextResponse } from "next/server";
import { connectMongoDB } from "@/lib/mongodb";
import Gift from "@/models/gift";

function normalizeMoney(value: number): number {
  if (!Number.isFinite(value)) return 0;
  const rounded = Math.round((value + Number.EPSILON) * 100) / 100;
  return Object.is(rounded, -0) ? 0 : rounded;
}

export async function POST(req: Request) {
  try {
    const { recipient } = await req.json();
    if (typeof recipient !== "string" || !recipient.trim()) {
      return NextResponse.json({ message: "Invalid recipient" }, { status: 400 });
    }

    const recipientName = recipient;

    await connectMongoDB();

    const gifts = await Gift.find({ recipient: recipientName });
    if (!gifts.length) {
      return NextResponse.json({ total: 0, senders: [] });
    }

    const total = normalizeMoney(gifts.reduce((sum, g) => sum + (typeof g.amount === "number" ? g.amount : 0), 0));
    const senders = Array.from(new Set(gifts.map((g) => g.sender).filter(Boolean)));

    await Gift.deleteMany({ recipient: recipientName });

    const res = NextResponse.json({ total, senders });
    res.headers.set("Cache-Control", "private, no-store");
    return res;
  } catch (error) {
    console.error("Error claiming gifts:", error);
    return NextResponse.json({ message: "Error claiming gifts" }, { status: 500 });
  }
}
