import { connectMongoDB } from "@/lib/mongodb";
import WebsiteStatus from "@/models/websiteStatus";
import { DEFAULT_GAME_STATUS, GAME_STATUS_KEYS } from "@/lib/gameStatus";

export type WebsiteStatusPayload = {
  isMaintenance: boolean;
  isPaused: boolean;
  isSeasonBreak: boolean;
  games: Record<string, boolean>;
};

function coerceBoolean(value: unknown, fallback: boolean): boolean {
  return typeof value === "boolean" ? value : fallback;
}

export async function getWebsiteStatus(): Promise<WebsiteStatusPayload> {
  await connectMongoDB();
  let status = await WebsiteStatus.findOne();

  if (!status) {
    status = await WebsiteStatus.create({
      isMaintenance: false,
      isPaused: false,
      isSeasonBreak: false,
      games: DEFAULT_GAME_STATUS,
    });
  }

  const rawGames = status.games?.toObject?.() ?? status.games ?? {};
  const games: Record<string, boolean> = { ...DEFAULT_GAME_STATUS };
  for (const key of GAME_STATUS_KEYS) {
    games[key] = coerceBoolean(rawGames[key], true);
  }

  const isMaintenance = coerceBoolean(status.isMaintenance, false);
  const isPaused = coerceBoolean(status.isPaused, false);
  const isSeasonBreak = coerceBoolean(status.isSeasonBreak, false);

  return {
    isMaintenance,
    isPaused,
    isSeasonBreak,
    games,
  };
}
