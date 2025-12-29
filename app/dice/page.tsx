"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useWallet } from "@/components/WalletProvider";
import { PlayArrow, Refresh, SwapHoriz } from "@mui/icons-material";

type GameState = "idle" | "rolling" | "won" | "lost";

const HOUSE_EDGE = 1.0;
const MIN_THRESHOLD = 2;
const MAX_THRESHOLD = 98;

export default function DicePage() {
  const { balance, subtractFromBalance, addToBalance, finalizePendingLoss } =
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

  const setBetBoth = (next: number) => {
    const v = normalizeMoney(next);
    setBetAmount(v);
    setBetInput(String(v));
  };

  const [betAmount, setBetAmount] = useState<number>(100);
  const [betInput, setBetInput] = useState<string>("100");

  const [sliderValue, setSliderValue] = useState<number>(50);
  const [thresholdInput, setThresholdInput] = useState<string>("50.00");
  const [rollOver, setRollOver] = useState<boolean>(true); 

  const [gameState, setGameState] = useState<GameState>("idle");
  const [displayNumber, setDisplayNumber] = useState<number>(50.0); 
  const [lastResult, setLastResult] = useState<number | null>(null); 
  const [lastWin, setLastWin] = useState<number>(0);

  const [playMode, setPlayMode] = useState<"manual" | "auto">("manual");
  const [onWinMode, setOnWinMode] = useState<"reset" | "raise">("reset");
  const [onWinPctInput, setOnWinPctInput] = useState<string>("0");
  const [onLoseMode, setOnLoseMode] = useState<"reset" | "raise">("reset");
  const [onLosePctInput, setOnLosePctInput] = useState<string>("0");
  const [stopProfitInput, setStopProfitInput] = useState<string>("0");
  const [stopLossInput, setStopLossInput] = useState<string>("0");
  const [isAutoBetting, setIsAutoBetting] = useState(false);

  const animationRef = useRef<number | null>(null);
  const isPointerDraggingRef = useRef<boolean>(false);
  const [resultAnimNonce, setResultAnimNonce] = useState(0);
  const [resultFx, setResultFx] = useState<"rolling" | "win" | "lose" | null>(
    null
  );
  const resultTimeoutRef = useRef<number | null>(null);

  const betAmountRef = useRef<number>(betAmount);
  const balanceRef = useRef<number>(balance);
  const sliderValueRef = useRef<number>(sliderValue);
  const rollOverRef = useRef<boolean>(rollOver);
  const gameStateRef = useRef<GameState>(gameState);
  const isAutoBettingRef = useRef<boolean>(false);
  const autoOriginalBetRef = useRef<number>(0);

  const winChance = useMemo(() => {
    if (rollOver) {
      return 100 - sliderValue;
    } else {
      return sliderValue;
    }
  }, [sliderValue, rollOver]);

  const multiplier = useMemo(() => {
    if (winChance <= 0) return 0;
    const rawMultiplier = (100 - HOUSE_EDGE) / winChance;
    return Math.max(1.01, rawMultiplier); 
  }, [winChance]);

  const potentialProfit = useMemo(() => {
    return betAmount * multiplier;
  }, [betAmount, multiplier]);

  const handleBetInputBlur = () => {
    const raw = betInput.trim();
    const sanitized = raw.replace(/^0+(?=\d)/, "") || "0";
    const num = Number(sanitized);
    setBetBoth(num);
  };

  const clamp = (v: number, min: number, max: number) =>
    Math.max(min, Math.min(max, v));

  const round2 = (v: number) => Math.round(v * 100) / 100;

  const handleSliderInput = (e: React.FormEvent<HTMLInputElement>) => {
    const val = Number(e.currentTarget.value);
    const clamped = isPointerDraggingRef.current
      ? clamp(Math.round(val), MIN_THRESHOLD, MAX_THRESHOLD)
      : round2(clamp(val, MIN_THRESHOLD, MAX_THRESHOLD));
    setSliderValue(clamped);
    setThresholdInput(clamped.toFixed(2));
  };

  const handleThresholdBlur = () => {
    const raw = thresholdInput.trim().replace(",", ".");
    const num = Number(raw);
    if (!Number.isFinite(num)) {
      setThresholdInput(sliderValue.toFixed(2));
      return;
    }
    const clamped = round2(clamp(num, MIN_THRESHOLD, MAX_THRESHOLD));
    setSliderValue(clamped);
    setThresholdInput(clamped.toFixed(2));
  };

  const liveThresholdNum = useMemo(() => {
    const raw = thresholdInput.trim().replace(",", ".");
    const num = Number(raw);
    if (!Number.isFinite(num)) return NaN;
    return round2(clamp(num, MIN_THRESHOLD, MAX_THRESHOLD));
  }, [thresholdInput]);

  const liveWinChance = useMemo(() => {
    if (!Number.isFinite(liveThresholdNum)) return NaN;
    return rollOver ? 100 - liveThresholdNum : liveThresholdNum;
  }, [liveThresholdNum, rollOver]);

  const liveMultiplier = useMemo(() => {
    if (!Number.isFinite(liveWinChance) || liveWinChance <= 0) return Infinity;
    const raw = (100 - HOUSE_EDGE) / liveWinChance;
    return Math.max(1.01, raw);
  }, [liveWinChance]);

  const formatLiveMultiplier = (m: number) => {
    if (!Number.isFinite(m)) return "—";
    if (m > 1_000_000) return m.toExponential(2);
    if (m >= 1000) return Math.round(m).toString();
    return m.toFixed(2);
  };

  const toggleMode = () => {
    setRollOver(!rollOver);
    const next = round2(100 - sliderValue);
    setSliderValue(next);
    setThresholdInput(next.toFixed(2));
  };

  useEffect(() => {
    betAmountRef.current = betAmount;
  }, [betAmount]);
  useEffect(() => {
    balanceRef.current = balance;
  }, [balance]);
  useEffect(() => {
    sliderValueRef.current = sliderValue;
  }, [sliderValue]);
  useEffect(() => {
    rollOverRef.current = rollOver;
  }, [rollOver]);
  useEffect(() => {
    gameStateRef.current = gameState;
  }, [gameState]);
  useEffect(() => {
    isAutoBettingRef.current = isAutoBetting;
  }, [isAutoBetting]);

  type RoundResult = {
    betAmount: number;
    roll: number;
    threshold: number;
    rollOver: boolean;
    multiplier: number;
    winAmount: number;
  };

  const playRound = useCallback(
    async (opts?: { betAmount?: number }) => {
      if (gameStateRef.current === "rolling") {
        return null as null | RoundResult;
      }

      const bet = normalizeMoney(opts?.betAmount ?? betAmountRef.current);
      if (bet <= 0 || bet > balanceRef.current) {
        return null as null | RoundResult;
      }

      const threshold = sliderValueRef.current;
      const over = rollOverRef.current;
      const winChance = over ? 100 - threshold : threshold;
      const rawMult = winChance <= 0 ? 0 : (100 - HOUSE_EDGE) / winChance;
      const roundMultiplier = Math.max(1.01, rawMult);
      const fullWinAmount = normalizeMoney(bet * roundMultiplier);

      subtractFromBalance(bet);
      setLastWin(0);
      setGameState("rolling");
      setLastResult(null);

      if (resultTimeoutRef.current) {
        clearTimeout(resultTimeoutRef.current);
        resultTimeoutRef.current = null;
      }
      setResultFx("rolling");

      const duration = 600;
      const startTime = performance.now();

      await new Promise<void>((resolve) => {
        const animate = (time: number) => {
          const elapsed = time - startTime;
          const progress = Math.min(elapsed / duration, 1);
          setDisplayNumber(Math.random() * 100);

          if (progress < 1) {
            animationRef.current = requestAnimationFrame(animate);
            return;
          }

          resolve();
        };

        animationRef.current = requestAnimationFrame(animate);
      });

      if (animationRef.current) cancelAnimationFrame(animationRef.current);

      const roll = Math.random() * 100;
      setDisplayNumber(roll);
      setLastResult(roll);

      const isWin = over ? roll > threshold : roll < threshold;
      const winAmount = isWin ? fullWinAmount : 0;

      setResultAnimNonce((n) => n + 1);

      if (isWin) {
        addToBalance(winAmount);
        setLastWin(winAmount);
        setGameState("won");
        setResultFx("win");
      } else {
        finalizePendingLoss();
        setGameState("lost");
        setResultFx("lose");
      }

      await new Promise<void>((resolve) => {
        resultTimeoutRef.current = window.setTimeout(() => {
          setResultFx(null);
          resultTimeoutRef.current = null;
          resolve();
        }, 900);
      });

      return {
        betAmount: bet,
        roll,
        threshold,
        rollOver: over,
        multiplier: roundMultiplier,
        winAmount,
      };
    },
    [addToBalance, finalizePendingLoss, subtractFromBalance]
  );

  const rollDice = useCallback(async () => {
    await playRound();
  }, [playRound]);

  const stopAutoBet = useCallback(() => {
    isAutoBettingRef.current = false;
    setIsAutoBetting(false);
  }, []);

  const startAutoBet = useCallback(async () => {
    if (isAutoBettingRef.current) return;
    if (gameStateRef.current === "rolling") return;

    const startingBet = normalizeMoney(betAmountRef.current);
    if (startingBet <= 0 || startingBet > balanceRef.current) return;

    autoOriginalBetRef.current = startingBet;

    isAutoBettingRef.current = true;
    setIsAutoBetting(true);

    while (isAutoBettingRef.current) {
      const stopProfit = Math.max(
        0,
        normalizeMoney(parseNumberLoose(stopProfitInput))
      );
      const stopLoss = Math.max(0, normalizeMoney(parseNumberLoose(stopLossInput)));
      const onWinPct = Math.max(0, parseNumberLoose(onWinPctInput));
      const onLosePct = Math.max(0, parseNumberLoose(onLosePctInput));

      const roundBet = normalizeMoney(betAmountRef.current);
      if (roundBet <= 0) break;
      if (roundBet > balanceRef.current) break;

      const result = await playRound({ betAmount: roundBet });
      if (!result) break;

      const lastNet = normalizeMoney(result.winAmount - result.betAmount);

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
  }, [
    onLoseMode,
    onLosePctInput,
    onWinMode,
    onWinPctInput,
    playRound,
    stopAutoBet,
    stopLossInput,
    stopProfitInput,
  ]);

  const changePlayMode = useCallback(
    (mode: "manual" | "auto") => {
      try {
        stopAutoBet();
      } catch {
      }

      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
        animationRef.current = null;
      }
      if (resultTimeoutRef.current) {
        clearTimeout(resultTimeoutRef.current);
        resultTimeoutRef.current = null;
      }

      setBetBoth(100);
      betAmountRef.current = 100;
      setRollOver(true);
      rollOverRef.current = true;
      setSliderValue(50);
      sliderValueRef.current = 50;
      setThresholdInput("50.00");

      setOnWinMode("reset");
      setOnWinPctInput("0");
      setOnLoseMode("reset");
      setOnLosePctInput("0");
      setStopProfitInput("0");
      setStopLossInput("0");

      setLastWin(0);
      setLastResult(null);
      setDisplayNumber(50);
      setGameState("idle");
      setResultFx(null);

      isAutoBettingRef.current = false;
      setIsAutoBetting(false);
      autoOriginalBetRef.current = 0;

      setPlayMode(mode);
    },
    [stopAutoBet]
  );

  useEffect(() => {
    return () => {
      if (animationRef.current) cancelAnimationFrame(animationRef.current);
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

  const isBusy = gameState === "rolling" || isAutoBetting;

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
              onBlur={handleBetInputBlur}
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
            Roll Mode
          </label>
          <div className="bg-[#0f212e] p-1 rounded-md border border-[#2f4553] flex">
            <button
              onClick={() =>
                !isBusy && !rollOver && toggleMode()
              }
              disabled={isBusy}
              className={`flex-1 py-2 text-xs font-bold uppercase rounded transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${
                rollOver
                  ? "bg-[#213743] text-white shadow-sm"
                  : "text-[#b1bad3] hover:text-white"
              }`}
            >
              Roll Over
            </button>
            <button
              onClick={() =>
                !isBusy && rollOver && toggleMode()
              }
              disabled={isBusy}
              className={`flex-1 py-2 text-xs font-bold uppercase rounded transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${
                !rollOver
                  ? "bg-[#213743] text-white shadow-sm"
                  : "text-[#b1bad3] hover:text-white"
              }`}
            >
              Roll Under
            </button>
          </div>
        </div>

        <div className="space-y-2">
          <label className="text-xs font-bold text-[#b1bad3] uppercase tracking-wider">
            Threshold
          </label>
          <input
            type="number"
            step="0.01"
            min={MIN_THRESHOLD}
            max={MAX_THRESHOLD}
            value={thresholdInput}
            onChange={(e) => setThresholdInput(e.target.value)}
            onBlur={handleThresholdBlur}
            disabled={isBusy}
            className="w-full bg-[#0f212e] border border-[#2f4553] rounded-md py-2 px-4 text-white font-mono focus:outline-none focus:border-[#00e701] transition-colors disabled:opacity-50"
          />
          <div className="text-xs text-[#b1bad3] mt-1">
            Multi: <span className="font-mono text-white">{formatLiveMultiplier(liveMultiplier)}x</span>
          </div>
        </div>

        {playMode === "manual" && (
          <button
            onClick={rollDice}
            disabled={isBusy}
            className="w-full bg-[#00e701] hover:bg-[#00c201] text-black py-3 rounded-md font-bold text-lg shadow-[0_0_20px_rgba(0,231,1,0.2)] transition-all active:scale-95 flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {gameState === "rolling" ? (
              <Refresh className="animate-spin" />
            ) : (
              <PlayArrow />
            )}
            {gameState === "rolling" ? "Rolling..." : "Bet"}
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
                disabled={gameState === "rolling"}
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

        {lastWin > 0 && gameState === "won" && (
          <div className="mt-2 p-4 bg-[#213743] border border-[#00e701] rounded-md text-center animate-pulse">
            <div className="text-xs text-[#b1bad3] uppercase">You Won</div>
            <div className="text-2xl font-bold text-[#00e701]">
              ${lastWin.toFixed(2)}
            </div>
          </div>
        )}
      </div>

      <div className="flex-1 flex flex-col items-center justify-center self-start bg-[#0f212e] rounded-xl p-4 sm:p-8 relative min-h-100 sm:min-h-125 overflow-hidden">
        {resultFx === "rolling" && (
          <div className="limbo-roll-glow absolute inset-0 pointer-events-none z-0" />
        )}
        {resultFx === "win" && (
          <div className="limbo-win-flash absolute inset-0 pointer-events-none z-0" />
        )}
        {resultFx === "lose" && (
          <div className="limbo-lose-flash absolute inset-0 pointer-events-none z-0" />
        )}

        <div className="relative z-10 mb-16 text-center">
          <div
            key={resultAnimNonce}
            className={`text-[5rem] sm:text-[7rem] font-black font-mono leading-none transition-all duration-200 tabular-nums tracking-tighter ${
              gameState === "rolling"
                ? "text-white animate-limbo-multiplier-rolling"
                : gameState === "won"
                ? "text-[#00e701] drop-shadow-[0_0_30px_rgba(0,231,1,0.4)] scale-110 animate-limbo-win-pop"
                : gameState === "lost"
                ? "text-[#ef4444] drop-shadow-[0_0_30px_rgba(239,68,68,0.4)] animate-limbo-lose-shake"
                : "text-white"
            }`}
          >
            {displayNumber.toFixed(2)}
          </div>
        </div>

        <div className="w-full max-w-4xl relative select-none">
          <div className="relative mx-4">
            <div className="h-3 bg-[#213743] rounded-full w-full relative overflow-hidden ring-1 ring-[#2f4553]">
              <div
                className="absolute top-0 bottom-0 bg-[#00e701] transition-all duration-200 ease-out opacity-90"
                style={{
                  left: rollOver ? `${sliderValue}%` : "0%",
                  width: rollOver
                    ? `${100 - sliderValue}%`
                    : `${sliderValue}%`,
                }}
              />

              <div
                className="absolute top-0 bottom-0 bg-[#ef4444] transition-all duration-200 ease-out opacity-90"
                style={{
                  left: rollOver ? "0%" : `${sliderValue}%`,
                  width: rollOver
                    ? `${sliderValue}%`
                    : `${100 - sliderValue}%`,
                }}
              />
            </div>

            <input
              type="range"
              min={MIN_THRESHOLD}
              max={MAX_THRESHOLD}
              step="0.01"
              value={sliderValue}
              onInput={handleSliderInput}
              onChange={handleSliderInput}
              onPointerDown={() => {
                isPointerDraggingRef.current = true;
              }}
              onPointerUp={() => {
                isPointerDraggingRef.current = false;
              }}
              onPointerCancel={() => {
                isPointerDraggingRef.current = false;
              }}
              disabled={isBusy}
              className="absolute -top-2.5 left-0 right-0 h-8 w-full opacity-0 cursor-pointer z-30"
            />

            <div
              className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 w-10 h-10 bg-white border-4 border-[#2f4553] rounded-lg shadow-[0_4px_10px_rgba(0,0,0,0.3)] flex items-center justify-center pointer-events-none transition-all duration-100 z-20"
              style={{ left: `${sliderValue}%` }}
            >
              <SwapHoriz className="text-[#2f4553] text-lg" />

              <div className="absolute -top-10 bg-[#2f4553] text-white text-xs font-bold px-2 py-1 rounded shadow-lg whitespace-nowrap">
                {sliderValue.toFixed(2)}
              </div>
            </div>

            <div
              className={`absolute top-1/2 -translate-y-1/2 w-1 h-8 rounded-full transition-all duration-75 z-10 ${
                gameState === "idle" ? "opacity-0" : "opacity-100"
              } ${
                (rollOver && displayNumber > sliderValue) ||
                (!rollOver && displayNumber < sliderValue)
                  ? "bg-white shadow-[0_0_15px_#00e701]"
                  : "bg-white shadow-[0_0_15px_#ef4444]"
              }`}
              style={{ left: `${clamp(displayNumber, 0, 100)}%` }}
            ></div>
          </div>

          <div className="flex justify-between mt-6 text-[#557086] text-xs font-bold font-mono mx-4">
            <span>0</span>
            <span>25</span>
            <span>50</span>
            <span>75</span>
            <span>100</span>
          </div>
        </div>
      </div>
    </div>
  );
}
