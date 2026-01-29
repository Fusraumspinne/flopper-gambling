import Link from "next/link";
import InvestmentPanel from "@/components/InvestmentPanel";
import Leaderboard from "@/components/Leaderboard";
import GiftPanel from "@/components/GiftPanel";
import WeeklyPotPanel from "@/components/WeeklyPotPanel";
import CryptoPanel from "@/components/CryptoPanel";
import { getWebsiteStatus } from "@/lib/websiteStatus";
import { getGameKeyFromHref } from "@/lib/gameStatus";
import GamesGrid from "@/components/GamesGrid";
import { games as gamesList } from "@/lib/games";

export default async function Home() {
  const status = await getWebsiteStatus();
  const allowedGames = gamesList.filter(
    (game) => status.games[getGameKeyFromHref(game.href)] === true
  ).map(g => g.href);

  return (
    <div className="p-8">
      <div className="mb-8">
        <h1 className="text-4xl sm:text-5xl font-extrabold bg-linear-to-r from-indigo-400 via-pink-400 to-yellow-300 bg-clip-text text-transparent mb-2">
          Flopper Gambling — Play Your Way
        </h1>
        <p className="text-[#b1bad3] text-lg">
          Welcome to Flopper Gambling — pick a game, chase the thrill, and cash
          out the moment luck smiles
        </p>
        <p className="text-sm text-[#557086] mt-2">
          Big wins • Climb the leaderboard • Play responsible • Website only for
          private use
        </p>
      </div>

      <InvestmentPanel />
      <CryptoPanel/>
      <Leaderboard />
      <GiftPanel />
      <WeeklyPotPanel />

      <GamesGrid initialAllowed={allowedGames} />
    </div>
  );
}
