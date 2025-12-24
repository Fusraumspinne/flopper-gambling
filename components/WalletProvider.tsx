"use client";

import React, { createContext, useContext, useEffect, useMemo, useRef, useState } from "react";

type LiveStatsPoint = {
  t: number;
  net: number;
};

export type LiveStatsState = {
  startedAt: number;
  net: number;
  wagered: number;
  wins: number;
  losses: number;
  history: LiveStatsPoint[];
};

interface WalletContextType {
  balance: number;
  addToBalance: (amount: number) => void;
  subtractFromBalance: (amount: number) => void;
  liveStats: LiveStatsState;
  resetLiveStats: () => void;
  finalizePendingLoss: () => void;
}

const WalletContext = createContext<WalletContextType | undefined>(undefined);

export const WalletProvider = ({ children }: { children: React.ReactNode }) => {
  const [balance, setBalance] = useState<number>(0);
  const [isLoaded, setIsLoaded] = useState(false);

  // Bets are tracked as a FIFO queue. A payout settles the oldest pending bet.
  // Use a ref to avoid React StrictMode / batching side-effects.
  const pendingBetsRef = useRef<number[]>([]);

  const LIVE_STATS_KEY = "flopper_livestats_v1";

  const initialLiveStats = useMemo<LiveStatsState>(
    () => ({
      startedAt: Date.now(),
      net: 0,
      wagered: 0,
      wins: 0,
      losses: 0,
      history: [{ t: Date.now(), net: 0 }],
    }),
    []
  );

  const [liveStats, setLiveStats] = useState<LiveStatsState>(initialLiveStats);

  useEffect(() => {
    const storedBalance = localStorage.getItem("flopper_balance");
    if (storedBalance) {
      setBalance(parseFloat(storedBalance));
    } else {
      setBalance(1000.0);
      localStorage.setItem("flopper_balance", "1000.00");
    }

    const storedStats = localStorage.getItem(LIVE_STATS_KEY);
    if (storedStats) {
      try {
        const parsed = JSON.parse(storedStats) as Partial<LiveStatsState>;
        if (
          typeof parsed.startedAt === "number" &&
          typeof parsed.net === "number" &&
          typeof parsed.wagered === "number" &&
          typeof parsed.wins === "number" &&
          typeof parsed.losses === "number" &&
          Array.isArray(parsed.history)
        ) {
          const history = parsed.history
            .filter((p: any) => p && typeof p.t === "number" && typeof p.net === "number")
            .map((p: any) => ({ t: p.t, net: p.net }));

          setLiveStats({
            startedAt: parsed.startedAt,
            net: parsed.net,
            wagered: parsed.wagered,
            wins: parsed.wins,
            losses: parsed.losses,
            history: history.length > 0 ? history : [{ t: Date.now(), net: parsed.net }],
          });
        }
      } catch {
        // ignore corrupted stats
      }
    }

    setIsLoaded(true);
  }, [LIVE_STATS_KEY]);

  useEffect(() => {
    if (isLoaded) {
      localStorage.setItem("flopper_balance", balance.toFixed(2));
    }
  }, [balance, isLoaded]);

  useEffect(() => {
    if (isLoaded) {
      localStorage.setItem(LIVE_STATS_KEY, JSON.stringify(liveStats));
    }
  }, [liveStats, isLoaded, LIVE_STATS_KEY]);

  const applyNetChange = (roundNet: number) => {
    if (!Number.isFinite(roundNet) || roundNet === 0) return;
    setLiveStats((prev) => {
      const nextNet = prev.net + roundNet;
      const nextHistory = [...prev.history, { t: Date.now(), net: nextNet }];
      return { ...prev, net: nextNet, history: nextHistory };
    });
  };

  const settleBetWithPayout = (payout: number) => {
    if (!Number.isFinite(payout) || payout <= 0) return;
    const bet = pendingBetsRef.current.shift();
    if (typeof bet !== "number") return;

    const roundNet = payout - bet;
    if (roundNet > 0) {
      setLiveStats((s) => ({ ...s, wins: s.wins + 1 }));
    } else if (roundNet < 0) {
      setLiveStats((s) => ({ ...s, losses: s.losses + 1 }));
    }
    applyNetChange(roundNet);
  };

  const finalizePendingLoss = () => {
    const bet = pendingBetsRef.current.shift();
    if (typeof bet !== "number") return;
    setLiveStats((s) => ({ ...s, losses: s.losses + 1 }));
    applyNetChange(-bet);
  };

  const resetLiveStats = () => {
    pendingBetsRef.current = [];
    setLiveStats({
      startedAt: Date.now(),
      net: 0,
      wagered: 0,
      wins: 0,
      losses: 0,
      history: [{ t: Date.now(), net: 0 }],
    });
  };

  const addToBalance = (amount: number) => {
    if (!Number.isFinite(amount) || amount <= 0) return;
    setBalance((prev) => prev + amount);

    // If this is a game payout, settle one pending bet to count win/loss.
    settleBetWithPayout(amount);
  };

  const subtractFromBalance = (amount: number) => {
    if (!Number.isFinite(amount) || amount <= 0) return;
    // Bets should not affect net until the round is settled (payout or loss).
    // IMPORTANT: avoid side-effects inside the state-updater (React dev/StrictMode may invoke it twice).
    // All games already check `betAmount > balance` before calling this, so we can treat `amount` as the bet.
    if (amount > balance) return;
    pendingBetsRef.current.push(amount);
    setBalance((prev) => prev - amount);

    setLiveStats((s) => ({ ...s, wagered: s.wagered + amount }));
  };

  if (!isLoaded) {
    return null;
  }

  return (
    <WalletContext.Provider value={{ balance, addToBalance, subtractFromBalance, liveStats, resetLiveStats, finalizePendingLoss }}>
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
