"use client";

import React, { createContext, useContext, useEffect, useMemo, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { getItem, setItem, clearStore } from "../lib/indexedDB";

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;
const POT_KEY = "flopper_weekly_pot_v1";
const LAST_CLAIM_KEY = "flopper_weekly_last_claim_v1";
const BALANCE_KEY = "flopper_balance";
const PAYBACK_RATE = 0.1; 

type LiveStatsPoint = {
  t: number;
  net: number;
};

function normalizeMoney(value: number): number {
  if (!Number.isFinite(value)) return 0;
  const rounded = Math.round((value + Number.EPSILON) * 100) / 100;
  return Object.is(rounded, -0) ? 0 : rounded;
}

export type LiveStatsState = {
  startedAt: number;
  net: number;
  wagered: number;
  wins: number;
  losses: number;
  history: LiveStatsPoint[];
};

export const GAME_OPTIONS = [
  { id: "blackjack", label: "Blackjack" },
  { id: "poker", label: "Poker" },
  { id: "mines", label: "Mines" },
  { id: "keno", label: "Keno" },
  { id: "dragontower", label: "Dragon Tower" },
  { id: "russianroulette", label: "Russian Roulette" },
  { id: "pump", label: "Pump" },
  { id: "limbo", label: "Limbo" },
  { id: "dice", label: "Dice" },
  { id: "roulette", label: "Roulette" },
  { id: "tarot", label: "Tarot" },
  { id: "chicken", label: "Chicken" },
  { id: "cases", label: "Cases" },
  { id: "crash", label: "Crash" },
  { id: "plinko", label: "Plinko" },
  { id: "bars", label: "Bars" },
  { id: "spinningwheel", label: "Spinning Wheel" },
  { id: "darts", label: "Darts" },
  { id: "vault", label: "Vault" },
  { id: "snakes", label: "Snakes" },
  { id: "coinflip", label: "Coinflip" },
  { id: "rps", label: "Rock Paper Scissors" },
  { id: "hilo", label: "Hi-Lo" },
] as const;

const ALL_OPTION = { id: "all", label: "All Games" } as const;
export const DROPDOWN_GAME_OPTIONS = [ALL_OPTION, ...GAME_OPTIONS];
export const VERIFIED_VERSION = "verified_v2";

type GameId = (typeof GAME_OPTIONS)[number]["id"];
type GameKey = GameId | "all" | "unknown";
type LiveStatsByGame = Record<GameKey, LiveStatsState>;

type WinMeta = { game: GameKey; profit: number; multi: number; };
type LossMeta = { game: GameKey; loss: number; };
type GameUpdate = { profit?: number; multi?: number; loss?: number; };

interface WalletContextType {
  balance: number;
  weeklyPot: number;
  lastClaim: number;
  addToBalance: (amount: number) => void;
  subtractFromBalance: (amount: number) => void;
  creditBalance: (amount: number) => void;
  debitBalance: (amount: number) => boolean;
  liveStats: LiveStatsState;
  liveStatsByGame: LiveStatsByGame;
  currentGameId: GameKey;
  resetLiveStats: (gameId?: GameKey) => void;
  finalizePendingLoss: () => void;
  lastBetAt: number | null;
  syncBalance: () => Promise<void>;
  claimWeeklyPot: () => Promise<{ success: boolean; error?: string }>;
}

const WalletContext = createContext<WalletContextType | undefined>(undefined);
const GAME_ID_SET = new Set<string>(GAME_OPTIONS.map((g) => g.id));

function createEmptyLiveStats(): LiveStatsState {
  const now = Date.now();
  return { startedAt: now, net: 0, wagered: 0, wins: 0, losses: 0, history: [] };
}

function deriveGameId(pathname: string): GameKey {
  const firstSegment = pathname.split("/").filter(Boolean)[0];
  if (firstSegment && GAME_ID_SET.has(firstSegment)) return firstSegment as GameKey;
  return "unknown";
}

export const WalletProvider = ({ children }: { children: React.ReactNode }) => {
  const [balance, setBalance] = useState<number>(0);
  const [weeklyPot, setWeeklyPot] = useState<number>(0);
  const [lastClaim, setLastClaim] = useState<number>(0);
  const [isLoaded, setIsLoaded] = useState(false);
  const balanceRef = useRef<number>(0);

  const [liveStatsByGame, setLiveStatsByGame] = useState<LiveStatsByGame>(() => {
    const empty: any = { all: createEmptyLiveStats(), unknown: createEmptyLiveStats() };
    for (const game of GAME_OPTIONS) { empty[game.id] = createEmptyLiveStats(); }
    return empty;
  });

  const pendingBetsRef = useRef<number[]>([]);
  const pendingUpdatesRef = useRef<Map<GameKey, GameUpdate>>(new Map());
  const pathname = usePathname();
  const currentGameId = useMemo(() => deriveGameId(pathname ?? "/"), [pathname]);
  const [lastBetAt, setLastBetAt] = useState<number | null>(null);

  useEffect(() => {
    const loadData = async () => {
      const isVerified = await getItem<string>(VERIFIED_VERSION);
      if (!isVerified) {
        await clearStore();
        balanceRef.current = 1000.0;
        setBalance(1000.0);
        setWeeklyPot(0);
        setLastClaim(0);
        await setItem(BALANCE_KEY, "1000.00");
        await setItem(POT_KEY, "0");
        await setItem(LAST_CLAIM_KEY, "0");
        await setItem(VERIFIED_VERSION, "true");
      } else {
        const [storedBal, storedPot, storedClaim] = await Promise.all([
          getItem<string>(BALANCE_KEY),
          getItem<string>(POT_KEY),
          getItem<string>(LAST_CLAIM_KEY)
        ]);
        if (storedBal) {
          balanceRef.current = normalizeMoney(parseFloat(storedBal));
          setBalance(balanceRef.current);
        }
        if (storedPot) setWeeklyPot(parseFloat(storedPot));
        if (storedClaim) setLastClaim(parseInt(storedClaim));
      }
      setIsLoaded(true);
    };
    loadData();
  }, []);

  useEffect(() => { if (isLoaded) setItem(BALANCE_KEY, balance.toFixed(2)); }, [balance, isLoaded]);
  useEffect(() => { if (isLoaded) setItem(POT_KEY, weeklyPot.toString()); }, [weeklyPot, isLoaded]);
  useEffect(() => { if (isLoaded) setItem(LAST_CLAIM_KEY, lastClaim.toString()); }, [lastClaim, isLoaded]);

  const addPayback = (netLoss: number) => {
    if (netLoss <= 0) return;
    const amount = normalizeMoney(netLoss * PAYBACK_RATE);
    setWeeklyPot(prev => normalizeMoney(prev + amount));
  };

  const claimWeeklyPot = async () => {
    const now = Date.now();
    if (now - lastClaim < WEEK_MS) return { success: false, error: "7 Tage Sperre aktiv." };
    if (weeklyPot <= 0) return { success: false, error: "Pot ist leer." };
    creditBalance(weeklyPot);
    setWeeklyPot(0);
    setLastClaim(now);
    return { success: true };
  };

  const creditBalance = (amount: number) => {
    const a = normalizeMoney(amount);
    if (a <= 0) return;
    const next = normalizeMoney(balanceRef.current + a);
    balanceRef.current = next;
    setBalance(next);
  };

  const finalizePendingLoss = () => {
    const bet = pendingBetsRef.current.shift();
    if (typeof bet !== "number") return;
    
    updateCurrentAndAll((s) => ({ ...s, losses: s.losses + 1 }));
    applyNetChange(-normalizeMoney(bet));
    addPayback(bet);
  };

  const addToBalance = (amount: number) => {
    const payout = normalizeMoney(amount);
    const bet = pendingBetsRef.current.shift();
    
    const next = normalizeMoney(balanceRef.current + payout);
    balanceRef.current = next;
    setBalance(next);

    if (typeof bet === "number") {
      const roundNet = normalizeMoney(payout - bet);
      applyNetChange(roundNet);
      
      if (roundNet > 0) {
        updateCurrentAndAll((s) => ({ ...s, wins: s.wins + 1 }));
      } else if (roundNet < 0) {
        updateCurrentAndAll((s) => ({ ...s, losses: s.losses + 1 }));
        addPayback(Math.abs(roundNet));
      }
    }
  };

  const subtractFromBalance = (amount: number) => {
    const a = normalizeMoney(amount);
    if (a <= 0 || a > balanceRef.current) return;
    const next = normalizeMoney(balanceRef.current - a);
    balanceRef.current = next;
    setBalance(next);
    pendingBetsRef.current.push(a);
    setLastBetAt(Date.now());
    updateCurrentAndAll((s) => ({ ...s, wagered: normalizeMoney(s.wagered + a) }));
  };

  const debitBalance = (amount: number): boolean => {
    const a = normalizeMoney(amount);
    if (a <= 0 || a > balanceRef.current) return false;
    const next = normalizeMoney(balanceRef.current - a);
    balanceRef.current = next;
    setBalance(next);
    setLastBetAt(Date.now());
    return true;
  };

  const updateCurrentAndAll = (updater: (prev: LiveStatsState, now: number) => LiveStatsState) => {
    const now = Date.now();
    setLiveStatsByGame((prev) => {
      const apply = (key: GameKey) => updater(prev[key] ?? createEmptyLiveStats(), now);
      return { ...prev, [currentGameId]: apply(currentGameId), all: apply("all") };
    });
  };

  const applyNetChange = (roundNet: number) => {
    const delta = normalizeMoney(roundNet);
    updateCurrentAndAll((prev, now) => {
      const nextNet = normalizeMoney(prev.net + delta);
      return { ...prev, net: nextNet, history: [...prev.history, { t: now, net: nextNet }] };
    });
  };

  const syncBalance = async () => { };
  const resetLiveStats = (gameId: GameKey = currentGameId) => {
     setLiveStatsByGame(prev => ({ ...prev, [gameId]: createEmptyLiveStats() }));
  };

  if (!isLoaded) return null;

  return (
    <WalletContext.Provider
      value={{
        balance, weeklyPot, lastClaim,
        addToBalance, subtractFromBalance, creditBalance, debitBalance,
        liveStats: liveStatsByGame[currentGameId] || liveStatsByGame.all,
        liveStatsByGame, currentGameId, resetLiveStats, finalizePendingLoss,
        syncBalance, lastBetAt, claimWeeklyPot
      }}
    >
      {children}
    </WalletContext.Provider>
  );
};

export const useWallet = () => {
  const context = useContext(WalletContext);
  if (context === undefined) throw new Error("useWallet error");
  return context;
};