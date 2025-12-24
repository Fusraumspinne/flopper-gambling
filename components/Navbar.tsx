"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { SportsEsports, Home, GridOn, Casino, ScatterPlot, Diamond, MonetizationOn, SportsMma, QueryStats, ChevronLeft, ChevronRight } from "@mui/icons-material";
import { useWallet } from "./WalletProvider";
import LiveStatsPanel from "./LiveStatsPanel";
import { useSidebar } from "./Shell";

interface Game {
  name: string;
  icon: React.ReactNode;
  href: string;
}

const games: Game[] = [
  { name: "Keno", icon: <GridOn className="w-5 h-5" />, href: "/keno" },
  { name: "Blackjack", icon: <Casino className="w-5 h-5" />, href: "/blackjack" },
  { name: "Plinko", icon: <ScatterPlot className="w-5 h-5" />, href: "/plinko" },
  { name: "Mines", icon: <Diamond className="w-5 h-5" />, href: "/mines" },
  { name: "Coin Flip", icon: <MonetizationOn className="w-5 h-5" />, href: "/coinflip" },
  { name: "Rock Paper Scissors", icon: <SportsMma className="w-5 h-5" />, href: "/rps" },
];

export default function Navbar() {
  const pathname = usePathname();
  const { balance } = useWallet();
  const { collapsed, toggleCollapsed, sidebarWidth } = useSidebar();

  const { addToBalance } = useWallet();
  const [unclaimed, setUnclaimed] = useState<number>(0);
  const [lastClaimISO, setLastClaimISO] = useState<string | null>(null);

  const [statsOpen, setStatsOpen] = useState(false);

  useEffect(() => {
    const KEY = "flopper_free_last_claim";
    const raw = localStorage.getItem(KEY);
    let lastDate: Date;

    if (!raw || isNaN(Date.parse(raw))) {
      lastDate = new Date();
      localStorage.setItem(KEY, lastDate.toISOString());
    } else {
      lastDate = new Date(raw);
    }

    const update = () => {
      const now = new Date();
      const hours = Math.floor((now.getTime() - lastDate.getTime()) / 3600000);
      setUnclaimed(hours * 100);
      setLastClaimISO(lastDate.toISOString());
    };

    update();
    const id = window.setInterval(update, 60_000);
    return () => window.clearInterval(id);
  }, []);

  const claimFree = () => {
    if (unclaimed <= 0) return;
    addToBalance(unclaimed);
    const KEY = "flopper_free_last_claim";
    const now = new Date();
    localStorage.setItem(KEY, now.toISOString());
    setUnclaimed(0);
    setLastClaimISO(now.toISOString());
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
          <div className="bg-[#1a2c38] p-3 rounded-md border border-[#2f4553] flex justify-between items-center shadow-inner">
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
              disabled={unclaimed <= 0}
              className={`w-full py-2 rounded-md font-bold transition-colors ${
                unclaimed > 0 ? "bg-[#00e701] text-black" : "bg-[#2f4553] text-[#b1bad3]"
              }`}
            >
              {unclaimed > 0 ? `Claim $${unclaimed}` : "Claim Free"}
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
