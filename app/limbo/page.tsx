"use client";

import React, {
  useEffect,
  useMemo,
  useRef,
  useState,
  useCallback,
} from "react";
import { useWallet } from "@/components/WalletProvider";
import { useSoundVolume } from "@/components/SoundVolumeProvider";
import { PlayArrow, Refresh } from "@mui/icons-material";
import GameRecordsPanel from "@/components/GameRecordsPanel";

type GameState = "idle" | "rolling" | "won" | "lost";

const HOUSE_EDGE = 0.99;
const MIN_TARGET = 1.01;
const MAX_TARGET = Infinity;
const ROLL_ANIMATION_MS = 750;

const clamp = (v: number, min: number, max: number) =>
  Math.max(min, Math.min(max, v));

const formatMultiplier = (m: number) => {
  if (!Number.isFinite(m)) return "—";
  return m.toFixed(2);
};

const formatChance = (pct: number) => {
  if (!Number.isFinite(pct) || pct < 0) return "—";
  if (pct === 0) return "0.00";
  return pct.toFixed(2);
};

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

export default function LimboPage() {
  const {
    balance,
    subtractFromBalance,
    addToBalance,
    finalizePendingLoss,
    syncBalance,
  } = useWallet();
  const { volume } = useSoundVolume();

  const [betAmount, setBetAmount] = useState<number>(100);
  const [betInput, setBetInput] = useState<string>("100");

  const [targetMultiplier, setTargetMultiplier] = useState<number>(2);
  const [targetInput, setTargetInput] = useState<string>("2.00");

  const [gameState, setGameState] = useState<GameState>("idle");
  const [rolledMultiplier, setRolledMultiplier] = useState<number | null>(null);
  const [rollingDisplayMultiplier, setRollingDisplayMultiplier] =
    useState<number>(1);
  const [lastWin, setLastWin] = useState<number>(0);
  const [history, setHistory] = useState<{ mult: number; win: boolean }[]>([]);

  const [resultAnimNonce, setResultAnimNonce] = useState(0);

  const rafRef = useRef<number | null>(null);

  const [playMode, setPlayMode] = useState<"manual" | "auto">("manual");
  const [onWinMode, setOnWinMode] = useState<"reset" | "raise">("reset");
  const [onWinPctInput, setOnWinPctInput] = useState<string>("0");
  const [onLoseMode, setOnLoseMode] = useState<"reset" | "raise">("reset");
  const [onLosePctInput, setOnLosePctInput] = useState<string>("0");
  const [stopProfitInput, setStopProfitInput] = useState<string>("0");
  const [stopLossInput, setStopLossInput] = useState<string>("0");
  const [isAutoBetting, setIsAutoBetting] = useState(false);

  const betAmountRef = useRef<number>(betAmount);
  const balanceRef = useRef<number>(balance);
  const isRollingRef = useRef<boolean>(false);
  const isAutoBettingRef = useRef<boolean>(false);
  const autoOriginalBetRef = useRef<number>(0);
  const autoNetRef = useRef<number>(0);
  const resultTimeoutRef = useRef<number | null>(null);
  const gameLoopRef = useRef<number | null>(null);

  const audioRef = useRef<{
    bet: HTMLAudioElement | null;
    win: HTMLAudioElement | null;
    limboLose: HTMLAudioElement | null;
    tick: HTMLAudioElement | null;
  }>({
    bet: null,
    win: null,
    limboLose: null,
    tick: null,
  });

  const ensureAudio = () => {
    if (audioRef.current.bet) return;
    audioRef.current = {
      bet: new Audio("/sounds/Bet.mp3"),
      win: new Audio("/sounds/Win.mp3"),
      limboLose: new Audio("/sounds/LimboLose.mp3"),
      tick: new Audio("/sounds/Tick.mp3"),
    };
  };

  const playAudio = (a: HTMLAudioElement | null) => {
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

  useEffect(() => {
    betAmountRef.current = betAmount;
  }, [betAmount]);
  useEffect(() => {
    balanceRef.current = balance;
  }, [balance]);
  useEffect(() => {
    isAutoBettingRef.current = isAutoBetting;
  }, [isAutoBetting]);

  useEffect(() => {
    return () => {
      if (rafRef.current !== null) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
    };
  }, []);

  const potentialProfit = useMemo(() => {
    return betAmount * targetMultiplier - betAmount;
  }, [betAmount, targetMultiplier]);

  const liveChancePercent = useMemo(() => {
    const raw = targetInput.trim();
    if (!raw) return Number.NaN;
    const num = Number(raw);
    if (!Number.isFinite(num) || num <= 0) return Number.NaN;
    const t = clamp(num, MIN_TARGET, MAX_TARGET);
    return (HOUSE_EDGE / t) * 100;
  }, [targetInput]);

  const handleBetInputBlur = () => {
    const raw = betInput.trim();
    const sanitized = raw.replace(/^0+(?=\d)/, "") || "0";
    const num = Number(sanitized);
    setBetAmount(num);
    setBetInput(sanitized);
  };

  const handleTargetBlur = () => {
    const raw = targetInput.trim();
    const sanitized = raw.replace(/^0+(?=\d)/, "") || "0";
    let num = Number(sanitized);
    num = clamp(num, MIN_TARGET, MAX_TARGET);

    setTargetMultiplier(num);
    setTargetInput(num.toFixed(2));
  };

  const setBetBoth = (next: number) => {
    const v = normalizeMoney(next);
    setBetAmount(v);
    setBetInput(String(v));
    betAmountRef.current = v;
  };

  const roll = async () => {
    await playRound();
  };

  const playRound = useCallback(
    async (opts?: { betAmount?: number }) => {
      const bet = normalizeMoney(opts?.betAmount ?? betAmountRef.current);
      const t = clamp(targetMultiplier, MIN_TARGET, MAX_TARGET);

      if (bet <= 0 || bet > balanceRef.current || isRollingRef.current) {
        return null as null | {
          betAmount: number;
          winAmount: number;
          multiplier: number;
        };
      }

      
      if (gameLoopRef.current !== null) {
        clearTimeout(gameLoopRef.current);
        gameLoopRef.current = null;
      }

      subtractFromBalance(bet);
      playAudio(audioRef.current.bet);
      gameLoopRef.current = window.setTimeout(() => playAudio(audioRef.current.tick), 150);
      setLastWin(0);
      isRollingRef.current = true;
      setGameState("rolling");
      setRolledMultiplier(null);
      setRollingDisplayMultiplier(1);
      setResultAnimNonce((n) => n + 1);

      if (rafRef.current !== null) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }

      const floatVal = Math.random();
      const rawResult = HOUSE_EDGE / (floatVal || 0.00000001);
      const result = Math.max(1.0, rawResult);
      const isWin = result >= t;

      await new Promise<void>((resolve) => {
        const start = performance.now();
        const logResult = Math.log(result);

        const tick = (now: number) => {
          const elapsed = now - start;
          const p = clamp(elapsed / ROLL_ANIMATION_MS, 0, 1);

          const m = Math.exp(logResult * p);
          setRollingDisplayMultiplier(m);

          if (p >= 1) {
            rafRef.current = null;
            setRollingDisplayMultiplier(result);
            resolve();
            return;
          }

          rafRef.current = requestAnimationFrame(tick);
        };

        rafRef.current = requestAnimationFrame(tick);
      });

      setRolledMultiplier(result);
      setHistory((prev) => [...prev, { mult: result, win: isWin }].slice(-8));

      let winAmount = 0;
      if (isWin) {
        const payout = normalizeMoney(bet * t);
        addToBalance(payout);
        setLastWin(payout);
        setGameState("won");
        playAudio(audioRef.current.win);
        setResultAnimNonce((n) => n + 1);
        isRollingRef.current = false;
        winAmount = payout;
      } else {
        finalizePendingLoss();
        setGameState("lost");
        playAudio(audioRef.current.limboLose);
        setResultAnimNonce((n) => n + 1);
        isRollingRef.current = false;
        winAmount = 0;
      }

      if (resultTimeoutRef.current) {
        clearTimeout(resultTimeoutRef.current);
        resultTimeoutRef.current = null;
      }
      await new Promise<void>((resolve) => {
        resultTimeoutRef.current = window.setTimeout(() => {
          resultTimeoutRef.current = null;
          resolve();
        }, 900);
      });

      if (gameLoopRef.current !== null) {
          clearTimeout(gameLoopRef.current);
          gameLoopRef.current = null;
      }

      isRollingRef.current = false;
      return { betAmount: bet, winAmount, multiplier: result };
    },
    [targetMultiplier, subtractFromBalance, addToBalance, finalizePendingLoss]
  );

  const rollWrapper = useCallback(async () => {
    await playRound();
  }, [playRound]);

  const isLocked = gameState === "rolling";
  const isBusy = isLocked || isAutoBetting;

  const startAutoBet = useCallback(async () => {
    if (isAutoBettingRef.current) return;

    const startingBet = normalizeMoney(betAmountRef.current);
    if (startingBet <= 0 || startingBet > balanceRef.current) return;
    if (isRollingRef.current) return;

    autoOriginalBetRef.current = startingBet;
    autoNetRef.current = 0;

    isAutoBettingRef.current = true;
    setIsAutoBetting(true);

    while (isAutoBettingRef.current) {
      const stopProfit = Math.max(
        0,
        normalizeMoney(parseNumberLoose(stopProfitInput))
      );
      const stopLoss = Math.max(
        0,
        normalizeMoney(parseNumberLoose(stopLossInput))
      );
      const onWinPct = Math.max(0, parseNumberLoose(onWinPctInput));
      const onLosePct = Math.max(0, parseNumberLoose(onLosePctInput));

      const roundBet = normalizeMoney(betAmountRef.current);
      if (roundBet <= 0) break;
      if (roundBet > balanceRef.current) break;

      const result = await playRound({ betAmount: roundBet });
      if (!result) break;

      const lastNet = normalizeMoney(
        (result.winAmount ?? 0) - result.betAmount
      );
      autoNetRef.current = normalizeMoney(autoNetRef.current + lastNet);

      if (result.winAmount > 0) {
        if (onWinMode === "reset") {
          setBetBoth(autoOriginalBetRef.current);
        } else {
          const next = normalizeMoney(result.betAmount * (1 + onWinPct / 100));
          setBetBoth(next);
        }
      } else {
        if (onLoseMode === "reset") {
          setBetBoth(autoOriginalBetRef.current);
        } else {
          const next = normalizeMoney(result.betAmount * (1 + onLosePct / 100));
          setBetBoth(next);
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
    onWinMode,
    onWinPctInput,
    onLoseMode,
    onLosePctInput,
    playRound,
    stopProfitInput,
    stopLossInput,
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

      if (resultTimeoutRef.current) {
        clearTimeout(resultTimeoutRef.current);
        resultTimeoutRef.current = null;
      }

      if (rafRef.current !== null) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }

      isRollingRef.current = false;
      setGameState("idle");
      setRolledMultiplier(null);
      setRollingDisplayMultiplier(1);
      setLastWin(0);
      setHistory([]);

      setBetBoth(100);
      setTargetMultiplier(2);
      setTargetInput("2.00");
      setOnWinMode("reset");
      setOnWinPctInput("0");
      setOnLoseMode("reset");
      setOnLosePctInput("0");
      setStopProfitInput("0");
      setStopLossInput("0");

      isAutoBettingRef.current = false;
      setIsAutoBetting(false);
      autoOriginalBetRef.current = 0;
      autoNetRef.current = 0;

      setPlayMode(mode);
    },
    [stopAutoBet]
  );
  const shownMultiplier =
    gameState === "rolling" ? rollingDisplayMultiplier : rolledMultiplier;

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
                onChange={(e) => {
                let v = e.target.value;
                if (parseFloat(v) < 0) v = "0";
                setBetInput(v);
              }}
                onBlur={handleBetInputBlur}
                disabled={isLocked}
                className="w-full bg-[#0f212e] border border-[#2f4553] rounded-md py-2 pl-7 pr-4 text-white font-mono focus:outline-none focus:border-[#00e701] transition-colors disabled:opacity-50"
              />
            </div>
            <div className="grid grid-cols-3 gap-2">
              <button
                onClick={() => {
                  const newBet = Number((betAmount / 2).toFixed(2));
                  setBetAmount(newBet);
                  setBetInput(String(newBet));
                }}
                disabled={isLocked}
                className="bg-[#2f4553] hover:bg-[#3e5666] text-xs py-1 rounded text-[#b1bad3] disabled:opacity-50"
              >
                ½
              </button>
              <button
                onClick={() => {
                  const newBet = Number((betAmount * 2).toFixed(2));
                  setBetAmount(newBet);
                  setBetInput(String(newBet));
                }}
                disabled={isLocked}
                className="bg-[#2f4553] hover:bg-[#3e5666] text-xs py-1 rounded text-[#b1bad3] disabled:opacity-50"
              >
                2×
              </button>
              <button
                onClick={() => {
                  const newBet = Number(balance.toFixed(2));
                  setBetAmount(newBet);
                  setBetInput(String(newBet));
                }}
                disabled={isLocked}
                className="bg-[#2f4553] hover:bg-[#3e5666] text-xs py-1 rounded text-[#b1bad3] disabled:opacity-50"
              >
                All In
              </button>
            </div>
          </div>

          <div className="space-y-2">
            <label className="text-xs font-bold text-[#b1bad3] uppercase tracking-wider">
              Target Multiplier
            </label>
            <div className="relative">
              <input
                type="number"
                step="0.01"
                min={MIN_TARGET}
                max={Number.isFinite(MAX_TARGET) ? MAX_TARGET : undefined}
                value={targetInput}
                onChange={(e) => setTargetInput(e.target.value)}
                onBlur={handleTargetBlur}
                disabled={isLocked}
                className="w-full bg-[#0f212e] border border-[#2f4553] rounded-md py-2 px-4 text-white font-mono focus:outline-none focus:border-[#00e701] transition-colors disabled:opacity-50"
              />
              <div className="absolute right-3 top-1/2 -translate-y-1/2 text-[#b1bad3] text-sm">
                x
              </div>
            </div>

            <div className="text-[11px] text-[#b1bad3]">
              Chance:{" "}
              <span className="font-mono text-white">
                {formatChance(liveChancePercent)}%
              </span>
            </div>
          </div>

          {playMode === "manual" && (
            <button
              onClick={rollWrapper}
              disabled={isBusy || betAmount <= 0}
              className="w-full bg-[#00e701] hover:bg-[#00c201] text-black py-3 rounded-md font-bold text-lg shadow-[0_0_20px_rgba(0,231,1,0.2)] transition-all active:scale-95 flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isLocked ? <Refresh className="animate-spin" /> : <PlayArrow />}
              {isLocked ? "Rolling..." : "Bet"}
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
                      onBlur={() =>
                        setOnWinPctInput(
                          (s) => s.trim().replace(/^0+(?=\d)/, "") || "0"
                        )
                      }
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
                      onBlur={() =>
                        setOnLosePctInput(
                          (s) => s.trim().replace(/^0+(?=\d)/, "") || "0"
                        )
                      }
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
                    onBlur={() =>
                      setStopProfitInput(
                        (s) => s.trim().replace(/^0+(?=\d)/, "") || "0"
                      )
                    }
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
                    onBlur={() =>
                      setStopLossInput(
                        (s) => s.trim().replace(/^0+(?=\d)/, "") || "0"
                      )
                    }
                    disabled={isBusy}
                    className="w-full bg-[#0f212e] border border-[#2f4553] rounded-md py-2 pl-7 pr-4 text-white font-mono focus:outline-none focus:border-[#00e701] transition-colors"
                  />
                </div>
              </div>

              {!isAutoBetting ? (
                <button
                  onClick={startAutoBet}
                  disabled={isLocked || betAmount <= 0}
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

        <div className="flex-1 flex flex-col gap-4">
          <div className="flex-1 flex flex-col items-center justify-center bg-[#0f212e] rounded-xl p-8 relative h-[400px] sm:h-[600px] overflow-hidden">
            {gameState === "rolling" && (
              <>
                <div className="limbo-roll-glow" />
              </>
            )}

            {gameState === "won" && <div className="limbo-win-flash" />}
            {gameState === "lost" && <div className="limbo-lose-flash" />}

            <div className="relative z-10 flex flex-col items-center">
              <div
                key={resultAnimNonce}
                className={`text-[4rem] sm:text-[6rem] md:text-[8rem] lg:text-[10rem] font-black font-mono leading-none transition-all duration-300 ${
                  gameState === "rolling"
                    ? "text-white animate-limbo-multiplier-rolling"
                    : gameState === "won"
                    ? "text-[#00e701] drop-shadow-[0_0_30px_rgba(0,231,1,0.4)] scale-110 animate-limbo-win-pop"
                    : gameState === "lost"
                    ? "text-[#ef4444] drop-shadow-[0_0_30px_rgba(239,68,68,0.4)] animate-limbo-lose-shake"
                    : "text-white"
                }`}
              >
                {shownMultiplier === null
                  ? "1.00x"
                  : `${formatMultiplier(shownMultiplier)}x`}
              </div>
            </div>

            <div className="absolute top-4 left-1/2 -translate-x-1/2 z-10 flex gap-2">
              {history.map((h, i) => (
                <div
                  key={i}
                  className={`w-10 h-8 rounded-full flex items-center justify-center text-[10px] font-bold shadow-md animate-scale-in ${
                    h.win ? "text-black" : "text-white"
                  }`}
                  style={{ backgroundColor: h.win ? "#00e701" : "#6b7280" }}
                >
                  {formatMultiplier(h.mult)}x
                </div>
              ))}
            </div>

            {gameState === "rolling" && (
              <div
                className="absolute inset-0 pointer-events-none"
                style={{
                  background:
                    "radial-gradient(circle at 50% 55%, rgba(47,69,83,0.22) 0%, rgba(15,33,46,0.0) 68%)",
                  opacity: 0.85,
                }}
              />
            )}
          </div>

          <GameRecordsPanel gameId="limbo" />
        </div>
      </div>
    </>
  );
}
