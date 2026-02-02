import mongoose, { Schema, models } from "mongoose";

const userSchema = new Schema(
  {
    name: {
      type: String,
      required: true,
      unique: true,
    },
    password: {
      type: String,
      required: true,
    },
    balance: {
      type: Number,
      required: true,
      set: (v: number) => Math.round((v + Number.EPSILON) * 100) / 100,
    },
    invest: {
      type: Number,
      required: true,
      set: (v: number) => Math.round((v + Number.EPSILON) * 100) / 100,
    },
    lastCheckedInvest: {
      type: Number,
      required: true,
    },
    lastDailyReward: {
      type: Date,
      required: true,
    },
    weeklyPayback: {
      type: Number,
      required: true,
      set: (v: number) => Math.round((v + Number.EPSILON) * 100) / 100,
    },
    lastWeeklyPayback: {
      type: Date,
      required: true,
    },
    processedSyncs: {
      type: [String],
      default: [],
      select: false,
    }
    ,
    btcHoldings: {
      type: Number,
      required: true,
    }
    ,
    btcCostUsd: {
      type: Number,
      required: true,
      default: 0,
      set: (v: number) => Math.round((v + Number.EPSILON) * 100) / 100,
    }
    ,
    portfolioUsd: {
      type: Number,
      required: true,
      default: 0,
      set: (v: number) => Math.round((v + Number.EPSILON) * 100) / 100,
    }
    ,
    seasons: {
      type: [String],
      default: [],
    }
  },
  { timestamps: true }
)

const User = models.User || mongoose.model("User", userSchema)
export default User