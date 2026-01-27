import { NextResponse } from "next/server";
import { connectMongoDB } from "@/lib/mongodb";
import User from "@/models/user";

function normalizeMoney(value: number): number {
  if (!Number.isFinite(value)) return 0;
  const rounded = Math.round((value + Number.EPSILON) * 100) / 100;
  return Object.is(rounded, -0) ? 0 : rounded;
}

export async function POST(req: Request) {
  try {
    const { name, clientPrice } = await req.json();
    if (typeof name !== 'string' || !name.trim()) return NextResponse.json({ message: 'Invalid name' }, { status: 400 });
    const cp = clientPrice !== undefined ? Number(clientPrice) : NaN;
    if (!Number.isFinite(cp) || cp <= 0) return NextResponse.json({ message: 'Invalid clientPrice' }, { status: 400 });

    await connectMongoDB();
    const user = await User.findOne({ name: name.trim() });
    if (!user) return NextResponse.json({ message: 'User not found' }, { status: 404 });

    const btcHoldings = typeof user.btcHoldings === 'number' ? user.btcHoldings : 0;
    const portfolioUsd = normalizeMoney(Number(btcHoldings || 0) * cp);

    const updated = await User.findByIdAndUpdate(user._id, { $set: { portfolioUsd } }, { new: true });
    if (!updated) return NextResponse.json({ message: 'Failed to update' }, { status: 500 });

    const res = NextResponse.json({ success: true, portfolioUsd: updated.portfolioUsd });
    res.headers.set('Cache-Control', 'private, no-store');
    return res;
  } catch (error) {
    console.error('/api/crypto/portfolio error', error);
    return NextResponse.json({ message: 'Internal error' }, { status: 500 });
  }
}
