import mongoose, { Schema, models } from "mongoose";

const highestLossSchema = new Schema(
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
    loss: {
      type: Number,
      required: true,
      min: 0,
      set: (v: number) => Math.round((v + Number.EPSILON) * 100) / 100,
    },
  },
  { timestamps: true }
);

const HighestLoss = models.HighestLoss || mongoose.model("HighestLoss", highestLossSchema);
export default HighestLoss;
