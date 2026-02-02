import { connectMongoDB } from "@/lib/mongodb"
import User from "@/models/user"
import bcrypt from "bcryptjs"
import { NextResponse } from "next/server"

function normalizeMoney(value: number): number {
    if (!Number.isFinite(value)) return 0;
    const rounded = Math.round((value + Number.EPSILON) * 100) / 100;
    return Object.is(rounded, -0) ? 0 : rounded;
}

export async function POST(req: any){
    try{
        const { name, password } = await req.json()

        const hashedPassword = await bcrypt.hash(password, 10)
        const now = new Date();

        await connectMongoDB()

        await User.create({
            name,
            password: hashedPassword,
            balance: normalizeMoney(10000),
            invest: normalizeMoney(0),
            lastCheckedInvest: Date.now(),
            lastDailyReward: now,
            weeklyPayback: normalizeMoney(0),
            lastWeeklyPayback: now,
            btcHoldings: 0,
            btcCostUsd: 0,
        });

        return NextResponse.json({ message: "User signed up" }, { status: 201 } )
    } catch (err){
        return NextResponse.json({ message: "Error ocurred while signing up" }, { status: 500 } )
    }
}