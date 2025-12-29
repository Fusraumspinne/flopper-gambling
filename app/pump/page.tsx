"use client";

import React, { useState, useEffect, useRef, useCallback } from "react";
import { useWallet } from "@/components/WalletProvider";
import { PlayArrow } from "@mui/icons-material";

type Difficulty = "Low" | "Medium" | "High" | "Expert";

interface Step {
  multiplier: number;
  probability: number;
}

const GAME_DATA: Record<Difficulty, Step[]> = {
  Low: [
    { multiplier: 1, probability: 100 },
    { multiplier: 1.02, probability: 96 },
    { multiplier: 1.07, probability: 92 },
    { multiplier: 1.11, probability: 88 },
    { multiplier: 1.17, probability: 84 },
    { multiplier: 1.23, probability: 80 },
    { multiplier: 1.29, probability: 76 },
    { multiplier: 1.36, probability: 72 },
    { multiplier: 1.44, probability: 68 },
    { multiplier: 1.53, probability: 64 },
    { multiplier: 1.63, probability: 60 },
    { multiplier: 1.75, probability: 56 },
    { multiplier: 1.88, probability: 52 },
    { multiplier: 2.04, probability: 48 },
    { multiplier: 2.23, probability: 44 },
    { multiplier: 2.45, probability: 40 },
    { multiplier: 2.72, probability: 36 },
    { multiplier: 3.06, probability: 32 },
    { multiplier: 3.5, probability: 28 },
    { multiplier: 4.08, probability: 24 },
    { multiplier: 4.9, probability: 20 },
    { multiplier: 6.13, probability: 16 },
    { multiplier: 8.17, probability: 12 },
    { multiplier: 12.25, probability: 8 },
    { multiplier: 24.5, probability: 4 },
  ],
  Medium: [
    { multiplier: 1, probability: 100 },
    { multiplier: 1.11, probability: 88 },
    { multiplier: 1.27, probability: 77 },
    { multiplier: 1.46, probability: 66.956522 },
    { multiplier: 1.69, probability: 57.826087 },
    { multiplier: 1.98, probability: 49.565217 },
    { multiplier: 2.33, probability: 42.130435 },
    { multiplier: 2.76, probability: 35.478261 },
    { multiplier: 3.31, probability: 29.565217 },
    { multiplier: 4.03, probability: 24.347826 },
    { multiplier: 4.95, probability: 19.782609 },
    { multiplier: 6.19, probability: 15.826087 },
    { multiplier: 7.88, probability: 12.434783 },
    { multiplier: 10.25, probability: 9.565217 },
    { multiplier: 13.66, probability: 7.173913 },
    { multiplier: 18.78, probability: 5.217391 },
    { multiplier: 26.83, probability: 3.652174 },
    { multiplier: 40.25, probability: 2.434783 },
    { multiplier: 64.4, probability: 1.521739 },
    { multiplier: 112.7, probability: 0.869565 },
    { multiplier: 225.4, probability: 0.434783 },
    { multiplier: 563.5, probability: 0.173913 },
    { multiplier: 2254, probability: 0.043478 },
  ],
  High: [
    { multiplier: 1, probability: 100 },
    { multiplier: 1.23, probability: 80 },
    { multiplier: 1.55, probability: 63.333333 },
    { multiplier: 1.98, probability: 49.565217 },
    { multiplier: 2.56, probability: 38.300395 },
    { multiplier: 3.36, probability: 29.181254 },
    { multiplier: 4.48, probability: 21.88594 },
    { multiplier: 6.08, probability: 16.126482 },
    { multiplier: 8.41, probability: 11.649604 },
    { multiplier: 11.92, probability: 8.221344 },
    { multiplier: 17.34, probability: 5.652174 },
    { multiplier: 26.01, probability: 3.768116 },
    { multiplier: 40.46, probability: 2.42236 },
    { multiplier: 65.74, probability: 1.490683 },
    { multiplier: 112.7, probability: 0.869565 },
    { multiplier: 206.62, probability: 0.474308 },
    { multiplier: 413.23, probability: 0.237154 },
    { multiplier: 929.77, probability: 0.105402 },
    { multiplier: 2479.4, probability: 0.039526 },
    { multiplier: 8677.9, probability: 0.011293 },
    { multiplier: 52076.4, probability: 0.001882 },
  ],
  Expert: [
    { multiplier: 1, probability: 100 },
    { multiplier: 1.63, probability: 60 },
    { multiplier: 2.8, probability: 35 },
    { multiplier: 4.95, probability: 19.782609 },
    { multiplier: 9.08, probability: 10.790514 },
    { multiplier: 17.34, probability: 5.652174 },
    { multiplier: 34.68, probability: 2.826087 },
    { multiplier: 73.21, probability: 1.338673 },
    { multiplier: 164.72, probability: 0.594966 },
    { multiplier: 400.02, probability: 0.224986 },
    { multiplier: 1066.73, probability: 0.09187 },
    { multiplier: 3200.18, probability: 0.030623 },
    { multiplier: 11200.65, probability: 0.008749 },
    { multiplier: 48536.13, probability: 0.002019 },
    { multiplier: 291216.8, probability: 0.000337 },
    { multiplier: 3203384.8, probability: 0.000031 },
  ],
};

const BALLOON_COLORS: Record<Difficulty, string> = {
  Low: "#10b981",
  Medium: "#3b82f6",
  High: "#f59e0b",
  Expert: "#8b5cf6",
};

type GameState = "idle" | "playing" | "cashed_out" | "popped";

export default function PumpPage() {
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

  const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

  const setBetBoth = (next: number) => {
    const v = normalizeMoney(next);
    setBetAmount(v);
    setBetInput(String(v));
  };

  const [betAmount, setBetAmount] = useState<number>(100);
  const [betInput, setBetInput] = useState<string>("100");
  const [difficulty, setDifficulty] = useState<Difficulty>("Low");
  const [gameState, setGameState] = useState<GameState>("idle");
  const [currentStepIndex, setCurrentStepIndex] = useState<number>(0);
  const [lastWin, setLastWin] = useState<number>(0);

  const [playMode, setPlayMode] = useState<"manual" | "auto">("manual");
  const [pumpsPerRoundInput, setPumpsPerRoundInput] = useState<string>("1");
  const [onWinMode, setOnWinMode] = useState<"reset" | "raise">("reset");
  const [onWinPctInput, setOnWinPctInput] = useState<string>("0");
  const [onLoseMode, setOnLoseMode] = useState<"reset" | "raise">("reset");
  const [onLosePctInput, setOnLosePctInput] = useState<string>("0");
  const [stopProfitInput, setStopProfitInput] = useState<string>("0");
  const [stopLossInput, setStopLossInput] = useState<string>("0");
  const [isAutoBetting, setIsAutoBetting] = useState(false);

  const [plannedSafeSteps, setPlannedSafeSteps] = useState<number | null>(null);

  const [resultFx, setResultFx] = useState<"rolling" | "win" | "lose" | null>(null);
  const resultTimeoutRef = useRef<number | null>(null);

  const [scale, setScale] = useState(1);
  const [isPumping, setIsPumping] = useState(false);
  const [hasPumped, setHasPumped] = useState(false);
  const [isFlyingAway, setIsFlyingAway] = useState(false);

  const currentData = GAME_DATA[difficulty];
  const currentStep = currentData[currentStepIndex];
  const nextStep = currentData[currentStepIndex + 1];

  const maxPumps = Math.max(0, currentData.length - 1);

  const potentialWin = betAmount * currentStep.multiplier;

  const stepsScrollRef = useRef<HTMLDivElement | null>(null);
  const stepRefs = useRef<Array<HTMLDivElement | null>>([]);

  const betAmountRef = useRef<number>(100);
  const balanceRef = useRef<number>(0);
  const difficultyRef = useRef<Difficulty>("Low");
  const isAutoBettingRef = useRef(false);
  const autoOriginalBetRef = useRef<number>(0);
  const autoNetRef = useRef<number>(0);

  useEffect(() => {
    betAmountRef.current = betAmount;
  }, [betAmount]);
  useEffect(() => {
    balanceRef.current = balance;
  }, [balance]);
  useEffect(() => {
    difficultyRef.current = difficulty;
  }, [difficulty]);
  useEffect(() => {
    isAutoBettingRef.current = isAutoBetting;
  }, [isAutoBetting]);

  useEffect(() => {
    // Clamp pumps-per-round whenever difficulty changes (different max pumps).
    setPumpsPerRoundInput((prev) => {
      const raw = prev.trim();
      const sanitized = raw.replace(/^0+(?=\d)/, "") || "0";
      const parsed = Math.floor(parseNumberLoose(sanitized));
      const clamped = Math.min(Math.max(parsed, 1), Math.max(1, maxPumps));
      return String(clamped);
    });
  }, [maxPumps]);

  const formatProb = (p: number) => {
    if (p >= 1) {
      return `${Number(p.toFixed(p % 1 ? 2 : 0))}%`;
    }
    if (p === 0) return "0%";
    return `${Number(p.toPrecision(3))}%`;
  };

  useEffect(() => {
    if (gameState !== "playing") return;
    const el = stepRefs.current[currentStepIndex];
    if (el && stepsScrollRef.current) {
      try {
        el.scrollIntoView({
          behavior: "smooth",
          block: "nearest",
          inline: "center",
        });
      } catch (e) {
        const container = stepsScrollRef.current;
        const left =
          el.offsetLeft - container.clientWidth / 2 + el.clientWidth / 2;
        container.scrollTo({ left, behavior: "smooth" });
      }
    }
  }, [currentStepIndex, gameState]);

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

  const startGame = () => {
    if (balance < betAmount) {
      return;
    }
    if (gameState === "playing") return;
    if (isAutoBettingRef.current) return;

    subtractFromBalance(betAmount);
    setIsFlyingAway(false);
    setGameState("playing");
    setCurrentStepIndex(0);
    setLastWin(0);
    setScale(1);
    setHasPumped(false);

    const roll = Math.random() * 100;

    const safeIndex = currentData.findLastIndex(
      (step) => roll <= step.probability
    );

    setPlannedSafeSteps(Math.max(safeIndex, 0));
  };

  const resetSession = () => {
    setGameState("idle");
    setCurrentStepIndex(0);
    setLastWin(0);
    setHasPumped(false);
    setScale(1);
    setPlannedSafeSteps(null);
    setIsFlyingAway(false);
    if (resultTimeoutRef.current) {
      clearTimeout(resultTimeoutRef.current);
      resultTimeoutRef.current = null;
    }
    setResultFx(null);
  };

  const changeDifficulty = (level: Difficulty) => {
    if (level === difficulty) return;
    if (isAutoBettingRef.current || gameState === "playing") return;
    setDifficulty(level);
    resetSession();
  };

  const changePlayMode = (mode: "manual" | "auto") => {
    if (isAutoBettingRef.current || gameState === "playing") return;

    try {
      stopAutoBet();
    } catch (e) {
    }

    setPlannedSafeSteps(null);
    resetSession();

    try {
      setBetBoth(100);
    } catch (e) {
      setBetAmount(100);
      setBetInput(String(100));
      betAmountRef.current = 100;
    }

    setDifficulty("Low");
    difficultyRef.current = "Low";

    setPumpsPerRoundInput("1");

    setOnWinMode("reset");
    setOnWinPctInput("0");
    setOnLoseMode("reset");
    setOnLosePctInput("0");
    setStopProfitInput("0");
    setStopLossInput("0");

    autoOriginalBetRef.current = 0;
    autoNetRef.current = 0;
    isAutoBettingRef.current = false;
    setIsAutoBetting(false);

    setIsPumping(false);

    setPlayMode(mode);
  };

  const pump = () => {
    if (gameState !== "playing") return;
    if (!nextStep) return;
    if (isAutoBettingRef.current) return;
    if (resultTimeoutRef.current) {
      clearTimeout(resultTimeoutRef.current);
      resultTimeoutRef.current = null;
    }
    setResultFx("rolling");

    setHasPumped(true);

    setIsPumping(false);
    const pressTimer = window.setTimeout(() => {
      setIsPumping(true);

      const safeLimit = plannedSafeSteps ?? (currentData.length - 1);
      const nextIndex = currentStepIndex + 1;
      const willHaveNoMorePumps = nextIndex >= currentData.length - 1;
      const nextPayout = betAmount * currentData[nextIndex].multiplier;

      const releaseTimer = window.setTimeout(() => {
        setIsPumping(false);
        if (nextIndex <= safeLimit) {
          setCurrentStepIndex((prev) => prev + 1);
          setScale((prev) => prev + 0.1);

          if (willHaveNoMorePumps) {
            cashOut(nextPayout);
          }
        } else {
          setIsFlyingAway(false);
          setGameState("popped");
          finalizePendingLoss();
          setResultFx("lose");
          resultTimeoutRef.current = window.setTimeout(() => setResultFx(null), 900);
        }
      }, 300);
    }, 10);
  };

  const cashOut = (overridePayout?: number) => {
    if (gameState !== "playing") return;
    if (isAutoBettingRef.current) return;

    const payout = overridePayout ?? potentialWin;
    addToBalance(payout);
    setLastWin(payout);
    setGameState("cashed_out");
    setIsFlyingAway(true);
    if (resultTimeoutRef.current) {
      clearTimeout(resultTimeoutRef.current);
      resultTimeoutRef.current = null;
    }
    setResultFx("win");
    resultTimeoutRef.current = window.setTimeout(() => setResultFx(null), 900);
    window.setTimeout(() => {
      setIsFlyingAway(false);
      setCurrentStepIndex(0);
      setHasPumped(false);
      setPlannedSafeSteps(null);
    }, 900);
  };

  const playRound = useCallback(
    async (opts?: { betAmount?: number; pumps?: number }) => {
      const bet = normalizeMoney(opts?.betAmount ?? betAmountRef.current);
      const pumpsRequestedRaw = Math.floor(
        Number.isFinite(opts?.pumps as number) ? (opts?.pumps as number) : parseNumberLoose(pumpsPerRoundInput)
      );

      const data = GAME_DATA[difficultyRef.current];
      const roundMaxPumps = Math.max(0, data.length - 1);
      const pumpsRequested = Math.min(
        Math.max(pumpsRequestedRaw, 1),
        Math.max(1, roundMaxPumps)
      );

      if (bet <= 0 || bet > balanceRef.current) {
        return null as null | { betAmount: number; winAmount: number; didWin: boolean };
      }
      if (isPumping) {
        return null as null | { betAmount: number; winAmount: number; didWin: boolean };
      }
      if (gameState === "playing") {
        return null as null | { betAmount: number; winAmount: number; didWin: boolean };
      }

      if (resultTimeoutRef.current) {
        clearTimeout(resultTimeoutRef.current);
        resultTimeoutRef.current = null;
      }

      subtractFromBalance(bet);
      setBetBoth(bet);

      setIsFlyingAway(false);
      setGameState("playing");
      setCurrentStepIndex(0);
      setLastWin(0);
      setScale(1);
      setHasPumped(false);
      setPlannedSafeSteps(null);

      const roll = Math.random() * 100;
      const safeIndex = data.findLastIndex((step) => roll <= step.probability);
      const safeLimit = Math.max(safeIndex, 0);
      setPlannedSafeSteps(safeLimit);

      let stepIndex = 0;

      for (let i = 0; i < pumpsRequested; i++) {
        const nextIndex = stepIndex + 1;
        if (nextIndex > roundMaxPumps) break;

        if (resultTimeoutRef.current) {
          clearTimeout(resultTimeoutRef.current);
          resultTimeoutRef.current = null;
        }
        setResultFx("rolling");
        setHasPumped(true);

        // Restart pump animation each iteration by toggling isPumping
        setIsPumping(false);
        await sleep(10);
        setIsPumping(true);
        await sleep(300);
        setIsPumping(false);

        if (nextIndex <= safeLimit) {
          stepIndex = nextIndex;
          setCurrentStepIndex(stepIndex);
          setScale(1 + stepIndex * 0.1);

          const reachedEnd = stepIndex >= roundMaxPumps;
          if (reachedEnd) break;
        } else {
          setIsFlyingAway(false);
          setGameState("popped");
          finalizePendingLoss();
          setResultFx("lose");
          await new Promise<void>((resolve) => {
            resultTimeoutRef.current = window.setTimeout(() => {
              setResultFx(null);
              resultTimeoutRef.current = null;
              resolve();
            }, 900);
          });
          return { betAmount: bet, winAmount: 0, didWin: false };
        }
      }

      const payout = normalizeMoney(bet * data[stepIndex].multiplier);
      addToBalance(payout);
      setLastWin(payout);
      setGameState("cashed_out");
      setIsFlyingAway(true);
      setResultFx("win");
      await new Promise<void>((resolve) => {
        resultTimeoutRef.current = window.setTimeout(() => {
          setResultFx(null);
          resultTimeoutRef.current = null;
          resolve();
        }, 900);
      });
      setIsFlyingAway(false);
      setCurrentStepIndex(0);
      setHasPumped(false);
      setPlannedSafeSteps(null);

      return { betAmount: bet, winAmount: payout, didWin: true };
    },
    [
      addToBalance,
      finalizePendingLoss,
      gameState,
      isPumping,
      pumpsPerRoundInput,
      subtractFromBalance,
    ]
  );

  const stopAutoBet = useCallback(() => {
    isAutoBettingRef.current = false;
    setIsAutoBetting(false);
  }, []);

  const startAutoBet = useCallback(async () => {
    if (isAutoBettingRef.current) return;

    const startingBet = normalizeMoney(betAmountRef.current);
    if (startingBet <= 0 || startingBet > balanceRef.current) return;
    if (gameState === "playing") return;
    if (isPumping) return;

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

      const result = await playRound({ betAmount: roundBet });
      if (!result) break;

      const lastNet = normalizeMoney(result.winAmount - result.betAmount);

      if (result.didWin && result.winAmount > 0) {
        autoNetRef.current = normalizeMoney(
          autoNetRef.current + lastNet
        );
        if (onWinMode === "reset") {
          setBetBoth(autoOriginalBetRef.current);
          betAmountRef.current = autoOriginalBetRef.current;
        } else {
          const next = normalizeMoney(result.betAmount * (1 + onWinPct / 100));
          setBetBoth(next);
          betAmountRef.current = next;
        }
      } else {
        autoNetRef.current = normalizeMoney(autoNetRef.current + lastNet);
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
  }, [
    gameState,
    isPumping,
    onLoseMode,
    onLosePctInput,
    onWinMode,
    onWinPctInput,
    playRound,
    stopLossInput,
    stopProfitInput,
    stopAutoBet,
  ]);

  const isDeflated = !hasPumped && gameState !== "popped";

  const balloonBaseScale = isDeflated ? 0.62 : 1 + currentStepIndex * 0.055;

  const difficultyIndex = (["Low", "Medium", "High", "Expert"] as Difficulty[]).indexOf(difficulty);
  const stageColors = ["#10b981", "#3b82f6", "#f59e0b", "#8b5cf6"];

  const isBusy = gameState === "playing" || isAutoBetting;

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
                const newBet = Number((betAmount / 2).toFixed(2));
                setBetBoth(newBet);
              }}
              disabled={isBusy}
              className="bg-[#2f4553] hover:bg-[#3e5666] text-xs py-1 rounded text-[#b1bad3] disabled:opacity-50"
            >
              ½
            </button>
            <button
              onClick={() => {
                const newBet = Number((betAmount * 2).toFixed(2));
                setBetBoth(newBet);
              }}
              disabled={isBusy}
              className="bg-[#2f4553] hover:bg-[#3e5666] text-xs py-1 rounded text-[#b1bad3] disabled:opacity-50"
            >
              2×
            </button>
            <button
              onClick={() => {
                const newBet = Number(balance.toFixed(2));
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
            Difficulty
          </label>
          <div className="bg-[#0f212e] p-1 rounded-md border border-[#2f4553] flex">
            {(["Low", "Medium", "High", "Expert"] as Difficulty[]).map(
              (level) => (
                <button
                  key={level}
                  onClick={() => changeDifficulty(level)}
                  disabled={isBusy}
                  className={`flex-1 py-2 text-[10px] font-bold uppercase rounded transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${
                    difficulty === level
                      ? "bg-[#213743] text-white shadow-sm"
                      : "text-[#b1bad3] hover:text-white"
                  }`}
                >
                  {level}
                </button>
              )
            )}
          </div>
        </div>

        {playMode === "manual" && (
          <>
            {gameState === "playing" ? (
              <div className="flex flex-col gap-3">
                <div className="grid grid-cols-2 gap-2">
                  <button
                    onClick={pump}
                    disabled={isPumping || !nextStep}
                    className="bg-[#2f4553] hover:bg-[#3e5666] text-white py-3 rounded-md font-bold text-lg transition-all active:scale-95 flex items-center justify-center gap-2 disabled:opacity-50"
                  >
                    Pump
                  </button>
                  <button
                    onClick={() => cashOut()}
                    disabled={isPumping || !hasPumped}
                    className="bg-[#00e701] hover:bg-[#00c201] text-black py-3 rounded-md font-bold text-lg shadow-[0_0_20px_rgba(0,231,1,0.2)] transition-all active:scale-95 flex items-center justify-center gap-2 disabled:opacity-50"
                  >
                    Cashout
                  </button>
                </div>
              </div>
            ) : (
              <button
                onClick={startGame}
                disabled={isAutoBetting}
                className="w-full bg-[#00e701] hover:bg-[#00c201] disabled:opacity-50 disabled:cursor-not-allowed text-black py-3 rounded-md font-bold text-lg shadow-[0_0_20px_rgba(0,231,1,0.2)] transition-all active:scale-95 flex items-center justify-center gap-2"
              >
                <PlayArrow /> Bet
              </button>
            )}
          </>
        )}

        {playMode === "auto" && (
          <>
            <div className="space-y-2">
              <label className="text-xs font-bold text-[#b1bad3] uppercase tracking-wider">
                Pumps per Round
              </label>
              <div className="relative">
                <input
                  type="number"
                  value={pumpsPerRoundInput}
                  onChange={(e) => setPumpsPerRoundInput(e.target.value)}
                  onBlur={() => {
                    const raw = pumpsPerRoundInput.trim();
                    const sanitized = raw.replace(/^0+(?=\d)/, "") || "0";
                    const parsed = Math.floor(parseNumberLoose(sanitized));
                    const clamped = Math.min(
                      Math.max(parsed, 1),
                      Math.max(1, maxPumps)
                    );
                    setPumpsPerRoundInput(String(clamped));
                  }}
                  disabled={isBusy}
                  min={1}
                  max={Math.max(1, maxPumps)}
                  className="w-full bg-[#0f212e] border border-[#2f4553] rounded-md py-2 px-4 text-white font-mono focus:outline-none focus:border-[#00e701] transition-colors disabled:opacity-50"
                />
              </div>
            </div>

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
                    className="w-full bg-[#0f212e] border border-[#2f4553] rounded-md py-2 pl-7 pr-4 text-white font-mono focus:outline-none focus:border-[#00e701] transition-colors disabled:opacity-50"
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
                    className="w-full bg-[#0f212e] border border-[#2f4553] rounded-md py-2 pl-7 pr-4 text-white font-mono focus:outline-none focus:border-[#00e701] transition-colors disabled:opacity-50"
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
                <div className="absolute left-3 top-1/2 -translate-y-1/2 text-[#b1bad3]">$
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
                  className="w-full bg-[#0f212e] border border-[#2f4553] rounded-md py-2 pl-7 pr-4 text-white font-mono focus:outline-none focus:border-[#00e701] transition-colors disabled:opacity-50"
                />
              </div>
            </div>

            <div className="space-y-2">
              <label className="text-xs font-bold text-[#b1bad3] uppercase tracking-wider">
                Stop on Loss
              </label>
              <div className="relative">
                <div className="absolute left-3 top-1/2 -translate-y-1/2 text-[#b1bad3]">$
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
                  className="w-full bg-[#0f212e] border border-[#2f4553] rounded-md py-2 pl-7 pr-4 text-white font-mono focus:outline-none focus:border-[#00e701] transition-colors disabled:opacity-50"
                />
              </div>
            </div>

            {!isAutoBetting ? (
              <button
                onClick={startAutoBet}
                disabled={gameState === "playing"}
                className="w-full bg-[#00e701] hover:bg-[#00c201] disabled:opacity-50 disabled:cursor-not-allowed text-black py-3 rounded-md font-bold text-lg transition-all active:scale-95 flex items-center justify-center gap-2"
              >
                <PlayArrow /> Autobet
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

        {gameState === "playing" && (
          <div className="bg-[#0f212e] p-4 rounded border border-[#2f4553] text-center">
            <div className="text-[#b1bad3] text-sm">Current Win</div>
            <div className="text-2xl font-bold text-[#00e701]">
              ${potentialWin.toFixed(2)}
            </div>
            <div className="text-sm text-[#b1bad3] mt-1">
              Next: {nextStep ? `${nextStep.multiplier}x` : "—"}
            </div>
          </div>
        )}

        {lastWin > 0 && gameState === "cashed_out" && (
          <div className="mt-2 p-4 bg-[#213743] border border-[#00e701] rounded-md text-center animate-pulse">
            <div className="text-xs text-[#b1bad3] uppercase">You Won</div>
            <div className="text-2xl font-bold text-[#00e701]">
              ${lastWin.toFixed(2)}
            </div>
          </div>
        )}
      </div>

      <div className="flex-1 bg-[#0f212e] p-4 sm:p-6 rounded-xl min-h-100 sm:min-h-150 flex flex-col items-center justify-center relative overflow-hidden">
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
        <div className="absolute top-10 text-center z-10">
          <div className="text-6xl font-black text-white drop-shadow-lg">
            {currentStep.multiplier}x
          </div>
        </div>

        <div className="relative w-full h-full flex items-center justify-center">
          <div className="relative w-full max-w-205 h-95 sm:h-130">
            <div className="absolute left-0 right-0 bottom-6 sm:bottom-7 h-9 sm:h-10 bg-[#2f4553] rounded-2xl" />

            <div className="absolute right-6 sm:right-8 bottom-9 sm:bottom-10 flex items-center gap-2">
              {stageColors.map((col, idx) => (
                <div
                  key={col}
                  title={["Low", "Medium", "High", "Expert"][idx]}
                  style={idx === difficultyIndex ? { backgroundColor: col } : undefined}
                  className={`w-3 h-3 sm:w-3.5 sm:h-3.5 rounded-full transition-transform ${
                    idx === difficultyIndex ? 'scale-110' : 'bg-[#0f212e]'
                  }`}
                />
              ))}
            </div>

            <div className="absolute left-1/2 -translate-x-1/2 bottom-6 sm:bottom-7">
              <div className="absolute left-1/2 -translate-x-1/2 -top-22 sm:-top-24">
                <div className="w-3 h-22 sm:h-24 bg-[#2f4553] rounded-full" />
              </div>
            </div>

            <div className="absolute left-8 sm:left-10 bottom-6 sm:bottom-7">
              <div className="relative w-28 sm:w-32 h-44 sm:h-48">
                <div className="absolute bottom-7 left-12 sm:left-14 -translate-x-1/2 w-7 sm:w-8 h-26 sm:h-28 bg-[#2f4553]" />

                <div
                  className={`absolute left-12 sm:left-14 top-6 sm:top-7 -translate-x-1/2 w-20 sm:w-22 h-6 sm:h-7 bg-[#213743] rounded-md ${isPumping ? "animate-pump-press" : ""}`}
                />
              </div>
            </div>

            <div
              className={`absolute left-1/2 -translate-x-1/2 bottom-22 sm:bottom-26 flex items-center justify-center ${
                isFlyingAway && gameState === "cashed_out"
                  ? "animate-balloon-fly-away"
                  : ""
              }`}
            >
              <div className="relative">
                <div style={{ transform: `scale(${balloonBaseScale})`, transformOrigin: "50% 100%", transition: "transform 260ms cubic-bezier(0.2,0.9,0.2,1)" }}>
                  <div
                    className={
                      isPumping
                        ? "animate-balloon-pump"
                        : gameState === "popped"
                          ? "animate-balloon-pop"
                          : ""
                    }
                  >
                    <svg
                      width="220"
                      height="260"
                      viewBox="0 0 100 120"
                      className="drop-shadow-[0_10px_20px_rgba(0,0,0,0.5)]"
                      style={{ transformOrigin: "50% 85%" }}
                    >
                      <path
                        d="M50 0 C 20 0 0 30 0 60 C 0 90 40 110 48 118 L 46 120 L 54 120 L 52 118 C 60 110 100 90 100 60 C 100 30 80 0 50 0 Z"
                        fill={
                          gameState === "popped"
                            ? "#ef4444"
                            : BALLOON_COLORS[difficulty]
                        }
                      />
                      <ellipse
                        cx="30"
                        cy="30"
                        rx="10"
                        ry="20"
                        fill="white"
                        fillOpacity={0.2}
                        transform="rotate(-20 30 30)"
                      />
                    </svg>
                  </div>
                </div>
              </div>
            </div>

            {gameState === "popped" && (
              <div className="absolute inset-0 flex items-center justify-center">
                <div className="text-[#ef4444] font-black text-4xl animate-shake">
                  POP!
                </div>
              </div>
            )}
          </div>
        </div>

        <div className="w-full mt-4">
          <div ref={stepsScrollRef} className="w-full overflow-x-auto">
            <div className="flex items-center space-x-2 px-4 py-2">
              {currentData.map((step, idx) => (
                <div
                  key={idx}
                  ref={(el) => {
                    stepRefs.current[idx] = el;
                  }}
                  className={`min-w-24 shrink-0 bg-[#213743] p-2 rounded-md border transition-transform ${
                    idx === currentStepIndex
                      ? "border-[#00e701] scale-105"
                      : "border-[#2f4553]"
                  }`}
                >
                  <div className="text-sm text-white font-bold text-center">
                    {step.multiplier}x
                  </div>
                  <div className="text-xs text-[#9fb0c6] mt-1 text-center">
                    {formatProb(step.probability)}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
