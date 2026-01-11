"use client";

import React, { createContext, useContext, useEffect, useMemo, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { getItem, setItem, clearStore } from "../lib/indexedDB";

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
  { id: "mines", label: "Mines" },
  { id: "keno", label: "Keno" },
  { id: "dragontower", label: "Dragon Tower" },
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

type GameId = (typeof GAME_OPTIONS)[number]["id"];
type GameKey = GameId | "all" | "unknown";
type LiveStatsByGame = Record<GameKey, LiveStatsState>;

type WinMeta = {
  game: GameKey;
  profit: number;
  multi: number;
};

type LossMeta = {
  game: GameKey;
  loss: number;
};

type GameUpdate = {
  profit?: number;
  multi?: number;
  loss?: number;
};

interface WalletContextType {
  balance: number;
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
}

const WalletContext = createContext<WalletContextType | undefined>(undefined);

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

export const WalletProvider = ({ children }: { children: React.ReactNode }) => {
  const [balance, setBalance] = useState<number>(0);
  const balanceRef = useRef<number>(0);
  const [isLoaded, setIsLoaded] = useState(false);
  const [liveStatsByGame, setLiveStatsByGame] = useState<LiveStatsByGame>(() => {
    const empty: Partial<LiveStatsByGame> = { all: createEmptyLiveStats(), unknown: createEmptyLiveStats() };
    for (const game of GAME_OPTIONS) {
      empty[game.id] = createEmptyLiveStats();
    }
    return empty as LiveStatsByGame;
  });

  const pendingBetsRef = useRef<number[]>([]);
  const betCountRef = useRef<number>(0);
  const syncTimerRef = useRef<number | null>(null);
  const pendingUpdatesRef = useRef<Map<GameKey, GameUpdate>>(new Map());
  const flushInFlightRef = useRef<Promise<void> | null>(null);
  const pathname = usePathname();
  const currentGameId = useMemo(() => deriveGameId(pathname ?? "/"), [pathname]);
  const [lastBetAt, setLastBetAt] = useState<number | null>(null);

  const SYNC_DEBOUNCE_MS = 2500;
  const BETS_PER_SYNC = 20;

  const mergeGameUpdate = (prev: GameUpdate | undefined, next: GameUpdate): GameUpdate => {
    const merged: GameUpdate = { ...prev };

    if (typeof next.profit === "number") {
      merged.profit = Math.max(merged.profit ?? 0, next.profit);
    }
    if (typeof next.multi === "number") {
      merged.multi = Math.max(merged.multi ?? 0, next.multi);
    }
    if (typeof next.loss === "number") {
      merged.loss = Math.max(merged.loss ?? 0, next.loss);
    }

    return merged;
  };

  const queueUpdate = (meta: WinMeta | LossMeta) => {
    const game = meta.game;
    if (!game || game === "unknown" || game === "all") return;

    const update: GameUpdate =
      "loss" in meta
        ? { loss: normalizeMoney(meta.loss) }
        : {
            profit: normalizeMoney(meta.profit),
            multi: normalizeMoney(meta.multi),
          };

    pendingUpdatesRef.current.set(game, mergeGameUpdate(pendingUpdatesRef.current.get(game), update));
  };

  const clearSyncTimer = () => {
    if (syncTimerRef.current) {
      clearTimeout(syncTimerRef.current);
      syncTimerRef.current = null;
    }
  };

  const flushSync = async (): Promise<void> => {
    if (flushInFlightRef.current) return flushInFlightRef.current;

    const run = (async () => {
      clearSyncTimer();
      const username = await getItem<string>("username");
      if (!username) {
        betCountRef.current = 0;
        return;
      }

      const snapshot = new Map(pendingUpdatesRef.current);
      pendingUpdatesRef.current.clear();

      try {
        const investmentValue = await getInvestmentValue();
        const totalBalance = normalizeMoney(balanceRef.current + investmentValue);

        await fetch("/api/user", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name: username, balance: totalBalance }),
        });

        for (const [game, upd] of snapshot.entries()) {
          if (!upd) continue;
          const payload: any = { name: username, balance: totalBalance, game };
          if (typeof upd.profit === "number" && upd.profit > 0) payload.profit = upd.profit;
          if (typeof upd.multi === "number" && upd.multi > 0) payload.multi = upd.multi;
          if (typeof upd.loss === "number" && upd.loss > 0) payload.loss = upd.loss;

          if (!payload.profit && !payload.multi && !payload.loss) continue;

          await fetch("/api/user", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload),
          });
        }

        betCountRef.current = 0;
      } catch (error) {
        for (const [game, upd] of snapshot.entries()) {
          pendingUpdatesRef.current.set(game, mergeGameUpdate(pendingUpdatesRef.current.get(game), upd));
        }
        console.error("Failed to sync balance", error);
      }
    })();

    flushInFlightRef.current = run;
    try {
      await run;
    } finally {
      flushInFlightRef.current = null;
    }
  };

  const scheduleSync = () => {
    clearSyncTimer();
    syncTimerRef.current = window.setTimeout(() => {
      void flushSync();
    }, SYNC_DEBOUNCE_MS);
  };

  const getInvestmentValue = async (): Promise<number> => {
    try {
      const raw = await getItem<string>("flopper_investment_v1");
      if (!raw) return 0;
      const parsed = JSON.parse(raw);
      if (typeof parsed.principal !== "number" || typeof parsed.startedAtMs !== "number") return 0;
      
      const HOUR_MS = 60 * 60 * 1000;
      const RATE_PER_HOUR = 0.01;
      const nowMs = Date.now();
      
      if (parsed.principal <= 0) return 0;
      const elapsedMs = Math.max(0, nowMs - parsed.startedAtMs);
      const hours = elapsedMs / HOUR_MS;
      const value = parsed.principal * (1 + RATE_PER_HOUR * hours);
      return normalizeMoney(value);
    } catch {
      return 0;
    }
  };

  const syncBalance = async (): Promise<void> => {
    try {
      await flushSync();
    } catch (error) {
      console.error("Failed to sync balance", error);
    }
  };

  useEffect(() => {
    const loadData = async () => {
      const storedBalance = await getItem<string>("flopper_balance");
      const storedInvest = await getItem<string>("flopper_investment_v1");
      const storedDailyBonus = await getItem<string>("flopper_hourly_reward_last_claim_v1");

      // Older versions used a "verified" flag and cleared the entire store when it was missing.
      // That caused random resets (including playtime) when the flag got lost.
      const verified = await getItem<string>("verified");
      const hasAnyState = Boolean(storedBalance || storedInvest || storedDailyBonus);
      if (!verified && hasAnyState) {
        try {
          await setItem("verified", "true");
        } catch (err) {
          console.error("Failed to set verified flag", err);
        }
      }

      if (storedBalance) {
        const initial = normalizeMoney(parseFloat(storedBalance));
        balanceRef.current = initial;
        setBalance(initial);
      } else if(!storedInvest && !storedDailyBonus) {
        balanceRef.current = 1000.0;
        setBalance(1000.0);
        await setItem("flopper_balance", "1000.00");
        try {
          await setItem("verified", "true");
        } catch (err) {
          console.error('Failed to set verified flag', err);
        }
      }

      setIsLoaded(true);
    };
    loadData();
  }, []);

  useEffect(() => {
    balanceRef.current = balance;
  }, [balance]);

  useEffect(() => {
    if (isLoaded) {
      setItem("flopper_balance", normalizeMoney(balance).toFixed(2));
    }
  }, [balance, isLoaded]);

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

  const settleBetWithPayout = (payout: number): WinMeta | LossMeta | null => {
    const normalizedPayout = normalizeMoney(payout);
    if (normalizedPayout <= 0) return null;
    const bet = pendingBetsRef.current.shift();
    if (typeof bet !== "number") return null;

    const roundNet = normalizeMoney(normalizedPayout - bet);
    const multiplier = bet > 0 ? normalizeMoney(normalizedPayout / bet) : 0;
    if (roundNet > 0) {
      updateCurrentAndAll((s) => ({ ...s, wins: s.wins + 1 }));
    } else if (roundNet < 0) {
      updateCurrentAndAll((s) => ({ ...s, losses: s.losses + 1 }));
    }
    applyNetChange(roundNet);

    if (roundNet > 0 && multiplier > 0) {
      return { game: currentGameId, profit: roundNet, multi: multiplier };
    }

    if (roundNet < 0) {
      return { game: currentGameId, loss: normalizeMoney(-roundNet) };
    }

    return null;
  };

  const finalizePendingLoss = () => {
    const bet = pendingBetsRef.current.shift();
    if (typeof bet !== "number") return;
    updateCurrentAndAll((s) => ({ ...s, losses: s.losses + 1 }));
    applyNetChange(-normalizeMoney(bet));
    queueUpdate({ game: currentGameId, loss: normalizeMoney(bet) });
    scheduleSync();
  };

  const resetLiveStats = (gameId: GameKey = currentGameId) => {
    pendingBetsRef.current = [];
    if (gameId === "all") {
      setLiveStatsByGame(() => {
        const next: LiveStatsByGame = { all: createEmptyLiveStats(), unknown: createEmptyLiveStats() } as any;
        for (const game of GAME_OPTIONS) {
          next[game.id] = createEmptyLiveStats();
        }
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
    const next = normalizeMoney(balanceRef.current + a);
    balanceRef.current = next;
    setBalance(next);

    const meta = settleBetWithPayout(a);
    if (meta) queueUpdate(meta);
    scheduleSync();
  };

  const subtractFromBalance = (amount: number) => {
    const a = normalizeMoney(amount);
    if (a <= 0) return;
    if (a > balanceRef.current) return;
    const next = normalizeMoney(balanceRef.current - a);
    balanceRef.current = next;
    setBalance(next);

    pendingBetsRef.current.push(a);

    betCountRef.current += 1;

    if (betCountRef.current >= BETS_PER_SYNC) {
      void flushSync();
    } else {
      scheduleSync();
    }


    try {
      setLastBetAt(Date.now());
    } catch {}

    updateCurrentAndAll((s) => ({ ...s, wagered: normalizeMoney(s.wagered + a) }));
  };

  const creditBalance = (amount: number) => {
    const a = normalizeMoney(amount);
    if (a <= 0) return;
    const next = normalizeMoney(balanceRef.current + a);
    balanceRef.current = next;
    setBalance(next);
    scheduleSync();
  };

  const debitBalance = (amount: number): boolean => {
    const a = normalizeMoney(amount);
    if (a <= 0) return false;
    if (a > balanceRef.current) return false;
    const next = normalizeMoney(balanceRef.current - a);
    balanceRef.current = next;
    setBalance(next);
    scheduleSync();

    // Treat debits as activity as well (some games use debitBalance instead of subtractFromBalance).
    try {
      setLastBetAt(Date.now());
    } catch {}

    return true;
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
        creditBalance,
        debitBalance,
        liveStats,
        liveStatsByGame,
        currentGameId,
        resetLiveStats,
        finalizePendingLoss,
        syncBalance,
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
