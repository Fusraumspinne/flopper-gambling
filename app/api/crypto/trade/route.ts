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
    const { name, action, amount, clientPrice } = await req.json();
    if (typeof name !== "string" || !name.trim()) {
      return NextResponse.json({ message: "Invalid name" }, { status: 400 });
    }
    if (action !== "buy" && action !== "sell" && action !== "sell_all" && action !== "buy_all") {
      return NextResponse.json({ message: "Invalid action" }, { status: 400 });
    }

    const rawAmount = amount !== undefined ? normalizeMoney(Number(amount)) : 0;
    if (action === "buy") {
      if (!Number.isFinite(rawAmount) || rawAmount <= 0) {
        return NextResponse.json({ message: "Invalid amount" }, { status: 400 });
      }
    }

    const cp = clientPrice !== undefined ? Number(clientPrice) : NaN;
    if (!Number.isFinite(cp) || cp <= 0) {
      console.warn('/api/crypto/trade missing/invalid clientPrice', { name, action, amount, clientPrice });
      return NextResponse.json({ message: "clientPrice required" }, { status: 400 });
    }
    const price = cp;

    await connectMongoDB();

    const user = await User.findOne({ name: name.trim() });
    if (!user) return NextResponse.json({ message: "User not found" }, { status: 404 });

    if (action === "buy") {
      const balance = typeof user.balance === "number" ? user.balance : 0;
      if (rawAmount > balance) return NextResponse.json({ message: "Not enough balance" }, { status: 400 });

      const btcToAdd = rawAmount / price;

      const prevCostUsd = typeof user.btcCostUsd === 'number' ? user.btcCostUsd : 0;
      const newCostUsd = normalizeMoney(prevCostUsd + rawAmount);

      const updated = await User.findOneAndUpdate(
        { _id: user._id, balance: user.balance },
        { $inc: { balance: -rawAmount, btcHoldings: btcToAdd }, $set: { btcCostUsd: newCostUsd } },
        { new: true }
      );

      if (!updated) return NextResponse.json({ message: "State changed, retry" }, { status: 409 });

      // update portfolioUsd (cached) based on new holdings and client price
      const newPortfolio = normalizeMoney(Number(updated.btcHoldings || 0) * price);
      const finalUpdated = await User.findByIdAndUpdate(updated._id, { $set: { portfolioUsd: newPortfolio } }, { new: true });

      const res = NextResponse.json({ success: true, amount: rawAmount, price, balanceDelta: -rawAmount, btcHoldings: finalUpdated.btcHoldings, btcCostUsd: finalUpdated.btcCostUsd, portfolioUsd: finalUpdated.portfolioUsd });
      res.headers.set("Cache-Control", "private, no-store");
      return res;
    }
    

    if (action === "buy_all") {
      const balance = typeof user.balance === "number" ? user.balance : 0;
      if (!Number.isFinite(balance) || balance <= 0) return NextResponse.json({ message: "No balance to buy" }, { status: 400 });

      const btcToAdd = balance / price;
      const prevCostUsd = typeof user.btcCostUsd === 'number' ? user.btcCostUsd : 0;
      const newCostUsd = normalizeMoney(prevCostUsd + balance);

      const updatedAll = await User.findOneAndUpdate(
        { _id: user._id, balance: user.balance },
        { $set: { balance: 0, btcCostUsd: newCostUsd }, $inc: { btcHoldings: btcToAdd } },
        { new: true }
      );

      if (!updatedAll) return NextResponse.json({ message: "State changed, retry" }, { status: 409 });

      const newPortfolioAll = normalizeMoney(Number(updatedAll.btcHoldings || 0) * price);
      const finalUpdatedAll = await User.findByIdAndUpdate(updatedAll._id, { $set: { portfolioUsd: newPortfolioAll } }, { new: true });

      const res = NextResponse.json({ success: true, action: 'buy_all', price, amountUsd: -normalizeMoney(balance), balanceDelta: -normalizeMoney(balance), btcHoldings: finalUpdatedAll.btcHoldings, btcCostUsd: finalUpdatedAll.btcCostUsd, portfolioUsd: finalUpdatedAll.portfolioUsd });
      res.headers.set("Cache-Control", "private, no-store");
      return res;
    }

    if (action === "sell_all") {
      const btcHoldings = typeof user.btcHoldings === "number" ? user.btcHoldings : 0;
      if (!Number.isFinite(btcHoldings) || btcHoldings <= 0) return NextResponse.json({ message: "No BTC to sell" }, { status: 400 });

      const proceeds = btcHoldings * price;
      const normalizedProceeds = normalizeMoney(proceeds);

      const updatedAll = await User.findOneAndUpdate(
        { _id: user._id, btcHoldings: user.btcHoldings },
        { $inc: { balance: normalizedProceeds }, $set: { btcHoldings: 0, btcCostUsd: 0 } },
        { new: true }
      );

      if (!updatedAll) return NextResponse.json({ message: "State changed, retry" }, { status: 409 });

      // portfolio is now zero
      const finalUpdatedSellAll = await User.findByIdAndUpdate(updatedAll._id, { $set: { portfolioUsd: 0 } }, { new: true });

      const res = NextResponse.json({ success: true, action: 'sell_all', price, amountUsd: normalizedProceeds, balanceDelta: normalizedProceeds, btcHoldings: finalUpdatedSellAll.btcHoldings, btcCostUsd: finalUpdatedSellAll.btcCostUsd, portfolioUsd: finalUpdatedSellAll.portfolioUsd });
      res.headers.set("Cache-Control", "private, no-store");
      return res;
    }

    const btcHoldings = typeof user.btcHoldings === "number" ? user.btcHoldings : 0;
    const btcNeeded = rawAmount / price;
    if (btcNeeded > btcHoldings + 1e-12) return NextResponse.json({ message: "Not enough BTC to sell" }, { status: 400 });

    const prevCostUsd = typeof user.btcCostUsd === 'number' ? user.btcCostUsd : 0;
    let newCostUsd = prevCostUsd;
    if (btcHoldings > 0) {
      const proportionSold = Math.min(1, btcNeeded / btcHoldings);
      const costRemoved = normalizeMoney(prevCostUsd * proportionSold);
      newCostUsd = normalizeMoney(Math.max(0, prevCostUsd - costRemoved));
    }

    const updated = await User.findOneAndUpdate(
      { _id: user._id, btcHoldings: user.btcHoldings },
      { $inc: { balance: rawAmount, btcHoldings: -btcNeeded }, $set: { btcCostUsd: newCostUsd } },
      { new: true }
    );

    if (!updated) return NextResponse.json({ message: "State changed, retry" }, { status: 409 });

    const newPortfolioSell = normalizeMoney(Number(updated.btcHoldings || 0) * price);
    const finalUpdatedSell = await User.findByIdAndUpdate(updated._id, { $set: { portfolioUsd: newPortfolioSell } }, { new: true });

    const res = NextResponse.json({ success: true, amount: rawAmount, price, balanceDelta: rawAmount, btcHoldings: finalUpdatedSell.btcHoldings, btcCostUsd: finalUpdatedSell.btcCostUsd, portfolioUsd: finalUpdatedSell.portfolioUsd });
    res.headers.set("Cache-Control", "private, no-store");
    return res;
  } catch (error) {
    console.error("/api/crypto/trade error", error);
    return NextResponse.json({ message: "Internal error" }, { status: 500 });
  }
}
