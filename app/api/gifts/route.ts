import { NextResponse } from "next/server";
import { connectMongoDB } from "@/lib/mongodb";
import Gift from "@/models/gift";
import User from "@/models/user";

function normalizeMoney(value: number): number {
  if (!Number.isFinite(value)) return 0;
  const rounded = Math.round((value + Number.EPSILON) * 100) / 100;
  return Object.is(rounded, -0) ? 0 : rounded;
}

function escapeRegex(str: string) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export async function POST(req: Request) {
  try {
    const { sender, recipient, amount } = await req.json();

    if (typeof sender !== "string" || typeof recipient !== "string") {
      return NextResponse.json({ message: "Invalid sender/recipient" }, { status: 400 });
    }

    const senderName = sender.trim();
    const recipientName = recipient.trim();
    const amt = normalizeMoney(Number(amount));

    if (!senderName || !recipientName) {
      return NextResponse.json({ message: "Invalid sender/recipient" }, { status: 400 });
    }
    if (senderName === recipientName) {
      return NextResponse.json({ message: "Cannot gift to yourself" }, { status: 400 });
    }
    if (amt <= 0) {
      return NextResponse.json({ message: "Invalid amount" }, { status: 400 });
    }

    await connectMongoDB();

    const recipientQuery = { name: { $regex: `^${escapeRegex(recipientName)}$`, $options: "i" } };
    const recipientUser = await User.findOne(recipientQuery);
    if (!recipientUser) {
      return NextResponse.json({ message: "Recipient not found" }, { status: 404 });
    }

    let senderUser = null as any;
    if (senderName !== "Unknown") {
      const senderQuery = { name: { $regex: `^${escapeRegex(senderName)}$`, $options: "i" } };
      senderUser = await User.findOne(senderQuery);
      if (!senderUser) {
        return NextResponse.json({ message: "Sender not found" }, { status: 404 });
      }

      const senderTotal = typeof senderUser.balance === "number" ? normalizeMoney(senderUser.balance) : 0;
      if (senderTotal - amt < 5000) {
        return NextResponse.json({ message: "Must keep at least 5000" }, { status: 400 });
      }

      const updated = await User.findOneAndUpdate(
        { _id: senderUser._id, balance: { $gte: amt + 5000 } },
        { $inc: { balance: -amt } },
        { new: true }
      );

      if (!updated) {
        return NextResponse.json({ message: "Not enough funds" }, { status: 400 });
      }
    }

    const created = await Gift.create({ sender: senderName, recipient: recipientName, amount: amt });
    const res = NextResponse.json({ gift: created }, { status: 201 });
    res.headers.set("Cache-Control", "no-store");
    return res;
  } catch (error) {
    console.error("Error creating gift:", error);
    return NextResponse.json({ message: "Error creating gift" }, { status: 500 });
  }
}

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const recipient = (url.searchParams.get("recipient") ?? "").trim();
    if (!recipient) {
      return NextResponse.json({ message: "Missing recipient" }, { status: 400 });
    }

    await connectMongoDB();
    const gifts = await Gift.find({ recipient }).sort({ createdAt: 1 });
    const res = NextResponse.json(gifts);
    res.headers.set("Cache-Control", "private, no-store");
    return res;
  } catch (error) {
    console.error("Error fetching gifts:", error);
    return NextResponse.json({ message: "Error fetching gifts" }, { status: 500 });
  }
}
