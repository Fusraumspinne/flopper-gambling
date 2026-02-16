"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useWallet } from "@/components/WalletProvider";
import { useSoundVolume } from "@/components/SoundVolumeProvider";
import { PlayArrow, SwapHoriz } from "@mui/icons-material";
import GameRecordsPanel from "@/components/GameRecordsPanel";

type GameState = "idle" | "rolling" | "won" | "lost";
type DiceMode = "classic" | "range" | "dual";

const HOUSE_EDGE = 1.0;
const MIN_VAL = 1;
const MAX_VAL = 99;

export default function DicePage() {
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

  const [betAmount, setBetAmount] = useState<number>(100);
  const [betInput, setBetInput] = useState<string>("100");

  const [diceMode, setDiceMode] = useState<DiceMode>("classic");
  const [values, setValues] = useState<number[]>([50]);
  const [activeIndex, setActiveIndex] = useState<number>(0);
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
  const valuesRef = useRef<number[]>(values);
  const diceModeRef = useRef<DiceMode>(diceMode);
  const rollOverRef = useRef<boolean>(rollOver);
  const gameStateRef = useRef<GameState>(gameState);
  const isAutoBettingRef = useRef<boolean>(false);
  const autoOriginalBetRef = useRef<number>(0);
  const gameLoopRef = useRef<number | null>(null);

  const audioRef = useRef<{
    bet: HTMLAudioElement | null;
    win: HTMLAudioElement | null;
    limboLose: HTMLAudioElement | null;
    diceRolling: HTMLAudioElement | null;
    diceSelected: HTMLAudioElement | null;
  }>({
    bet: null,
    win: null,
    limboLose: null,
    diceRolling: null,
    diceSelected: null,
  });

  const playAudio = (a: HTMLAudioElement | null) => {
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
    } catch (e) {}
  };

  const ensureAudio = () => {
    if (audioRef.current.bet) return;
    audioRef.current = {
      bet: new Audio("/sounds/Bet.mp3"),
      win: new Audio("/sounds/Win.mp3"),
      limboLose: new Audio("/sounds/LimboLose.mp3"),
      diceRolling: new Audio("/sounds/DiceRolling.mp3"),
      diceSelected: new Audio("/sounds/DiceSelected.mp3"),
    };
  };

  useEffect(() => {
    if (volume <= 0) return;
    const prime = async () => {
      try {
        ensureAudio();
        const items = Object.values(audioRef.current);
        for (const a of items) {
          if (!a) continue;
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

  const winChance = useMemo(() => {
    let baseChance = 0;
    if (diceMode === "classic") {
      baseChance = 100 - values[0];
    } else if (diceMode === "range") {
      baseChance = values[1] - values[0];
    } else if (diceMode === "dual") {
      baseChance = (values[1] - values[0]) + (values[3] - values[2]);
    }

    if (rollOver) {
      return baseChance;
    } else {
      return 100 - baseChance;
    }
  }, [values, diceMode, rollOver]);

  const multiplier = useMemo(() => {
    const rawChance = Math.max(0.01, Math.min(99.99, winChance));
    const rawMultiplier = (100 - HOUSE_EDGE) / rawChance;
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

  const handleValueChange = (idx: number, newVal: number) => {
    const next = [...values];
    let v = Math.round(newVal);
    
    const min = idx === 0 ? MIN_VAL : next[idx - 1] + 1;
    const max = idx === next.length - 1 ? MAX_VAL : next[idx + 1] - 1;
    
    v = clamp(v, min, max);
    next[idx] = v;
    setValues(next);
  };

  const liveMultiplier = multiplier;

  const formatLiveMultiplier = (m: number) => {
    if (!Number.isFinite(m)) return "—";
    if (m > 1_000_000) return m.toExponential(2);
    if (m >= 1000) return Math.round(m).toString();
    return m.toFixed(2);
  };

  const toggleMode = () => {
    playAudio(audioRef.current.diceSelected);
    setRollOver(!rollOver);
  };

  useEffect(() => {
    betAmountRef.current = betAmount;
  }, [betAmount]);
  useEffect(() => {
    balanceRef.current = balance;
  }, [balance]);
  useEffect(() => {
    valuesRef.current = values;
  }, [values]);
  useEffect(() => {
    diceModeRef.current = diceMode;
  }, [diceMode]);
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
    values: number[];
    diceMode: DiceMode;
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

      const currentValues = valuesRef.current;
      const currentMode = diceModeRef.current;
      const over = rollOverRef.current;
      
      let baseChance = 0;
      if (currentMode === "classic") {
        baseChance = 100 - currentValues[0];
      } else if (currentMode === "range") {
        baseChance = currentValues[1] - currentValues[0];
      } else if (currentMode === "dual") {
        baseChance = (currentValues[1] - currentValues[0]) + (currentValues[3] - currentValues[2]);
      }

      const currentWinChance = over ? baseChance : 100 - baseChance;
      const rawChance = Math.max(0.01, Math.min(99.99, currentWinChance));
      const rawMult = (100 - HOUSE_EDGE) / rawChance;
      const roundMultiplier = Math.max(1.01, rawMult);
      const fullWinAmount = normalizeMoney(bet * roundMultiplier);

      if (gameLoopRef.current) {
        clearTimeout(gameLoopRef.current);
        gameLoopRef.current = null;
      }

      subtractFromBalance(bet);
      playAudio(audioRef.current.bet);
      playAudio(audioRef.current.diceRolling);
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

      let isWin = false;
      if (currentMode === "classic") {
        isWin = over ? roll > currentValues[0] : roll < currentValues[0];
      } else if (currentMode === "range") {
        const inside = roll > currentValues[0] && roll < currentValues[1];
        isWin = over ? inside : !inside;
      } else if (currentMode === "dual") {
        const inside = (roll > currentValues[0] && roll < currentValues[1]) || (roll > currentValues[2] && roll < currentValues[3]);
        isWin = over ? inside : !inside;
      }

      const winAmount = isWin ? fullWinAmount : 0;

      setResultAnimNonce((n) => n + 1);

      if (isWin) {
        addToBalance(winAmount);
        setLastWin(winAmount);
        setGameState("won");
        setResultFx("win");
        playAudio(audioRef.current.win);
      } else {
        finalizePendingLoss();
        setGameState("lost");
        setResultFx("lose");
        playAudio(audioRef.current.limboLose);
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
        values: currentValues,
        diceMode: currentMode,
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
    void syncBalance();
  }, [syncBalance]);

  const startAutoBet = useCallback(async () => {
    if (isAutoBettingRef.current) return;
    if (gameStateRef.current === "rolling") return;

    const startingBet = normalizeMoney(betAmountRef.current);
    if (startingBet <= 0 || startingBet > balanceRef.current) return;

    autoOriginalBetRef.current = startingBet;

    isAutoBettingRef.current = true;
    setIsAutoBetting(true);

    while (isAutoBettingRef.current) {
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
    stopAutoBet,
    syncBalance,
  ]);

  const changeDiceMode = useCallback((newMode: DiceMode) => {
    setDiceMode(newMode);
    if (newMode === "classic") {
      setValues([50]);
    } else if (newMode === "range") {
      setValues([25, 75]);
    } else if (newMode === "dual") {
      setValues([10, 40, 60, 90]);
    }
  }, []);

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
      setDiceMode("classic");
      setValues([50]);
      valuesRef.current = [50];

      setOnWinMode("reset");
      setOnWinPctInput("0");
      setOnLoseMode("reset");
      setOnLosePctInput("0");

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
    <>
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
              onChange={(e) => {
                let v = e.target.value;
                if (parseFloat(v) < 0) v = "0";
                setBetInput(v);
              }}
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
            Dice Mode
          </label>
          <div className="bg-[#0f212e] p-1 rounded-md border border-[#2f4553] flex flex-wrap gap-1">
            {(["classic", "range", "dual"] as const).map((m) => (
              <button
                key={m}
                onClick={() => !isBusy && changeDiceMode(m)}
                disabled={isBusy}
                className={`flex-1 py-2 text-[10px] font-bold uppercase rounded transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${
                  diceMode === m
                    ? "bg-[#213743] text-white shadow-sm"
                    : "text-[#b1bad3] hover:text-white"
                }`}
              >
                {m}
              </button>
            ))}
          </div>
          <div className="text-xs text-[#b1bad3] mt-1">
            Multi: <span className="font-mono text-white">{formatLiveMultiplier(multiplier)}x</span>
          </div>
        </div>

        {playMode === "manual" && (
          <button
            onClick={rollDice}
            disabled={isBusy || betAmount <= 0}
            className="w-full bg-[#00e701] hover:bg-[#00c201] text-black py-3 rounded-md font-bold text-lg shadow-[0_0_20px_rgba(0,231,1,0.2)] transition-all active:scale-95 flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {gameState !== "rolling" && (
              <PlayArrow sx={{ fill: "currentColor" }} />
            )}
            {gameState === "rolling" ? "Playing" : "Bet"}
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

            {!isAutoBetting ? (
              <button
                onClick={startAutoBet}
                disabled={gameState === "rolling" || betAmount <= 0}
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
          <div className="p-4 bg-[#213743] border border-[#00e701] rounded-md text-center">
            <div className="text-xs text-[#b1bad3] uppercase">You Won</div>
            <div className="text-2xl font-bold text-[#00e701]">
              ${lastWin.toFixed(2)}
            </div>
          </div>
        )}
      </div>

      <div className="flex-1 min-w-0 flex flex-col gap-4">
      <div className="flex-1 w-full flex flex-col items-center justify-center bg-[#0f212e] rounded-xl p-4 sm:p-8 relative min-h-100 sm:min-h-125 overflow-hidden">
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
              {diceMode === "classic" && (
                <>
                  <div
                    className="absolute top-0 bottom-0 transition-all duration-200 ease-out opacity-90"
                    style={{
                      left: "0%",
                      width: `${values[0]}%`,
                      backgroundColor: rollOver ? "#ef4444" : "#00e701",
                    }}
                  />
                  <div
                    className="absolute top-0 bottom-0 transition-all duration-200 ease-out opacity-90"
                    style={{
                      left: `${values[0]}%`,
                      width: `${100 - values[0]}%`,
                      backgroundColor: rollOver ? "#00e701" : "#ef4444",
                    }}
                  />
                </>
              )}
              {diceMode === "range" && (
                <>
                  <div
                    className="absolute top-0 bottom-0 transition-all duration-200 ease-out opacity-90"
                    style={{
                      left: "0%",
                      width: `${values[0]}%`,
                      backgroundColor: rollOver ? "#ef4444" : "#00e701",
                    }}
                  />
                  <div
                    className="absolute top-0 bottom-0 transition-all duration-200 ease-out opacity-90"
                    style={{
                      left: `${values[0]}%`,
                      width: `${values[1] - values[0]}%`,
                      backgroundColor: rollOver ? "#00e701" : "#ef4444",
                    }}
                  />
                  <div
                    className="absolute top-0 bottom-0 transition-all duration-200 ease-out opacity-90"
                    style={{
                      left: `${values[1]}%`,
                      width: `${100 - values[1]}%`,
                      backgroundColor: rollOver ? "#ef4444" : "#00e701",
                    }}
                  />
                </>
              )}
              {diceMode === "dual" && (
                <>
                  <div
                    className="absolute top-0 bottom-0 transition-all duration-200 ease-out opacity-90"
                    style={{
                      left: "0%",
                      width: `${values[0]}%`,
                      backgroundColor: rollOver ? "#ef4444" : "#00e701",
                    }}
                  />
                  <div
                    className="absolute top-0 bottom-0 transition-all duration-200 ease-out opacity-90"
                    style={{
                      left: `${values[0]}%`,
                      width: `${values[1] - values[0]}%`,
                      backgroundColor: rollOver ? "#00e701" : "#ef4444",
                    }}
                  />
                  <div
                    className="absolute top-0 bottom-0 transition-all duration-200 ease-out opacity-90"
                    style={{
                      left: `${values[1]}%`,
                      width: `${values[2] - values[1]}%`,
                      backgroundColor: rollOver ? "#ef4444" : "#00e701",
                    }}
                  />
                  <div
                    className="absolute top-0 bottom-0 transition-all duration-200 ease-out opacity-90"
                    style={{
                      left: `${values[2]}%`,
                      width: `${values[3] - values[2]}%`,
                      backgroundColor: rollOver ? "#00e701" : "#ef4444",
                    }}
                  />
                  <div
                    className="absolute top-0 bottom-0 transition-all duration-200 ease-out opacity-90"
                    style={{
                      left: `${values[3]}%`,
                      width: `${100 - values[3]}%`,
                      backgroundColor: rollOver ? "#ef4444" : "#00e701",
                    }}
                  />
                </>
              )}
            </div>

            <div 
              className="absolute -top-2.5 left-0 right-0 h-8 w-full z-30"
              onPointerMove={(e) => {
                if (isPointerDraggingRef.current) return;
                const rect = e.currentTarget.getBoundingClientRect();
                const pct = ((e.clientX - rect.left) / rect.width) * 100;
                let closestIdx = 0;
                let minDist = Math.abs(values[0] - pct);
                for (let i = 1; i < values.length; i++) {
                  const d = Math.abs(values[i] - pct);
                  if (d < minDist) {
                    minDist = d;
                    closestIdx = i;
                  }
                }
                if (closestIdx !== activeIndex) {
                  setActiveIndex(closestIdx);
                }
              }}
            >
              {values.map((v, i) => (
                <input
                  key={i}
                  type="range"
                  min={MIN_VAL}
                  max={MAX_VAL}
                  step="1"
                  value={v}
                  onChange={(e) => handleValueChange(i, Number(e.target.value))}
                  onPointerDown={() => {
                    isPointerDraggingRef.current = true;
                    setActiveIndex(i);
                  }}
                  onPointerUp={() => {
                    isPointerDraggingRef.current = false;
                  }}
                  onPointerCancel={() => {
                    isPointerDraggingRef.current = false;
                  }}
                  disabled={isBusy}
                  className="absolute inset-0 h-8 w-full opacity-0 cursor-pointer"
                  style={{
                    zIndex: activeIndex === i ? 50 : 30,
                    pointerEvents: isBusy ? "none" : "auto",
                  }}
                />
              ))}
            </div>

            {values.map((v, i) => (
              <div
                key={i}
                className={`absolute top-1/2 -translate-y-1/2 -translate-x-1/2 w-8 h-8 rounded shadow-[0_4px_10px_rgba(0,0,0,0.3)] flex items-center justify-center pointer-events-none transition-all duration-100 ${
                  activeIndex === i ? "z-40 border-white scale-110 bg-[#4e94ff]" : "z-20 border-[#2f4553] bg-[#3b82f6]"
                } border-2`}
                style={{ left: `${v}%` }}
              >
                <span className="text-white text-[10px] select-none">
                  {diceMode === "classic" ? (
                    <SwapHoriz sx={{ fontSize: 16 }} />
                  ) : i % 2 === 0 ? (
                    rollOver ? "▶" : "◀"
                  ) : (
                    rollOver ? "◀" : "▶"
                  )}
                </span>
                <div className="absolute -top-8 bg-[#2f4553] text-white text-[10px] font-bold px-1.5 py-0.5 rounded shadow-lg whitespace-nowrap">
                  {v}
                </div>
              </div>
            ))}

            <div
              className={`absolute top-1/2 -translate-y-1/2 w-1 h-8 rounded-full transition-all duration-75 z-10 ${
                gameState === "idle" ? "opacity-0" : "opacity-100"
              } ${
                gameState === "won"
                  ? "bg-white shadow-[0_0_15px_#00e701]"
                  : "bg-white shadow-[0_0_15px_#ef4444]"
              }`}
              style={{ left: `${clamp(displayNumber, MIN_VAL, MAX_VAL)}%` }}
            ></div>
          </div>

          <div className="flex justify-between mt-6 text-[#557086] text-xs font-bold font-mono mx-4 relative">
            {[1, 25, 50, 75, 99].map((m) => (
              <div key={m} className="flex flex-col items-center">
                <div className="h-2 w-0.5 bg-[#213743] mb-1" />
                <span>{m}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      <GameRecordsPanel gameId="dice" />
      </div>
    </div>
    </>
  );
}
