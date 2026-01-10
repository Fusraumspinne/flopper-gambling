"use client";

import React, { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { SportsEsports, Home, GridOn, Casino, ScatterPlot, Diamond, MonetizationOn, SportsMma, QueryStats, ChevronLeft, ChevronRight, ShowChart, Shuffle, Cached, TrendingUp, AutoAwesome, Timeline, SmartToy, CatchingPokemon, CardGiftcard, LocalBar, Flare, FlightTakeoff, Lock } from "@mui/icons-material";
import { useWallet } from "./WalletProvider";
import LiveStatsPanel from "./LiveStatsPanel";
import { useSidebar } from "./Shell";
import { useHourlyReward } from "./useHourlyReward";
import { useSoundVolume } from "./SoundVolumeProvider";

interface Game {
  name: string;
  icon: React.ReactNode;
  href: string;
}

const games: Game[] = [
  { name: "Blackjack", icon: <Casino className="w-5 h-5" />, href: "/blackjack" },
  { name: "Mines", icon: <Diamond className="w-5 h-5" />, href: "/mines" },
  { name: "Keno", icon: <GridOn className="w-5 h-5" />, href: "/keno" },
  { name: "Dragon Tower", icon: <AutoAwesome className="w-5 h-5" />, href: "/dragontower" },
  { name: "Pump", icon: <TrendingUp className="w-5 h-5" />, href: "/pump" },
  { name: "Limbo", icon: <Timeline className="w-5 h-5" />, href: "/limbo" },
  { name: "Dice", icon: <SmartToy className="w-5 h-5" />, href: "/dice" },
  { name: "Tarot", icon: <Flare className="w-5 h-5" />, href: "/tarot" },
  { name: "Chicken", icon: <CatchingPokemon className="w-5 h-5" />, href: "/chicken" },
  { name: "Cases", icon: <CardGiftcard className="w-5 h-5" />, href: "/cases" },
  { name: "Crash", icon: <FlightTakeoff className="w-5 h-5" />, href: "/crash" },
  { name: "Plinko", icon: <ScatterPlot className="w-5 h-5" />, href: "/plinko" },
  { name: "Bars", icon: <LocalBar className="w-5 h-5" />, href: "/bars" },
  { name: "Spinning Wheel", icon: <Cached className="w-5 h-5" />, href: "/spinningwheel" },
  { name: "Darts", icon: <Shuffle className="w-5 h-5" />, href: "/darts" },
  { name: "Vault", icon: <Lock className="w-5 h-5" />, href: "/vault" },
  { name: "Snakes", icon: <SportsEsports className="w-5 h-5" />, href: "/snakes" },
  { name: "Coin Flip", icon: <MonetizationOn className="w-5 h-5" />, href: "/coinflip" },
  { name: "Rock Paper Scissors", icon: <SportsMma className="w-5 h-5" />, href: "/rps" },
  { name: "HiLo", icon: <ShowChart className="w-5 h-5" />, href: "/hilo" },
];

export default function Navbar() {
  const pathname = usePathname();
  const { balance } = useWallet();
  const { collapsed, toggleCollapsed, sidebarWidth } = useSidebar();
  const { volume, setVolume } = useSoundVolume();

  const { addToBalance } = useWallet();
  const { claimableAmount, lastClaimISO, claim } = useHourlyReward({ amountPerHour: 100, storageKeyPrefix: "flopper_hourly_reward" });

  const [statsOpen, setStatsOpen] = useState(false);

  const claimFree = async () => {
    const amount = await claim();
    if (amount <= 0) return;
    addToBalance(amount);
  };

  return (
    <aside
      className="fixed left-0 top-0 h-screen bg-[#0f212e] border-r border-[#213743] flex flex-col text-gray-400 font-medium z-50"
      style={{ width: sidebarWidth }}
    >
      <div className={`${collapsed ? "p-3" : "p-6"} flex items-center gap-3 text-white justify-between`}>
        <div className="bg-[#00e701] p-2 rounded-lg text-black">
          <SportsEsports sx={{ fontSize: 24 }} />
        </div>
        {!collapsed && <span className="text-xl font-bold tracking-wide">FLOPPER</span>}

        <button
          onClick={toggleCollapsed}
          className="ml-auto rounded-md px-2 py-1 text-[#b1bad3] hover:bg-[#213743] hover:text-white"
          aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          title={collapsed ? "Expand" : "Collapse"}
        >
          {collapsed ? <ChevronRight sx={{ fontSize: 18 }} /> : <ChevronLeft sx={{ fontSize: 18 }} />}
        </button>
      </div>

      {!collapsed && (
        <div className="px-6 py-4">
          <div className="bg-[#1a2c38] p-2 rounded-md border border-[#2f4553] flex justify-between items-center shadow-inner">
            <span className="text-sm text-gray-400">Balance</span>
            <span className="text-[#00e701] font-bold font-mono">${balance.toFixed(2)}</span>
          </div>

          <button
            onClick={() => setStatsOpen(true)}
            className="mt-3 w-full flex items-center justify-center gap-2 py-2 rounded-md font-bold transition-colors bg-[#213743] text-white hover:bg-[#2f4553]"
          >
            <QueryStats sx={{ fontSize: 18 }} />
            Live-Stats
          </button>

          <div className="mt-3 w-full rounded-md bg-[#1a2c38] border border-[#2f4553] p-2">
            <div className="flex items-center justify-between text-xs text-[#8399aa]">
              <span>Volume</span>
              <span className="font-mono">{Math.round(volume * 100)}%</span>
            </div>
            <input
              aria-label="Sound volume"
              className="mt-2 w-full accent-[#00e701]"
              type="range"
              min={0}
              max={100}
              step={1}
              value={Math.round(volume * 100)}
              onChange={(e) => setVolume(Number(e.target.value) / 100)}
            />
            <div className="text-xs text-[#8399aa] mt-2">
              If games lag, set Volume to 0% to increase performance.
            </div>
          </div>
        </div>
      )}

      {collapsed && (
        <div className="px-2 py-3">
          <button
            onClick={() => setStatsOpen(true)}
            className="w-full flex items-center justify-center py-2 rounded-md transition-colors bg-[#213743] text-white hover:bg-[#2f4553]"
            title="Live-Stats"
            aria-label="Live-Stats"
          >
            <QueryStats sx={{ fontSize: 18 }} />
          </button>
        </div>
      )}

      <nav className={`flex-1 overflow-y-auto ${collapsed ? "py-2 px-2" : "py-4 px-3"} space-y-1`}>
        <Link
          href="/"
          title="Home"
          className={`flex items-center ${collapsed ? "justify-center" : "gap-3"} ${collapsed ? "px-2 py-3" : "px-4 py-3"} rounded-md transition-colors ${
            pathname === "/"
              ? "bg-[#213743] text-white"
              : "hover:bg-[#1a2c38] hover:text-white"
          }`}
        >
          <Home sx={{ fontSize: 20 }} />
          {!collapsed && <span>Home</span>}
        </Link>

        {games.length > 0 && (
          <div className={`${collapsed ? "hidden" : "mt-6 mb-2 px-4"} text-xs font-bold uppercase tracking-wider text-[#557086]`}>Games</div>
        )}
        
        {games.map((game, index) => (
          <Link
            key={index}
            href={game.href}
            title={game.name}
            className={`flex items-center ${collapsed ? "justify-center" : "gap-3"} ${collapsed ? "px-2 py-3" : "px-4 py-3"} rounded-md transition-colors ${
              pathname === game.href
                ? "bg-[#213743] text-white"
                : "hover:bg-[#1a2c38] hover:text-white"
            }`}
          >
            {game.icon}
            {!collapsed && <span>{game.name}</span>}
          </Link>
        ))}
      </nav>

      {!collapsed && (
        <div className="px-4 pb-6">
          <div className="border-t border-[#213743] pt-4">
            <button
              onClick={claimFree}
              disabled={claimableAmount <= 0}
              className={`w-full py-2 rounded-md font-bold transition-colors ${
                claimableAmount > 0 ? "bg-[#00e701] text-black" : "bg-[#2f4553] text-[#b1bad3]"
              }`}
            >
              {claimableAmount > 0 ? `Claim $${claimableAmount}` : "Claim Free"}
            </button>
            <div className="text-xs text-[#557086] mt-2">+ $100 per hour since last claim</div>
            {lastClaimISO && (
              <div className="text-xs text-[#8399aa] mt-1">Last claim: {new Date(lastClaimISO).toLocaleString()}</div>
            )}
          </div>
        </div>
      )}

      <LiveStatsPanel open={statsOpen} onClose={() => setStatsOpen(false)} />
    </aside>
  );
}
