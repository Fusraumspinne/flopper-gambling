"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useWallet } from "@/components/WalletProvider";
import {
  Diamond,
  LocalFireDepartment,
  PlayArrow,
  Refresh,
} from "@mui/icons-material";

const MULTIPLIERS: Record<number, number[]> = {
  1: [
    1.03, 1.08, 1.12, 1.18, 1.24, 1.3, 1.37, 1.46, 1.55, 1.65, 1.77, 1.9, 2.06,
    2.25, 2.47, 2.75, 3.09, 3.54, 4.12, 4.95, 6.19, 8.25, 12.37, 24.75,
  ],
  2: [
    1.08, 1.17, 1.29, 1.41, 1.56, 1.74, 1.94, 2.18, 2.47, 2.83, 3.26, 3.81, 4.5,
    5.4, 6.6, 8.25, 10.61, 14.14, 19.8, 29.7, 49.5, 99, 297,
  ],
  3: [
    1.12, 1.29, 1.48, 1.71, 2, 2.35, 2.79, 3.35, 4.07, 5, 6.26, 7.96, 10.35,
    13.8, 18.97, 27.11, 40.66, 65.06, 113.85, 227.7, 569.25, 2277,
  ],
  4: [
    1.18, 1.41, 1.71, 2.09, 2.58, 3.23, 4.09, 5.26, 6.88, 9.17, 12.51, 17.52,
    25.3, 37.95, 59.64, 99.39, 178.91, 357.81, 834.9, 2504.7, 12523.5,
  ],
  5: [
    1.24, 1.56, 2, 2.58, 3.39, 4.52, 6.14, 8.5, 12.04, 17.52, 26.27, 40.87,
    66.41, 113.85, 208.72, 417.45, 939.26, 2504.7, 8766.45, 52598.7,
  ],
  6: [
    1.3, 1.74, 2.35, 3.23, 4.52, 6.46, 9.44, 14.17, 21.89, 35.03, 58.38, 102.17,
    189.75, 379.5, 834.9, 2087.25, 6261.75, 25047, 175329,
  ],
  7: [
    1.37, 1.94, 2.79, 4.09, 6.14, 9.44, 14.95, 24.47, 41.6, 73.95, 138.66,
    277.33, 600.87, 1442.1, 3965.25, 13219.25, 59486.62, 475893,
  ],
  8: [
    1.46, 2.18, 3.35, 5.26, 8.5, 14.17, 24.47, 44.05, 83.2, 166.4, 356.56,
    831.98, 2163.45, 6489.45, 23794.65, 118973.25, 1070759.25,
  ],
  9: [
    1.55, 2.47, 4.07, 6.88, 12.04, 21.89, 41.6, 83.2, 176.8, 404.1, 1010.26,
    2828.73, 9193.39, 36773.55, 202254.52, 2022545.25,
  ],
  10: [
    1.65, 2.83, 5, 9.17, 17.52, 35.03, 73.95, 166.4, 404.1, 1077.61, 3232.84,
    11314.94, 49031.4, 294188.4, 3236072.4,
  ],
  11: [
    1.77, 3.26, 6.26, 12.51, 26.27, 58.38, 138.66, 356.56, 1010.26, 3232.84,
    12123.15, 56574.69, 367735.5, 4412826,
  ],
  12: [
    1.9, 3.81, 7.96, 17.52, 40.87, 102.17, 277.33, 831.98, 2828.73, 11314.69,
    56574.69, 396022.85, 5148297,
  ],
  13: [
    2.06, 4.5, 10.35, 25.3, 66.41, 189.75, 600.87, 2163.15, 9193.39, 49031.4,
    367735.5, 5148297,
  ],
  14: [
    2.25, 5.4, 13.8, 37.95, 113.85, 379.5, 1442.1, 6489.45, 36773.55, 294188.4,
    4412826,
  ],
  15: [
    2.47, 6.6, 18.97, 59.64, 208.72, 834.9, 3965.77, 23794.52, 202254.52,
    3236072.4,
  ],
  16: [
    2.75, 8.25, 27.11, 99.39, 418.45, 2087.25, 13219.25, 118973.25, 2022545.25,
  ],
  17: [3.09, 10.61, 40.66, 178.91, 939.26, 6261.75, 59486.62, 1070759.25],
  18: [3.54, 14.14, 65.06, 357.81, 2504.7, 25047, 475893],
  19: [4.12, 19.8, 113.85, 834.9, 8766.45, 175329],
  20: [4.95, 29.7, 227.7, 2504.7, 52598.7],
  21: [6.19, 45.5, 569.25, 12523.5],
  22: [8.25, 99, 2277],
  23: [12.38, 297],
  24: [24.75],
};

type GameState = "idle" | "playing" | "cashed_out" | "game_over";

interface Tile {
  id: number;
  isMine: boolean;
  isRevealed: boolean;
  revealedByPlayer: boolean;
}

export default function MinesPage() {
  const blendHexColors = (hex1: string, hex2: string, weight = 0.5) => {
    const h1 = hex1.replace("#", "");
    const h2 = hex2.replace("#", "");
    const r1 = parseInt(h1.substring(0, 2), 16);
    const g1 = parseInt(h1.substring(2, 4), 16);
    const b1 = parseInt(h1.substring(4, 6), 16);
    const r2 = parseInt(h2.substring(0, 2), 16);
    const g2 = parseInt(h2.substring(2, 4), 16);
    const b2 = parseInt(h2.substring(4, 6), 16);
    const r = Math.round(r1 * (1 - weight) + r2 * weight);
    const g = Math.round(g1 * (1 - weight) + g2 * weight);
    const b = Math.round(b1 * (1 - weight) + b2 * weight);
    const hex = (n: number) => n.toString(16).padStart(2, "0");
    return `#${hex(r)}${hex(g)}${hex(b)}`;
  };
  const { balance, addToBalance, subtractFromBalance, finalizePendingLoss } =
    useWallet();

  const normalizeMoney = (value: number) => {
    if (!Number.isFinite(value)) return 0;
    const rounded = Math.round((value + Number.EPSILON) * 100) / 100;
    return Object.is(rounded, -0) ? 0 : rounded;
  };

  const parseNumberLoose = (raw: string) => {
    const normalized = raw.replace(",", ".").trim();
    const n = Number(normalized);
    return Number.isFinite(n) ? n : 0;
  };

  const sleep = (ms: number) =>
    new Promise<void>((resolve) => setTimeout(resolve, ms));

  const [betAmount, setBetAmount] = useState<number>(100);
  const [betInput, setBetInput] = useState<string>("100");
  const [mineCount, setMineCount] = useState<number>(3);
  const [gameState, setGameState] = useState<GameState>("idle");
  const [grid, setGrid] = useState<Tile[]>([]);
  const [revealedCount, setRevealedCount] = useState<number>(0);
  const [lastWin, setLastWin] = useState<number>(0);

  const setBetBoth = (next: number) => {
    const v = normalizeMoney(next);
    setBetAmount(v);
    setBetInput(String(v));
  };

  const [playMode, setPlayMode] = useState<"manual" | "auto">("manual");
  const [onWinMode, setOnWinMode] = useState<"reset" | "raise">("reset");
  const [onWinPctInput, setOnWinPctInput] = useState<string>("0");
  const [onLoseMode, setOnLoseMode] = useState<"reset" | "raise">("reset");
  const [onLosePctInput, setOnLosePctInput] = useState<string>("0");
  const [stopProfitInput, setStopProfitInput] = useState<string>("0");
  const [stopLossInput, setStopLossInput] = useState<string>("0");
  const [isAutoBetting, setIsAutoBetting] = useState(false);

  const [autoPickOrder, setAutoPickOrder] = useState<number[]>([]);

  const [resultFx, setResultFx] = useState<"rolling" | "win" | "lose" | null>(
    null
  );
  const resultTimeoutRef = useRef<number | null>(null);

  const betAmountRef = useRef<number>(100);
  const balanceRef = useRef<number>(0);
  const mineCountRef = useRef<number>(3);
  const gameStateRef = useRef<GameState>("idle");
  const isAutoBettingRef = useRef(false);
  const autoOriginalBetRef = useRef<number>(0);
  const autoNetRef = useRef<number>(0);
  const autoPickOrderRef = useRef<number[]>([]);

  useEffect(() => {
    betAmountRef.current = betAmount;
  }, [betAmount]);
  useEffect(() => {
    balanceRef.current = balance;
  }, [balance]);
  useEffect(() => {
    mineCountRef.current = mineCount;
  }, [mineCount]);
  useEffect(() => {
    gameStateRef.current = gameState;
  }, [gameState]);
  useEffect(() => {
    isAutoBettingRef.current = isAutoBetting;
  }, [isAutoBetting]);
  useEffect(() => {
    autoPickOrderRef.current = autoPickOrder;
  }, [autoPickOrder]);

  useEffect(() => {
    resetGrid();
  }, []);

  useEffect(() => {
    return () => {
      if (resultTimeoutRef.current) {
        clearTimeout(resultTimeoutRef.current);
        resultTimeoutRef.current = null;
      }
    };
  }, []);

  const resetGrid = () => {
    const newGrid = Array.from({ length: 25 }, (_, i) => ({
      id: i,
      isMine: false,
      isRevealed: false,
      revealedByPlayer: false,
    }));
    setGrid(newGrid);
    if (resultTimeoutRef.current) {
      clearTimeout(resultTimeoutRef.current);
      resultTimeoutRef.current = null;
    }
    setResultFx(null);
  };

  const showFx = useCallback(async (fx: "win" | "lose") => {
    if (resultTimeoutRef.current) {
      clearTimeout(resultTimeoutRef.current);
      resultTimeoutRef.current = null;
    }
    setResultFx(fx);
    await new Promise<void>((resolve) => {
      resultTimeoutRef.current = window.setTimeout(() => {
        setResultFx(null);
        resultTimeoutRef.current = null;
        resolve();
      }, 900);
    });
  }, []);

  const getValidPickOrder = useCallback((order: number[]) => {
    const seen = new Set<number>();
    const picks: number[] = [];
    for (const id of order) {
      if (!Number.isFinite(id)) continue;
      if (id < 0 || id >= 25) continue;
      if (seen.has(id)) continue;
      seen.add(id);
      picks.push(id);
    }
    return picks;
  }, []);

  const togglePlannedTile = useCallback(
    (id: number) => {
      if (gameStateRef.current === "playing") return;
      if (isAutoBettingRef.current) return;
      if (id < 0 || id >= 25) return;

      setAutoPickOrder((prev) => {
        const idx = prev.indexOf(id);
        if (idx >= 0) {
          const next = [...prev];
          next.splice(idx, 1);
          return next;
        }
        return [...prev, id];
      });
    },
    []
  );

  const currentMultiplier = useMemo(() => {
    if (revealedCount === 0) return 1.0;
    const multipliers = MULTIPLIERS[mineCount];
    if (!multipliers) return 1.0;
    return (
      multipliers[revealedCount - 1] || multipliers[multipliers.length - 1]
    );
  }, [mineCount, revealedCount]);

  const nextMultiplier = useMemo(() => {
    const multipliers = MULTIPLIERS[mineCount];
    if (!multipliers) return 0;
    if (revealedCount >= multipliers.length) return 0;
    return multipliers[revealedCount];
  }, [mineCount, revealedCount]);

  const potentialWin = useMemo(() => {
    return betAmount * currentMultiplier;
  }, [betAmount, currentMultiplier]);

  const startGame = () => {
    if (isAutoBettingRef.current) return;
    if (balance < betAmount) {
      return;
    }
    if (gameState === "playing") return;

    subtractFromBalance(betAmount);
    setGameState("playing");
    setRevealedCount(0);
    setLastWin(0);

    const newGrid = Array.from({ length: 25 }, (_, i) => ({
      id: i,
      isMine: false,
      isRevealed: false,
      revealedByPlayer: false,
    }));

    let minesPlaced = 0;
    while (minesPlaced < mineCount) {
      const idx = Math.floor(Math.random() * 25);
      if (!newGrid[idx].isMine) {
        newGrid[idx].isMine = true;
        minesPlaced++;
      }
    }
    setGrid(newGrid);
  };

  const revealTile = (id: number) => {
    if (gameState !== "playing") return;
    if (playMode !== "manual") return;
    if (isAutoBettingRef.current) return;

    const tile = grid[id];
    if (tile.isRevealed) return;

    if (resultTimeoutRef.current) {
      clearTimeout(resultTimeoutRef.current);
      resultTimeoutRef.current = null;
    }
    setResultFx("rolling");

    const newGrid = [...grid];
    newGrid[id] = { ...tile, isRevealed: true, revealedByPlayer: true };
    setGrid(newGrid);

    if (tile.isMine) {
      setGameState("game_over");
      setGrid(newGrid.map((t) => ({ ...t, isRevealed: true })));
      // popped on mine -> red flash
      setResultFx("lose");
      resultTimeoutRef.current = window.setTimeout(() => setResultFx(null), 900);
      finalizePendingLoss();
    } else {
      const newRevealedCount = revealedCount + 1;
      setRevealedCount(newRevealedCount);

      const totalSafeTiles = 25 - mineCount;
      if (newRevealedCount >= totalSafeTiles) {
        const winAmount =
          betAmount * MULTIPLIERS[mineCount][newRevealedCount - 1];
        addToBalance(winAmount);
        setLastWin(winAmount);
        // final win -> green flash
        if (resultTimeoutRef.current) {
          clearTimeout(resultTimeoutRef.current);
          resultTimeoutRef.current = null;
        }
        setResultFx("win");
        resultTimeoutRef.current = window.setTimeout(() => setResultFx(null), 900);
        setGameState("cashed_out");

        setGrid(newGrid.map((t) => ({ ...t, isRevealed: true })));
      }
      // clear rolling overlay after a safe pick
      setResultFx(null);
    }
  };

  const cashOut = () => {
    if (gameState !== "playing") return;
    if (isAutoBettingRef.current) return;
    if (revealedCount === 0) return;

    const winAmount = potentialWin;
    addToBalance(winAmount);
    setLastWin(winAmount);
    setGameState("cashed_out");

    if (resultTimeoutRef.current) {
      clearTimeout(resultTimeoutRef.current);
      resultTimeoutRef.current = null;
    }
    setResultFx("win");
    resultTimeoutRef.current = window.setTimeout(() => setResultFx(null), 900);

    setGrid((prev) => prev.map((t) => ({ ...t, isRevealed: true })));
  };

  const playRound = useCallback(
    async (opts?: { betAmount?: number }) => {
      const bet = normalizeMoney(opts?.betAmount ?? betAmountRef.current);
      const currentBalance = balanceRef.current;
      const mines = mineCountRef.current;
      const currentState = gameStateRef.current;

      const picks = getValidPickOrder(autoPickOrderRef.current);
      if (picks.length <= 0) {
        return null as null | { betAmount: number; winAmount: number; didWin: boolean };
      }

      if (currentState === "playing") {
        return null as null | { betAmount: number; winAmount: number; didWin: boolean };
      }

      if (bet <= 0 || bet > currentBalance) {
        return null as null | { betAmount: number; winAmount: number; didWin: boolean };
      }

      if (resultTimeoutRef.current) {
        clearTimeout(resultTimeoutRef.current);
        resultTimeoutRef.current = null;
      }
      setResultFx(null);

      setLastWin(0);
      setRevealedCount(0);
      setBetBoth(bet);
      subtractFromBalance(bet);
      setGameState("playing");

      let gridLocal: Tile[] = Array.from({ length: 25 }, (_, i) => ({
        id: i,
        isMine: false,
        isRevealed: false,
        revealedByPlayer: false,
      }));

      let minesPlaced = 0;
      while (minesPlaced < mines) {
        const idx = Math.floor(Math.random() * 25);
        if (!gridLocal[idx].isMine) {
          gridLocal[idx].isMine = true;
          minesPlaced++;
        }
      }

      setGrid(gridLocal);
      await sleep(120);

      let revealedLocal = 0;
      const totalSafeTiles = 25 - mines;

      for (const id of picks) {
        if (gridLocal[id]?.isRevealed) continue;

        if (resultTimeoutRef.current) {
          clearTimeout(resultTimeoutRef.current);
          resultTimeoutRef.current = null;
        }
        setResultFx("rolling");
        await sleep(120);

        const tile = gridLocal[id];
        gridLocal = [...gridLocal];
        gridLocal[id] = {
          ...tile,
          isRevealed: true,
          revealedByPlayer: true,
        };
        setGrid(gridLocal);

        if (tile.isMine) {
          setGameState("game_over");
          gridLocal = gridLocal.map((t) => ({ ...t, isRevealed: true }));
          setGrid(gridLocal);
          finalizePendingLoss();
          await showFx("lose");
          return { betAmount: bet, winAmount: 0, didWin: false };
        }

        revealedLocal++;
        setRevealedCount(revealedLocal);
        setResultFx(null);

        if (revealedLocal >= totalSafeTiles) {
          const mult = MULTIPLIERS[mines]?.[revealedLocal - 1] ?? 1;
          const winAmount = normalizeMoney(bet * mult);
          addToBalance(winAmount);
          setLastWin(winAmount);
          setGameState("cashed_out");
          gridLocal = gridLocal.map((t) => ({ ...t, isRevealed: true }));
          setGrid(gridLocal);
          await showFx("win");
          return { betAmount: bet, winAmount, didWin: true };
        }

        await sleep(120);
      }

      // cashout after last planned safe pick (if any)
      if (revealedLocal <= 0) {
        setGameState("game_over");
        gridLocal = gridLocal.map((t) => ({ ...t, isRevealed: true }));
        setGrid(gridLocal);
        finalizePendingLoss();
        await showFx("lose");
        return { betAmount: bet, winAmount: 0, didWin: false };
      }

      const mult = MULTIPLIERS[mines]?.[revealedLocal - 1] ?? 1;
      const winAmount = normalizeMoney(bet * mult);
      addToBalance(winAmount);
      setLastWin(winAmount);
      setGameState("cashed_out");
      gridLocal = gridLocal.map((t) => ({ ...t, isRevealed: true }));
      setGrid(gridLocal);
      await showFx("win");
      return { betAmount: bet, winAmount, didWin: true };
    },
    [
      addToBalance,
      finalizePendingLoss,
      getValidPickOrder,
      showFx,
      subtractFromBalance,
    ]
  );

  const startAutoBet = useCallback(async () => {
    if (isAutoBettingRef.current) return;

    const startingBet = normalizeMoney(betAmountRef.current);
    if (startingBet <= 0 || startingBet > balanceRef.current) return;
    if (gameStateRef.current === "playing") return;

    const picks = getValidPickOrder(autoPickOrderRef.current);
    if (picks.length <= 0) return;

    autoOriginalBetRef.current = startingBet;
    autoNetRef.current = 0;

    isAutoBettingRef.current = true;
    setIsAutoBetting(true);

    while (isAutoBettingRef.current) {
      const stopProfit = Math.max(0, normalizeMoney(parseNumberLoose(stopProfitInput)));
      const stopLoss = Math.max(0, normalizeMoney(parseNumberLoose(stopLossInput)));
      const onWinPct = Math.max(0, parseNumberLoose(onWinPctInput));
      const onLosePct = Math.max(0, parseNumberLoose(onLosePctInput));

      const roundBet = normalizeMoney(betAmountRef.current);
      if (roundBet <= 0) break;
      if (roundBet > balanceRef.current) break;

      const currentPicks = getValidPickOrder(autoPickOrderRef.current);
      if (currentPicks.length <= 0) break;

      const result = await playRound({ betAmount: roundBet });
      if (!result) break;

      const lastNet = normalizeMoney((result.winAmount ?? 0) - result.betAmount);
      autoNetRef.current = normalizeMoney(autoNetRef.current + lastNet);

      if (result.didWin && result.winAmount > 0) {
        if (onWinMode === "reset") {
          setBetBoth(autoOriginalBetRef.current);
          betAmountRef.current = autoOriginalBetRef.current;
        } else {
          const next = normalizeMoney(result.betAmount * (1 + onWinPct / 100));
          setBetBoth(next);
          betAmountRef.current = next;
        }
      } else {
        if (onLoseMode === "reset") {
          setBetBoth(autoOriginalBetRef.current);
          betAmountRef.current = autoOriginalBetRef.current;
        } else {
          const next = normalizeMoney(result.betAmount * (1 + onLosePct / 100));
          setBetBoth(next);
          betAmountRef.current = next;
        }
      }

      if (stopProfit > 0 && lastNet >= stopProfit) {
        stopAutoBet();
        break;
      }
      if (stopLoss > 0 && lastNet <= -stopLoss) {
        stopAutoBet();
        break;
      }

      await sleep(120);
    }

    isAutoBettingRef.current = false;
    setIsAutoBetting(false);
  }, [
    getValidPickOrder,
    onLoseMode,
    onLosePctInput,
    onWinMode,
    onWinPctInput,
    playRound,
    stopLossInput,
    stopProfitInput,
  ]);

  const stopAutoBet = useCallback(() => {
    isAutoBettingRef.current = false;
    setIsAutoBetting(false);
  }, []);

  const changePlayMode = useCallback(
    (mode: "manual" | "auto") => {
      try {
        stopAutoBet();
      } catch (e) {
      }

      if (resultTimeoutRef.current) {
        clearTimeout(resultTimeoutRef.current);
        resultTimeoutRef.current = null;
      }
      setResultFx(null);

      setLastWin(0);
      setRevealedCount(0);
      setGameState("idle");
      resetGrid();

      setBetBoth(100);
      betAmountRef.current = 100;
      setBetInput(String(100));

      setMineCount(3);
      mineCountRef.current = 3;

      setOnWinMode("reset");
      setOnWinPctInput("0");
      setOnLoseMode("reset");
      setOnLosePctInput("0");
      setStopProfitInput("0");
      setStopLossInput("0");

      setAutoPickOrder([]);
      autoPickOrderRef.current = [];

      try {
        stopAutoBet();
      } catch (e) {
      }
      isAutoBettingRef.current = false;
      setIsAutoBetting(false);
      autoOriginalBetRef.current = 0;
      autoNetRef.current = 0;

      setPlayMode(mode);
    },
    [stopAutoBet]
  );

  const plannedOrderById = useMemo(() => {
    const map = new Map<number, number>();
    for (let i = 0; i < autoPickOrder.length; i++) {
      map.set(autoPickOrder[i], i + 1);
    }
    return map;
  }, [autoPickOrder]);

  const isBusy = gameState === "playing" || isAutoBetting;

  return (
    <div className="p-2 sm:p-4 lg:p-6 max-w-[1400px] mx-auto flex flex-col lg:flex-row items-start gap-4 lg:gap-8">
      <div className="w-full lg:w-[240px] flex flex-col gap-3 bg-[#0f212e] p-2 sm:p-3 rounded-xl h-fit text-xs">
        <div className="space-y-2">
          <label className="text-xs font-bold text-[#b1bad3] uppercase tracking-wider">
            Mode
          </label>
          <div className="bg-[#0f212e] p-1 rounded-md border border-[#2f4553] flex">
            {(["manual", "auto"] as const).map((mode) => (
              <button
                key={mode}
                onClick={() => !isBusy && changePlayMode(mode)}
                disabled={isBusy}
                className={`flex-1 py-2 text-[10px] font-bold uppercase rounded transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${
                  playMode === mode
                    ? "bg-[#213743] text-white shadow-sm"
                    : "text-[#b1bad3] hover:text-white"
                }`}
              >
                {mode === "manual" ? "Manual" : "Auto"}
              </button>
            ))}
          </div>
        </div>

        <div className="space-y-2">
          <label className="text-xs font-bold text-[#b1bad3] uppercase tracking-wider">
            Bet Amount
          </label>
          <div className="relative">
            <div className="absolute left-3 top-1/2 -translate-y-1/2 text-[#b1bad3]">
              $
            </div>
            <input
              type="number"
              value={betInput}
              onChange={(e) => setBetInput(e.target.value)}
              onBlur={() => {
                const raw = betInput.trim();
                const sanitized = raw.replace(/^0+(?=\d)/, "") || "0";
                const num = Number(sanitized);
                setBetBoth(num);
              }}
              disabled={isBusy}
              className="w-full bg-[#0f212e] border border-[#2f4553] rounded-md py-2 pl-7 pr-4 text-white font-mono focus:outline-none focus:border-[#00e701] transition-colors disabled:opacity-50"
            />
          </div>
          <div className="grid grid-cols-3 gap-2">
            <button
              onClick={() => {
                const newBet = normalizeMoney(betAmount / 2);
                setBetBoth(newBet);
              }}
              disabled={isBusy}
              className="bg-[#2f4553] hover:bg-[#3e5666] text-xs py-1 rounded text-[#b1bad3] disabled:opacity-50"
            >
              ½
            </button>
            <button
              onClick={() => {
                const newBet = normalizeMoney(betAmount * 2);
                setBetBoth(newBet);
              }}
              disabled={isBusy}
              className="bg-[#2f4553] hover:bg-[#3e5666] text-xs py-1 rounded text-[#b1bad3] disabled:opacity-50"
            >
              2×
            </button>
            <button
              onClick={() => {
                const newBet = normalizeMoney(balance);
                setBetBoth(newBet);
              }}
              disabled={isBusy}
              className="bg-[#2f4553] hover:bg-[#3e5666] text-xs py-1 rounded text-[#b1bad3] disabled:opacity-50"
            >
              All In
            </button>
          </div>
        </div>

        <div className="space-y-2">
          <label className="text-xs font-bold text-[#b1bad3] uppercase tracking-wider">
            Mines
          </label>
          <select
            value={mineCount}
            onChange={(e) => setMineCount(Number(e.target.value))}
            disabled={isBusy}
            className="w-full bg-[#0f212e] border border-[#2f4553] rounded-md py-2 px-4 text-white focus:outline-none focus:border-[#00e701] transition-colors disabled:opacity-50"
          >
            {Array.from({ length: 24 }, (_, i) => i + 1).map((num) => (
              <option key={num} value={num}>
                {num}
              </option>
            ))}
          </select>
        </div>

        {playMode === "manual" &&
          (gameState === "playing" ? (
            <div className="flex flex-col gap-3">
              <button
                onClick={cashOut}
                disabled={revealedCount === 0 || isAutoBetting}
                className="w-full bg-[#00e701] hover:bg-[#00c201] text-black py-3 rounded-md font-bold text-lg shadow-[0_0_20px_rgba(0,231,1,0.2)] transition-all active:scale-95 flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Cashout
              </button>
            </div>
          ) : (
            <button
              onClick={startGame}
              disabled={isBusy}
              className="w-full bg-[#00e701] hover:bg-[#00c201] disabled:opacity-50 disabled:cursor-not-allowed text-black py-3 rounded-md font-bold text-lg shadow-[0_0_20px_rgba(0,231,1,0.2)] transition-all active:scale-95 flex items-center justify-center gap-2"
            >
              <PlayArrow /> Bet
            </button>
          ))}

        {playMode === "auto" && (
          <>
            <div className="space-y-2">
              <label className="text-xs font-bold text-[#b1bad3] uppercase tracking-wider">
                On Win
              </label>
              <div className="bg-[#0f212e] p-1 rounded-md border border-[#2f4553] flex">
                {(["reset", "raise"] as const).map((m) => (
                  <button
                    key={m}
                    onClick={() => !isBusy && setOnWinMode(m)}
                    disabled={isBusy}
                    className={`flex-1 py-2 text-[10px] font-bold uppercase rounded transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${
                      onWinMode === m
                        ? "bg-[#213743] text-white shadow-sm"
                        : "text-[#b1bad3] hover:text-white"
                    }`}
                  >
                    {m === "reset" ? "Reset" : "Raise"}
                  </button>
                ))}
              </div>
              {onWinMode === "raise" && (
                <div className="relative">
                  <div className="absolute left-3 top-1/2 -translate-y-1/2 text-[#b1bad3]">%</div>
                  <input
                    type="number"
                    value={onWinPctInput}
                    onChange={(e) => setOnWinPctInput(e.target.value)}
                    onBlur={() => {
                      const raw = onWinPctInput.trim();
                      const sanitized = raw.replace(/^0+(?=\d)/, "") || "0";
                      setOnWinPctInput(sanitized);
                    }}
                    disabled={isBusy}
                    className="w-full bg-[#0f212e] border border-[#2f4553] rounded-md py-2 pl-7 pr-4 text-white font-mono focus:outline-none focus:border-[#00e701] transition-colors"
                    placeholder="0"
                  />
                </div>
              )}
            </div>

            <div className="space-y-2">
              <label className="text-xs font-bold text-[#b1bad3] uppercase tracking-wider">
                On Loss
              </label>
              <div className="bg-[#0f212e] p-1 rounded-md border border-[#2f4553] flex">
                {(["reset", "raise"] as const).map((m) => (
                  <button
                    key={m}
                    onClick={() => !isBusy && setOnLoseMode(m)}
                    disabled={isBusy}
                    className={`flex-1 py-2 text-[10px] font-bold uppercase rounded transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${
                      onLoseMode === m
                        ? "bg-[#213743] text-white shadow-sm"
                        : "text-[#b1bad3] hover:text-white"
                    }`}
                  >
                    {m === "reset" ? "Reset" : "Raise"}
                  </button>
                ))}
              </div>
              {onLoseMode === "raise" && (
                <div className="relative">
                  <div className="absolute left-3 top-1/2 -translate-y-1/2 text-[#b1bad3]">%</div>
                  <input
                    type="number"
                    value={onLosePctInput}
                    onChange={(e) => setOnLosePctInput(e.target.value)}
                    onBlur={() => {
                      const raw = onLosePctInput.trim();
                      const sanitized = raw.replace(/^0+(?=\d)/, "") || "0";
                      setOnLosePctInput(sanitized);
                    }}
                    disabled={isBusy}
                    className="w-full bg-[#0f212e] border border-[#2f4553] rounded-md py-2 pl-7 pr-4 text-white font-mono focus:outline-none focus:border-[#00e701] transition-colors"
                    placeholder="0"
                  />
                </div>
              )}
            </div>

            <div className="space-y-2">
              <label className="text-xs font-bold text-[#b1bad3] uppercase tracking-wider">
                Stop on Profit
              </label>
              <div className="relative">
                <div className="absolute left-3 top-1/2 -translate-y-1/2 text-[#b1bad3]">$</div>
                <input
                  type="number"
                  value={stopProfitInput}
                  onChange={(e) => setStopProfitInput(e.target.value)}
                  onBlur={() => {
                    const raw = stopProfitInput.trim();
                    const sanitized = raw.replace(/^0+(?=\d)/, "") || "0";
                    setStopProfitInput(sanitized);
                  }}
                  disabled={isBusy}
                  className="w-full bg-[#0f212e] border border-[#2f4553] rounded-md py-2 pl-7 pr-4 text-white font-mono focus:outline-none focus:border-[#00e701] transition-colors"
                />
              </div>
            </div>

            <div className="space-y-2">
              <label className="text-xs font-bold text-[#b1bad3] uppercase tracking-wider">
                Stop on Loss
              </label>
              <div className="relative">
                <div className="absolute left-3 top-1/2 -translate-y-1/2 text-[#b1bad3]">$</div>
                <input
                  type="number"
                  value={stopLossInput}
                  onChange={(e) => setStopLossInput(e.target.value)}
                  onBlur={() => {
                    const raw = stopLossInput.trim();
                    const sanitized = raw.replace(/^0+(?=\d)/, "") || "0";
                    setStopLossInput(sanitized);
                  }}
                  disabled={isBusy}
                  className="w-full bg-[#0f212e] border border-[#2f4553] rounded-md py-2 pl-7 pr-4 text-white font-mono focus:outline-none focus:border-[#00e701] transition-colors"
                />
              </div>
            </div>

            {!isAutoBetting ? (
              <button
                onClick={startAutoBet}
                disabled={isBusy || autoPickOrder.length === 0}
                className="w-full bg-[#00e701] hover:bg-[#00c201] disabled:opacity-50 disabled:cursor-not-allowed text-black py-3 rounded-md font-bold text-lg transition-all active:scale-95 flex items-center justify-center gap-2"
              >
                <PlayArrow sx={{ fill: "currentColor" }} />
                Autobet
              </button>
            ) : (
              <button
                onClick={stopAutoBet}
                className="w-full bg-[#ef4444] hover:bg-[#dc2626] text-white py-3 rounded-md font-bold text-lg transition-all active:scale-95 flex items-center justify-center gap-2"
              >
                Stop
              </button>
            )}
          </>
        )}

        {gameState === "playing" && playMode === "manual" && (
          <div className="bg-[#0f212e] p-4 rounded border border-[#2f4553] text-center">
            <div className="text-[#b1bad3] text-sm">Current Win</div>
            <div className="text-2xl font-bold text-[#00e701]">
              ${potentialWin.toFixed(2)}
            </div>
            <div className="text-sm text-[#b1bad3] mt-1">
              Next: {nextMultiplier ? `${nextMultiplier}x` : "Max"}
            </div>
          </div>
        )}

        {lastWin > 0 && gameState !== "playing" && (
          <div className="mt-4 p-4 bg-[#213743] border border-[#00e701] rounded-md text-center">
            <div className="text-xs text-[#b1bad3] uppercase">You Won</div>
            <div className="text-xl font-bold text-[#00e701]">
              ${lastWin.toFixed(2)}
            </div>
          </div>
        )}
      </div>

      <div className="flex-1 flex flex-col items-center justify-center bg-[#0f212e] rounded-xl p-4 sm:p-8 relative min-h-[400px] sm:min-h-[500px]">
            {resultFx === "rolling" && <div className="limbo-roll-glow" />}
            {resultFx === "win" && <div className="limbo-win-flash" />}
            {resultFx === "lose" && <div className="limbo-lose-flash" />}
            {resultFx === "rolling" && (
              <div
                className="absolute inset-0 pointer-events-none"
                style={{
                  background:
                    "radial-gradient(circle at 50% 55%, rgba(47,69,83,0.18) 0%, rgba(15,33,46,0.0) 68%)",
                  opacity: 0.9,
                }}
              />
            )}
            <div className="grid grid-cols-5 gap-2 sm:gap-3 w-full max-w-[500px] aspect-square">
          {grid.map((tile) => {
            const isAutoRevealed = tile.isRevealed && !tile.revealedByPlayer;
            const baseSafe = "#213743";
            const target = "#0f212e";
            const blendedBg = tile.isRevealed
              ? isAutoRevealed
                ? blendHexColors(baseSafe, target, 0.5)
                : baseSafe
              : undefined;

            const plannedIndex = plannedOrderById.get(tile.id) ?? null;

            const canPlan =
              playMode === "auto" && gameState !== "playing" && !isAutoBetting;
            const canReveal =
              playMode === "manual" && gameState === "playing" && !isAutoBetting;

            const isPlannedCovered = plannedIndex != null && !tile.isRevealed;

            return (
              <button
                key={tile.id}
                onClick={() => {
                  if (canReveal) {
                    revealTile(tile.id);
                    return;
                  }
                  if (canPlan) {
                    togglePlannedTile(tile.id);
                  }
                }}
                disabled={(canReveal && tile.isRevealed) || (!canReveal && !canPlan)}
                className={`relative rounded-lg transition-all duration-200 flex items-center justify-center aspect-square
                  overflow-hidden
                  ${
                    !tile.isRevealed
                      ? isPlannedCovered
                        ? "bg-[#6b21a8] text-white shadow-[0_4px_0_#4c1d95] -translate-y-1 hover:bg-[#7e22ce] active:translate-y-0 active:shadow-none"
                        : "bg-[#2f4553] hover:bg-[#3c5566] hover:-translate-y-1 cursor-pointer shadow-[0_4px_0_0_#1a2c38]"
                      : tile.isMine && tile.revealedByPlayer
                      ? "animate-mines-mine"
                      : !tile.isMine && tile.revealedByPlayer
                      ? "animate-mines-gem"
                      : ""
                  }
                  ${
                    gameState !== "playing" && !tile.isRevealed && !canPlan
                      ? "cursor-default hover:transform-none opacity-50"
                      : ""
                  }`}
                style={blendedBg ? { backgroundColor: blendedBg } : undefined}
              >
                {plannedIndex != null && !tile.isRevealed && (
                  <div className="absolute top-1 right-1 bg-[#6b21a8] border border-[#a855f7] text-white text-[10px] font-bold px-1.5 py-0.5 rounded">
                    {plannedIndex}
                  </div>
                )}

                {tile.isRevealed && tile.revealedByPlayer && !tile.isMine && (
                  <div
                    className="pointer-events-none absolute inset-0 flex items-center justify-center"
                  >
                    <div
                      className="mines-gem-flash absolute inset-0"
                      style={{
                        background:
                          "radial-gradient(circle at 50% 45%, rgba(255,255,255,0.85) 0%, rgba(0,231,1,0.35) 38%, rgba(0,231,1,0.0) 70%)",
                      }}
                    />
                    <div
                      className="mines-gem-glow absolute inset-0 rounded-lg"
                      style={{
                        boxShadow: "0 0 0 0 rgba(0,231,1,0.0)",
                        border: "2px solid rgba(0,231,1,0.35)",
                      }}
                    />
                  </div>
                )}

                {tile.isRevealed && tile.revealedByPlayer && tile.isMine && (
                  <div
                    className="pointer-events-none absolute inset-0 mines-mine-flash"
                    style={{
                      background:
                        "radial-gradient(circle at 50% 45%, rgba(255,255,255,0.75) 0%, rgba(239,68,68,0.35) 45%, rgba(239,68,68,0.0) 70%)",
                    }}
                  />
                )}

                {tile.isRevealed && (
                  <div
                    className={
                      tile.revealedByPlayer ? "animate-mines-icon-pop" : undefined
                    }
                    style={{
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      width: "35%",
                      height: "35%",
                    }}
                  >
                    {tile.isMine ? (
                      <LocalFireDepartment
                        style={{
                          width: tile.revealedByPlayer ? "100%" : "75%",
                          height: tile.revealedByPlayer ? "100%" : "75%",
                          color: "#ef4444",
                          filter: tile.revealedByPlayer
                            ? "drop-shadow(0 0 14px rgba(239,68,68,0.55))"
                            : "brightness(0.75)",
                        }}
                      />
                    ) : (
                      <Diamond
                        style={{
                          width: tile.revealedByPlayer ? "100%" : "75%",
                          height: tile.revealedByPlayer ? "100%" : "75%",
                          color: tile.revealedByPlayer ? "#00ff17" : "#0b6623",
                          filter: tile.revealedByPlayer
                            ? "drop-shadow(0 0 16px rgba(0,231,1,0.85))"
                            : "brightness(1.25)",
                        }}
                      />
                    )}
                  </div>
                )}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
