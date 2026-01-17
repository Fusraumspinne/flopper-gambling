import Link from "next/link";
import InvestmentPanel from "@/components/InvestmentPanel";
import Leaderboard from "@/components/Leaderboard";
import GiftPanel from "@/components/GiftPanel";
import WeeklyPotPanel from "@/components/WeeklyPotPanel";

const games: Array<{
  name: string;
  href: string;
  tagline: string;
  image?: string;
}> = [
  {
    name: "Blackjack",
    href: "/blackjack",
    tagline: "Beat the dealer",
    image: "/images/BlackJack.png",
  },
  {
    name: "Poker",
    href: "/poker",
    tagline: "Read your enemies",
    image: "/images/Poker.png",
  },
  {
    name: "Mines",
    href: "/mines",
    tagline: "Find diamonds, avoid mines",
    image: "/images/Mines.png",
  },
  {
    name: "Keno",
    href: "/keno",
    tagline: "Pick 10 numbers",
    image: "/images/Keno.png",
  },
  {
    name: "Dragon Tower",
    href: "/dragontower",
    tagline: "Climb without hitting traps",
    image: "/images/DragonTower.png",
  },
  {
    name: "Russian Roulette",
    href: "/russianroulette",
    tagline: "Risk it all — shoot sequentially",
    image: "/images/RussianRoulette.png",
  },
  {
    name: "Pump",
    href: "/pump",
    tagline: "Pump and cash out",
    image: "/images/Pump.png",
  },
  {
    name: "Limbo",
    href: "/limbo",
    tagline: "Hit your target multiplier",
    image: "/images/Limbo.png",
  },
  {
    name: "Dice",
    href: "/dice",
    tagline: "Roll and set your chance",
    image: "/images/Dice.png",
  },
  {
    name: "Roulette",
    href: "/roulette",
    tagline: "Spin the wheel, hit your bets",
    image: "/images/Roulette.png",
  },
  {
    name: "Tarot",
    href: "/tarot",
    tagline: "Draw 3 multipliers and multiply them",
    image: "/images/Tarot.png",
  },
  {
    name: "Chicken",
    href: "/chicken",
    tagline: "Cross safely for rewards",
    image: "/images/Chicken.png",
  },
  {
    name: "Cases",
    href: "/cases",
    tagline: "Open and reveal rewards",
    image: "/images/Cases.png",
  },
  {
    name: "Crash",
    href: "/crash",
    tagline: "Ride the curve and cash out",
    image: "/images/Crash.png",
  },
  {
    name: "Plinko",
    href: "/plinko",
    tagline: "Drop and win",
    image: "/images/Plinko.png",
  },
  {
    name: "Bars",
    href: "/bars",
    tagline: "Pick 1-5 tiles and sum multipliers",
    image: "/images/Bars.png",
  },
  {
    name: "Spinning Wheel",
    href: "/spinningwheel",
    tagline: "Spin and hit a multiplier",
    image: "/images/SpinningWheel.png",
  },
  {
    name: "Darts",
    href: "/darts",
    tagline: "Aim for a high score",
    image: "/images/Darts.png",
  },
  {
    name: "Vault",
    href: "/vault",
    tagline: "Crack the vault and stack multipliers",
    image: "/images/Vault.png",
  },
  {
    name: "Snakes",
    href: "/snakes",
    tagline: "Climb high, dodge snakes",
    image: "/images/Snakes.png",
  },
  {
    name: "Coin Flip",
    href: "/coinflip",
    tagline: "Build a streak multiplier",
    image: "/images/Coinflip.png",
  },
  {
    name: "Rock Paper Scissors",
    href: "/rps",
    tagline: "Build a streak and cash out",
    image: "/images/RPS.png",
  },
  {
    name: "HiLo",
    href: "/hilo",
    tagline: "Wette, ob die nächste Karte höher oder niedriger ist.",
    image: "/images/HiLo.png",
  },
];

export default function Home() {
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
          Big wins • Climb the leaderboard • Play responsibly • Website only for
          private use
        </p>
      </div>

      <div className="grid grid-cols-2 gap-6">
        <InvestmentPanel />
        <WeeklyPotPanel />
      </div>
      <Leaderboard />
      <GiftPanel />

      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-5">
        {games.map((game) => (
          <Link
            key={game.href}
            href={game.href}
            prefetch={false}
            className="bg-[#213743] rounded-xl overflow-hidden hover:-translate-y-1 transition-transform duration-300 cursor-pointer group border border-[#2f4553]/60"
          >
            <div className="relative aspect-square bg-[#0f212e]">
              {game.image ? (
                <img
                  src={game.image}
                  alt={`${game.name} preview`}
                  className="absolute inset-0 w-full h-full object-contain transition-transform duration-500 group-hover:scale-105"
                  loading={game.name === "Blackjack" ? "eager" : "lazy"}
                  decoding="async"
                />
              ) : (
                <div className="absolute inset-0 flex items-center justify-center">
                  <div className="text-center">
                    <div className="text-white font-extrabold text-3xl tracking-wide">
                      {game.name}
                    </div>
                    <div className="mt-2 text-xs text-[#557086]">
                      No preview
                    </div>
                  </div>
                </div>
              )}
              <div className="absolute inset-x-0 bottom-0 h-16 bg-linear-to-t from-[#0f212e] via-[#0f212e]/80 to-transparent"></div>
              <div className="absolute inset-x-0 bottom-0 px-3 pb-3 flex items-end">
                <span className="text-white font-semibold text-lg drop-shadow">
                  {game.name}
                </span>
              </div>
            </div>
            <div className="p-4 pt-3">
              <p className="text-sm text-[#b1bad3]">{game.tagline}</p>
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}
