import { NextResponse } from "next/server";
import { connectMongoDB } from "@/lib/mongodb";
import User from "@/models/user";

export async function POST(req: Request) {
  try {
    const { name, balance, createOnly } = await req.json();
    if (typeof name !== "string") {
      return NextResponse.json({ message: "Invalid name" }, { status: 400 });
    }

    await connectMongoDB();

    // If createOnly is true, try to create a new user but fail if name exists
    if (createOnly) {
      const existing = await User.findOne({ name });
      if (existing) {
        return NextResponse.json({ message: "Name already exists" }, { status: 409 });
      }
      const created = await User.create({ name, balance: typeof balance === 'number' ? balance : 0 });
      return NextResponse.json(created, { status: 201 });
    }

    // Default: update (or create) user's balance
    const user = await User.findOneAndUpdate(
      { name },
      { balance },
      { new: true, upsert: true }
    );

    return NextResponse.json(user);
  } catch (error) {
    console.error("Error updating user:", error);
    return NextResponse.json({ message: "Error updating user" }, { status: 500 });
  }
}
