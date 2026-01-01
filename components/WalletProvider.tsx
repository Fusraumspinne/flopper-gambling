"use client";

import React, { createContext, useContext, useEffect, useMemo, useRef, useState } from "react";
import { usePathname } from "next/navigation";

type LiveStatsPoint = {
  t: number;
  net: number;
};

function normalizeMoney(value: number): number {
  if (!Number.isFinite(value)) return 0;
  // Round to cents and avoid -0.
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
  { id: "cases", label: "Cases" },
  { id: "coinflip", label: "Coinflip" },
  { id: "darts", label: "Darts" },
  { id: "dice", label: "Dice" },
  { id: "dragontower", label: "Dragon Tower" },
  { id: "hilo", label: "Hi-Lo" },
  { id: "keno", label: "Keno" },
  { id: "limbo", label: "Limbo" },
  { id: "mines", label: "Mines" },
  { id: "plinko", label: "Plinko" },
  { id: "pump", label: "Pump" },
  { id: "rps", label: "Rock Paper Scissors" },
  { id: "chicken", label: "Chicken" },
  { id: "snakes", label: "Snakes" },
  { id: "spinningwheel", label: "Spinning Wheel" },
] as const;

const ALL_OPTION = { id: "all", label: "All Games" } as const;
export const DROPDOWN_GAME_OPTIONS = [ALL_OPTION, ...GAME_OPTIONS];

type GameId = (typeof GAME_OPTIONS)[number]["id"];
type GameKey = GameId | "all" | "unknown";
type LiveStatsByGame = Record<GameKey, LiveStatsState>;

interface WalletContextType {
  balance: number;
  addToBalance: (amount: number) => void;
  subtractFromBalance: (amount: number) => void;
  liveStats: LiveStatsState;
  liveStatsByGame: LiveStatsByGame;
  currentGameId: GameKey;
  resetLiveStats: (gameId?: GameKey) => void;
  finalizePendingLoss: () => void;
  lastBetAt: number | null;
}

const WalletContext = createContext<WalletContextType | undefined>(undefined);

const LIVE_STATS_KEY = "flopper_livestats_by_game_v3";
const LEGACY_LIVE_STATS_KEYS = ["flopper_livestats_by_game_v2"];
const GAME_ID_SET = new Set<string>(GAME_OPTIONS.map((g) => g.id));

function createEmptyLiveStats(): LiveStatsState {
  const now = Date.now();
  return {
    startedAt: now,
    net: 0,
    wagered: 0,
    wins: 0,
    losses: 0,
    history: [],
  };
}

function deriveGameId(pathname: string): GameKey {
  const firstSegment = pathname.split("/").filter(Boolean)[0];
  if (firstSegment && GAME_ID_SET.has(firstSegment)) return firstSegment as GameKey;
  return "unknown";
}

function isValidLiveStats(value: any): value is LiveStatsState {
  if (
    !value ||
    typeof value.startedAt !== "number" ||
    typeof value.net !== "number" ||
    typeof value.wagered !== "number" ||
    typeof value.wins !== "number" ||
    typeof value.losses !== "number" ||
    !Array.isArray(value.history)
  ) {
    return false;
  }

  return value.history.every((p: any) => p && typeof p.t === "number" && typeof p.net === "number");
}

function buildAllAggregate(map: LiveStatsByGame): LiveStatsState {
  let startedAt = Date.now();
  let wagered = 0;
  let wins = 0;
  let losses = 0;
  const events: Array<{ t: number; delta: number }> = [];

  for (const [key, stats] of Object.entries(map)) {
    if (key === "all") continue;
    if (!isValidLiveStats(stats)) continue;

    startedAt = Math.min(startedAt, stats.startedAt);
    wagered = normalizeMoney(wagered + stats.wagered);
    wins += stats.wins;
    losses += stats.losses;

    if (stats.history.length > 0) {
      events.push({ t: stats.history[0].t, delta: stats.history[0].net });
    }

    for (let i = 1; i < stats.history.length; i++) {
      const prev = stats.history[i - 1];
      const curr = stats.history[i];
      events.push({ t: curr.t, delta: curr.net - prev.net });
    }
  }

  events.sort((a, b) => a.t - b.t);

  let net = 0;
  const history: LiveStatsPoint[] = [];
  for (const ev of events) {
    net = normalizeMoney(net + ev.delta);
    history.push({ t: ev.t, net });
  }

  return {
    startedAt,
    net: normalizeMoney(net),
    wagered: normalizeMoney(wagered),
    wins,
    losses,
    history,
  };
}

export const WalletProvider = ({ children }: { children: React.ReactNode }) => {
  const [balance, setBalance] = useState<number>(0);
  const [isLoaded, setIsLoaded] = useState(false);
  const [liveStatsByGame, setLiveStatsByGame] = useState<LiveStatsByGame>(() => {
    const empty: Partial<LiveStatsByGame> = { all: createEmptyLiveStats(), unknown: createEmptyLiveStats() };
    for (const game of GAME_OPTIONS) {
      empty[game.id] = createEmptyLiveStats();
    }
    return empty as LiveStatsByGame;
  });

  const pendingBetsRef = useRef<number[]>([]);
  const pathname = usePathname();
  const currentGameId = useMemo(() => deriveGameId(pathname ?? "/"), [pathname]);
  const [lastBetAt, setLastBetAt] = useState<number | null>(null);

  useEffect(() => {
    const storedBalance = localStorage.getItem("flopper_balance");
    if (storedBalance) {
      setBalance(normalizeMoney(parseFloat(storedBalance)));
    } else {
      setBalance(1000.0);
      localStorage.setItem("flopper_balance", "1000.00");
    }

    const rawStats = (() => {
      const primary = localStorage.getItem(LIVE_STATS_KEY);
      if (primary) return primary;
      for (const legacyKey of LEGACY_LIVE_STATS_KEYS) {
        const legacy = localStorage.getItem(legacyKey);
        if (legacy) return legacy;
      }
      return null;
    })();

    if (rawStats) {
      try {
        const parsed = JSON.parse(rawStats) as LiveStatsByGame;
        const next: Partial<LiveStatsByGame> = { all: createEmptyLiveStats(), unknown: createEmptyLiveStats() };

        for (const key of Object.keys(parsed)) {
          const maybe = parsed[key as keyof LiveStatsByGame];
          if (isValidLiveStats(maybe)) {
            const normalizedNet = normalizeMoney(maybe.net);
            next[key as GameKey] = {
              ...maybe,
              net: normalizedNet,
              wagered: normalizeMoney(maybe.wagered),
              history:
                maybe.history.length > 0
                  ? maybe.history.map((p) => ({ t: p.t, net: normalizeMoney(p.net) }))
                  : normalizedNet === 0
                    ? []
                    : [{ t: Date.now(), net: normalizedNet }],
            };
          }
        }

        for (const game of GAME_OPTIONS) {
          if (!next[game.id]) next[game.id] = createEmptyLiveStats();
        }
        if (!next.unknown) next.unknown = createEmptyLiveStats();

        next.all = buildAllAggregate(next as LiveStatsByGame);
        setLiveStatsByGame(next as LiveStatsByGame);
      } catch {
      }
    }

    setIsLoaded(true);
  }, []);

  useEffect(() => {
    if (isLoaded) {
      localStorage.setItem("flopper_balance", normalizeMoney(balance).toFixed(2));
    }
  }, [balance, isLoaded]);

  useEffect(() => {
    if (isLoaded) {
      localStorage.setItem(LIVE_STATS_KEY, JSON.stringify(liveStatsByGame));
    }
  }, [liveStatsByGame, isLoaded]);

  useEffect(() => {
    if (!isLoaded) return;
    setLiveStatsByGame((prev) => {
      if (prev[currentGameId]) return prev;
      return { ...prev, [currentGameId]: createEmptyLiveStats() };
    });
  }, [currentGameId, isLoaded]);

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
      const nextHistory = [...prev.history, { t: now, net: nextNet }];
      return { ...prev, net: nextNet, history: nextHistory };
    });
  };

  const settleBetWithPayout = (payout: number) => {
    const normalizedPayout = normalizeMoney(payout);
    if (normalizedPayout <= 0) return;
    const bet = pendingBetsRef.current.shift();
    if (typeof bet !== "number") return;

    const roundNet = normalizeMoney(normalizedPayout - bet);
    if (roundNet > 0) {
      updateCurrentAndAll((s) => ({ ...s, wins: s.wins + 1 }));
    } else if (roundNet < 0) {
      updateCurrentAndAll((s) => ({ ...s, losses: s.losses + 1 }));
    }
    applyNetChange(roundNet);
  };

  const finalizePendingLoss = () => {
    const bet = pendingBetsRef.current.shift();
    if (typeof bet !== "number") return;
    updateCurrentAndAll((s) => ({ ...s, losses: s.losses + 1 }));
    applyNetChange(-normalizeMoney(bet));
  };

  const resetLiveStats = (gameId: GameKey = currentGameId) => {
    pendingBetsRef.current = [];
    if (gameId === "all") {
      setLiveStatsByGame(() => {
        const next: LiveStatsByGame = { all: createEmptyLiveStats(), unknown: createEmptyLiveStats() } as any;
        for (const game of GAME_OPTIONS) {
          next[game.id] = createEmptyLiveStats();
        }
        // ensure unknown + all present
        next.unknown = createEmptyLiveStats();
        next.all = createEmptyLiveStats();
        return next;
      });
      return;
    }

    setLiveStatsByGame((prev) => ({ ...prev, [gameId]: createEmptyLiveStats() }));
  };

  const addToBalance = (amount: number) => {
    const a = normalizeMoney(amount);
    if (a <= 0) return;
    setBalance((prev) => normalizeMoney(prev + a));

    // If this is a game payout, settle one pending bet to count win/loss.
    settleBetWithPayout(a);
  };

  const subtractFromBalance = (amount: number) => {
    const a = normalizeMoney(amount);
    if (a <= 0) return;
    // Bets should not affect net until the round is settled (payout or loss).
    // Use the latest balance inside the updater so rapid successive bets cannot overdraw/overcount.
    let accepted = false;
    setBalance((prev) => {
      if (a > prev) return prev;
      accepted = true;
      return normalizeMoney(prev - a);
    });
    if (!accepted) return;

    pendingBetsRef.current.push(a);

    // record last bet timestamp for activity tracking
    try {
      setLastBetAt(Date.now());
    } catch {}

    updateCurrentAndAll((s) => ({ ...s, wagered: normalizeMoney(s.wagered + a) }));
  };

  if (!isLoaded) {
    return null;
  }

  const liveStats = liveStatsByGame[currentGameId] ?? liveStatsByGame.all ?? createEmptyLiveStats();

  return (
    <WalletContext.Provider
      value={{
        balance,
        addToBalance,
        subtractFromBalance,
        liveStats,
        liveStatsByGame,
        currentGameId,
        resetLiveStats,
        finalizePendingLoss,
        lastBetAt,
      }}
    >
      {children}
    </WalletContext.Provider>
  );
};

export const useWallet = () => {
  const context = useContext(WalletContext);
  if (context === undefined) {
    throw new Error("useWallet must be used within a WalletProvider");
  }
  return context;
};
