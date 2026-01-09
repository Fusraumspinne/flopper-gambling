"use client";

import React, { useState, useCallback, useEffect } from "react";
import { useWallet } from "@/components/WalletProvider";
import { useSoundVolume } from "@/components/SoundVolumeProvider";
import { PlayArrow, Refresh, Delete, Bolt, Diamond } from "@mui/icons-material";
import GameRecordsPanel from "@/components/GameRecordsPanel";

type RiskLevel = "low" | "medium" | "high";

const MULTIPLIERS: Record<RiskLevel, Record<number, number[]>> = {
  low: {
    1: [0.7, 1.85],
    2: [0, 2, 3.8],
    3: [0, 1.1, 1.38, 26],
    4: [0, 0, 2.2, 7.9, 90],
    5: [0, 0, 1.5, 4.2, 13, 300],
    6: [0, 0, 1.1, 2, 6.2, 100, 700],
    7: [0, 0, 1.1, 1.6, 3.5, 15, 225, 700],
    8: [0, 0, 1.1, 1.5, 2, 5.5, 39, 100, 800],
    9: [0, 0, 1.1, 1.3, 1.7, 2.5, 7.5, 50, 250, 1000],
    10: [0, 0, 1.1, 1.2, 1.3, 1.8, 3.5, 13, 50, 250, 1000],
  },

  medium: {
    1: [0.4, 2.75],
    2: [0, 1.8, 5.1],
    3: [0, 0, 2.8, 50],
    4: [0, 0, 1.7, 10, 100],
    5: [0, 0, 1.4, 4, 14, 390],
    6: [0, 0, 0, 3, 9, 180, 710],
    7: [0, 0, 0, 2, 7, 30, 400, 800],
    8: [0, 0, 0, 2, 4, 11, 67, 400, 900],
    9: [0, 0, 0, 2, 2.5, 5, 15, 100, 500, 1000],
    10: [0, 0, 0, 1.6, 2, 4, 7, 26, 100, 500, 1000],
  },

  high: {
    1: [0, 3.96],
    2: [0, 0, 17.1],
    3: [0, 0, 0, 81.5],
    4: [0, 0, 0, 10, 259],
    5: [0, 0, 0, 4.5, 48, 450],
    6: [0, 0, 0, 0, 11, 350, 710],
    7: [0, 0, 0, 0, 7, 90, 400, 800],
    8: [0, 0, 0, 0, 5, 20, 270, 600, 900],
    9: [0, 0, 0, 0, 4, 11, 56, 500, 800, 1000],
    10: [0, 0, 0, 0, 3.5, 8, 13, 63, 500, 800, 1000],
  },
};

const GRID_SIZE = 40;
const DRAW_COUNT = 10;

export default function KenoPage() {
  const { balance, subtractFromBalance, addToBalance, finalizePendingLoss, syncBalance } = useWallet();

  const { volume } = useSoundVolume();

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

  const setBetBoth = (next: number) => {
    const v = normalizeMoney(next);
    setBetAmount(v);
    setBetInput(String(v));
  };

  const [selectedNumbers, setSelectedNumbers] = useState<number[]>([]);
  const [drawnNumbers, setDrawnNumbers] = useState<number[]>([]);
  const [isAnimating, setIsAnimating] = useState(false);
  const [betAmount, setBetAmount] = useState<number>(100);
  const [betInput, setBetInput] = useState<string>(betAmount.toString());
  const [riskLevel, setRiskLevel] = useState<RiskLevel>("low");
  const [lastWin, setLastWin] = useState<number>(0);

  const [playMode, setPlayMode] = useState<"manual" | "auto">("manual");
  const [onWinMode, setOnWinMode] = useState<"reset" | "raise">("reset");
  const [onWinPctInput, setOnWinPctInput] = useState<string>("0");
  const [onLoseMode, setOnLoseMode] = useState<"reset" | "raise">("reset");
  const [onLosePctInput, setOnLosePctInput] = useState<string>("0");
  const [stopProfitInput, setStopProfitInput] = useState<string>("0");
  const [stopLossInput, setStopLossInput] = useState<string>("0");
  const [isAutoBetting, setIsAutoBetting] = useState(false);

  const selectedNumbersRef = React.useRef<number[]>([]);
  const riskLevelRef = React.useRef<RiskLevel>("low");
  const betAmountRef = React.useRef<number>(100);
  const balanceRef = React.useRef<number>(0);
  const isAnimatingRef = React.useRef(false);
  const roundLockRef = React.useRef(false);
  const isAutoBettingRef = React.useRef(false);
  const autoOriginalBetRef = React.useRef<number>(0);
  const autoNetRef = React.useRef<number>(0);

  useEffect(() => {
    selectedNumbersRef.current = selectedNumbers;
  }, [selectedNumbers]);
  useEffect(() => {
    riskLevelRef.current = riskLevel;
  }, [riskLevel]);
  useEffect(() => {
    betAmountRef.current = betAmount;
  }, [betAmount]);
  useEffect(() => {
    balanceRef.current = balance;
  }, [balance]);
  useEffect(() => {
    isAutoBettingRef.current = isAutoBetting;
  }, [isAutoBetting]);

  const [resultFx, setResultFx] = useState<"rolling" | "win" | "lose" | null>(
    null
  );
  const resultTimeoutRef = React.useRef<number | null>(null);

  const audioRef = React.useRef({
    bet: new Audio("/sounds/Bet.mp3"),
    select: new Audio("/sounds/Select.mp3"),
    reveal: new Audio("/sounds/KenoReveal.mp3"),
    match: new Audio("/sounds/KenoMatch.mp3"),
    win: new Audio("/sounds/Win.mp3"),
    limboLose: new Audio("/sounds/LimboLose.mp3"),
  });

  const playAudio = (a?: HTMLAudioElement) => {
    if (!a) return;
    const v =
      typeof window !== "undefined" && typeof (window as any).__flopper_sound_volume__ === "number"
        ? (window as any).__flopper_sound_volume__
        : 1;
    if (!v) return;
    try {
      a.volume = v;
      a.currentTime = 0;
      void a.play();
    } catch (e) {
    }
  };

  useEffect(() => {
    if (volume <= 0) return;
    const prime = async () => {
      try {
        const items = Object.values(audioRef.current) as HTMLAudioElement[];
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
    return () => {
      if (resultTimeoutRef.current) {
        clearTimeout(resultTimeoutRef.current);
        resultTimeoutRef.current = null;
      }
      
    };
  }, []);

  useEffect(() => {
    return () => {
      isAutoBettingRef.current = false;
    };
  }, []);

  const toggleNumber = (num: number) => {
    if (isAnimating || isAutoBetting) return;
    if (drawnNumbers.length > 0) {
      setDrawnNumbers([]);
    }
    if (selectedNumbers.includes(num)) {
      setSelectedNumbers((prev) => prev.filter((n) => n !== num));
      playAudio(audioRef.current.select);
    } else {
      if (selectedNumbers.length < 10) {
        setSelectedNumbers((prev) => [...prev, num]);
        playAudio(audioRef.current.select);
      }
    }
  };

  const clearSelection = () => {
    if (!isAnimating && !isAutoBetting) {
      setSelectedNumbers([]);
      setDrawnNumbers([]);
      setLastWin(0);
    }
  };

  const pickRandom = () => {
    if (isAnimating || isAutoBetting) return;
    const count = 10;
    const newSelection: number[] = [];
    while (newSelection.length < count) {
      const r = Math.floor(Math.random() * GRID_SIZE) + 1;
      if (!newSelection.includes(r)) newSelection.push(r);
    }
    setDrawnNumbers([]);
    setLastWin(0);
    setSelectedNumbers(newSelection);
  };

  const getMultiplier = (matches: number) => {
    const count = selectedNumbers.length;
    if (count === 0) return 0;
    const table = MULTIPLIERS[riskLevel][count];
    return table && table[matches] ? table[matches] : 0;
  };

  const comb = (n: number, r: number) => {
    if (r < 0 || r > n) return 0;
    r = Math.min(r, n - r);
    let num = 1;
    let den = 1;
    for (let i = 1; i <= r; i++) {
      num *= n - r + i;
      den *= i;
    }
    return num / den;
  };

  const probabilityForHits = (k: number, hits: number) => {
    const n = GRID_SIZE;
    const draw = DRAW_COUNT;
    if (k <= 0) return 0;
    const total = comb(n, draw);
    const favourable = comb(k, hits) * comb(n - k, draw - hits);
    return total === 0 ? 0 : favourable / total;
  };

  const formatPercentTwoNonZero = (p: number) => {
    if (!p || p <= 0) return "0%";
    const pct = p * 100;
    if (pct >= 0.01) return `${pct.toFixed(2)}%`;

    const fixed = pct.toFixed(30);
    const parts = fixed.split(".");
    const intPart = parts[0];
    let dec = parts[1] || "";

    let nonZeroCount = 0;
    let cut = dec.length;
    for (let i = 0; i < dec.length; i++) {
      if (dec[i] !== "0") nonZeroCount++;
      if (nonZeroCount === 2) {
        cut = i + 1;
        break;
      }
    }

    if (nonZeroCount < 2) {
      dec = dec.replace(/0+$/g, "");
      return dec ? `${intPart}.${dec}%` : `${intPart}%`;
    }

    const nextDigit = dec[cut] ? parseInt(dec[cut], 10) : 0;
    let sliceArr = dec
      .slice(0, cut)
      .split("")
      .map((c) => parseInt(c, 10));
    if (nextDigit >= 5) {
      let carry = 1;
      for (let i = sliceArr.length - 1; i >= 0; i--) {
        const v = sliceArr[i] + carry;
        if (v === 10) {
          sliceArr[i] = 0;
          carry = 1;
        } else {
          sliceArr[i] = v;
          carry = 0;
          break;
        }
      }
      if (carry === 1) {
        const newInt = String(Number(intPart) + 1);
        while (sliceArr.length && sliceArr[sliceArr.length - 1] === 0)
          sliceArr.pop();
        return sliceArr.length
          ? `${newInt}.${sliceArr.join("")}%`
          : `${newInt}%`;
      }
    }

    let lastNonZero = sliceArr.length - 1;
    while (lastNonZero >= 0 && sliceArr[lastNonZero] === 0) lastNonZero--;
    if (lastNonZero < 0) return `${intPart}%`;
    sliceArr = sliceArr.slice(0, lastNonZero + 1);
    return `${intPart}.${sliceArr.join("")}%`;
  };

  const playRound = useCallback(
    async (opts?: { betAmount?: number }) => {
      if (roundLockRef.current) {
        return null as null | { betAmount: number; matches: number; multiplier: number; winAmount: number };
      }
      roundLockRef.current = true;
      try {
        const currentSelected = selectedNumbersRef.current;
        const currentRisk = riskLevelRef.current;
        const bet = normalizeMoney(opts?.betAmount ?? betAmountRef.current);

        if (
          currentSelected.length === 0 ||
          bet <= 0 ||
          bet > balanceRef.current ||
          isAnimatingRef.current
        ) {
          return null as null | { betAmount: number; matches: number; multiplier: number; winAmount: number };
        }

        subtractFromBalance(bet);
        playAudio(audioRef.current.bet);
        setLastWin(0);
        setDrawnNumbers([]);
        isAnimatingRef.current = true;
        setIsAnimating(true);
        setResultFx("rolling");

        const newDrawn: number[] = [];
        while (newDrawn.length < DRAW_COUNT) {
          const r = Math.floor(Math.random() * GRID_SIZE) + 1;
          if (!newDrawn.includes(r)) newDrawn.push(r);
        }

        for (let i = 0; i < newDrawn.length; i++) {
          await new Promise((resolve) => setTimeout(resolve, 100));
          const n = newDrawn[i];
          setDrawnNumbers((prev) => [...prev, n]);
          if (selectedNumbersRef.current.includes(n)) {
            playAudio(audioRef.current.match);
          } else {
            playAudio(audioRef.current.reveal);
          }
        }

        const matches = currentSelected.filter((n) => newDrawn.includes(n)).length;
        const table = MULTIPLIERS[currentRisk][currentSelected.length];
        const multiplier = table && table[matches] ? table[matches] : 0;
        const winAmount = normalizeMoney(bet * multiplier);

        if (winAmount > 0) {
          await new Promise((resolve) => setTimeout(resolve, 150));
          addToBalance(winAmount);
          setLastWin(winAmount);
          playAudio(audioRef.current.win);
          if (resultTimeoutRef.current) {
            clearTimeout(resultTimeoutRef.current);
            resultTimeoutRef.current = null;
          }
          setResultFx("win");
          isAnimatingRef.current = false;
          setIsAnimating(false);
          await new Promise<void>((resolve) => {
            resultTimeoutRef.current = window.setTimeout(() => {
              setResultFx(null);
              resultTimeoutRef.current = null;
              resolve();
            });
          });
        } else {
          finalizePendingLoss();
          if (resultTimeoutRef.current) {
            clearTimeout(resultTimeoutRef.current);
            resultTimeoutRef.current = null;
          }
          setResultFx("lose");
          playAudio(audioRef.current.limboLose);
          isAnimatingRef.current = false;
          setIsAnimating(false);
          await new Promise<void>((resolve) => {
            resultTimeoutRef.current = window.setTimeout(() => {
              setResultFx(null);
              resultTimeoutRef.current = null;
              resolve();
            });
          });
        }

        isAnimatingRef.current = false;
        setIsAnimating(false);
        return { betAmount: bet, matches, multiplier, winAmount };
      } finally {
        roundLockRef.current = false;
      }
    },
    [
      subtractFromBalance,
      addToBalance,
      finalizePendingLoss,
    ]
  );

  const playGame = useCallback(async () => {
    await playRound();
  }, [playRound]);

  const stopAutoBet = useCallback(() => {
    isAutoBettingRef.current = false;
    setIsAutoBetting(false);
    void syncBalance();
  }, [syncBalance]);

  const startAutoBet = useCallback(async () => {
    if (isAutoBettingRef.current) return;

    const currentSelected = selectedNumbersRef.current;
    const startingBet = normalizeMoney(betAmountRef.current);
    if (currentSelected.length === 0) return;
    if (startingBet <= 0 || startingBet > balanceRef.current) return;
    if (isAnimatingRef.current) return;

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
      if (selectedNumbersRef.current.length === 0) break;

      const result = await playRound({ betAmount: roundBet });
      if (!result) break;

      const lastNet = normalizeMoney(result.winAmount - result.betAmount);
      autoNetRef.current = normalizeMoney(autoNetRef.current + lastNet);

      if (result.winAmount > 0) {
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
    }

    isAutoBettingRef.current = false;
    setIsAutoBetting(false);
    void syncBalance();
  }, [
    onLoseMode,
    onLosePctInput,
    onWinMode,
    onWinPctInput,
    playRound,
    stopLossInput,
    stopProfitInput,
    stopAutoBet,
    syncBalance,
  ]);

  const changePlayMode = useCallback((mode: "manual" | "auto") => {
    try {
      stopAutoBet();
    } catch (e) {
    }

    if (resultTimeoutRef.current) {
      clearTimeout(resultTimeoutRef.current);
      resultTimeoutRef.current = null;
    }

    isAnimatingRef.current = false;
    setIsAnimating(false);
    setDrawnNumbers([]);
    setSelectedNumbers([]);
    selectedNumbersRef.current = [];
    setLastWin(0);
    setResultFx(null);

    setBetBoth(100);
    betAmountRef.current = 100;
    setRiskLevel("low");

    setOnWinMode("reset");
    setOnWinPctInput("0");
    setOnLoseMode("reset");
    setOnLosePctInput("0");
    setStopProfitInput("0");
    setStopLossInput("0");

    try {
      stopAutoBet();
    } catch (e) {}
    isAutoBettingRef.current = false;
    setIsAutoBetting(false);
    autoOriginalBetRef.current = 0;
    autoNetRef.current = 0;

    setPlayMode(mode);
  }, [stopAutoBet]);

  const getTileStatus = (num: number) => {
    const isSelected = selectedNumbers.includes(num);
    const isDrawn = drawnNumbers.includes(num);
    if (isSelected && isDrawn) return "hit";
    if (isDrawn && !isSelected) return "miss";
    if (isSelected) return "selected";
    return "default";
  };

  const getTileStyles = (status: string) => {
    switch (status) {
      case "hit":
        return "bg-[#213743] text-black shadow-[0_4px_0_#1a2c38] z-10";
      case "selected":
        return "bg-[#6b21a8] text-white shadow-[0_4px_0_#4c1d95] -translate-y-1 hover:bg-[#7e22ce] active:translate-y-0 active:shadow-none";
      case "miss":
        return "bg-[#213743] text-[#ef4444] shadow-[0_4px_0_#1a2c38]";
      case "unrevealed":
        return "bg-[#2f4553] text-[#b1bad3] shadow-[0_4px_0_#1a2c38]";
      default:
        return "bg-[#213743] text-[#b1bad3] shadow-[0_4px_0_#1a2c38] hover:-translate-y-1 hover:bg-[#2f4553] active:translate-y-0 active:shadow-none transition-all duration-100";
    }
  };

  const isBusy = isAnimating || isAutoBetting;

  return (
    <>
    <div className="p-2 sm:p-4 lg:p-6 max-w-[1400px] mx-auto flex flex-col lg:flex-row gap-4 lg:gap-8">
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
              onChange={(e) => setBetInput(e.target.value)}
              onBlur={() => {
                const raw = betInput.trim();
                const sanitized = raw.replace(/^0+(?=\d)/, "") || "0";
                const num = Number(sanitized);
                setBetBoth(num);
              }}
              disabled={isBusy}
              className="w-full bg-[#0f212e] border border-[#2f4553] rounded-md py-2 pl-7 pr-4 text-white font-mono focus:outline-none focus:border-[#00e701] transition-colors"
            />
          </div>
          <div className="grid grid-cols-3 gap-2">
            <button
              onClick={() => {
                const newBet = Number((betAmount / 2).toFixed(2));
                setBetBoth(newBet);
              }}
              disabled={isBusy}
              className="bg-[#2f4553] hover:bg-[#3e5666] text-xs py-1 rounded text-[#b1bad3]"
            >
              ½
            </button>
            <button
              onClick={() => {
                const newBet = Number((betAmount * 2).toFixed(2));
                setBetBoth(newBet);
              }}
              disabled={isBusy}
              className="bg-[#2f4553] hover:bg-[#3e5666] text-xs py-1 rounded text-[#b1bad3]"
            >
              2×
            </button>
            <button
              onClick={() => {
                const newBet = Number(balance.toFixed(2));
                setBetBoth(newBet);
              }}
              disabled={isBusy}
              className="bg-[#2f4553] hover:bg-[#3e5666] text-xs py-1 rounded text-[#b1bad3]"
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
            {(["low", "medium", "high"] as RiskLevel[]).map((level) => (
              <button
                key={level}
                onClick={() => !isBusy && setRiskLevel(level)}
                disabled={isBusy}
                className={`flex-1 py-2 text-[10px] font-bold uppercase rounded transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${
                  riskLevel === level
                    ? "bg-[#213743] text-white shadow-sm"
                    : "text-[#b1bad3] hover:text-white"
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
              disabled={isBusy || (selectedNumbers.length === 0 && drawnNumbers.length === 0 && lastWin === 0)}
              className="flex-1 bg-[#2f4553] hover:bg-[#3e5666] disabled:opacity-50 text-white py-2 rounded-md text-sm font-semibold flex items-center justify-center gap-2"
            >
              <Delete sx={{ fontSize: 16 }} /> Clear
            </button>
          </div>
        </div>

        {playMode === "manual" && (
          <button
            onClick={playGame}
            disabled={isBusy || selectedNumbers.length === 0}
            className="w-full bg-[#00e701] hover:bg-[#00c201] disabled:opacity-50 disabled:cursor-not-allowed text-black py-3 rounded-md font-bold text-lg shadow-[0_0_20px_rgba(0,231,1,0.2)] transition-all active:scale-95 flex items-center justify-center gap-2"
          >
            {isAnimating ? (
              <Refresh className="animate-spin" />
            ) : (
              <PlayArrow sx={{ fill: "currentColor" }} />
            )}
            {isAnimating ? "Playing..." : "Bet"}
          </button>
        )}

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
                    <div className="absolute left-3 top-1/2 -translate-y-1/2 text-[#b1bad3]">%
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
                  <div className="absolute left-3 top-1/2 -translate-y-1/2 text-[#b1bad3]">%
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
                disabled={isAnimating || selectedNumbers.length === 0}
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

        {lastWin > 0 && (
          <div className="p-4 bg-[#213743] border border-[#00e701] rounded-md text-center animate-pulse">
            <div className="text-xs text-[#b1bad3] uppercase">You Won</div>
            <div className="text-2xl font-bold text-[#00e701]">
              ${lastWin.toFixed(2)}
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
              <div className="grid grid-cols-5 sm:grid-cols-8 gap-2 sm:gap-3 max-w-[600px] mx-auto">
            {Array.from({ length: GRID_SIZE }, (_, i) => i + 1).map((num) => {
              const status = getTileStatus(num);
              const drawIndex = drawnNumbers.indexOf(num);
              const isDrawn = drawIndex >= 0;
              const isHit = status === "hit";
              const isMiss = status === "miss";
              const isUnrevealed = (status as string) === "unrevealed";

              const innerStyles: React.CSSProperties = {
                width: "100%",
                height: "100%",
                position: "relative",
                transformStyle: "preserve-3d",
                transition: "transform 420ms cubic-bezier(.2,.9,.2,1)",
                transitionDelay: "0ms",
                transform: isDrawn ? "rotateX(180deg)" : "rotateX(0deg)",
              };

              const frontBackFaceStyle: React.CSSProperties = {
                position: "absolute",
                inset: 0,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                backfaceVisibility: "hidden",
              };

              const gemClasses = `transform transition-all duration-500 ${
                isDrawn ? "opacity-100 scale-100" : "opacity-0 scale-75"
              }`;

              return (
                <button
                  key={num}
                  onClick={() => toggleNumber(num)}
                  onMouseDown={(e) => e.preventDefault()}
                  disabled={isAnimating}
                  style={{ perspective: 900, outline: "none", WebkitTapHighlightColor: "transparent" } as React.CSSProperties}
                  className={`aspect-square rounded-lg font-bold text-sm sm:text-base p-0 border-0 relative flex items-center justify-center overflow-hidden transition-all duration-200 shadow-[0_4px_0_#1a2c38] focus:outline-none focus-visible:outline-none focus:ring-0 focus:border-transparent ${getTileStyles(
                    status
                  )} ${isHit && isDrawn ? "animate-mines-gem" : ""}`}
                >
                  <div style={innerStyles}>
                    <div style={frontBackFaceStyle}>
                      <span className="select-none">{num}</span>
                    </div>
                    <div
                      style={{
                        ...frontBackFaceStyle,
                        transform: "rotateX(180deg)",
                      }}
                    >
                      {isHit ? (
                        <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
                          {isDrawn && (
                            <div className="absolute inset-0 rounded-lg pointer-events-none" style={{ border: "2px solid #00e701" }} />
                          )}
                          <div
                            className={`mines-gem-flash absolute inset-0`}
                            style={{
                              background:
                                "radial-gradient(circle at 50% 45%, rgba(255,255,255,0.85) 0%, rgba(0,231,1,0.35) 38%, rgba(0,231,1,0.0) 70%)",
                              animationDelay: "0ms",
                            }}
                          />

                          <div
                            className={`mines-gem-glow absolute inset-0 rounded-lg`}
                            style={{
                              boxShadow: "0 0 0 0 rgba(0,231,1,0.0)",
                              border: "2px solid rgba(0,231,1,0.35)",
                              animationDelay: "0ms",
                            }}
                          />

                          <div
                            className={
                              isDrawn ? "animate-mines-icon-pop" : undefined
                            }
                            style={{
                              display: "flex",
                              alignItems: "center",
                              justifyContent: "center",
                              width: "35%",
                              height: "35%",
                              animationDelay: "0ms",
                            }}
                          >
                            <Diamond
                              style={{
                                width: "100%",
                                height: "100%",
                                color: "#00ff17",
                                filter: "none",
                              }}
                            />
                          </div>
                        </div>
                      ) : isMiss ? (
                        <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
                          {isDrawn && (
                            <div className="absolute inset-0 rounded-lg pointer-events-none" style={{ border: "2px solid rgba(239,68,68,0.35)" }} />
                          )}
                          <div
                            className="mines-mine-flash absolute inset-0 rounded-lg"
                            style={{
                              background:
                                "radial-gradient(circle at 50% 45%, rgba(239,68,68,0.55) 0%, rgba(239,68,68,0.22) 35%, rgba(239,68,68,0.0) 72%)",
                            }}
                          />

                          <div
                            className={
                              isDrawn ? "animate-mines-mine" : undefined
                            }
                            style={{
                              width: "65%",
                              height: "65%",
                              display: "flex",
                              alignItems: "center",
                              justifyContent: "center",
                              filter: "none",
                            }}
                          >
                            <div
                              className="relative"
                              style={{ width: "100%", height: "100%" }}
                            >
                              <div
                                className="absolute inset-0 rounded-full"
                                style={{
                                  border: "2px solid rgba(239,68,68,0.35)",
                                  boxShadow:
                                    "inset 0 0 0 1px rgba(239,68,68,0.12)",
                                }}
                              />

                              <div
                                className="absolute left-1/2 top-1/2 rounded"
                                style={{
                                  width: "92%",
                                  height: "3px",
                                  background: "#ef4444",
                                  transform:
                                    "translate(-50%, -50%) rotate(45deg)",
                                  opacity: 0.9,
                                }}
                              />
                              <div
                                className="absolute left-1/2 top-1/2 rounded"
                                style={{
                                  width: "92%",
                                  height: "3px",
                                  background: "#ef4444",
                                  transform:
                                    "translate(-50%, -50%) rotate(-45deg)",
                                  opacity: 0.9,
                                }}
                              />

                              <div className="absolute inset-0 flex items-center justify-center">
                                <span
                                  className="font-extrabold"
                                  style={{
                                    color: "#ef4444",
                                    textShadow:
                                      "0 0 12px rgba(239,68,68,0.55)",
                                    lineHeight: 1,
                                  }}
                                >
                                  {num}
                                </span>
                              </div>
                            </div>
                          </div>
                        </div>
                      ) : isUnrevealed ? (
                        <div style={{ width: "65%", height: "65%", display: "flex", alignItems: "center", justifyContent: "center" }}>
                          <Diamond
                            style={{ width: "100%", height: "100%", color: "#557086" }}
                            className={gemClasses}
                          />
                        </div>
                      ) : (
                        <div />
                      )}
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        </div>
        {resultFx === "rolling" && (
          <div
            className="absolute inset-0 pointer-events-none"
            style={{
              background:
                "radial-gradient(circle at 50% 55%, rgba(47,69,83,0.22) 0%, rgba(15,33,46,0.0) 68%)",
              opacity: 0.85,
            }}
          />
        )}
        <div className="p-4 pb-0 rounded-xl">
          {selectedNumbers.length > 0 && (
            (() => {
              const payouts = MULTIPLIERS[riskLevel][selectedNumbers.length] || [];
              const cols = payouts.length || 1;
              return (
                <div
                  className="grid gap-2 w-full"
                  style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` }}
                >
                  {payouts.map((mult, hits) => {
                    const currentMatches = selectedNumbers.filter((n) =>
                      drawnNumbers.includes(n)
                    ).length;
                    const isCurrent = isAnimating
                      ? false
                      : drawnNumbers.length > 0 && hits === currentMatches;

                    const prob = probabilityForHits(selectedNumbers.length, hits);
                    const probText = formatPercentTwoNonZero(prob);

                    return (
                      <div
                        key={hits}
                        className={`flex flex-col items-center p-2 rounded-md border text-center bg-[#213743] ${
                          isCurrent
                            ? "border-[#00e701] scale-105"
                            : "border-[#2f4553]"
                        }`}
                      >
                        <span className="text-xs opacity-70">{hits}x</span>
                        <span className="font-bold text-sm">
                          {mult && mult > 0 ? `${mult}x` : "-"}
                        </span>
                        <span className="text-xs text-[#8399aa] mt-1 leading-tight">{probText}</span>
                      </div>
                    );
                  })}
                </div>
              );
            })()
          )}
        </div>
      </div>

      <GameRecordsPanel gameId="keno" />
    </div>
     </div>
    </>
  );
}
