"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useWallet } from "@/components/WalletProvider";
import { useSoundVolume } from "@/components/SoundVolumeProvider";
import { PlayArrow } from "@mui/icons-material";
import GameRecordsPanel from "@/components/GameRecordsPanel";

type RiskLevel = "low" | "medium" | "high" | "expert";

const RISK_LABELS: Record<RiskLevel, string> = {
  low: "Low",
  medium: "Medium",
  high: "High",
  expert: "Expert",
};

interface Outcome {
  multiplier: number;
  chance: number;
}

const RISK_CONFIG: Record<RiskLevel, Outcome[]> = {
  "low": [
    { "multiplier": 0, "chance": 2 },
    { "multiplier": 0.9, "chance": 15 },
    { "multiplier": 0.95, "chance": 65 },
    { "multiplier": 1.2, "chance": 15 },
    { "multiplier": 1.6, "chance": 2.5 },
    { "multiplier": 2.5, "chance": 0.5 }
  ],
  "medium": [
    { "multiplier": 0, "chance": 10 },
    { "multiplier": 0.5, "chance": 10 },
    { "multiplier": 0.9, "chance": 50 },
    { "multiplier": 1.2, "chance": 15 },
    { "multiplier": 1.65, "chance": 10 },
    { "multiplier": 2.5, "chance": 5 }
  ],
  "high": [
    { "multiplier": 0, "chance": 25 },
    { "multiplier": 0.5, "chance": 10 },
    { "multiplier": 0.9, "chance": 43 },
    { "multiplier": 1.55, "chance": 15 },
    { "multiplier": 4.0, "chance": 5 },
    { "multiplier": 6.0, "chance": 2 }
  ],
  "expert": [
    { "multiplier": 0, "chance": 80 },
    { "multiplier": 1.0, "chance": 12 },
    { "multiplier": 3.5, "chance": 4 },
    { "multiplier": 8.0, "chance": 2 },
    { "multiplier": 20.0, "chance": 1.4 },
    { "multiplier": 50.0, "chance": 0.6 }
  ]
}

const CLICK_MULTIPLIERS = [
    1.00,
    1.01,
    1.01,
    1.01,
    1.01,
    1.01,
    1.01,
    1.01,
    1.01,
    1.01,
    1.01,
    1.01,
    1.01,
    1.02,
    1.02,
    1.02,
    1.02,
    1.02,
    1.02,
    1.02,
    1.02,
    1.02,
    1.02,
    1.02,
    1.02
  ];

type GameState = "idle" | "playing" | "cashed_out" | "game_over";

interface Tile {
  id: number;
  isRevealed: boolean;
  revealedByPlayer: boolean;
  multiplier: number | null;
}

export default function VaultPage() {
  const { balance, addToBalance, subtractFromBalance, finalizePendingLoss, syncBalance } =
    useWallet();

  const { volume } = useSoundVolume();

  const normalizeMoney = (value: number) => {
    if (!Number.isFinite(value)) return 0;
    const rounded = Math.round((value + Number.EPSILON) * 100) / 100;
    return Object.is(rounded, -0) ? 0 : rounded;
  };

  const getClickBoost = (revealIndex: number) => {
    const idx = Number.isFinite(revealIndex) ? Math.max(0, Math.floor(revealIndex)) : 0;
    return CLICK_MULTIPLIERS[idx] ?? 1.0;
  };

  const getStepMultiplier = (baseMultiplier: number, revealIndex: number) => {
    if (!Number.isFinite(baseMultiplier) || baseMultiplier === 0) return 0;
    return normalizeMoney(baseMultiplier * getClickBoost(revealIndex));
  };

  const parseNumberLoose = (raw: string) => {
    const normalized = raw.replace(",", ".").trim();
    const n = Number(normalized);
    return Number.isFinite(n) ? n : 0;
  };

  const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

  const [betAmount, setBetAmount] = useState<number>(100);
  const [betInput, setBetInput] = useState<string>("100");
  const [riskLevel, setRiskLevel] = useState<RiskLevel>("low");
  const [gameState, setGameState] = useState<GameState>("idle");
  const [grid, setGrid] = useState<Tile[]>([]);
  const [revealedCount, setRevealedCount] = useState<number>(0);
  const [currentMultiplier, setCurrentMultiplier] = useState<number>(1);
  const [lastWin, setLastWin] = useState<number>(0);
  const [lastPickIndex, setLastPickIndex] = useState<number>(0);

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

  const [resultFx, setResultFx] = useState<"rolling" | "win" | "lose" | null>(null);
  const resultTimeoutRef = useRef<number | null>(null);

  const betAmountRef = useRef<number>(100);
  const balanceRef = useRef<number>(0);
  const riskLevelRef = useRef<RiskLevel>("low");
  const gameStateRef = useRef<GameState>("idle");
  const isAutoBettingRef = useRef(false);
  const isProcessingRef = useRef(false);
  const autoOriginalBetRef = useRef<number>(0);
  const autoNetRef = useRef<number>(0);
  const autoPickOrderRef = useRef<number[]>([]);
  const revealedCountRef = useRef<number>(0);
  const currentMultiplierRef = useRef<number>(1);

  const audioRef = useRef<{
    bet: HTMLAudioElement | null;
    minePop: HTMLAudioElement | null;
    reveal1: HTMLAudioElement | null;
    reveal2: HTMLAudioElement | null;
    reveal3: HTMLAudioElement | null;
    select: HTMLAudioElement | null;
    win: HTMLAudioElement | null;
  }>({ bet: null, minePop: null, reveal1: null, reveal2: null, reveal3: null, select: null, win: null });

  const ensureAudio = () => {
    if (audioRef.current.bet) return;
    audioRef.current = {
      bet: new Audio("/sounds/Bet.mp3"),
      minePop: new Audio("/sounds/MinePop.mp3"),
      reveal1: new Audio("/sounds/MineReveal1.mp3"),
      reveal2: new Audio("/sounds/MineReveal2.mp3"),
      reveal3: new Audio("/sounds/MineReveal3.mp3"),
      select: new Audio("/sounds/Select.mp3"),
      win: new Audio("/sounds/Win.mp3"),
    };
  };

  const playAudio = (a?: HTMLAudioElement | null) => {
    if (!a) return;
    const v =
      typeof window !== "undefined" &&
      typeof (window as any).__flopper_sound_volume__ === "number"
        ? (window as any).__flopper_sound_volume__
        : 1;
    if (!v) return;
    try {
      a.volume = v;
      a.currentTime = 0;
      void a.play();
    } catch (e) {}
  };

  const playRevealSound = (revealed: number, total: number) => {
    if (total <= 0) return;
    const pct = revealed / total;
    if (pct <= 1 / 3) {
      playAudio(audioRef.current.reveal1);
    } else if (pct <= 2 / 3) {
      playAudio(audioRef.current.reveal2);
    } else {
      playAudio(audioRef.current.reveal3);
    }
  };

  const playMinePopSound = () => playAudio(audioRef.current.minePop);
  const playWinSound = () => playAudio(audioRef.current.win);

  useEffect(() => {
    if (volume <= 0) return;
    const prime = async () => {
      try {
        ensureAudio();
        const items = Object.values(audioRef.current).filter(Boolean) as HTMLAudioElement[];
        for (const a of items) {
          try {
            a.muted = true;
            await a.play();
            a.pause();
            a.currentTime = 0;
            a.muted = false;
          } catch (e) {
            a.muted = false;
          }
        }
      } catch (e) {}
    };

    document.addEventListener("pointerdown", prime, { once: true });
    return () => document.removeEventListener("pointerdown", prime);
  }, [volume]);

  useEffect(() => {
    betAmountRef.current = betAmount;
  }, [betAmount]);
  useEffect(() => {
    balanceRef.current = balance;
  }, [balance]);
  useEffect(() => {
    riskLevelRef.current = riskLevel;
  }, [riskLevel]);
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
    revealedCountRef.current = revealedCount;
  }, [revealedCount]);
  useEffect(() => {
    currentMultiplierRef.current = currentMultiplier;
  }, [currentMultiplier]);

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
    const newGrid: Tile[] = Array.from({ length: 25 }, (_, i) => ({
      id: i,
      isRevealed: false,
      revealedByPlayer: false,
      multiplier: null,
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

  const togglePlannedTile = useCallback((id: number) => {
    if (gameStateRef.current === "playing") return;
    if (isAutoBettingRef.current) return;
    if (id < 0 || id >= 25) return;

    setAutoPickOrder((prev) => {
      const idx = prev.indexOf(id);
      if (idx >= 0) {
        const next = [...prev];
        next.splice(idx, 1);
        playAudio(audioRef.current.select);
        return next;
      }
      playAudio(audioRef.current.select);
      return [...prev, id];
    });
  }, []);

  const getOutcome = useCallback((risk: RiskLevel): number => {
    const outcomes = RISK_CONFIG[risk];
    const rand = Math.random() * 100;
    let sum = 0;
    for (const item of outcomes) {
      sum += item.chance;
      if (rand < sum) return item.multiplier;
    }
    return outcomes[outcomes.length - 1].multiplier;
  }, []);

  const potentialWin = useMemo(() => {
    return betAmount * currentMultiplier;
  }, [betAmount, currentMultiplier]);

  const startGame = () => {
    if (isAutoBettingRef.current) return;
    if (balance < betAmount) return;
    if (gameState === "playing") return;

    subtractFromBalance(betAmount);
    setGameState("playing");
    playAudio(audioRef.current.bet);
    setRevealedCount(0);
    setLastPickIndex(0);
    setCurrentMultiplier(1);
    setLastWin(0);

    const newGrid: Tile[] = Array.from({ length: 25 }, (_, i) => ({
      id: i,
      isRevealed: false,
      revealedByPlayer: false,
      multiplier: null,
    }));
    setGrid(newGrid);
  };

  const revealAllWithTease = useCallback(
    (gridLocal: Tile[], revealedByPlayerId: number | null, startRevealedCount: number) => {
      const risk = riskLevelRef.current;
      const revealIndex =
        Number.isFinite(startRevealedCount) && startRevealedCount > 0
          ? Math.floor(startRevealedCount)
          : 0;
      const next = gridLocal.map((t) => {
        if (t.isRevealed) return t;
        const outcome = getOutcome(risk);
        const stepMultiplier = getStepMultiplier(outcome, revealIndex);
        return {
          ...t,
          isRevealed: true,
          revealedByPlayer: false,
          multiplier: stepMultiplier,
        };
      });
      if (revealedByPlayerId != null && next[revealedByPlayerId]) {
        next[revealedByPlayerId] = {
          ...next[revealedByPlayerId],
          revealedByPlayer: true,
        };
      }
      return next;
    },
    [getOutcome]
  );

  const cashOutCore = useCallback(
    async (opts?: { multiplier?: number; revealedCount?: number }) => {
      if (gameStateRef.current !== "playing") return;
      if (isAutoBettingRef.current) return;
      const rCount = opts?.revealedCount ?? revealedCountRef.current;
      if (rCount <= 0) return;

      const mult = opts?.multiplier ?? currentMultiplierRef.current;
      const winAmount = normalizeMoney(betAmountRef.current * mult);
      if (winAmount <= 0) {
        setLastWin(0);
        setGameState("game_over");
        setGrid((prev) => revealAllWithTease(prev, null, rCount));
        playMinePopSound();
        finalizePendingLoss();
        await showFx("lose");
        return;
      }

      const isPartialLoss = mult < 1;

      addToBalance(winAmount);
      setLastWin(winAmount);
      setGameState("cashed_out");

      setGrid((prev) => revealAllWithTease(prev, null, rCount));

      if (isPartialLoss) {
        playMinePopSound();
        await showFx("lose");
      } else {
        playWinSound();
        await showFx("win");
      }
    },
    [addToBalance, finalizePendingLoss, revealAllWithTease, showFx]
  );

  const cashOut = useCallback(() => {
    if (isProcessingRef.current) return;
    isProcessingRef.current = true;
    setTimeout(() => {
      isProcessingRef.current = false;
    }, 50);
    void cashOutCore();
  }, [cashOutCore]);

  const revealTile = (id: number) => {
    if (gameState !== "playing") return;
    if (playMode !== "manual") return;
    if (isAutoBettingRef.current) return;
    if (isProcessingRef.current) return;

    const tile = grid[id];
    if (tile?.isRevealed) return;

    isProcessingRef.current = true;
    setTimeout(() => {
      isProcessingRef.current = false;
    }, 50);

    if (resultTimeoutRef.current) {
      clearTimeout(resultTimeoutRef.current);
      resultTimeoutRef.current = null;
    }
    setResultFx("rolling");

    const pickIndex = grid.reduce((acc, t) => acc + (t.revealedByPlayer ? 1 : 0), 0);
    setLastPickIndex(pickIndex);

    const risk = riskLevelRef.current;
    const outcome = getOutcome(risk);
    const stepMultiplier = getStepMultiplier(outcome, pickIndex);

    const newGrid = [...grid];
    newGrid[id] = {
      ...tile,
      isRevealed: true,
      revealedByPlayer: true,
      multiplier: stepMultiplier,
    };
    setGrid(newGrid);

    if (stepMultiplier <= 0) {
      setGameState("game_over");
      playMinePopSound();
      setGrid(revealAllWithTease(newGrid, id, revealedCount));
      setResultFx("lose");
      resultTimeoutRef.current = window.setTimeout(() => setResultFx(null), 900);
      finalizePendingLoss();
      return;
    }

    const newRevealedCount = revealedCount + 1;
    setRevealedCount(newRevealedCount);
    const nextMultiplier = normalizeMoney(currentMultiplierRef.current * stepMultiplier);
    setCurrentMultiplier(nextMultiplier);
    setResultFx(null);
    playRevealSound(newRevealedCount, 25);

    if (newRevealedCount >= 25) {
      void cashOutCore({ multiplier: nextMultiplier, revealedCount: newRevealedCount });
    }
  };

  const playRound = useCallback(
    async (opts?: { betAmount?: number }) => {
      const bet = normalizeMoney(opts?.betAmount ?? betAmountRef.current);
      const currentBalance = balanceRef.current;
      const risk = riskLevelRef.current;
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
      setCurrentMultiplier(1);
      setBetBoth(bet);
      subtractFromBalance(bet);
      playAudio(audioRef.current.bet);
      setGameState("playing");

      let gridLocal: Tile[] = Array.from({ length: 25 }, (_, i) => ({
        id: i,
        isRevealed: false,
        revealedByPlayer: false,
        multiplier: null,
      }));

      setGrid(gridLocal);
      await sleep(120);

      let revealedLocal = 0;
      let multiplierLocal = 1;

      for (const id of picks) {
        if (gridLocal[id]?.isRevealed) continue;

        if (resultTimeoutRef.current) {
          clearTimeout(resultTimeoutRef.current);
          resultTimeoutRef.current = null;
        }
        setResultFx("rolling");
        await sleep(120);

        const outcome = getOutcome(risk);
        const stepMultiplier = getStepMultiplier(outcome, revealedLocal);

        setLastPickIndex(revealedLocal);

        gridLocal = [...gridLocal];
        gridLocal[id] = {
          ...gridLocal[id],
          isRevealed: true,
          revealedByPlayer: true,
          multiplier: stepMultiplier,
        };
        setGrid(gridLocal);

        if (stepMultiplier <= 0) {
          setGameState("game_over");
          gridLocal = revealAllWithTease(gridLocal, id, revealedLocal);
          setGrid(gridLocal);
          playMinePopSound();
          finalizePendingLoss();
          await showFx("lose");
          return { betAmount: bet, winAmount: 0, didWin: false };
        }

        revealedLocal++;
        multiplierLocal = normalizeMoney(multiplierLocal * stepMultiplier);
        setRevealedCount(revealedLocal);
        setCurrentMultiplier(multiplierLocal);
        playRevealSound(revealedLocal, 25);
        setResultFx(null);

        await sleep(120);
      }

      if (revealedLocal <= 0) {
        setGameState("game_over");
        gridLocal = revealAllWithTease(gridLocal, null, 0);
        setGrid(gridLocal);
        finalizePendingLoss();
        await showFx("lose");
        return { betAmount: bet, winAmount: 0, didWin: false };
      }

      const winAmount = normalizeMoney(bet * multiplierLocal);
      if (winAmount <= 0) {
        setLastWin(0);
        setGameState("game_over");
        gridLocal = revealAllWithTease(gridLocal, null, revealedLocal);
        setGrid(gridLocal);
        playMinePopSound();
        finalizePendingLoss();
        await showFx("lose");
        return { betAmount: bet, winAmount: 0, didWin: false };
      }

      addToBalance(winAmount);
      setLastWin(winAmount);
      setGameState("cashed_out");
      playWinSound();
      gridLocal = revealAllWithTease(gridLocal, null, revealedLocal);
      setGrid(gridLocal);
      await showFx("win");
      return { betAmount: bet, winAmount, didWin: true };
    },
    [
      addToBalance,
      finalizePendingLoss,
      getOutcome,
      getValidPickOrder,
      revealAllWithTease,
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
    void syncBalance();
  }, [
    getValidPickOrder,
    onLoseMode,
    onLosePctInput,
    onWinMode,
    onWinPctInput,
    playRound,
    stopLossInput,
    stopProfitInput,
    syncBalance,
  ]);

  const stopAutoBet = useCallback(() => {
    isAutoBettingRef.current = false;
    setIsAutoBetting(false);
    void syncBalance();
  }, [syncBalance]);

  const changePlayMode = useCallback(
    (mode: "manual" | "auto") => {
      try {
        stopAutoBet();
      } catch (e) {}

      if (typeof document !== "undefined") {
        (document.activeElement as HTMLElement)?.blur();
      }

      if (resultTimeoutRef.current) {
        clearTimeout(resultTimeoutRef.current);
        resultTimeoutRef.current = null;
      }
      setResultFx(null);

      setLastWin(0);
      setRevealedCount(0);
      setLastPickIndex(0);
      setCurrentMultiplier(1);
      setGameState("idle");
      resetGrid();

      setBetBoth(100);
      betAmountRef.current = 100;
      setBetInput(String(100));

      setRiskLevel("low");
      riskLevelRef.current = "low";

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
      } catch (e) {}
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
    <>
      <div className="p-2 sm:p-4 lg:p-6 max-w-[1400px] mx-auto flex flex-col lg:flex-row items-start gap-4 lg:gap-8">
        <div className="w-full lg:w-60 flex flex-col gap-3 bg-[#0f212e] p-2 sm:p-3 rounded-xl h-fit text-xs">
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
                onChange={(e) => {
                let v = e.target.value;
                if (parseFloat(v) < 0) v = "0";
                setBetInput(v);
              }}
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
              Risk
            </label>
            <div className="bg-[#0f212e] p-1 rounded-md border border-[#2f4553] flex">
              {(["low", "medium", "high", "expert"] as const).map((lvl) => (
                <button
                  key={lvl}
                  onClick={() => !isBusy && setRiskLevel(lvl)}
                  disabled={isBusy}
                  className={`flex-1 py-2 text-[10px] font-bold uppercase rounded transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${
                    riskLevel === lvl
                      ? "bg-[#213743] text-white shadow-sm"
                      : "text-[#b1bad3] hover:text-white"
                  }`}
                >
                  {RISK_LABELS[lvl]}
                </button>
              ))}
            </div>
          </div>

          {playMode === "manual" && (
            <div className="space-y-2">
              <button
                onClick={() => {
                  if (gameState !== "playing") return;
                  if (isAutoBettingRef.current) return;
                  const unrevealed = grid.filter((t) => !t.isRevealed).map((t) => t.id);
                  if (unrevealed.length === 0) return;
                  const pick = unrevealed[Math.floor(Math.random() * unrevealed.length)];
                  revealTile(pick);
                }}
                disabled={
                  gameState !== "playing" ||
                  isAutoBettingRef.current ||
                  grid.filter((t) => !t.isRevealed).length === 0
                }
                className="w-full bg-[#2f4553] hover:bg-[#3e5666] disabled:opacity-50 disabled:cursor-not-allowed text-white py-3 rounded-md font-bold text-sm transition-all active:scale-95 flex items-center justify-center gap-2"
              >
                Random Pick
              </button>
            </div>
          )}

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
                disabled={isBusy || betAmount <= 0}
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
                    <div className="absolute left-3 top-1/2 -translate-y-1/2 text-[#b1bad3]">
                      %
                    </div>
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
                    <div className="absolute left-3 top-1/2 -translate-y-1/2 text-[#b1bad3]">
                      %
                    </div>
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
                  <div className="absolute left-3 top-1/2 -translate-y-1/2 text-[#b1bad3]">
                    $
                  </div>
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
                  <div className="absolute left-3 top-1/2 -translate-y-1/2 text-[#b1bad3]">
                    $
                  </div>
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
                  disabled={isBusy || autoPickOrder.length === 0 || betAmount <= 0}
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
                Current: {currentMultiplier}x
              </div>
            </div>
          )}

          {lastWin > 0 && gameState !== "playing" && (
            <div className="p-4 bg-[#213743] border border-[#00e701] rounded-md text-center">
              <div className="text-xs text-[#b1bad3] uppercase">You Won</div>
              <div className="text-xl font-bold text-[#00e701]">${lastWin.toFixed(2)}</div>
            </div>
          )}
        </div>

        <div className="flex-1 flex flex-col gap-4">
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
                const isBust = tile.multiplier === 0;
                const baseSafe = "#213743";
                const blendedBg = tile.isRevealed ? baseSafe : undefined;

                const plannedIndex = plannedOrderById.get(tile.id) ?? null;

                const canPlan = playMode === "auto" && gameState !== "playing" && !isAutoBetting;
                const canReveal = playMode === "manual" && gameState === "playing" && !isAutoBetting;

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
                    onPointerDown={(e) => e.currentTarget.blur()}
                    disabled={(canReveal && tile.isRevealed) || (!canReveal && !canPlan)}
                    className={`relative rounded-lg transition-[background-color,transform,box-shadow,opacity] duration-200 flex items-center justify-center aspect-square
                  focus:outline-none focus-visible:outline-none focus:ring-0 focus-visible:ring-0
                  overflow-hidden
                  ${
                    !tile.isRevealed
                      ? isPlannedCovered
                        ? "bg-[#6b21a8] text-white shadow-[0_4px_0_#4c1d95] -translate-y-1 hover:bg-[#7e22ce] active:translate-y-0 active:shadow-none border-none"
                        : "bg-[#2f4553] hover:bg-[#3c5566] hover:-translate-y-1 cursor-pointer shadow-[0_4px_0_0_#1a2c38] border-none"
                      : isBust && tile.revealedByPlayer
                      ? "animate-mines-mine"
                      : !isBust && tile.revealedByPlayer
                      ? "animate-mines-gem"
                      : ""
                  }
                  ${
                    tile.revealedByPlayer
                      ? isBust
                        ? "border-2 border-[#ef4444]"
                        : "border-2 border-[#00e701]"
                      : "border-none"
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

                    {tile.isRevealed && tile.revealedByPlayer && !isBust && (
                      <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
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

                    {tile.isRevealed && tile.revealedByPlayer && isBust && (
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
                        className={tile.revealedByPlayer ? "animate-mines-icon-pop" : undefined}
                        style={{
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          width: "100%",
                          height: "100%",
                        }}
                      >
                        <div
                          className={`text-sm sm:text-base font-extrabold tracking-tight ${
                            isBust
                              ? "text-[#b1bad3]"
                              : (tile.multiplier ?? 0) < 1
                              ? "text-[#b1bad3]"
                              : "text-[#00e701]"
                          }`}
                          style={{
                            textShadow: isBust
                              ? "none"
                              : (tile.multiplier ?? 0) >= 1
                              ? "0 0 14px rgba(0,231,1,0.25)"
                              : "none",
                          }}
                        >
                          {isBust ? "0x" : `${tile.multiplier}x`}
                        </div>
                      </div>
                    )}
                  </button>
                );
              })}
            </div>

            <div className="w-full pt-4">
              <div className="grid grid-cols-6 gap-2 w-full">
                {RISK_CONFIG[riskLevel].map((outcome, idx) => {
                  const tableRevealIndex = gameState === "playing" ? lastPickIndex : revealedCount;
                  const finalMult = getStepMultiplier(outcome.multiplier, tableRevealIndex);
                  return (
                    <div
                      key={idx}
                      className="flex flex-col items-center p-2 rounded-md border border-[#2f4553] text-center bg-[#213743]"
                    >
                      <span className="font-bold text-[11px] sm:text-xs text-white">
                        {finalMult > 0 ? `${finalMult}x` : "0x"}
                      </span>
                      <span className="text-[9px] text-[#8399aa] mt-0.5 leading-tight font-medium">
                        {outcome.chance}%
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>

          <GameRecordsPanel gameId="vault" />
        </div>
      </div>
    </>
  );
}
