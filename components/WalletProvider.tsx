"use client";

import React, { createContext, useContext, useEffect, useMemo, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { useSession } from "next-auth/react";

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
  { id: "bigbassamazonas", label: "Big Bass Amazonas" },
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
  { id: "horserace", label: "Horse Race" },
  { id: "cases", label: "Cases" },
  { id: "diamonds", label: "Diamonds" },
  { id: "crash", label: "Crash" },
  { id: "drill", label: "Drill" },
  { id: "plinko", label: "Plinko" },
  { id: "bars", label: "Bars" },
  { id: "spinningwheel", label: "Spinning Wheel" },
  { id: "darts", label: "Darts" },
  { id: "vault", label: "Vault" },
  { id: "snakes", label: "Snakes" },
  { id: "coinflip", label: "Coinflip" },
  { id: "rps", label: "Rock Paper Scissors" },
  { id: "hilo", label: "Hi-Lo" },
  { id: "livepoker", label: "Live Poker" },
] as const;

const ALL_OPTION = { id: "all", label: "All Games" } as const;
export const DROPDOWN_GAME_OPTIONS = [ALL_OPTION, ...GAME_OPTIONS];
type GameId = (typeof GAME_OPTIONS)[number]["id"];
type GameKey = GameId | "all" | "unknown";
type LiveStatsByGame = Record<GameKey, LiveStatsState>;

type InvestmentState = { principal: number; startedAtMs: number };

type WinMeta = { game: GameKey; profit: number; multi: number; };
type LossMeta = { game: GameKey; loss: number; };
type GameUpdate = { profit?: number; multi?: number; loss?: number; };

interface WalletContextType {
  balance: number;
  weeklyPot: number;
  lastClaim: number;
  lastDailyReward: number;
  btcHoldings: number;
  btcCostUsd: number;
  accountMissing: boolean;
  addToBalance: (amount: number) => void;
  subtractFromBalance: (amount: number) => void;
  increaseBet: (amount: number) => void;
  creditBalance: (amount: number) => void;
  debitBalance: (amount: number) => boolean;
  investment: InvestmentState;
  updateInvestment: (next: InvestmentState) => void;
  setLastDailyReward: (next: number) => void;
  applyServerBalanceDelta: (delta: number) => void;
  applyServerLastDailyReward: (next: number) => void;
  applyServerInvestment: (next: InvestmentState) => void;
  applyServerBtcHoldings: (next: number) => void;
  applyServerBtcCostUsd: (next: number) => void;
  liveStats: LiveStatsState;
  liveStatsByGame: LiveStatsByGame;
  currentGameId: GameKey;
  resetLiveStats: (gameId?: GameKey) => void;
  finalizePendingLoss: () => void;
  lastBetAt: number | null;
  syncBalance: () => Promise<void>;
  setBalanceTo: (amount: number) => void;
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

function createEmptyLiveStatsByGame(): LiveStatsByGame {
  const empty: any = { all: createEmptyLiveStats(), unknown: createEmptyLiveStats() };
  for (const game of GAME_OPTIONS) {
    empty[game.id] = createEmptyLiveStats();
  }
  return empty;
}

function computeWeeklyPotFromHistory(history: LiveStatsPoint[], lastClaim: number) {
  if (!Array.isArray(history) || history.length === 0) return 0;

  let baseNet = 0;
  for (const point of history) {
    if (point.t <= lastClaim) baseNet = point.net;
    else break;
  }

  let prevNet = baseNet;
  let pot = 0;

  for (const point of history) {
    if (point.t <= lastClaim) continue;
    const delta = point.net - prevNet;
    if (delta < 0) pot += Math.abs(delta) * PAYBACK_RATE;
    prevNet = point.net;
  }

  return normalizeMoney(pot);
}

export const WalletProvider = ({ children }: { children: React.ReactNode }) => {
  const [balance, setBalance] = useState<number>(0);
  const [btcHoldings, setBtcHoldings] = useState<number>(0);
  const [btcCostUsd, setBtcCostUsd] = useState<number>(0);
  const [lastClaim, setLastClaim] = useState<number>(0);
  const [lastDailyReward, setLastDailyRewardState] = useState<number>(0);
  const [weeklyPayback, setWeeklyPayback] = useState<number>(0);
  const [isLoaded, setIsLoaded] = useState(false);
  const [accountMissing, setAccountMissing] = useState(false);
  const balanceRef = useRef<number>(0);
  const lastClaimRef = useRef<number>(0);
  const lastDailyRewardRef = useRef<number>(0);
  const weeklyPaybackRef = useRef<number>(0);
  const [investment, setInvestment] = useState<InvestmentState>({ principal: 0, startedAtMs: Date.now() });
  const investmentRef = useRef<InvestmentState>({ principal: 0, startedAtMs: Date.now() });

  const [liveStatsByGame, setLiveStatsByGame] = useState<LiveStatsByGame>(() => createEmptyLiveStatsByGame());

  const pendingBetsRef = useRef<{ amount: number; gameId: GameKey }[]>([]);
  const lastBetPushTsRef = useRef<number | null>(null);
  const lastFinalizeLossAtRef = useRef<number | null>(null);
  const betCountRef = useRef<number>(0);
  const syncTimerRef = useRef<number | null>(null);
  const pendingUpdatesRef = useRef<Map<GameKey, GameUpdate>>(new Map());
  const flushInFlightRef = useRef<Promise<void> | null>(null);
  const visibilityFlushQueuedRef = useRef(false);
  const pendingBalanceDeltaRef = useRef<number>(0);
  
  const pendingWeeklyPaybackDeltaRef = useRef<number>(0);
  const pendingInvestmentDeltaRef = useRef<number>(0);
  const investmentDirtyRef = useRef(false);
  const lastClaimDirtyRef = useRef(false);
  const lastDailyRewardDirtyRef = useRef(false);
  const accountMissingRef = useRef(false);
  const usernameRef = useRef<string | null>(null);
  const pathname = usePathname();
  const currentGameId = useMemo(() => deriveGameId(pathname ?? "/"), [pathname]);
  const [lastBetAt, setLastBetAt] = useState<number | null>(null);
  const { data: session, status } = useSession();
  const username = session?.user?.name ?? null;

  const weeklyPot = useMemo(() => weeklyPayback, [weeklyPayback]);

  const mergeGameUpdate = (prev: GameUpdate | undefined, next: GameUpdate): GameUpdate => {
    const merged: GameUpdate = { ...prev };
    if (typeof next.profit === "number") merged.profit = Math.max(merged.profit ?? 0, next.profit);
    if (typeof next.multi === "number") merged.multi = Math.max(merged.multi ?? 0, next.multi);
    if (typeof next.loss === "number") merged.loss = Math.max(merged.loss ?? 0, next.loss);
    return merged;
  };

  const queueUpdate = (meta: WinMeta | LossMeta) => {
    const game = meta.game;
    if (!game || game === "unknown" || game === "all") return;
    const update: GameUpdate = "loss" in meta 
        ? { loss: normalizeMoney(meta.loss) } 
        : { profit: normalizeMoney(meta.profit), multi: normalizeMoney(meta.multi) };
    pendingUpdatesRef.current.set(game, mergeGameUpdate(pendingUpdatesRef.current.get(game), update));
  };

  const buildSyncPayload = (
    snapshotUpdates: Map<GameKey, GameUpdate>,
    snapBalanceDelta: number,
    snapWeeklyPaybackDelta: number,
    snapInvestmentDelta: number,
    snapInvestmentDirty: boolean,
    snapLastClaimDirty: boolean,
    snapLastDailyDirty: boolean,
    snapLastClaim: number,
    snapLastDaily: number
  ) => {
    const activeUsername = usernameRef.current;
    if (!activeUsername || accountMissingRef.current) return null;

    const payload: Record<string, any> = { 
      name: activeUsername,
      syncId: Math.random().toString(36).substring(2) + Date.now().toString(36)
    };

    if (snapshotUpdates.size > 0) {
      payload.updates = Array.from(snapshotUpdates.entries()).map(([game, upd]) => ({ game, ...upd }));
    }
    if (snapBalanceDelta !== 0) payload.balanceDelta = snapBalanceDelta;
    if (snapLastClaimDirty) payload.lastWeeklyPayback = snapLastClaim;
    if (snapLastDailyDirty) payload.lastDailyReward = snapLastDaily;
    if (snapInvestmentDirty) payload.investmentDelta = snapInvestmentDelta;
    if (snapWeeklyPaybackDelta !== 0) payload.weeklyPaybackDelta = snapWeeklyPaybackDelta;

    return payload;
  };

  const clearSnapshotted = (
    snapUpdates: Map<GameKey, GameUpdate>,
    snapBalanceDelta: number,
    snapWeeklyPaybackDelta: number,
    snapInvestmentDelta: number,
    snapInvestmentDirty: boolean,
    snapLastClaimDirty: boolean,
    snapLastDailyDirty: boolean
  ) => {
    pendingBalanceDeltaRef.current = normalizeMoney(pendingBalanceDeltaRef.current - snapBalanceDelta);
    pendingWeeklyPaybackDeltaRef.current = normalizeMoney(pendingWeeklyPaybackDeltaRef.current - snapWeeklyPaybackDelta);
    pendingInvestmentDeltaRef.current = normalizeMoney(pendingInvestmentDeltaRef.current - snapInvestmentDelta);

    if (snapInvestmentDirty) investmentDirtyRef.current = false;
    if (snapLastClaimDirty) lastClaimDirtyRef.current = false;
    if (snapLastDailyDirty) lastDailyRewardDirtyRef.current = false;

    for (const [game, snapUpd] of snapUpdates) {
      const currentUpd = pendingUpdatesRef.current.get(game);
      if (currentUpd) {
        if (currentUpd.profit === snapUpd.profit) delete currentUpd.profit;
        if (currentUpd.multi === snapUpd.multi) delete currentUpd.multi;
        if (currentUpd.loss === snapUpd.loss) delete currentUpd.loss;
        if (Object.keys(currentUpd).length === 0) {
          pendingUpdatesRef.current.delete(game);
        }
      }
    }
    betCountRef.current = Math.max(0, betCountRef.current - snapUpdates.size);
  };

  const flushSync = async (options?: { allowHidden?: boolean; useBeacon?: boolean }): Promise<void> => {
    if (typeof document !== "undefined" && document.visibilityState === "hidden" && !options?.allowHidden && !options?.useBeacon) {
      visibilityFlushQueuedRef.current = true;
      return;
    }

    const snapshotUpdates = new Map(pendingUpdatesRef.current);
    const snapBalanceDelta = normalizeMoney(pendingBalanceDeltaRef.current);
    const snapWeeklyPaybackDelta = normalizeMoney(pendingWeeklyPaybackDeltaRef.current);
    const snapInvestmentDelta = normalizeMoney(pendingInvestmentDeltaRef.current);
    const snapInvestmentDirty = investmentDirtyRef.current;
    const snapLastClaimDirty = lastClaimDirtyRef.current;
    const snapLastDailyDirty = lastDailyRewardDirtyRef.current;
    const snapLastClaim = lastClaimRef.current;
    const snapLastDaily = lastDailyRewardRef.current;

    if (
      snapshotUpdates.size === 0 &&
      snapBalanceDelta === 0 &&
      !snapInvestmentDirty &&
      !snapLastClaimDirty &&
      !snapLastDailyDirty &&
      snapWeeklyPaybackDelta === 0
    ) {
      return;
    }

    const payload = buildSyncPayload(
      snapshotUpdates,
      snapBalanceDelta,
      snapWeeklyPaybackDelta,
      snapInvestmentDelta,
      snapInvestmentDirty,
      snapLastClaimDirty,
      snapLastDailyDirty,
      snapLastClaim,
      snapLastDaily
    );
    if (!payload) return;

    if (options?.useBeacon) {
      if (typeof navigator !== "undefined" && "sendBeacon" in navigator) {
        try {
          const blob = new Blob([JSON.stringify(payload)], { type: "application/json" });
          const ok = navigator.sendBeacon("/api/user", blob);
          if (ok) {
            clearSnapshotted(snapshotUpdates, snapBalanceDelta, snapWeeklyPaybackDelta, snapInvestmentDelta, snapInvestmentDirty, snapLastClaimDirty, snapLastDailyDirty);
          }
        } catch { }
      }
      return;
    }

    if (flushInFlightRef.current) return flushInFlightRef.current;

    const run = (async () => {
      if (syncTimerRef.current) clearTimeout(syncTimerRef.current);

      try {
        const res = await fetch("/api/user", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
        if (res.status === 404) {
          setAccountMissing(true);
          return;
        }
        if (!res.ok) return;

        const data = await res.json().catch(() => null);

        clearSnapshotted(snapshotUpdates, snapBalanceDelta, snapWeeklyPaybackDelta, snapInvestmentDelta, snapInvestmentDirty, snapLastClaimDirty, snapLastDailyDirty);

        if (data && typeof data.balance === "number") {
          const serverBalance = normalizeMoney(data.balance);
          const reconciledBalance = normalizeMoney(serverBalance + pendingBalanceDeltaRef.current);
          balanceRef.current = reconciledBalance;
          setBalance(reconciledBalance);
        }
        if (data && data.lastPot) {
          const parsed = new Date(data.lastPot).getTime();
          if (Number.isFinite(parsed)) setLastClaim(parsed);
        }
        if (data && typeof data.lastDailyReward === "number") {
          const parsed = Number(data.lastDailyReward);
          if (Number.isFinite(parsed)) setLastDailyRewardState(Math.floor(parsed));
        } else if (data && data.lastDailyReward) {
          const parsed = new Date(data.lastDailyReward).getTime();
          if (Number.isFinite(parsed)) setLastDailyRewardState(Math.floor(parsed));
        }
        if (data && typeof data.weeklyPayback === "number") {
          const serverWeekly = normalizeMoney(data.weeklyPayback);
          const reconciledWeekly = normalizeMoney(serverWeekly + pendingWeeklyPaybackDeltaRef.current);
          setWeeklyPayback(reconciledWeekly);
          weeklyPaybackRef.current = reconciledWeekly;
        }
        if (data && data.investment && typeof data.investment === "object") {
          const principal = Number(data.investment.principal ?? 0);
          const startedAtMs = Number(data.investment.startedAtMs ?? Date.now());
          if (Number.isFinite(principal) && Number.isFinite(startedAtMs)) {
            const reconciledPrincipal = normalizeMoney(principal + pendingInvestmentDeltaRef.current);
            const sanitized = { principal: reconciledPrincipal, startedAtMs: Math.floor(startedAtMs) };
            setInvestment(sanitized);
            investmentRef.current = sanitized;
          }
        }
      } catch (error) {
        console.error("Failed to sync balance", error);
      }
    })();

    flushInFlightRef.current = run;
    try {
      await run;
    } finally {
      flushInFlightRef.current = null;
    }

    const snapshotPendingUpdates = new Map(pendingUpdatesRef.current);
    if (
      snapshotPendingUpdates.size > 0 ||
      pendingBalanceDeltaRef.current !== 0 ||
      investmentDirtyRef.current ||
      lastClaimDirtyRef.current ||
      lastDailyRewardDirtyRef.current ||
      pendingWeeklyPaybackDeltaRef.current !== 0
    ) {
      void flushSync();
    }
  };

  const scheduleSync = (unused?: boolean) => {
    if (typeof window === "undefined") return;
    if (syncTimerRef.current) clearTimeout(syncTimerRef.current);
    void flushSync();
  };

  useEffect(() => {
    if (status === "loading") return;

    const loadData = async () => {
      const baseStats = createEmptyLiveStatsByGame();

      if (!username) {
        setAccountMissing(false);
        balanceRef.current = 0.0;
        setBalance(0.0);
        setLastClaim(Date.now());
        setLastDailyRewardState(Date.now());
        setWeeklyPayback(0);
        setInvestment({ principal: 0, startedAtMs: Date.now() });
        setLiveStatsByGame(baseStats);
        setIsLoaded(true);
        return;
      }

      try {
        const res = await fetch(`/api/user?name=${encodeURIComponent(username)}`);
        if (res.status === 404) {
          const now = Date.now();
          setAccountMissing(true);
          balanceRef.current = 0.0;
          setBalance(0.0);
          setLastClaim(now);
          setLastDailyRewardState(now);
          setWeeklyPayback(0);
          setInvestment({ principal: 0, startedAtMs: now });
          setLiveStatsByGame(baseStats);
          setIsLoaded(true);
          return;
        }

        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();

        setAccountMissing(false);

        const nextBalance = typeof data.balance === "number" ? normalizeMoney(data.balance) : 0;
        balanceRef.current = nextBalance;
        setBalance(nextBalance);

        const lastWeeklyPayback = data.lastWeeklyPayback
          ? new Date(data.lastWeeklyPayback).getTime()
          : data.lastPot
            ? new Date(data.lastPot).getTime()
            : 0;
        setLastClaim(Number.isFinite(lastWeeklyPayback) ? lastWeeklyPayback : 0);

        if (typeof data.lastDailyReward === "number" && Number.isFinite(data.lastDailyReward)) {
          setLastDailyRewardState(Math.floor(data.lastDailyReward));
        } else if (data.lastDailyReward) {
          const parsed = new Date(data.lastDailyReward).getTime();
          setLastDailyRewardState(Number.isFinite(parsed) ? parsed : Date.now());
        } else {
          setLastDailyRewardState(Date.now());
        }

        if (typeof data.weeklyPayback === "number" && Number.isFinite(data.weeklyPayback)) {
          setWeeklyPayback(normalizeMoney(data.weeklyPayback));
        } else {
          setWeeklyPayback(0);
        }

        if (data.investment && typeof data.investment === "object") {
          const principal = Number(data.investment.principal ?? 0);
          const startedAtMs = Number(data.investment.startedAtMs ?? Date.now());
          if (Number.isFinite(principal) && Number.isFinite(startedAtMs)) {
            setInvestment({ principal: normalizeMoney(principal), startedAtMs: Math.floor(startedAtMs) });
          } else {
            setInvestment({ principal: 0, startedAtMs: Date.now() });
          }
        } else {
          setInvestment({ principal: 0, startedAtMs: Date.now() });
        }
        if (typeof data.btcHoldings === "number" && Number.isFinite(data.btcHoldings)) {
          setBtcHoldings(Number(data.btcHoldings));
        } else {
          setBtcHoldings(0);
        }
        if (typeof data.btcCostUsd === "number" && Number.isFinite(data.btcCostUsd)) {
          setBtcCostUsd(normalizeMoney(Number(data.btcCostUsd)));
        } else {
          setBtcCostUsd(0);
        }
        setLiveStatsByGame(baseStats);
      } catch (error) {
        console.error("Failed to load user data", error);
        setAccountMissing(false);
        balanceRef.current = 0.0;
        setBalance(0.0);
        setLastClaim(Date.now());
        setLastDailyRewardState(Date.now());
        setWeeklyPayback(0);
        setInvestment({ principal: 0, startedAtMs: Date.now() });
        setLiveStatsByGame(baseStats);
      }

      setIsLoaded(true);
    };

    loadData();
  }, [status, username]);

  useEffect(() => {
    lastClaimRef.current = lastClaim;
  }, [lastClaim]);

  useEffect(() => {
    lastDailyRewardRef.current = lastDailyReward;
  }, [lastDailyReward]);

  useEffect(() => {
    weeklyPaybackRef.current = weeklyPayback;
  }, [weeklyPayback]);

  const setLastDailyReward = (next: number) => {
    const ts = Math.floor(next);
    setLastDailyRewardState(ts);
    lastDailyRewardDirtyRef.current = true;
    scheduleSync();
  };

  const addWeeklyPayback = (lossAmount: number) => {
    const delta = normalizeMoney(Math.abs(lossAmount) * PAYBACK_RATE);
    if (delta <= 0) return;
    const next = normalizeMoney(weeklyPaybackRef.current + delta);
    weeklyPaybackRef.current = next;
    setWeeklyPayback(next);
    pendingWeeklyPaybackDeltaRef.current = normalizeMoney(pendingWeeklyPaybackDeltaRef.current + delta);
  };

  useEffect(() => {
    investmentRef.current = investment;
  }, [investment]);

  useEffect(() => {
    usernameRef.current = username;
  }, [username]);

  useEffect(() => {
    accountMissingRef.current = accountMissing;
  }, [accountMissing]);

  useEffect(() => {
    if (typeof window === "undefined" || typeof document === "undefined") return;

    const handleVisibility = () => {
      if (document.visibilityState === "visible" && visibilityFlushQueuedRef.current) {
        visibilityFlushQueuedRef.current = false;
        void flushSync({ allowHidden: true });
      }

      if (document.visibilityState === "hidden") {
        void flushSync({ allowHidden: true, useBeacon: true });
      }
    };

    const handlePageHide = () => {
      void flushSync({ allowHidden: true, useBeacon: true });
    };

    document.addEventListener("visibilitychange", handleVisibility);
    window.addEventListener("pagehide", handlePageHide);
    window.addEventListener("beforeunload", handlePageHide);

    return () => {
      document.removeEventListener("visibilitychange", handleVisibility);
      window.removeEventListener("pagehide", handlePageHide);
      window.removeEventListener("beforeunload", handlePageHide);
    };
  }, []);

  const updateCurrentAndAll = (updater: (prev: LiveStatsState, now: number) => LiveStatsState, targetGameId: GameKey = currentGameId) => {
    const now = Date.now();
    setLiveStatsByGame((prev) => {
      const apply = (key: GameKey) => updater(prev[key] || createEmptyLiveStats(), now);
      return { ...prev, [targetGameId]: apply(targetGameId), all: apply("all") };
    });
  };

  const applyNetChange = (roundNet: number, targetGameId: GameKey = currentGameId) => {
    const delta = normalizeMoney(roundNet);
    updateCurrentAndAll((prev, now) => {
      const nextNet = normalizeMoney(prev.net + delta);
      return { ...prev, net: nextNet, history: [...prev.history, { t: now, net: nextNet }] };
    }, targetGameId);
  };

  const recordBalanceDelta = (delta: number) => {
    pendingBalanceDeltaRef.current = normalizeMoney(pendingBalanceDeltaRef.current + delta);
  };

  const addToBalance = (amount: number) => {
    const payout = normalizeMoney(amount);
    const pending = pendingBetsRef.current.shift();
    const hasBet = !!pending;
    const bet = pending ? pending.amount : 0;
    const gameId = pending ? pending.gameId : currentGameId;

    if (!hasBet) {
      const lastPush = lastBetPushTsRef.current;
      const lastLoss = lastFinalizeLossAtRef.current;
      if (lastPush && lastLoss && lastLoss >= lastPush) {
        console.warn("addToBalance called after finalizePendingLoss for the same bet; ignoring suspicious payout", { payout, pending, lastPush, lastLoss });
        return;
      }

      console.warn("addToBalance called without matching pending bet; crediting payout anyway", { payout, pending });
    }

    const next = normalizeMoney(balanceRef.current + payout);
    balanceRef.current = next;
    setBalance(next);
    recordBalanceDelta(payout);

    const roundNet = normalizeMoney(payout - bet);
    applyNetChange(roundNet, gameId);

    if (hasBet) {
      if (roundNet > 0) {
        updateCurrentAndAll((s) => ({ ...s, wins: s.wins + 1 }), gameId);
        queueUpdate({ game: gameId, profit: roundNet, multi: normalizeMoney(payout / bet) });
      } else if (roundNet < 0) {
        updateCurrentAndAll((s) => ({ ...s, losses: s.losses + 1 }), gameId);
        queueUpdate({ game: gameId, loss: Math.abs(roundNet) });
        addWeeklyPayback(roundNet);
      }
    }

    void flushSync();
  };

  const subtractFromBalance = (amount: number) => {
    const a = normalizeMoney(amount);
    if (a <= 0 || a > balanceRef.current) return;
    pendingBetsRef.current.push({ amount: a, gameId: currentGameId });
    lastBetPushTsRef.current = Date.now();
    betCountRef.current += 1;
    setLastBetAt(Date.now());
    updateCurrentAndAll((s) => ({ ...s, wagered: normalizeMoney(s.wagered + a) }));

    const next = normalizeMoney(balanceRef.current - a);
    balanceRef.current = next;
    setBalance(next);
    recordBalanceDelta(-a);

    void flushSync();
  };

  const increaseBet = (amount: number) => {
    const a = normalizeMoney(amount);
    if (a <= 0 || a > balanceRef.current) return;

    if (pendingBetsRef.current.length > 0) {
      pendingBetsRef.current[pendingBetsRef.current.length - 1].amount = normalizeMoney(
        pendingBetsRef.current[pendingBetsRef.current.length - 1].amount + a
      );
    } else {
      subtractFromBalance(a);
      return;
    }

    lastBetPushTsRef.current = Date.now();
    setLastBetAt(Date.now());
    updateCurrentAndAll((s) => ({ ...s, wagered: normalizeMoney(s.wagered + a) }));

    const next = normalizeMoney(balanceRef.current - a);
    balanceRef.current = next;
    setBalance(next);
    recordBalanceDelta(-a);

    void flushSync();
  };

  const finalizePendingLoss = () => {
    const pending = pendingBetsRef.current.shift();
    if (!pending) return;
    const { amount: bet, gameId } = pending;
    lastFinalizeLossAtRef.current = Date.now();
    updateCurrentAndAll((s) => ({ ...s, losses: s.losses + 1 }), gameId);
    applyNetChange(-normalizeMoney(bet), gameId);
    queueUpdate({ game: gameId, loss: normalizeMoney(bet) });
    addWeeklyPayback(bet);
    scheduleSync();
  };

  const creditBalance = (amount: number) => {
    const a = normalizeMoney(amount);
    balanceRef.current = normalizeMoney(balanceRef.current + a);
    setBalance(balanceRef.current);
    recordBalanceDelta(a);
    scheduleSync();
  };

  const debitBalance = (amount: number): boolean => {
    const a = normalizeMoney(amount);
    if (a <= 0 || a > balanceRef.current) return false;
    balanceRef.current = normalizeMoney(balanceRef.current - a);
    setBalance(balanceRef.current);
    setLastBetAt(Date.now());
    recordBalanceDelta(-a);
    scheduleSync();
    return true;
  };

  const setBalanceTo = (amount: number) => {
    const next = normalizeMoney(Number(amount) || 0);
    balanceRef.current = next;
    setBalance(next);
  };

  const applyServerBalanceDelta = (delta: number) => {
    const a = normalizeMoney(delta);
    if (a === 0) return;
    balanceRef.current = normalizeMoney(balanceRef.current + a);
    setBalance(balanceRef.current);
  };

  const applyServerLastDailyReward = (next: number) => {
    const ts = Math.floor(next);
    if (!Number.isFinite(ts)) return;
    setLastDailyRewardState(ts);
    lastDailyRewardRef.current = ts;
    lastDailyRewardDirtyRef.current = false;
  };

  const applyServerInvestment = (next: InvestmentState) => {
    const principal = normalizeMoney(next.principal);
    const startedAtMs = Math.floor(next.startedAtMs);
    const sanitized = { principal, startedAtMs };
    investmentRef.current = sanitized;
    setInvestment(sanitized);
    pendingInvestmentDeltaRef.current = 0;
    investmentDirtyRef.current = false;
  };

  const applyServerBtcHoldings = (next: number) => {
    const n = Number(next) || 0;
    if (!Number.isFinite(n)) return;
    setBtcHoldings(n);
  };

  const applyServerBtcCostUsd = (next: number) => {
    const n = Number(next) || 0;
    if (!Number.isFinite(n)) return;
    setBtcCostUsd(normalizeMoney(n));
  };

  const updateInvestment = (next: InvestmentState) => {
    const principal = normalizeMoney(next.principal);
    const startedAtMs = Math.floor(next.startedAtMs);
    const sanitized = { principal, startedAtMs };
    const prevPrincipal = investmentRef.current?.principal ?? 0;
    const delta = normalizeMoney(principal - prevPrincipal);
    pendingInvestmentDeltaRef.current = normalizeMoney(pendingInvestmentDeltaRef.current + delta);
    investmentRef.current = sanitized;
    setInvestment(sanitized);
    investmentDirtyRef.current = true;
    scheduleSync();
  };

  const claimWeeklyPot = async () => {
    const activeUsername = usernameRef.current;
    if (!activeUsername) return { success: false, error: "Nicht eingeloggt." };
    if (accountMissingRef.current) return { success: false, error: "Account existiert nicht." };

    await flushSync();

    const res = await fetch("/api/rewards/weekly", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: activeUsername }),
    });

    const data = await res.json().catch(() => null);
    if (!res.ok || !data?.success) {
      return { success: false, error: data?.error || "Fehler beim Claim." };
    }

    const amount = normalizeMoney(Number(data.amount) || 0);
    if (amount > 0) applyServerBalanceDelta(amount);

    const nextLast = Number(data.lastWeeklyPayback ?? Date.now());
    setLastClaim(nextLast);
    lastClaimRef.current = nextLast;
    lastClaimDirtyRef.current = false;

    const nextWeekly = normalizeMoney(Number(data.weeklyPayback ?? 0));
    setWeeklyPayback(nextWeekly);
    weeklyPaybackRef.current = nextWeekly;
    pendingWeeklyPaybackDeltaRef.current = 0;

    return { success: true };
  };

  const resetLiveStats = (gameId: GameKey = currentGameId) => {
    setLiveStatsByGame((prev) => {
      const next: any = { ...prev };
      const targets = gameId === "all" ? Object.keys(prev) : [gameId];
      for (const key of targets) {
        next[key] = createEmptyLiveStats();
      }
      return next;
    });

    scheduleSync();
  };

  if (!isLoaded) return null;
  if (!isLoaded) return null;

  return (
    <WalletContext.Provider
      value={{
        balance, weeklyPot, lastClaim, lastDailyReward, accountMissing, addToBalance, subtractFromBalance, increaseBet, creditBalance, debitBalance,
        investment, updateInvestment, setLastDailyReward,
        applyServerBalanceDelta, applyServerLastDailyReward, applyServerInvestment, applyServerBtcHoldings, applyServerBtcCostUsd,
        btcHoldings,
        btcCostUsd,
        liveStats: liveStatsByGame[currentGameId] || liveStatsByGame.all,
        liveStatsByGame, currentGameId, resetLiveStats, finalizePendingLoss,
        syncBalance: flushSync, setBalanceTo, lastBetAt, claimWeeklyPot
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