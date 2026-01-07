import mongoose, { Schema, models } from "mongoose";

const giftSchema = new Schema(
  {
    sender: {
      type: String,
      required: true,
      index: true,
    },
    recipient: {
      type: String,
      required: true,
      index: true,
    },
    amount: {
      type: Number,
      required: true,
      min: 0,
    },
  },
  { timestamps: true }
);

const Gift = models.Gift || mongoose.model("Gift", giftSchema);
export default Gift;
