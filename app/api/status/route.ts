import { NextResponse } from "next/server";
import WebsiteStatus from "@/models/websiteStatus";
import { getWebsiteStatus } from "@/lib/websiteStatus";
import { connectMongoDB } from "@/lib/mongodb";
import { DEFAULT_GAME_STATUS, GAME_STATUS_KEYS } from "@/lib/gameStatus";

function requireAdmin(req: Request): NextResponse | null {
  // Admin auth disabled: allow access from client-side gated admin UI only
  return null;
}

function sanitizeGames(input: Record<string, unknown> | null | undefined) {
  const games: Record<string, boolean> = { ...DEFAULT_GAME_STATUS };
  if (!input) return games;
  for (const key of GAME_STATUS_KEYS) {
    if (typeof input[key] === "boolean") {
      games[key] = input[key] as boolean;
    }
  }
  return games;
}

export async function GET() {
  try {
    const status = await getWebsiteStatus();
    const res = NextResponse.json(status);
    res.headers.set("Cache-Control", "no-store");
    return res;
  } catch (error) {
    console.error("Error fetching website status:", error);
    return NextResponse.json({ message: "Error fetching status" }, { status: 500 });
  }
}

export async function PATCH(req: Request) {
  try {
    const auth = requireAdmin(req);
    if (auth) return auth;

    const body = await req.json();
    const nextMaintenance = typeof body?.isMaintenance === "boolean" ? body.isMaintenance : undefined;
    const nextPaused = typeof body?.isPaused === "boolean" ? body.isPaused : undefined;
    const nextGames = sanitizeGames(body?.games ?? null);

    await connectMongoDB();

    const update: Record<string, any> = {
      $set: {
        games: nextGames,
      },
    };

    if (typeof nextMaintenance === "boolean") update.$set.isMaintenance = nextMaintenance;
    if (typeof nextPaused === "boolean") update.$set.isPaused = nextPaused;

    const status = await WebsiteStatus.findOneAndUpdate({}, update, {
      new: true,
      upsert: true,
    });

    const res = NextResponse.json({
      isMaintenance: !!status.isMaintenance,
      isPaused: !!status.isPaused,
      games: status.games?.toObject?.() ?? status.games ?? nextGames,
    });
    res.headers.set("Cache-Control", "no-store");
    return res;
  } catch (error) {
    console.error("Error updating website status:", error);
    return NextResponse.json({ message: "Error updating status" }, { status: 500 });
  }
}
