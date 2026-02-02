import mongoose, { Schema, models } from "mongoose";
import { GAME_STATUS_KEYS } from "@/lib/gameStatus";

const gameFields: Record<string, { type: BooleanConstructor; default: boolean }> = {};
for (const key of GAME_STATUS_KEYS) {
  gameFields[key] = { type: Boolean, default: true };
}

const gamesSchema = new Schema(gameFields, { _id: false });

const websiteStatusSchema = new Schema(
  {
    isMaintenance: {
      type: Boolean,
      default: false,
    },
    isPaused: {
      type: Boolean,
      default: false,
    },
    isSeasonBreak: {
      type: Boolean,
      default: false,
    },
    games: {
      type: gamesSchema,
      default: () => ({}),
    },
  },
  { timestamps: true }
);

const WebsiteStatus = models.WebsiteStatus || mongoose.model("WebsiteStatus", websiteStatusSchema);
export default WebsiteStatus;
