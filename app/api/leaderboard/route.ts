import { NextResponse } from "next/server";
import { connectMongoDB } from "@/lib/mongodb";
import User from "@/models/user";

export async function GET() {
  try {
    await connectMongoDB();
    // return all users sorted by balance desc; client will paginate 10 per page
    const users = await User.find().sort({ balance: -1 });
    return NextResponse.json(users);
  } catch (error) {
    return NextResponse.json({ message: "Error fetching leaderboard" }, { status: 500 });
  }
}
