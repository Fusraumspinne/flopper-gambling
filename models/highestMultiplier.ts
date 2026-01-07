import mongoose, { Schema, models } from "mongoose";

const highestMultiplierSchema = new Schema(
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
    multiplier: {
      type: Number,
      required: true,
      min: 0,
    },
  },
  { timestamps: true }
);

const HighestMultiplier = models.HighestMultiplier || mongoose.model("HighestMultiplier", highestMultiplierSchema);
export default HighestMultiplier;
