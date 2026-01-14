import { NextResponse } from "next/server";
import { connectMongoDB } from "@/lib/mongodb";
import User from "@/models/user";

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    await connectMongoDB();
    const users = await User.find().sort({ balance: -1 });
    const res = NextResponse.json(users);
    res.headers.set("Cache-Control", "no-store, max-age=0");
    return res;
  } catch (error) {
    return NextResponse.json({ message: "Error fetching leaderboard" }, { status: 500 });
  }
}
