import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { GAME_ROUTE_TO_KEY } from "./lib/gameStatus";

export async function middleware(req: NextRequest) {
  try {
    const pathname = req.nextUrl.pathname.replace(/\/+$/, "");
    const parts = pathname.split("/").filter(Boolean);
    const baseRoute = parts.length ? `/${parts[0]}` : "/";

    const gameKey = GAME_ROUTE_TO_KEY[baseRoute];
    if (!gameKey) return NextResponse.next();

    const statusUrl = new URL("/api/status", req.nextUrl.origin);
    const res = await fetch(statusUrl.toString(), {
      headers: { "x-middleware": "1" },
    });
    if (!res.ok) return NextResponse.next();
    const json = await res.json();
    if (json?.games && json.games[gameKey] === false) {
      return NextResponse.rewrite(new URL("/", req.url));
    }
  } catch (e) {
    return NextResponse.next();
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    "/((?!login|signup|privacy|api|_next/static|_next/image|images|favicon.ico).*)",
  ],
};
