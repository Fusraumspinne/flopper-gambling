import { NextResponse } from "next/server";
import { connectMongoDB } from "@/lib/mongodb";
import Gift from "@/models/gift";
import User from "@/models/user";

function normalizeMoney(value: number): number {
  if (!Number.isFinite(value)) return 0;
  const rounded = Math.round((value + Number.EPSILON) * 100) / 100;
  return Object.is(rounded, -0) ? 0 : rounded;
}

export async function POST(req: Request) {
  try {
    const { sender, recipient, amount } = await req.json();

    if (typeof sender !== "string" || typeof recipient !== "string") {
      return NextResponse.json({ message: "Invalid sender/recipient" }, { status: 400 });
    }

    const senderName = sender;
    const recipientName = recipient;
    const amt = normalizeMoney(Number(amount));

    if (!senderName.trim() || !recipientName.trim()) {
      return NextResponse.json({ message: "Invalid sender/recipient" }, { status: 400 });
    }
    if (senderName === recipientName) {
      return NextResponse.json({ message: "Cannot gift to yourself" }, { status: 400 });
    }
    if (amt <= 0) {
      return NextResponse.json({ message: "Invalid amount" }, { status: 400 });
    }

    await connectMongoDB();

    const recipientUser = await User.findOne({ name: recipientName });
    if (!recipientUser) {
      return NextResponse.json({ message: "Recipient not found" }, { status: 404 });
    }

    let senderUser = null as any;
    let updatedSender: any = null;
    if (senderName !== "Unknown") {
      senderUser = await User.findOne({ name: senderName });
      if (!senderUser) {
        return NextResponse.json({ message: "Sender not found" }, { status: 404 });
      }

      try {
        if ((typeof senderUser.balance !== 'number' ? 0 : senderUser.balance) < amt) {
          return NextResponse.json({ message: "Not enough funds" }, { status: 400 });
        }
        senderUser.balance = normalizeMoney((typeof senderUser.balance === 'number' ? senderUser.balance : 0) - amt) as any;
        updatedSender = await senderUser.save();
      } catch (err) {
        console.error('Gift sender save failed, falling back to atomic update:', err);
        updatedSender = await User.findOneAndUpdate(
          { _id: senderUser._id, balance: { $gte: amt } },
          { $inc: { balance: -amt } },
          { new: true }
        );
      }

      if (!updatedSender) {
        return NextResponse.json({ message: "Not enough funds" }, { status: 400 });
      }
    }

    const created = await Gift.create({ sender: senderName, recipient: recipientName, amount: amt });
    const res = NextResponse.json({ gift: created, senderBalance: updatedSender ? normalizeMoney(updatedSender.balance) : null }, { status: 201 });
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
    const recipient = url.searchParams.get("recipient") ?? "";
    if (!recipient.trim()) {
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
