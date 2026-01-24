import { connectMongoDB } from "@/lib/mongodb"
import User from "@/models/user"
import bcrypt from "bcryptjs"
import { NextResponse } from "next/server"

export async function POST(req: any){
    try{
        const { name, password } = await req.json()

        const hashedPassword = await bcrypt.hash(password, 10)
        const now = new Date();

        await connectMongoDB()

        await User.create({
            name,
            password: hashedPassword,
            balance: 1000,
            invest: 0,
            lastDailyReward: now,
            weeklyPayback: 0,
            lastWeeklyPayback: now,
        });

        return NextResponse.json({ message: "User signed up" }, { status: 201 } )
    } catch (err){
        return NextResponse.json({ message: "Error ocurred while signing up" }, { status: 500 } )
    }
}