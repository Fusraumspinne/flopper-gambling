import { NextResponse } from "next/server";
import { connectMongoDB } from "@/lib/mongodb";
import User from "@/models/user";
import HighestProfit from "@/models/highestProfit";
import HighestMultiplier from "@/models/highestMultiplier";
import HighestLoss from "@/models/highestLoss";
import Gift from "@/models/gift";

function normalizeMoney(value: number): number {
  if (!Number.isFinite(value)) return 0;
  const rounded = Math.round((value + Number.EPSILON) * 100) / 100;
  return Object.is(rounded, -0) ? 0 : rounded;
}

function computeInvestmentValue(principal: number, startedAtMs: number, nowMs: number): number {
  if (!Number.isFinite(principal) || principal <= 0) return 0;
  const HOUR_MS = 60 * 60 * 1000;
  const RATE_PER_HOUR = 0.01;
  const cappedPrincipal = Math.min(principal, 100000);
  const nonInterestPrincipal = principal - cappedPrincipal;
  const elapsedMs = Math.max(0, nowMs - startedAtMs);
  const hours = elapsedMs / HOUR_MS;
  const interestValue = cappedPrincipal * (1 + RATE_PER_HOUR * hours);
  return normalizeMoney(interestValue + nonInterestPrincipal);
}

function sanitizeInvestment(input: any) {
  if (!input || typeof input !== "object") return undefined;
  const principal = Number(input.principal);
  const startedAtMs = Number(input.startedAtMs);
  if (!Number.isFinite(principal) || !Number.isFinite(startedAtMs)) return undefined;
  return {
    principal: normalizeMoney(principal),
    startedAtMs: Math.floor(startedAtMs),
  };
}

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const name = searchParams.get("name");
    if (!name) {
      return NextResponse.json({ message: "Invalid name" }, { status: 400 });
    }

    await connectMongoDB();
    const user = await User.findOne({ name: name.trim() });
    if (!user) {
      return NextResponse.json({ message: "User not found" }, { status: 404 });
    }

    const nowMs = Date.now();
    const rawPrincipal = typeof user.invest === "number" ? user.invest : 0;
    const rawStartedAtMs =
      typeof user.lastCheckedInvest === "number" && Number.isFinite(user.lastCheckedInvest)
        ? user.lastCheckedInvest
        : nowMs;
    const computedInvestment = computeInvestmentValue(rawPrincipal, rawStartedAtMs, nowMs);

    if (computedInvestment !== rawPrincipal || rawStartedAtMs !== nowMs) {
      const investmentDelta = normalizeMoney(computedInvestment - rawPrincipal);
      const update: Record<string, any> = { $set: { lastCheckedInvest: nowMs } };
      if (investmentDelta !== 0) update.$inc = { invest: investmentDelta };
      await User.updateOne({ name: user.name }, update);
    }

    const res = NextResponse.json({
      name: user.name,
      balance: typeof user.balance === "number" ? user.balance : 0,
      lastDailyReward: user.lastDailyReward ? new Date(user.lastDailyReward).getTime() : 0,
      weeklyPayback: typeof user.weeklyPayback === "number" ? user.weeklyPayback : 0,
      lastWeeklyPayback: user.lastWeeklyPayback ? new Date(user.lastWeeklyPayback).getTime() : 0,
      lastPot: user.lastWeeklyPayback ? new Date(user.lastWeeklyPayback).getTime() : 0,
      investment: {
        principal: computedInvestment,
        startedAtMs: nowMs,
      },
    });
    res.headers.set("Cache-Control", "private, no-store");
    return res;
  } catch (error) {
    console.error("Error fetching user:", error);
    return NextResponse.json({ message: "Error fetching user" }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const {
      name,
      balance,
      balanceDelta,
      weeklyPayback,
      weeklyPaybackDelta,
      lastDailyReward,
      lastWeeklyPayback,
      lastPot,
      investment,
      investmentDelta,
      createOnly,
    } = body ?? {};
    if (typeof name !== "string") {
      return NextResponse.json({ message: "Invalid name" }, { status: 400 });
    }

    await connectMongoDB();

    const userBefore = await User.findOne({ name });
    const nowMs = Date.now();

    if (createOnly) {
      if (userBefore) {
        return NextResponse.json({ message: "Name already exists" }, { status: 409 });
      }
      const now = new Date();
      const sanitizedInvestment = sanitizeInvestment(investment);
      const principal = sanitizedInvestment?.principal ?? 0;
      const startedAtMs = sanitizedInvestment?.startedAtMs ?? nowMs;
      const createdLastWeeklyPayback =
        typeof lastWeeklyPayback === "number"
          ? new Date(lastWeeklyPayback)
          : typeof lastPot === "number"
            ? new Date(lastPot)
            : now;
      const created = await User.create({
        name,
        password: "",
        balance: 0,
        invest: principal,
        lastCheckedInvest: startedAtMs,
        lastDailyReward: now,
        weeklyPayback: 0,
        lastWeeklyPayback: createdLastWeeklyPayback,
      });
      return NextResponse.json(created, { status: 201 });
    }

    const update: Record<string, any> = {};
    const inc: Record<string, number> = {};
    const set: Record<string, any> = {};

    if (typeof balance === "number") {
      return NextResponse.json(
        { message: "Send balanceDelta instead of absolute balance" },
        { status: 400 }
      );
    }
    if (typeof balanceDelta === "number") inc.balance = normalizeMoney(balanceDelta);
    if (typeof weeklyPayback === "number") {
      return NextResponse.json(
        { message: "Send weeklyPaybackDelta instead of absolute weeklyPayback" },
        { status: 400 }
      );
    } else if (typeof weeklyPaybackDelta === "number") {
      inc.weeklyPayback = normalizeMoney(weeklyPaybackDelta);
    }
    if (typeof lastDailyReward === "number" && Number.isFinite(lastDailyReward)) {
      set.lastDailyReward = new Date(lastDailyReward);
    }
    if (typeof lastWeeklyPayback === "number" && Number.isFinite(lastWeeklyPayback)) {
      set.lastWeeklyPayback = new Date(lastWeeklyPayback);
    }
    if (investment) {
      return NextResponse.json(
        { message: "Send investmentDelta instead of absolute investment" },
        { status: 400 }
      );
    }
    if (typeof investmentDelta === "number") {
      inc.invest = normalizeMoney(investmentDelta);
      set.lastCheckedInvest = nowMs;
    } else if (userBefore) {
      const rawPrincipal = typeof userBefore.invest === "number" ? userBefore.invest : 0;
      const rawStartedAtMs =
        typeof userBefore.lastCheckedInvest === "number" && Number.isFinite(userBefore.lastCheckedInvest)
          ? userBefore.lastCheckedInvest
          : nowMs;
      const computedInvestment = computeInvestmentValue(rawPrincipal, rawStartedAtMs, nowMs);

      if (computedInvestment !== rawPrincipal || rawStartedAtMs !== nowMs) {
        const investmentDelta = normalizeMoney(computedInvestment - rawPrincipal);
        if (investmentDelta !== 0) inc.invest = investmentDelta;
        set.lastCheckedInvest = nowMs;
      }
    }
    if (
      typeof lastPot === "number" &&
      Number.isFinite(lastPot) &&
      typeof lastWeeklyPayback !== "number"
    ) {
      set.lastWeeklyPayback = new Date(lastPot);
    }

    if (Object.keys(inc).length) update.$inc = inc;
    if (Object.keys(set).length) update.$set = set;

    const user = Object.keys(update).length
      ? await User.findOneAndUpdate({ name }, update, { new: true, upsert: true })
      : await User.findOne({ name });

    const updates: Array<{ game: unknown; profit?: unknown; multi?: unknown; loss?: unknown }> =
      Array.isArray(body?.updates)
        ? body.updates
        : typeof body?.game === "string" && body.game.trim()
          ? [{ game: body.game, profit: body.profit, multi: body.multi, loss: body.loss }]
          : [];

    for (const rawUpd of updates) {
      const gameRaw = typeof rawUpd?.game === "string" ? rawUpd.game.trim() : "";
      if (!gameRaw || gameRaw === "unknown") continue;

      const multiValue = typeof rawUpd?.multi === "number" ? normalizeMoney(rawUpd.multi) : null;
      const profitValue = typeof rawUpd?.profit === "number" ? normalizeMoney(rawUpd.profit) : null;
      const lossValue = typeof rawUpd?.loss === "number" ? normalizeMoney(rawUpd.loss) : null;

      const scoreValue = profitValue ?? 0;

      const ops: Promise<any>[] = [];

      if (scoreValue > 0) {
        ops.push(
          HighestProfit.findOneAndUpdate(
            { game: gameRaw, profit: { $lt: scoreValue } },
            { game: gameRaw, username: name, profit: scoreValue },
            { upsert: true, new: true }
          ).catch((err: any) => {
             if (err.code !== 11000) {
                 console.error("HighestProfit update error:", err);
             }
          })
        );
      }

      if (multiValue !== null && multiValue > 0) {
        ops.push(
          HighestMultiplier.findOneAndUpdate(
            { game: gameRaw, multiplier: { $lt: multiValue } },
            { game: gameRaw, username: name, multiplier: multiValue },
            { upsert: true, new: true }
          ).catch((err: any) => {
             if (err.code !== 11000) {
                console.error("HighestMultiplier update error:", err);
             }
          })
        );
      }

      if (lossValue !== null && lossValue > 0) {
        ops.push(
          HighestLoss.findOneAndUpdate(
            { game: gameRaw, loss: { $lt: lossValue } },
            { game: gameRaw, username: name, loss: lossValue },
            { upsert: true, new: true }
          ).catch((err: any) => {
             if (err.code !== 11000) {
                console.error("HighestLoss update error:", err);
             }
          })
        );
      }

      if (ops.length) await Promise.all(ops);
    }

    const res = NextResponse.json(user ?? { name });
    res.headers.set("Cache-Control", "private, no-store");
    return res;
  } catch (error) {
    console.error("Error updating user:", error);
    return NextResponse.json({ message: "Error updating user" }, { status: 500 });
  }
}

export async function PATCH(req: Request) {
  try {
    const { oldName, newName } = await req.json();
    if (typeof oldName !== "string" || typeof newName !== "string") {
      return NextResponse.json({ message: "Invalid name" }, { status: 400 });
    }

    const from = oldName.trim();
    const to = newName.trim();
    if (!from || !to) {
      return NextResponse.json({ message: "Invalid name" }, { status: 400 });
    }
    if (from === to) {
      return NextResponse.json({ message: "No changes" }, { status: 200 });
    }

    await connectMongoDB();

    const existing = await User.findOne({ name: to });
    if (existing) {
      return NextResponse.json({ message: "Name already exists" }, { status: 409 });
    }

    const updated = await User.findOneAndUpdate(
      { name: from },
      { name: to },
      { new: true }
    );

    if (!updated) {
      return NextResponse.json({ message: "User not found" }, { status: 404 });
    }

    await Promise.all([
      HighestProfit.updateMany({ name: from }, { name: to }),
      HighestMultiplier.updateMany({ name: from }, { name: to }),
      HighestLoss.updateMany({ name: from }, { name: to }),
      Gift.updateMany({ sender: from }, { sender: to }),
      Gift.updateMany({ recipient: from }, { recipient: to }),
    ]);

    const res = NextResponse.json(updated);
    res.headers.set("Cache-Control", "private, no-store");
    return res;
  } catch (error: any) {
    if (error?.code === 11000) {
      return NextResponse.json({ message: "Name already exists" }, { status: 409 });
    }
    console.error("Error renaming user:", error);
    return NextResponse.json({ message: "Error renaming user" }, { status: 500 });
  }
}