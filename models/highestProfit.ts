import mongoose, { Schema, models } from "mongoose";

const highestProfitSchema = new Schema(
  {
    game: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },
    username: {
      type: String,
      required: true,
      index: true,
    },
    profit: {
      type: Number,
      required: true,
      min: 0,
      set: (v: number) => Math.round((v + Number.EPSILON) * 100) / 100,
    },
  },
  { timestamps: true }
);

const HighestProfit = models.HighestProfit || mongoose.model("HighestProfit", highestProfitSchema);
export default HighestProfit;
