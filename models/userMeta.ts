import mongoose, { Schema, models } from "mongoose";

const userMetaSchema = new Schema(
  {
    name: {
      type: String,
      required: true,
      unique: true,
    },
    lastPot: {
      type: Date,
      default: () => new Date(),
    },
    investment: {
      principal: { type: Number, default: 0 },
      startedAtMs: { type: Number, default: () => Date.now() },
    },
  },
  { timestamps: true }
);

const UserMeta = models.UserMeta || mongoose.model("UserMeta", userMetaSchema);
export default UserMeta;
