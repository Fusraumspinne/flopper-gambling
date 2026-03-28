"use client";

import React, { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { SportsEsports, Home, GridOn, Casino, ScatterPlot, Diamond, MonetizationOn, SportsMma, QueryStats, ChevronLeft, ChevronRight, ShowChart, Shuffle, Cached, TrendingUp, AutoAwesome, Timeline, SmartToy, CatchingPokemon, CardGiftcard, LocalBar, Flare, FlightTakeoff, Lock, Album, Toll, LocalFireDepartment, PrivacyTip, Speed, Category, Logout, Phishing, ArrowDownward, Cake, AccountBalance, MilitaryTech, ChatBubbleOutline, Star } from "@mui/icons-material";
import { useWallet } from "./WalletProvider";
import LiveStatsPanel from "./LiveStatsPanel";
import LiveChatPanel from "./LiveChatPanel";
import { signOut, useSession } from "next-auth/react";
import { useSidebar } from "./Shell";
import { useHourlyReward } from "./useHourlyReward";
import { useSoundVolume } from "./SoundVolumeProvider";
import { DEFAULT_GAME_STATUS, getGameKeyFromHref } from "@/lib/gameStatus";
import { io, Socket } from "socket.io-client";

type ChatAttachment = {
  kind: "image";
  mimeType: string;
  data: string;
  fileName: string;
  width?: number;
  height?: number;
};

type ChatPayload = {
  id?: string;
  socketId?: string;
  name?: string;
  text?: string;
  ts?: number;
  attachment?: ChatAttachment;
  reactions?: string[];
};

type ChatMessage = {
  id: string;
  socketId: string;
  name: string;
  text: string;
  ts: number;
  attachment?: ChatAttachment;
  reactions: string[];
};

interface Game {
  name: string;
  icon: React.ReactNode;
  href: string;
}

const games: Game[] = [
  { name: "Big Bass Amazonas", icon: <Phishing className="w-5 h-5" />, href: "/bigbassamazonas" },
  { name: "Sugar Rush", icon: <Cake className="w-5 h-5" />, href: "/sugarrush" },
  { name: "Gates of Olympus", icon: <AccountBalance className="w-5 h-5" />, href: "/gatesofolympus" },
  { name: "Le Bandit", icon: <MilitaryTech className="w-5 h-5" />, href: "/lebandit" },
  { name: "Dead or Wild", icon: <Star className="w-5 h-5" />, href: "/deadorwild" },
  { name: "Coin Flip", icon: <MonetizationOn className="w-5 h-5" />, href: "/coinflip" },
  { name: "Poker", icon: <Toll className="w-5 h-5" />, href: "/poker" },
  { name: "Mines", icon: <Diamond className="w-5 h-5" />, href: "/mines" },
  { name: "Roulette", icon: <Album className="w-5 h-5" />, href: "/roulette" },
  { name: "Dice", icon: <SmartToy className="w-5 h-5" />, href: "/dice" },
  { name: "Crash", icon: <FlightTakeoff className="w-5 h-5" />, href: "/crash" },
  { name: "Dragon Tower", icon: <AutoAwesome className="w-5 h-5" />, href: "/dragontower" },
  { name: "Pump", icon: <TrendingUp className="w-5 h-5" />, href: "/pump" },
  { name: "Diamonds", icon: <Category className="w-5 h-5" />, href: "/diamonds" },
  { name: "Spinning Wheel", icon: <Cached className="w-5 h-5" />, href: "/spinningwheel" },
  { name: "Keno", icon: <GridOn className="w-5 h-5" />, href: "/keno" },
  { name: "Limbo", icon: <Timeline className="w-5 h-5" />, href: "/limbo" },
  { name: "Blackjack", icon: <Casino className="w-5 h-5" />, href: "/blackjack" },
  { name: "Horse Race", icon: <Speed className="w-5 h-5" />, href: "/horserace" },
  { name: "Cases", icon: <CardGiftcard className="w-5 h-5" />, href: "/cases" },
  { name: "Drill", icon: <ArrowDownward className="w-5 h-5" />, href: "/drill" },
  { name: "Russian Roulette", icon: <LocalFireDepartment className="w-5 h-5" />, href: "/russianroulette" },
  { name: "Tarot", icon: <Flare className="w-5 h-5" />, href: "/tarot" },
  { name: "Chicken", icon: <CatchingPokemon className="w-5 h-5" />, href: "/chicken" },
  { name: "Snakes", icon: <SportsEsports className="w-5 h-5" />, href: "/snakes" },
  { name: "Plinko", icon: <ScatterPlot className="w-5 h-5" />, href: "/plinko" },
  { name: "HiLo", icon: <ShowChart className="w-5 h-5" />, href: "/hilo" },
  { name: "Rock Paper Scissors", icon: <SportsMma className="w-5 h-5" />, href: "/rps" },
  { name: "Bars", icon: <LocalBar className="w-5 h-5" />, href: "/bars" },
  { name: "Vault", icon: <Lock className="w-5 h-5" />, href: "/vault" },
  { name: "Darts", icon: <Shuffle className="w-5 h-5" />, href: "/darts" },
];

export default function Navbar() {
  const pathname = usePathname();
  const { balance } = useWallet();
  const { collapsed, toggleCollapsed, sidebarWidth } = useSidebar();
  const { volume, setVolume } = useSoundVolume();
  const { data: session } = useSession();

  const { claimableAmount, lastClaimISO, claim } = useHourlyReward({ amountPerHour: 1000 });

  const [statsOpen, setStatsOpen] = useState(false);
  const [chatOpen, setChatOpen] = useState(false);
  const [hasUnreadChat, setHasUnreadChat] = useState(false);
  const [gameStatus, setGameStatus] = useState<Record<string, boolean>>(DEFAULT_GAME_STATUS);
  const [adminAuthorized, setAdminAuthorized] = useState(false);
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [chatSocketId, setChatSocketId] = useState("");
  const [chatConnected, setChatConnected] = useState(false);
  const [onlineCount, setOnlineCount] = useState<number>(0);

  const chatSocketRef = React.useRef<Socket | null>(null);
  const chatOpenRef = React.useRef(false);

  useEffect(() => {
    chatOpenRef.current = chatOpen;
  }, [chatOpen]);

  useEffect(() => {
    const baseUrl = process.env.NEXT_PUBLIC_POKER_WS_URL || "http://localhost:4000";
    const socket = io(`${baseUrl}/chat`);
    chatSocketRef.current = socket;

    socket.on("connect", () => {
      setChatSocketId(socket.id || "");
      setChatConnected(true);
      const fallback = `Guest-${Math.floor(Math.random() * 9000) + 1000}`;
      socket.emit("chat:join", { name: session?.user?.name || fallback });
    });

    socket.on("chat:online_count", (count: number) => {
      setOnlineCount(count);
    });

    socket.on("chat:message", (payload: ChatPayload) => {
      if (!payload) return;
      const rawText = typeof payload.text === "string" ? payload.text : "";
      const hasAttachment = !!payload.attachment;
      if (!rawText && !hasAttachment) return;
      const msg = {
        id: String(payload.id || `${Date.now()}-${Math.random()}`),
        socketId: String(payload.socketId || ""),
        name: String(payload.name || "Guest"),
        text: rawText,
        ts: Number(payload.ts || Date.now()),
        attachment: payload.attachment,
        reactions: Array.isArray(payload.reactions)
          ? payload.reactions.filter((entry) => typeof entry === "string").slice(0, 8)
          : [],
      };

      setChatMessages((prev) => [...prev.slice(-119), msg]);
      if (!chatOpenRef.current && msg.socketId !== socket.id) setHasUnreadChat(true);
    });

    socket.on("chat:reaction_update", ({ messageId, reactions } = {}) => {
      if (typeof messageId !== "string" || !Array.isArray(reactions)) return;
      const nextReactions = reactions.filter((entry) => typeof entry === "string").slice(0, 8);
      setChatMessages((prev) =>
        prev.map((msg) =>
          msg.id === messageId
            ? {
                ...msg,
                reactions: nextReactions,
              }
            : msg
        )
      );
    });

    socket.on("disconnect", () => {
      setChatSocketId("");
      setChatConnected(false);
    });

    socket.on("connect_error", () => {
      setChatConnected(false);
    });

    return () => {
      socket.disconnect();
      chatSocketRef.current = null;
    };
  }, []);

  useEffect(() => {
    const socket = chatSocketRef.current;
    if (!socket || !socket.connected) return;
    const fallback = `Guest-${Math.floor(Math.random() * 9000) + 1000}`;
    socket.emit("chat:join", { name: session?.user?.name || fallback });
  }, [session?.user?.name]);

  useEffect(() => {
    if (chatOpen) setHasUnreadChat(false);
  }, [chatOpen]);

  const sendChatMessage = (text: string, attachment?: ChatAttachment) => {
    const socket = chatSocketRef.current;
    if (!socket || !socket.connected) return;
    socket.emit("chat:message", { text, attachment });
  };

  const sendChatReaction = (messageId: string, emoji: string) => {
    const socket = chatSocketRef.current;
    if (!socket || !socket.connected) return;
    socket.emit("chat:reaction", { messageId, emoji });
  };

  useEffect(() => {
    const loadStatus = async () => {
      try {
        const res = await fetch("/api/status", { cache: "no-store" });
        if (!res.ok) return;
        const data = await res.json();
        if (data?.games && typeof data.games === "object") {
          setGameStatus({ ...DEFAULT_GAME_STATUS, ...data.games });
        }
      } catch (e) {}
    };

    loadStatus();
  }, [pathname]);

  useEffect(() => {
    const checkAdmin = () => {
      try {
        if (typeof window !== "undefined") {
          setAdminAuthorized(localStorage.getItem("flopper_admin_authorized") === "true");
        }
      } catch (e) {}
    };

    checkAdmin();
  }, []);

  const claimFree = async () => {
    await claim();
  };

  const visibleGames = useMemo(
    () => games.filter((game) => gameStatus[getGameKeyFromHref(game.href)] !== false),
    [gameStatus]
  );

  return (
    <aside
      className="fixed left-0 top-0 h-screen bg-[#0f212e] border-r border-[#213743] flex flex-col text-gray-400 font-medium z-50"
      style={{ width: sidebarWidth }}
    >
      <div className={`${collapsed ? "p-3" : "p-6"} flex items-center gap-3 text-white justify-between`}>
        <Link href="/" className="flex items-center gap-3 text-white mr-auto">
          <div className="bg-[#00e701] p-2 rounded-lg text-black">
            <SportsEsports sx={{ fontSize: 24 }} />
          </div>
          {!collapsed && <span className="text-xl font-bold tracking-wide">FLOPPER</span>}
        </Link>

        <button
          onClick={toggleCollapsed}
          className="ml-2 rounded-md px-2 py-1 text-[#b1bad3] hover:bg-[#213743] hover:text-white"
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

          <button
            onClick={() => setChatOpen(true)}
            className="mt-2 w-full flex items-center justify-center gap-2 py-2 rounded-md font-bold transition-colors bg-[#213743] text-white hover:bg-[#2f4553] relative"
          >
            <ChatBubbleOutline sx={{ fontSize: 18 }} />
            Live-Chat
            {hasUnreadChat && (
              <span className="absolute right-2 top-2 inline-block h-2.5 w-2.5 rounded-full bg-red-500" aria-hidden="true" />
            )}
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
              If games lag, set Volume to 0% to increase performance
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

          <button
            onClick={() => setChatOpen(true)}
            className="mt-2 w-full flex items-center justify-center py-2 rounded-md transition-colors bg-[#213743] text-white hover:bg-[#2f4553] relative"
            title="Live-Chat"
            aria-label="Live-Chat"
          >
            <ChatBubbleOutline sx={{ fontSize: 18 }} />
            {hasUnreadChat && (
              <span className="absolute right-2 top-2 inline-block h-2.5 w-2.5 rounded-full bg-red-500" aria-hidden="true" />
            )}
          </button>
        </div>
      )}

      <nav className={`flex-1 overflow-y-auto ${collapsed ? "py-2 px-2" : "py-4 px-3"} space-y-1`}>
        {games.length > 0 && (
          <div className={`${collapsed ? "hidden" : "mb-2 px-4"} text-xs font-bold uppercase tracking-wider text-[#557086]`}>Games</div>
        )}
        
        {visibleGames.map((game, index) => {
          const isActive = pathname === game.href || (pathname === "/livepoker" && game.href === "/poker");
          return (
            <Link
              key={index}
              href={game.href}
                prefetch={false}
              title={game.name}
              className={`flex items-center ${collapsed ? "justify-center" : "gap-3"} ${collapsed ? "px-2 py-3" : "px-4 py-3"} rounded-md transition-colors ${
                isActive
                  ? "bg-[#213743] text-white"
                  : "hover:bg-[#1a2c38] hover:text-white"
              }`}
            >
              {game.icon}
              {!collapsed && <span>{game.name}</span>}
            </Link>
          );
        })}
      </nav>

      {!collapsed && (
        <div className="px-4 pb-2">
          <div className="border-t border-[#213743] pt-2">
            <button
              onClick={claimFree}
              disabled={claimableAmount <= 0}
              className={`w-full py-2 rounded-md font-bold transition-colors ${
                claimableAmount > 0 ? "bg-[#00e701] text-black" : "bg-[#2f4553] text-[#b1bad3]"
              }`}
            >
              {claimableAmount > 0 ? `Claim $${claimableAmount}` : "Claim Free"}
            </button>
            <div className="text-xs text-[#557086] mt-2">+ $1000 per hour since last claim</div>
            {lastClaimISO && (
              <div className="text-xs text-[#8399aa] mt-1">Last claim: {new Date(lastClaimISO).toLocaleString()}</div>
            )}
          </div>
        </div>
      )}

      <div className={`${collapsed ? "px-2" : "px-4"} pb-2`}>
        <div className="border-t border-[#213743] pt-2 space-y-2">
          {adminAuthorized && (
            <Link
              href="/admin"
              prefetch={false}
              title="Admin"
              className={`flex items-center ${collapsed ? "justify-center" : "gap-2"} text-xs text-[#8399aa] hover:text-white`}
            >
              <Lock sx={{ fontSize: 18 }} />
              {!collapsed && <span>Admin</span>}
            </Link>
          )}
          <button
            onClick={async () => {
              try {
                await signOut();

                try {
                  localStorage.clear();
                } catch (e) {}
              } catch (e) {
                console.error("Logout error:", e);
              }
            }}
            title="Logout"
            className={`flex items-center ${collapsed ? "justify-center" : "gap-2"} w-full text-left text-xs text-[#8399aa] hover:text-white cursor-pointer`}
          >
            <Logout sx={{ fontSize: 18 }} />
            {!collapsed && <span>Logout</span>}
          </button>
          <Link
            href="/privacy"
            prefetch={false}
            title="Privacy Policy"
            className={`flex items-center ${collapsed ? "justify-center" : "gap-2"} text-xs text-[#8399aa] hover:text-white`}
          >
            <PrivacyTip sx={{ fontSize: 18 }} />
            {!collapsed && <span>Privacy Policy</span>}
          </Link>
        </div>
      </div>

      <LiveStatsPanel open={statsOpen} onClose={() => setStatsOpen(false)} />
      <LiveChatPanel
        open={chatOpen}
        onClose={() => setChatOpen(false)}
        messages={chatMessages}
        mySocketId={chatSocketId}
        onSend={sendChatMessage}
        onReact={sendChatReaction}
        connected={chatConnected}
        onlineCount={onlineCount}
      />
    </aside>
  );
}
