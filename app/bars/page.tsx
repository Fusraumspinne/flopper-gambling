"use client";

import React, { useEffect, useMemo, useRef, useState, useCallback } from "react";
import { PlayArrow, Refresh, Bolt, Delete } from "@mui/icons-material";
import GameRecordsPanel from "@/components/GameRecordsPanel";
import { useWallet } from "@/components/WalletProvider";
import { useSoundVolume } from "@/components/SoundVolumeProvider";

type RiskLevel = "low" | "medium" | "high" | "expert";

type DistItem = { multi: number; chance: number };

const TOTAL_MULTI_DIST: Record<RiskLevel, DistItem[]> = {
  low: [
    { multi: 0.4, chance: 35 },
    { multi: 0.6, chance: 35 },
    { multi: 1.2, chance: 15 },
    { multi: 1.5, chance: 8 },
    { multi: 3, chance: 5 },
    { multi: 9, chance: 2 },
  ],
  medium: [
    { multi: 0.3, chance: 35 },
    { multi: 0.6, chance: 35 },
    { multi: 1.2, chance: 15 },
    { multi: 1.4, chance: 10 },
    { multi: 3, chance: 3 },
    { multi: 6, chance: 1.5 },
    { multi: 33, chance: 0.5 },
  ],
  high: [
    { multi: 0.1, chance: 47 },
    { multi: 0.3, chance: 31 },
    { multi: 1.2, chance: 12 },
    { multi: 2.4, chance: 6 },
    { multi: 6, chance: 3 },
    { multi: 12, chance: 0.8 },
    { multi: 75, chance: 0.18 },
    { multi: 705, chance: 0.02 },
  ],
  expert: [
    { multi: 0, chance: 50 },
    { multi: 0.2, chance: 40 },
    { multi: 1.5, chance: 6 },
    { multi: 6, chance: 2.5 },
    { multi: 9, chance: 1 },
    { multi: 30, chance: 0.4 },
    { multi: 150, chance: 0.08 },
    { multi: 1200, chance: 0.015 },
    { multi: 3000, chance: 0.005 },
  ],
};

function perPickDistribution(risk: RiskLevel, picks: number): DistItem[] {
  const base = TOTAL_MULTI_DIST[risk] || [];
  if (picks <= 1) return base;
  return base.map((it) => ({ multi: it.multi / picks, chance: it.chance }));
}

const GRID_ROWS = 5;
const GRID_COLS = 6;
const GRID_SIZE = GRID_ROWS * GRID_COLS;
const MAX_PICKS = 5;

type GameState = "idle" | "revealed";

type Tile = {
  id: number;
  isSelected: boolean;
  isRevealed: boolean;
  multi: number | null;
};


function getMultiColor(multi: number): string {
  if (multi < 1) return "text-[#94a3b8]";
  return "text-[#00e701]";
}

function getMultiBorder(multi: number): string {
  if (multi < 1) return "border-[#94a3b8]";
  return "border-[#00e701]";
}

function getTileStyles(opts: {
  isSelected: boolean;
  isRevealed: boolean;
  multi: number;
}): string {
  const { isSelected, isRevealed, multi } = opts;

  if (!isRevealed) {
    if (isSelected) {
      return "bg-[#6b21a8] text-white shadow-[0_4px_0_#4c1d95] -translate-y-1 hover:bg-[#7e22ce] active:translate-y-0 active:shadow-none transition-all";
    }
    return "bg-[#213743] text-[#b1bad3] shadow-[0_4px_0_#1a2c38] hover:-translate-y-1 hover:bg-[#2f4553] active:translate-y-0 active:shadow-none transition-all duration-100";
  }

  const backShadow = "shadow-[0_4px_0_#1a2c38]";
  const borderColor = getMultiBorder(multi);

  if (isSelected) {
    return `bg-[#213743] border-2 ${borderColor} ${backShadow} scale-110 z-10 text-white`;
  }

  return `bg-[#213743] ${backShadow} scale-95`;
}

function normalizeMoney(value: number): number {
  if (!Number.isFinite(value)) return 0;
  const rounded = Math.round((value + Number.EPSILON) * 100) / 100;
  return Object.is(rounded, -0) ? 0 : rounded;
}

function parseNumberLoose(raw: string): number {
  const normalized = raw.replace(",", ".").trim();
  const n = Number(normalized);
  return Number.isFinite(n) ? n : 0;
}

function pickWeighted(dist: DistItem[]): number {
  const total = dist.reduce((acc, it) => acc + it.chance, 0);
  if (total <= 0) return dist[0]?.multi ?? 0;
  const r = Math.random() * total;
  let acc = 0;
  for (const it of dist) {
    acc += it.chance;
    if (r <= acc) return it.multi;
  }
  return dist[dist.length - 1]?.multi ?? 0;
}

function formatMulti(v: number): string {
  if (!Number.isFinite(v)) return "0";
  if (v === 0) return "0";
  if (Math.abs(v) >= 1) return String(Number(v.toFixed(2)));
  if (Math.abs(v) >= 0.01) return String(Number(v.toFixed(2)));
  return String(Number(v.toFixed(3)));
}

function formatPercentTwoNonZero(p: number): string {
  if (!p || p <= 0) return "0%";
  const pct = p * 100;
  if (pct >= 0.01) return `${Number(pct.toFixed(2))}%`;

  const maxDecimals = 6;
  let s = pct.toFixed(maxDecimals + 6);
  s = s.replace(/0+$/, "");
  if (s.endsWith('.')) s = s.slice(0, -1);

  if (s.includes('.')) {
    const [intPart, frac] = s.split('.');
    const fracClamped = frac.slice(0, maxDecimals).replace(/0+$/, '');
    s = fracClamped ? `${intPart}.${fracClamped}` : intPart;
  }

  return `${s}%`;
}

function createEmptyGrid(): Tile[] {
  return Array.from({ length: GRID_SIZE }, (_, i) => ({
    id: i,
    isSelected: false,
    isRevealed: false,
    multi: null,
  }));
}

export default function BarsPage() {
  const { balance, subtractFromBalance, addToBalance, finalizePendingLoss } =
    useWallet();
  const { volume } = useSoundVolume();

  const audioRef = useRef<{
    bet: HTMLAudioElement | null;
    select: HTMLAudioElement | null;
    reveal: HTMLAudioElement | null;
    win: HTMLAudioElement | null;
    lose: HTMLAudioElement | null;
  }>({ bet: null, select: null, reveal: null, win: null, lose: null });

  const ensureAudio = () => {
    if (audioRef.current.bet) return;
    audioRef.current = {
      bet: new Audio("/sounds/Bet.mp3"),
      select: new Audio("/sounds/Select.mp3"),
      reveal: new Audio("/sounds/KenoReveal.mp3"),
      win: new Audio("/sounds/Win.mp3"),
      lose: new Audio("/sounds/LimboLose.mp3"),
    };
  };

  const playAudio = (a: HTMLAudioElement | null) => {
    if (!a || !volume) return;
    try {
      a.volume = volume;
      a.currentTime = 0;
      void a.play();
    } catch (e) {}
  };

  useEffect(() => {
    if (volume <= 0) return;
    const prime = async () => {
      ensureAudio();
      const items = Object.values(audioRef.current).filter(Boolean) as HTMLAudioElement[];
      for (const a of items) {
        if (!a) continue;
        try {
          a.muted = true;
          await a.play();
          a.pause();
          a.currentTime = 0;
          a.muted = false;
        } catch {}
      }
    };
    document.addEventListener("pointerdown", prime, { once: true });
    return () => document.removeEventListener("pointerdown", prime);
  }, [volume]);

  const [riskLevel, setRiskLevel] = useState<RiskLevel>("low");
  const [betAmount, setBetAmount] = useState<number>(100);
  const [betInput, setBetInput] = useState<string>("100");

  const [gameState, setGameState] = useState<GameState>("idle");
  const [grid, setGrid] = useState<Tile[]>(() => createEmptyGrid());

  const [playMode, setPlayMode] = useState<"manual" | "auto">("manual");
  const [onWinMode, setOnWinMode] = useState<"reset" | "raise">("reset");
  const [onWinPctInput, setOnWinPctInput] = useState<string>("0");
  const [onLoseMode, setOnLoseMode] = useState<"reset" | "raise">("reset");
  const [onLosePctInput, setOnLosePctInput] = useState<string>("0");
  const [stopProfitInput, setStopProfitInput] = useState<string>("0");
  const [stopLossInput, setStopLossInput] = useState<string>("0");
  const [isAutoBetting, setIsAutoBetting] = useState(false);

  const isAutoBettingRef = useRef(false);
  const autoOriginalBetRef = useRef(0);
  const autoNetRef = useRef(0);
  const betAmountRef = useRef(betAmount);
  const riskLevelRef = useRef(riskLevel);
  const balanceRef = useRef(balance);

  useEffect(() => {
    betAmountRef.current = betAmount;
  }, [betAmount]);
  useEffect(() => {
    riskLevelRef.current = riskLevel;
  }, [riskLevel]);
  useEffect(() => {
    balanceRef.current = balance;
  }, [balance]);

  const [lastPayout, setLastPayout] = useState<number>(0);
  const [lastTotalMulti, setLastTotalMulti] = useState<number>(0);

  const [recordsRefreshCounter, setRecordsRefreshCounter] = useState(0);

  const [resultFx, setResultFx] = useState<"rolling" | "win" | "lose" | null>(
    null
  );
  const resultTimeoutRef = useRef<number | null>(null);
  const [isAnimating, setIsAnimating] = useState(false);
  const revealTimeoutsRef = useRef<number[]>([]);

  const picksCount = useMemo(
    () => grid.reduce((acc, t) => acc + (t.isSelected ? 1 : 0), 0),
    [grid]
  );

  const isBusy = isAnimating || isAutoBetting || resultFx === "rolling";

  const setBetBoth = (next: number) => {
    const v = normalizeMoney(next);
    setBetAmount(v);
    setBetInput(String(v));
  };

  const stopAutoBet = useCallback(() => {
    isAutoBettingRef.current = false;
    setIsAutoBetting(false);
  }, []);

  const changePlayMode = (mode: "manual" | "auto") => {
    if (isAutoBetting) stopAutoBet();
    setPlayMode(mode);

    setBetBoth(100);
    setRiskLevel("low");
    setOnWinMode("reset");
    setOnWinPctInput("0");
    setOnLoseMode("reset");
    setOnLosePctInput("0");
    setStopProfitInput("0");
    setStopLossInput("0");

    setGameState("idle");
    setGrid(createEmptyGrid());
    setLastPayout(0);
    setLastTotalMulti(0);
  };

  useEffect(() => {
    return () => {
      stopAutoBet();
      if (resultTimeoutRef.current) {
        clearTimeout(resultTimeoutRef.current);
        resultTimeoutRef.current = null;
      }
      if (revealTimeoutsRef.current.length) {
        for (const t of revealTimeoutsRef.current) clearTimeout(t);
        revealTimeoutsRef.current = [];
      }
    };
  }, [stopAutoBet]);

  const resetRound = () => {
    stopAutoBet();
    if (resultTimeoutRef.current) {
      clearTimeout(resultTimeoutRef.current);
      resultTimeoutRef.current = null;
    }
    if (revealTimeoutsRef.current.length) {
      for (const t of revealTimeoutsRef.current) clearTimeout(t);
      revealTimeoutsRef.current = [];
    }
    setIsAnimating(false);
    setResultFx(null);
    setGameState("idle");
    setGrid(createEmptyGrid());
    setLastPayout(0);
    setLastTotalMulti(0);
  };

  const toggleTile = (id: number) => {
    if (isBusy) return;

    let baseGrid = grid;
    if (gameState === "revealed") {
      setGameState("idle");
      baseGrid = grid.map((t) => ({ ...t, isRevealed: false, multi: null }));
    }

    setGrid(() => {
      const tile = baseGrid[id];
      if (!tile) return baseGrid;

      playAudio(audioRef.current.select);

      if (tile.isSelected) {
        const next = [...baseGrid];
        next[id] = { ...tile, isSelected: false };
        return next;
      }

      const currentPicks = baseGrid.reduce(
        (acc, t) => acc + (t.isSelected ? 1 : 0),
        0
      );
      if (currentPicks >= MAX_PICKS) return baseGrid;

      const next = [...baseGrid];
      next[id] = { ...tile, isSelected: true };
      return next;
    });
  };

  const clearSelection = () => {
    if (isBusy) return;
    setGameState("idle");
    setGrid((prev) =>
      prev.map((t) => ({ ...t, isSelected: false, isRevealed: false, multi: null }))
    );
    setLastPayout(0);
    setLastTotalMulti(0);
  };

  const playRound = useCallback(
    async (opts?: { betAmount?: number }) => {
      const bet = normalizeMoney(opts?.betAmount ?? parseNumberLoose(betInput));
      if (bet <= 0 || bet > balanceRef.current) return null;

      const selectedIds = grid.filter((t) => t.isSelected).map((t) => t.id);
      const pickCount = selectedIds.length;
      if (pickCount < 1 || pickCount > MAX_PICKS) return null;

      if (revealTimeoutsRef.current.length) {
        for (const t of revealTimeoutsRef.current) clearTimeout(t);
        revealTimeoutsRef.current = [];
      }
      if (resultTimeoutRef.current) {
        clearTimeout(resultTimeoutRef.current);
        resultTimeoutRef.current = null;
      }

      if (gameState === "revealed") setGameState("idle");

      subtractFromBalance(bet);
      playAudio(audioRef.current.bet);

      setGrid((prev) =>
        prev.map((t) => ({ ...t, isRevealed: false, multi: null }))
      );

      setLastPayout(0);
      setLastTotalMulti(0);

      setResultFx("rolling");
      setIsAnimating(true);

      const perPickDist = perPickDistribution(riskLevelRef.current, pickCount);

      // Reveal tiles using the same distribution we show below (risk + picks)
      const drawnMultis: number[] = grid.map(() => pickWeighted(perPickDist));

      const totalSumMulti = grid.reduce(
        (acc, t, i) => acc + (t.isSelected ? drawnMultis[i] : 0),
        0
      );

      const payout = normalizeMoney(bet * totalSumMulti);

      const totalDuration = 2000;
      const perTileDelay = totalDuration / GRID_SIZE;

      const nextGrid = [...grid];
      for (let i = 0; i < GRID_SIZE; i++) {
        const delay = Math.round(i * perTileDelay);
        const tId = window.setTimeout(() => {
          playAudio(audioRef.current.reveal);
          nextGrid[i] = {
            ...nextGrid[i],
            isRevealed: true,
            multi: drawnMultis[i],
          };
          setGrid((prev) => {
            const updated = [...prev];
            updated[i] = nextGrid[i];
            return updated;
          });
        }, delay);
        revealTimeoutsRef.current.push(tId);
      }

      return new Promise((resolve) => {
        const finishTimeout = window.setTimeout(() => {
          setGameState("revealed");
          setLastTotalMulti(totalSumMulti);

          if (payout > 0) {
            addToBalance(payout);
            setLastPayout(payout);
          } else {
            finalizePendingLoss();
            setLastPayout(0);
          }

          if (totalSumMulti >= 1) {
            setResultFx("win");
            playAudio(audioRef.current.win);
          } else {
            setResultFx("lose");
            playAudio(audioRef.current.lose);
          }

          revealTimeoutsRef.current = [];

          resultTimeoutRef.current = window.setTimeout(() => {
            setResultFx(null);
            resultTimeoutRef.current = null;
          }, 900);

          setIsAnimating(false);
          resolve({ payout, totalMulti: totalSumMulti, bet });
        }, totalDuration + 120);

        revealTimeoutsRef.current.push(finishTimeout);
      });
    },
    [grid, betInput, subtractFromBalance, addToBalance, finalizePendingLoss]
  );

  const startAutoBet = useCallback(async () => {
    if (isAutoBettingRef.current) return;

    const bet = normalizeMoney(betAmountRef.current);
    if (picksCount === 0 || bet <= 0 || bet > balanceRef.current) return;

    autoOriginalBetRef.current = bet;
    autoNetRef.current = 0;
    isAutoBettingRef.current = true;
    setIsAutoBetting(true);

    while (isAutoBettingRef.current) {
      const currentBet = betAmountRef.current;
      if (currentBet <= 0 || currentBet > balanceRef.current) break;

      const result = (await playRound({ betAmount: currentBet })) as {
        payout: number;
        totalMulti: number;
        bet: number;
      } | null;

      if (!result) break;

      const net = normalizeMoney(result.payout - result.bet);
      autoNetRef.current = normalizeMoney(autoNetRef.current + net);

      const stopProfit = normalizeMoney(parseNumberLoose(stopProfitInput));
      const stopLoss = normalizeMoney(parseNumberLoose(stopLossInput));

      if (stopProfit > 0 && autoNetRef.current >= stopProfit) {
        stopAutoBet();
        break;
      }
      if (stopLoss > 0 && autoNetRef.current <= -stopLoss) {
        stopAutoBet();
        break;
      }

      if (result.totalMulti >= 1) {
        if (onWinMode === "reset") {
          setBetBoth(autoOriginalBetRef.current);
        } else {
          const pct = parseNumberLoose(onWinPctInput);
          setBetBoth(result.bet * (1 + pct / 100));
        }
      } else {
        if (onLoseMode === "reset") {
          setBetBoth(autoOriginalBetRef.current);
        } else {
          const pct = parseNumberLoose(onLosePctInput);
          setBetBoth(result.bet * (1 + pct / 100));
        }
      }

      try {
        setRecordsRefreshCounter((c) => c + 1);
      } catch {}

      await new Promise((r) => setTimeout(r, 500));
    }

    stopAutoBet();
  }, [
    picksCount,
    onWinMode,
    onWinPctInput,
    onLoseMode,
    onLosePctInput,
    stopProfitInput,
    stopLossInput,
    playRound,
    stopAutoBet,
  ]);

  const revealAndSettle = () => {
    playRound();
  };

  const pickRandom = () => {
    if (isBusy) return;
    setGameState("idle");
    setGrid((prev) => {
      const ids = Array.from({ length: GRID_SIZE }, (_, i) => i);
      for (let i = ids.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [ids[i], ids[j]] = [ids[j], ids[i]];
      }
      const pickCount = MAX_PICKS;
      const chosen = new Set(ids.slice(0, pickCount));
      return prev.map((t) => ({
        ...t,
        isSelected: chosen.has(t.id),
        isRevealed: false,
        multi: null,
      }));
    });
  };

  const riskButtons: Array<{ id: RiskLevel; label: string }> = [
    { id: "low", label: "Low" },
    { id: "medium", label: "Medium" },
    { id: "high", label: "High" },
    { id: "expert", label: "Expert" },
  ];

  return (
    <div className="p-2 sm:p-4 lg:p-6 max-w-350 mx-auto flex flex-col lg:flex-row gap-4 lg:gap-8">
    <div className="w-full lg:w-60 flex flex-col gap-3 bg-[#0f212e] p-2 sm:p-3 rounded-xl h-fit text-xs">
      <div className="space-y-2">
        <label className="text-xs font-bold text-[#b1bad3] uppercase tracking-wider">
          Mode
        </label>
        <div className="bg-[#0f212e] p-1 rounded-md border border-[#2f4553] flex">
          {(["manual", "auto"] as const).map((mode) => (
            <button
              key={mode}
              onClick={() => changePlayMode(mode)}
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
          onChange={(e) => {
            let v = e.target.value;
            if (parseFloat(v) < 0) v = "0";
            setBetInput(v);
          }}
          onBlur={() => {
            const raw = betInput.trim();
            const sanitized = raw.replace(/^0+(?=\d)/, "") || "0";
            const num = Number(sanitized);
            setBetBoth(Math.max(0, num));
          }}
          disabled={isBusy}
          className="w-full bg-[#0f212e] border border-[#2f4553] rounded-md py-2 pl-7 pr-4 text-white font-mono focus:outline-none focus:border-[#00e701] transition-colors"
        />
        </div>
        <div className="grid grid-cols-3 gap-2">
        <button
          onClick={() => setBetBoth(Number((betAmount / 2).toFixed(2)))}
          disabled={isBusy}
          className="bg-[#2f4553] hover:bg-[#3e5666] text-xs py-1 rounded text-[#b1bad3]"
        >
          ½
        </button>
        <button
          onClick={() => setBetBoth(Number((betAmount * 2).toFixed(2)))}
          disabled={isBusy}
          className="bg-[#2f4553] hover:bg-[#3e5666] text-xs py-1 rounded text-[#b1bad3]"
        >
          2×
        </button>
        <button
          onClick={() => setBetBoth(Number(balance.toFixed(2)))}
          disabled={isBusy}
          className="bg-[#2f4553] hover:bg-[#3e5666] text-xs py-1 rounded text-[#b1bad3]"
        >
          All In
        </button>
        </div>
      </div>

      <div className="space-y-2">
        <label className="text-xs font-bold text-[#b1bad3] uppercase tracking-wider">Risk</label>
        <div className="bg-[#0f212e] p-1 rounded-md border border-[#2f4553] flex">
          {(["low", "medium", "high", "expert"] as RiskLevel[]).map((level) => (
            <button
              key={level}
              onClick={() => {
                if (isBusy) return;
                setRiskLevel(level);
              }}
              disabled={isBusy}
              className={`flex-1 py-2 text-[10px] font-bold uppercase rounded transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${
                riskLevel === level ? "bg-[#213743] text-white shadow-sm" : "text-[#b1bad3] hover:text-white"
              }`}
            >
              {level}
            </button>
          ))}
        </div>
      </div>

      <div className="space-y-2">
        <label className="text-xs font-bold text-[#b1bad3] uppercase tracking-wider">
        Pick Numbers
        </label>
        <div className="flex gap-2">
        <button
          onClick={pickRandom}
          disabled={isBusy}
          className="flex-1 bg-[#2f4553] hover:bg-[#3e5666] disabled:opacity-50 text-white py-2 rounded-md text-sm font-semibold flex items-center justify-center gap-2"
        >
          <Bolt sx={{ fontSize: 16 }} /> Random
        </button>
        <button
          onClick={clearSelection}
          disabled={isBusy || picksCount === 0}
          className="flex-1 bg-[#2f4553] hover:bg-[#3e5666] disabled:opacity-50 text-white py-2 rounded-md text-sm font-semibold flex items-center justify-center gap-2"
        >
          <Delete sx={{ fontSize: 16 }} /> Clear
        </button>
        </div>
      </div>

      {playMode === "manual" ? (
        <button
          onClick={revealAndSettle}
          disabled={isBusy || picksCount === 0 || picksCount > MAX_PICKS || betAmount <= 0}
          className="w-full bg-[#00e701] hover:bg-[#00c201] disabled:opacity-50 disabled:cursor-not-allowed text-black py-3 rounded-md font-bold text-lg shadow-[0_0_20px_rgba(0,231,1,0.2)] transition-all active:scale-95 flex items-center justify-center gap-2"
        >
          {isAnimating ? (
          <Refresh className="animate-spin" />
          ) : (
          <PlayArrow sx={{ fill: "currentColor" }} />
          )}
          {isAnimating ? "Playing..." : "Bet"}
        </button>
      ) : (
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
                  disabled={isBusy}
                  className="w-full bg-[#0f212e] border border-[#2f4553] rounded-md py-2 pl-7 pr-4 text-white font-mono focus:outline-none focus:border-[#00e701] transition-colors"
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
                  disabled={isBusy}
                  className="w-full bg-[#0f212e] border border-[#2f4553] rounded-md py-2 pl-7 pr-4 text-white font-mono focus:outline-none focus:border-[#00e701] transition-colors"
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
                disabled={isBusy}
                className="w-full bg-[#0f212e] border border-[#2f4553] rounded-md py-2 pl-7 pr-4 text-white font-mono focus:outline-none focus:border-[#00e701] transition-colors"
              />
            </div>
          </div>

          {!isAutoBetting ? (
            <button
              onClick={startAutoBet}
              disabled={isAnimating || picksCount === 0 || betAmount <= 0}
              className="w-full bg-[#00e701] hover:bg-[#00c201] disabled:opacity-50 disabled:cursor-not-allowed text-black py-3 rounded-md font-bold text-lg transition-all active:scale-95 flex items-center justify-center gap-2 mt-2"
            >
              <PlayArrow sx={{ fill: "currentColor" }} /> Autobet
            </button>
          ) : (
            <button
              onClick={stopAutoBet}
              className="w-full bg-[#ef4444] hover:bg-[#dc2626] text-white py-3 rounded-md font-bold text-lg transition-all active:scale-95 flex items-center justify-center gap-2 mt-2"
            >
              Stop
            </button>
          )}
        </>
      )}

      {lastPayout > 0 && (
        <div className="p-4 bg-[#213743] border border-[#00e701] rounded-md text-center">
        <div className="text-xs text-[#b1bad3] uppercase">You Won</div>
        <div className="text-2xl font-bold text-[#00e701]">
          ${lastPayout.toFixed(2)}
        </div>
        </div>
      )}
    </div>

      <div className="flex-1 flex flex-col gap-6">
        <div className="bg-[#0f212e] p-6 rounded-xl relative overflow-hidden">
          {resultFx === "rolling" && <div className="limbo-roll-glow" />}
          {resultFx === "win" && <div className="limbo-win-flash" />}
          {resultFx === "lose" && <div className="limbo-lose-flash" />}

          <div className="relative z-10">
            <div className="grid grid-cols-6 gap-2 sm:gap-3 mx-auto justify-items-center w-max">
              {grid.map((tile) => {
                const isSelected = tile.isSelected;
                const isRevealed = tile.isRevealed;
                const multi = tile.multi ?? 0;

                const base =
                  "rounded-lg font-bold text-[11px] sm:text-sm p-0 border-0 relative select-none cursor-pointer overflow-visible";
                const size = "w-16 h-12 sm:w-20 sm:h-14 md:w-20 md:h-14";

                const unrevealedStyles = getTileStyles({ isSelected, isRevealed: false, multi: 0 });
                const revealedStyles = getTileStyles({ isSelected, isRevealed: true, multi });

                return (
                  <button
                    key={tile.id}
                    onClick={() => toggleTile(tile.id)}
                    disabled={isBusy}
                    className={`${base} ${size}`}
                    aria-label={`Tile ${tile.id + 1}`}
                    title={isRevealed ? `${formatMulti(multi)}x` : ""}
                    style={{ perspective: 800, background: 'transparent' }}
                  >
                    <div
                      style={{
                        width: '100%',
                        height: '100%',
                        position: 'relative',
                        transformStyle: 'preserve-3d',
                        transition: isRevealed ? 'transform 0.45s cubic-bezier(0.4, 0, 0.2, 1)' : 'none',
                        transform: isRevealed ? 'rotateX(180deg)' : 'rotateX(0deg)',
                      }}
                    >
                      <div
                        style={{
                          position: 'absolute',
                          inset: 0,
                          backfaceVisibility: 'hidden',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                        }}
                        className={`rounded-lg ${unrevealedStyles}`}
                      >
                      </div>

                      <div
                        style={{
                          position: 'absolute',
                          inset: 0,
                          backfaceVisibility: 'hidden',
                          transform: 'rotateX(180deg)',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                        }}
                        className={`rounded-lg ${revealedStyles}`}
                      >
                        <span className={
                          "font-mono " + getMultiColor(multi)
                        }>
                          {formatMulti(multi)}x
                        </span>
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
          <div className="p-4 pb-0 rounded-xl">
            {picksCount > 0 && (() => {
              const perPickDist = perPickDistribution(riskLevel, picksCount);
              const cols = perPickDist.length || 1;
              const totalChance = perPickDist.reduce((a, b) => a + b.chance, 0) || 1;
              return (
                <div
                  className="grid gap-2 w-full"
                  style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` }}
                >
                  {perPickDist.map((it, idx) => {
                    const prob = it.chance / totalChance;
                    const probText = formatPercentTwoNonZero(prob);
                    return (
                      <div
                        key={idx}
                        className="flex flex-col items-center p-2 rounded-md border text-center bg-[#213743] border-[#2f4553]"
                      >
                        <span className="font-bold text-sm">
                          {Number.isFinite(it.multi) ? `${formatMulti(it.multi)}x` : "-"}
                        </span>
                        <span className="text-xs text-[#8399aa] mt-1 leading-tight">{probText}</span>
                      </div>
                    );
                  })}
                </div>
              );
            })()}
          </div>
        </div>

        <GameRecordsPanel gameId="bars" refreshSignal={recordsRefreshCounter} />
      </div>
    </div>
  );
}
