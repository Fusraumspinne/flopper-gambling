import { NextResponse } from "next/server";
import { connectMongoDB } from "@/lib/mongodb";
import Gift from "@/models/gift";

function requireAdmin(req: Request): NextResponse | null {
  return null;
}

export async function GET(req: Request) {
  try {
    const auth = requireAdmin(req);
    if (auth) return auth;

    const url = new URL(req.url);
    const q = (url.searchParams.get("q") ?? "").trim();

    await connectMongoDB();

    const filter = q
      ? { $or: [{ sender: new RegExp(q, "i") }, { recipient: new RegExp(q, "i") }] }
      : {};

    const gifts = await Gift.find(filter).sort({ updatedAt: -1 }).lean();

    const res = NextResponse.json({ gifts });
    res.headers.set("Cache-Control", "no-store");
    return res;
  } catch (error) {
    console.error("Error fetching gifts (admin):", error);
    return NextResponse.json({ message: "Error fetching gifts" }, { status: 500 });
  }
}

export async function PATCH(req: Request) {
  try {
    const auth = requireAdmin(req);
    if (auth) return auth;

    const body = await req.json();
    const id = typeof body?.id === "string" ? body.id : null;
    const sender = typeof body?.sender === "string" ? body.sender.trim() : null;
    const recipient = typeof body?.recipient === "string" ? body.recipient.trim() : null;
    const amount = typeof body?.amount === "number" && Number.isFinite(body.amount) ? body.amount : null;

    if (!id || amount === null || amount < 0) {
      return NextResponse.json({ message: "Invalid payload" }, { status: 400 });
    }

    await connectMongoDB();

    const update: Record<string, any> = {};
    if (sender) update.sender = sender;
    if (recipient) update.recipient = recipient;

    await connectMongoDB();

    const giftDoc = await Gift.findById(id);
    if (!giftDoc) return NextResponse.json({ message: "Gift not found" }, { status: 404 });

    if (sender) giftDoc.sender = sender;
    if (recipient) giftDoc.recipient = recipient;
    giftDoc.amount = typeof amount === 'number' ? amount : giftDoc.amount;

    try {
      const saved = await giftDoc.save();
      const res = NextResponse.json({ gift: saved });
      res.headers.set("Cache-Control", "no-store");
      return res;
    } catch (err) {
      console.error('Gift save failed, falling back to atomic update:', err);
      if (Object.keys(update).length) update.amount = amount;
      const gift = await Gift.findOneAndUpdate({ _id: id }, { $set: update }, { new: true });
      if (!gift) return NextResponse.json({ message: "Gift not found" }, { status: 404 });
      const res = NextResponse.json({ gift });
      res.headers.set("Cache-Control", "no-store");
      return res;
    }
  } catch (error) {
    console.error("Error updating gift (admin):", error);
    return NextResponse.json({ message: "Error updating gift" }, { status: 500 });
  }
}

export async function DELETE(req: Request) {
  try {
    const auth = requireAdmin(req);
    if (auth) return auth;

    const body = await req.json();
    const id = typeof body?.id === "string" ? body.id : null;

    if (!id) {
      return NextResponse.json({ message: "Invalid payload" }, { status: 400 });
    }

    await connectMongoDB();

    await Gift.deleteOne({ _id: id });

    const res = NextResponse.json({ success: true });
    res.headers.set("Cache-Control", "no-store");
    return res;
  } catch (error) {
    console.error("Error deleting gift (admin):", error);
    return NextResponse.json({ message: "Error deleting gift" }, { status: 500 });
  }
}
