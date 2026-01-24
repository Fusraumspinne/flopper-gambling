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
    },
    invest: {
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
    },
    lastWeeklyPayback: {
      type: Date,
      required: true,
    },
  },
  { timestamps: true }
)

const User = models.User || mongoose.model("User", userSchema)
export default User