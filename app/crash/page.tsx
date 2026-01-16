"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useWallet } from "@/components/WalletProvider";
import { useSoundVolume } from "@/components/SoundVolumeProvider";
import { ExitToApp, PlayArrow } from "@mui/icons-material";
import GameRecordsPanel from "@/components/GameRecordsPanel";

type GameState = "idle" | "running" | "cashed" | "crashed";

type HistoryEntry = {
  crashAt: number;
  cashedAt?: number;
  win: boolean;
};

type PlayMode = "manual" | "auto";
type AutoAdjustMode = "reset" | "raise";

const HOUSE_EDGE = 0.99;

const clamp = (v: number, min: number, max: number) => Math.max(min, Math.min(max, v));

const normalizeMoney = (value: number) => {
  if (!Number.isFinite(value)) return 0;
  const rounded = Math.round((value + Number.EPSILON) * 100) / 100;
  return Object.is(rounded, -0) ? 0 : rounded;
};

const formatMultiplier = (m: number) => {
  if (!Number.isFinite(m) || m <= 0) return "—";
  if (m < 10) return m.toFixed(2);
  if (m < 100) return m.toFixed(1);
  return m.toFixed(0);
};

const formatSeconds = (s: number) => {
  if (!Number.isFinite(s) || s < 0) return "—";
  if (s < 10) return `${s.toFixed(1)}s`;
  return `${s.toFixed(0)}s`;
};

const formatChance = (p: number) => {
  if (!Number.isFinite(p)) return "0.00";
  const clamped = clamp(p, 0, 100);
  if (clamped < 1) return clamped.toFixed(2);
  if (clamped < 10) return clamped.toFixed(2);
  return clamped.toFixed(1);
};

function parseNumberLoose(raw: string) {
  const normalized = raw.replace(",", ".").trim();
  const n = Number(normalized);
  return Number.isFinite(n) ? n : 0;
}

function sampleCrashMultiplier(): number {
  const u = Math.random();
  const crashAt = HOUSE_EDGE / (u || 0.00000001);
  return Math.max(1.0, crashAt);
}

function growthMultiplier(elapsedMs: number): number {
  const t = Math.max(0, elapsedMs) / 1000;
  const K = 0.14;
  const EXP = 1.35;
  const m = Math.exp(K * Math.pow(t, EXP));
  return clamp(m, 1.0, 1_000_000);
}

export default function CrashPage() {
  const { balance, subtractFromBalance, addToBalance, finalizePendingLoss, syncBalance } = useWallet();
  const { volume } = useSoundVolume();

  const DEFAULT_X_MAX = 8;
  const DEFAULT_Y_MAX = 5;
  const REVEAL_MAX_MS = 500;
  const AXIS_FOLLOW_TAU_MS = 180;
  const AXIS_X_ANCHOR = 0.92;
  const AXIS_Y_ANCHOR = 0.90;
  const AXIS_TICKS = 6;

  const MIN_TARGET = 1.01;
  const MAX_TARGET = 1_000_000;

  const [betAmount, setBetAmount] = useState<number>(100);
  const [betInput, setBetInput] = useState<string>("100");

  const [playMode, setPlayMode] = useState<PlayMode>("manual");
  const [targetMultiplier, setTargetMultiplier] = useState<number>(2);
  const [targetInput, setTargetInput] = useState<string>("2");

  const [isAutoBetting, setIsAutoBetting] = useState<boolean>(false);
  const [onWinMode, setOnWinMode] = useState<AutoAdjustMode>("reset");
  const [onLoseMode, setOnLoseMode] = useState<AutoAdjustMode>("reset");
  const [onWinPctInput, setOnWinPctInput] = useState<string>("0");
  const [onLosePctInput, setOnLosePctInput] = useState<string>("0");
  const [stopProfitInput, setStopProfitInput] = useState<string>("0");
  const [stopLossInput, setStopLossInput] = useState<string>("0");

  const targetRef = useRef<number>(2);
  const autoBaseBetRef = useRef<number>(100);
  const autoStartBalanceRef = useRef<number>(0);

  const isAutoBettingRef = useRef<boolean>(false);
  const playModeRef = useRef<PlayMode>("manual");
  const onWinModeRef = useRef<AutoAdjustMode>("reset");
  const onLoseModeRef = useRef<AutoAdjustMode>("reset");
  const onWinPctInputRef = useRef<string>("0");
  const onLosePctInputRef = useRef<string>("0");

  const [gameState, setGameState] = useState<GameState>("idle");
  const [displayMultiplier, setDisplayMultiplier] = useState<number>(1);
  const [elapsedMs, setElapsedMs] = useState<number>(0);
  const [crashShownMultiplier, setCrashShownMultiplier] = useState<number | null>(null);
  const [cashedAtMultiplier, setCashedAtMultiplier] = useState<number | null>(null);
  const [maxPossibleMultiplier, setMaxPossibleMultiplier] = useState<number | null>(null);
  const [isRevealingMax, setIsRevealingMax] = useState<boolean>(false);
  const [lastWin, setLastWin] = useState<number>(0);
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [resultAnimNonce, setResultAnimNonce] = useState(0);
  const [recordsRefresh, setRecordsRefresh] = useState(0);
  const [outcomeEffect, setOutcomeEffect] = useState<"win" | "loss" | null>(null);

  useEffect(() => { isAutoBettingRef.current = isAutoBetting; }, [isAutoBetting]);
  useEffect(() => { playModeRef.current = playMode; }, [playMode]);
  useEffect(() => { onWinModeRef.current = onWinMode; }, [onWinMode]);
  useEffect(() => { onLoseModeRef.current = onLoseMode; }, [onLoseMode]);
  useEffect(() => { onWinPctInputRef.current = onWinPctInput; }, [onWinPctInput]);
  useEffect(() => { onLosePctInputRef.current = onLosePctInput; }, [onLosePctInput]);

  const [xAxisMax, setXAxisMax] = useState<number>(DEFAULT_X_MAX);
  const [yAxisMax, setYAxisMax] = useState<number>(DEFAULT_Y_MAX);

  const xAxisMaxRef = useRef<number>(DEFAULT_X_MAX);
  const yAxisMaxRef = useRef<number>(DEFAULT_Y_MAX);
  const axisLastNowRef = useRef<number | null>(null);

  const rafRef = useRef<number | null>(null);
  const startTsRef = useRef<number>(0);
  const runningRef = useRef<boolean>(false);
  const crashAtRef = useRef<number>(1);
  const betRef = useRef<number>(0);
  const lastStakeRef = useRef<number>(0);
  const settledRef = useRef<boolean>(false);

  const resetAxes = useCallback(() => {
    xAxisMaxRef.current = DEFAULT_X_MAX;
    yAxisMaxRef.current = DEFAULT_Y_MAX;
    axisLastNowRef.current = null;

    setXAxisMax(DEFAULT_X_MAX);
    setYAxisMax(DEFAULT_Y_MAX);
  }, []);

  const estimateCrashTimeMs = useCallback((crashAt: number) => {
    if (!Number.isFinite(crashAt) || crashAt <= 1) return 0;
    const K = 0.14;
    const EXP = 1.35;
    const ln = Math.log(crashAt);
    if (!Number.isFinite(ln) || ln <= 0) return 0;
    const tSec = Math.pow(ln / K, 1 / EXP);
    if (!Number.isFinite(tSec) || tSec < 0) return 0;
    return tSec * 1000;
  }, []);

  const ensureAxesFor = useCallback(
    (tSec: number, m: number, nowTs?: number) => {
      if (!Number.isFinite(tSec) || !Number.isFinite(m)) return;

      const now = typeof nowTs === "number" ? nowTs : performance.now();
      const last = axisLastNowRef.current ?? now;
      axisLastNowRef.current = now;

      const dt = clamp(now - last, 0, 80);
      const alpha = 1 - Math.exp(-dt / AXIS_FOLLOW_TAU_MS);

      const desiredX = Math.max(DEFAULT_X_MAX, tSec / AXIS_X_ANCHOR);
      const desiredY = Math.max(DEFAULT_Y_MAX, 1 + (m - 1) / AXIS_Y_ANCHOR);

      const nextXRaw = xAxisMaxRef.current + (Math.max(xAxisMaxRef.current, desiredX) - xAxisMaxRef.current) * alpha;
      const nextYRaw = yAxisMaxRef.current + (Math.max(yAxisMaxRef.current, desiredY) - yAxisMaxRef.current) * alpha;

      const nextX = Math.max(nextXRaw, tSec * 1.001);
      const nextY = Math.max(nextYRaw, m * 1.001);

      if (nextX > xAxisMaxRef.current + 1e-6) {
        xAxisMaxRef.current = nextX;
        setXAxisMax(nextX);
      }
      if (nextY > yAxisMaxRef.current + 1e-6) {
        yAxisMaxRef.current = nextY;
        setYAxisMax(nextY);
      }
    },
    [AXIS_FOLLOW_TAU_MS, AXIS_X_ANCHOR, AXIS_Y_ANCHOR]
  );

  const audioRef = useRef<{
    bet: HTMLAudioElement | null;
    win: HTMLAudioElement | null;
    crash: HTMLAudioElement | null;
    tick: HTMLAudioElement | null;
  }>({ bet: null, win: null, crash: null, tick: null });

  const ensureAudio = () => {
    if (audioRef.current.bet) return;
    audioRef.current = {
      bet: new Audio("/sounds/Bet.mp3"),
      win: new Audio("/sounds/Win.mp3"),
      crash: new Audio("/sounds/LimboLose.mp3"),
      tick: new Audio("/sounds/Tick.mp3"),
    };
  };

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
    } catch {
    }
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
          } catch {
            a.muted = false;
          }
        }
      } catch {
      }
    };

    document.addEventListener("pointerdown", prime, { once: true });
    return () => document.removeEventListener("pointerdown", prime);
  }, [volume]);

  useEffect(() => {
    return () => {
      if (rafRef.current !== null) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
    };
  }, []);

  const isRunning = gameState === "running";

  const isBusy = isRunning || isRevealingMax || isAutoBetting;

  const currentPayout = useMemo(() => {
    if (!isRunning) return 0;
    const payout = normalizeMoney(betRef.current * displayMultiplier);
    return payout;
  }, [displayMultiplier, isRunning]);

  const liveChancePercent = useMemo(() => {
    const t = targetMultiplier;
    if (!Number.isFinite(t) || t <= 0) return 0;
    const p = (HOUSE_EDGE / t) * 100;
    return clamp(p, 0, 100);
  }, [targetMultiplier]);

  const handleBetInputBlur = () => {
    const raw = betInput.trim();
    const sanitized = raw.replace(/^0+(?=\d)/, "") || "0";
    const num = Number(sanitized);
    const v = normalizeMoney(Number.isFinite(num) ? num : 0);
    setBetAmount(v);
    setBetInput(String(v));
  };

  const handleTargetBlur = () => {
    const raw = targetInput.trim();
    const sanitized = raw.replace(/^0+(?=\d)/, "") || "0";
    const num = Number(sanitized);
    const v = clamp(Number.isFinite(num) ? num : 0, MIN_TARGET, MAX_TARGET);
    const rounded = Math.round(v * 100) / 100;
    setTargetMultiplier(rounded);
    targetRef.current = rounded;
    setTargetInput(String(rounded));
  };

  const setBetBoth = (next: number) => {
    const v = normalizeMoney(next);
    setBetAmount(v);
    setBetInput(String(v));
  };

  const stopRaf = () => {
    if (rafRef.current !== null) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
  };

  const settleLoss = useCallback(
    async (crashAt: number) => {
      if (settledRef.current) return;
      settledRef.current = true;

      finalizePendingLoss();
      setHistory((prev) => [...prev, { crashAt, win: false }].slice(-10));
      setCrashShownMultiplier(crashAt);
      setLastWin(0);
      setResultAnimNonce((n) => n + 1);
      setRecordsRefresh((n) => n + 1);
      setOutcomeEffect("loss");
      setTimeout(() => setOutcomeEffect(null), 600);
      playAudio(audioRef.current.crash);
      void syncBalance();

      if (isAutoBettingRef.current) {
        const base = autoBaseBetRef.current;
        if (onLoseModeRef.current === "reset") {
          setBetBoth(base);
        } else {
          const pct = Math.max(0, parseNumberLoose(onLosePctInputRef.current));
          const next = normalizeMoney(betRef.current * (1 + pct / 100));
          setBetBoth(next);
        }
      }
    },
    [finalizePendingLoss, syncBalance]
  );

  const settleWin = useCallback(
    async (cashAt: number, crashAt: number) => {
      if (settledRef.current) return;
      settledRef.current = true;

      const payout = normalizeMoney(betRef.current * cashAt);
      addToBalance(payout);
      setLastWin(payout);
      setHistory((prev) => [...prev, { crashAt, cashedAt: cashAt, win: true }].slice(-10));
      setCrashShownMultiplier(crashAt);
      setResultAnimNonce((n) => n + 1);
      setRecordsRefresh((n) => n + 1);
      setOutcomeEffect("win");
      setTimeout(() => setOutcomeEffect(null), 600);
      playAudio(audioRef.current.win);
      void syncBalance();

      if (isAutoBettingRef.current) {
        const base = autoBaseBetRef.current;
        if (onWinModeRef.current === "reset") {
          setBetBoth(base);
        } else {
          const pct = Math.max(0, parseNumberLoose(onWinPctInputRef.current));
          const next = normalizeMoney(betRef.current * (1 + pct / 100));
          setBetBoth(next);
        }
      }
    },
    [addToBalance, syncBalance]
  );

  const cashOut = useCallback(async (forcedMultiplier?: number) => {
    if (!runningRef.current) return;

    const now = performance.now();
    let elapsed = now - startTsRef.current;
    let m = forcedMultiplier ?? growthMultiplier(elapsed);

    if (typeof forcedMultiplier === "number") {
      elapsed = estimateCrashTimeMs(forcedMultiplier);
    }

    ensureAxesFor(elapsed / 1000, m, now);

    if (m >= crashAtRef.current) {
      stopRaf();
      runningRef.current = false;

      setElapsedMs(elapsed);
      setDisplayMultiplier(crashAtRef.current);
      setCashedAtMultiplier(null);
      setGameState("crashed");

      void settleLoss(crashAtRef.current);
      return;
    }

    stopRaf();
    runningRef.current = false;

    setElapsedMs(elapsed);
    setDisplayMultiplier(m);
    setCashedAtMultiplier(m);
    setGameState("cashed");

    const crashAt = crashAtRef.current;
    const crashTimeMs = estimateCrashTimeMs(crashAt);
    if (Number.isFinite(crashAt) && crashAt > m + 1e-6 && crashTimeMs > elapsed + 1e-3) {
      setIsRevealingMax(true);
      setMaxPossibleMultiplier(null);
      setResultAnimNonce((n) => n + 1);

      const revealStart = performance.now();
      const startMult = m;
      const startElapsed = elapsed;
      const endMult = crashAt;
      const endElapsed = crashTimeMs;

      const revealTick = (ts: number) => {
        const p = clamp((ts - revealStart) / REVEAL_MAX_MS, 0, 1);
        const eased = 1 - Math.pow(1 - p, 3);
        const nextMult = startMult + (endMult - startMult) * eased;
        const nextElapsed = startElapsed + (endElapsed - startElapsed) * eased;

        setDisplayMultiplier(nextMult);
        setElapsedMs(nextElapsed);
        ensureAxesFor(nextElapsed / 1000, nextMult, ts);

        if (p >= 1) {
          rafRef.current = null;
          setDisplayMultiplier(endMult);
          setElapsedMs(endElapsed);
          setIsRevealingMax(false);
          setMaxPossibleMultiplier(endMult);
          setResultAnimNonce((n) => n + 1);
          return;
        }

        rafRef.current = requestAnimationFrame(revealTick);
      };

      rafRef.current = requestAnimationFrame(revealTick);
    } else {
      setIsRevealingMax(false);
      setMaxPossibleMultiplier(crashAt);
    }

    void settleWin(m, crashAtRef.current);
  }, [ensureAxesFor, estimateCrashTimeMs, settleLoss, settleWin]);

  const tick = useCallback(
    (now: number) => {
      if (!runningRef.current) return;

      const elapsed = now - startTsRef.current;
      const m = growthMultiplier(elapsed);

      ensureAxesFor(elapsed / 1000, m, now);

      if (m >= crashAtRef.current) {
        stopRaf();
        runningRef.current = false;

        setElapsedMs(elapsed);
        setDisplayMultiplier(crashAtRef.current);
        setCashedAtMultiplier(null);
        setGameState("crashed");

        void settleLoss(crashAtRef.current);
        return;
      }

      if (playModeRef.current === "auto") {
        const target = targetRef.current;
        if (Number.isFinite(target) && target >= MIN_TARGET && m >= target) {
          void cashOut(target);
          return;
        }
      }

      setElapsedMs(elapsed);
      setDisplayMultiplier(m);
      rafRef.current = requestAnimationFrame(tick);
    },
    [cashOut, ensureAxesFor, isAutoBetting, playMode, settleLoss]
  );

  const shouldStopAuto = useCallback(() => {
    if (!isAutoBetting) return false;

    const stopProfit = normalizeMoney(parseNumberLoose(stopProfitInput));
    const stopLoss = normalizeMoney(parseNumberLoose(stopLossInput));

    if (stopProfit > 0 && lastWin > 0) {
        const roundProfit = normalizeMoney(lastWin - lastStakeRef.current);
        if (roundProfit >= stopProfit) return true;
    }

    if (stopLoss > 0 && betAmount >= stopLoss) return true;

    if (betAmount <= 0) return true;
    if (betAmount > balance) return true;

    const t = targetRef.current;
    if (!Number.isFinite(t) || t < MIN_TARGET) return true;

    return false;
  }, [balance, betAmount, isAutoBetting, lastWin, stopLossInput, stopProfitInput]);

  const startRoundWithBet = useCallback(
    async (betValue: number) => {
      if (runningRef.current) return;

      const bet = normalizeMoney(betValue);
      if (bet <= 0 || bet > balance) return;

      settledRef.current = false;
      betRef.current = bet;
      lastStakeRef.current = bet;

      subtractFromBalance(bet);
      playAudio(audioRef.current.bet);
      setTimeout(() => playAudio(audioRef.current.tick), 150);

      setLastWin(0);
      setCrashShownMultiplier(null);
      setCashedAtMultiplier(null);
      setMaxPossibleMultiplier(null);
      setIsRevealingMax(false);
      setOutcomeEffect(null);

      const crashAt = sampleCrashMultiplier();
      crashAtRef.current = crashAt;

      resetAxes();

      setGameState("running");
      setDisplayMultiplier(1);
      setElapsedMs(0);
      setResultAnimNonce((n) => n + 1);

      runningRef.current = true;
      startTsRef.current = performance.now();

      stopRaf();
      rafRef.current = requestAnimationFrame(tick);
    },
    [balance, resetAxes, subtractFromBalance, tick]
  );

  const startRound = useCallback(async () => {
    const bet = normalizeMoney(parseNumberLoose(betInput));
    await startRoundWithBet(bet);
  }, [betInput, startRoundWithBet]);

  const startAutoBet = useCallback(async () => {
    if (isRunning || isRevealingMax) return;

    handleBetInputBlur();
    handleTargetBlur();

    const t = targetRef.current;
    if (!Number.isFinite(t) || t < MIN_TARGET) return;

    const baseBet = normalizeMoney(betAmount);
    if (baseBet <= 0 || baseBet > balance) return;

    autoBaseBetRef.current = baseBet;
    autoStartBalanceRef.current = balance;
    setIsAutoBetting(true);

    if (!runningRef.current) {
      await startRoundWithBet(baseBet);
    }
  }, [balance, betAmount, handleBetInputBlur, handleTargetBlur, isRevealingMax, isRunning, startRoundWithBet]);

  const stopAutoBet = useCallback(() => {
    setIsAutoBetting(false);
  }, []);

  useEffect(() => {
    if (!isAutoBetting || playMode !== "auto") return;
    if (isRevealingMax) return;
    if (isRunning) return;

    if (shouldStopAuto()) {
      setIsAutoBetting(false);
      return;
    }

    const id = window.setTimeout(() => {
      if (!runningRef.current && !isRevealingMax) {
        void startRoundWithBet(betAmount);
      }
    }, 250);

    return () => window.clearTimeout(id);
  }, [betAmount, isAutoBetting, isRevealingMax, isRunning, playMode, shouldStopAuto, startRoundWithBet]);

  useEffect(() => {
    if (!isAutoBetting) return;
    if (shouldStopAuto()) setIsAutoBetting(false);
  }, [balance, isAutoBetting, shouldStopAuto]);

  const resetBoard = useCallback(() => {
    stopRaf();
    runningRef.current = false;
    settledRef.current = false;

    resetAxes();

    setGameState("idle");
    setDisplayMultiplier(1);
    setElapsedMs(0);
    setCrashShownMultiplier(null);
    setCashedAtMultiplier(null);
    setMaxPossibleMultiplier(null);
    setIsRevealingMax(false);
    setLastWin(0);
    setOutcomeEffect(null);
    setResultAnimNonce((n) => n + 1);
  }, [resetAxes]);

  const changePlayMode = (mode: PlayMode) => {
    if (isBusy) return;
    setPlayMode(mode);

    setBetAmount(100);
    setBetInput("100");
    setTargetMultiplier(2);
    setTargetInput("2");
    targetRef.current = 2;

    setIsAutoBetting(false);
    setOnWinMode("reset");
    setOnLoseMode("reset");
    setOnWinPctInput("0");
    setOnLosePctInput("0");
    setStopProfitInput("0");
    setStopLossInput("0");

    setHistory([]);
    resetBoard();
  };

  const isLocked = isRunning;

  const chart = useMemo(() => {
    const VB_W = 1000;
    const VB_H = 520;

    const padL = 86;
    const padR = 22;
    const padT = 22;
    const padB = 70;

    const plotW = VB_W - padL - padR;
    const plotH = VB_H - padT - padB;

    const tSec = Math.max(0, elapsedMs / 1000);

    const xMax = Math.max(1e-6, xAxisMax);
    const yMin = 1;
    const yMax = Math.max(yMin + 1e-6, yAxisMax);

    const xTo = (t: number) => padL + (t / xMax) * plotW;
    const yTo = (m: number) => {
      const clamped = clamp(m, yMin, yMax);
      const p = (clamped - yMin) / (yMax - yMin);
      return padT + (1 - p) * plotH;
    };

    const tDraw = gameState === "idle" ? xMax : tSec;

    const N = 140;
    let d = "";
    for (let i = 0; i <= N; i++) {
      const t = (i / N) * tDraw;
      const m = growthMultiplier(t * 1000);
      const x = xTo(t);
      const y = yTo(m);
      d += i === 0 ? `M ${x.toFixed(2)} ${y.toFixed(2)}` : ` L ${x.toFixed(2)} ${y.toFixed(2)}`;
    }

    const currentX = xTo(tDraw);
    const currentY = yTo(displayMultiplier);

    const xTicks = Array.from({ length: AXIS_TICKS }, (_, i) => (i / Math.max(1, AXIS_TICKS - 1)) * xMax);
    const yTicks = Array.from({ length: AXIS_TICKS }, (_, i) => yMin + (i / Math.max(1, AXIS_TICKS - 1)) * (yMax - yMin));

    return {
      VB_W,
      VB_H,
      padL,
      padR,
      padT,
      padB,
      plotW,
      plotH,
      xMax,
      yMin,
      yMax,
      xTicks,
      yTicks,
      d,
      currentX,
      currentY,
    };
  }, [AXIS_TICKS, displayMultiplier, elapsedMs, gameState, xAxisMax, yAxisMax]);

  return (
    <div className="p-2 sm:p-4 lg:p-6 max-w-350 mx-auto flex flex-col lg:flex-row gap-4 lg:gap-8">
      <div className="w-full lg:w-60 flex flex-col gap-3 bg-[#0f212e] p-2 sm:p-3 rounded-xl h-fit text-xs">
        <div className="space-y-2">
          <label className="text-xs font-bold text-[#b1bad3] uppercase tracking-wider">Mode</label>
          <div className="bg-[#0f212e] p-1 rounded-md border border-[#2f4553] flex">
            {(["manual", "auto"] as const).map((mode) => (
              <button
                key={mode}
                onClick={() => changePlayMode(mode)}
                disabled={isBusy}
                className={`flex-1 py-2 text-[10px] font-bold uppercase rounded transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${
                  playMode === mode ? "bg-[#213743] text-white shadow-sm" : "text-[#b1bad3] hover:text-white"
                }`}
              >
                {mode === "manual" ? "Manual" : "Auto"}
              </button>
            ))}
          </div>
        </div>

        <div className="space-y-2">
          <label className="text-xs font-bold text-[#b1bad3] uppercase tracking-wider">Bet Amount</label>
          <div className="relative">
            <div className="absolute left-3 top-1/2 -translate-y-1/2 text-[#b1bad3]">$</div>
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
                const v = normalizeMoney(Number.isFinite(num) ? Math.max(0, num) : 0);
                setBetAmount(v);
                setBetInput(String(v));
              }}
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

        {playMode === "auto" && (
          <div className="space-y-2">
            <label className="text-xs font-bold text-[#b1bad3] uppercase tracking-wider">Target Multiplier</label>
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
              <div className="absolute right-3 top-1/2 -translate-y-1/2 text-[#b1bad3] text-sm">x</div>
            </div>

            <div className="text-[11px] text-[#b1bad3]">
              Chance: <span className="font-mono text-white">{formatChance(liveChancePercent)}%</span>
            </div>
          </div>
        )}

        {isRunning && playMode === "manual" && (
          <button
            onClick={() => cashOut()}
            className="w-full bg-[#00e701] hover:bg-[#00c201] text-black py-3 rounded-md font-bold text-lg shadow-[0_0_20px_rgba(0,231,1,0.2)] transition-all active:scale-95 flex items-center justify-center"
          >
            Cashout
          </button>
        )}

        {playMode === "manual" && !isRunning && (
        <button
            onClick={startRound}
            disabled={isBusy || betAmount <= 0 || betAmount > balance}
            className="w-full bg-[#00e701] hover:bg-[#00c201] text-black py-3 rounded-md font-bold text-lg shadow-[0_0_20px_rgba(0,231,1,0.2)] transition-all active:scale-95 flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
        >
            <PlayArrow /> Bet
        </button>
        )}



        {playMode === "auto" && (
            <>
            <div className="space-y-2">
              <label className="text-xs font-bold text-[#b1bad3] uppercase tracking-wider">On Win</label>
              <div className="bg-[#0f212e] p-1 rounded-md border border-[#2f4553] flex">
                {(["reset", "raise"] as const).map((m) => (
                    <button
                    key={m}
                    onClick={() => !isBusy && setOnWinMode(m)}
                    disabled={isBusy}
                    className={`flex-1 py-2 text-[10px] font-bold uppercase rounded transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${
                        onWinMode === m ? "bg-[#213743] text-white shadow-sm" : "text-[#b1bad3] hover:text-white"
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
                    onBlur={() => setOnWinPctInput((s) => s.trim().replace(/^0+(?=\d)/, "") || "0")}
                    disabled={isBusy}
                    className="w-full bg-[#0f212e] border border-[#2f4553] rounded-md py-2 pl-7 pr-4 text-white font-mono focus:outline-none focus:border-[#00e701] transition-colors"
                    placeholder="0"
                    />
                </div>
              )}
            </div>

            <div className="space-y-2">
              <label className="text-xs font-bold text-[#b1bad3] uppercase tracking-wider">On Loss</label>
              <div className="bg-[#0f212e] p-1 rounded-md border border-[#2f4553] flex">
                {(["reset", "raise"] as const).map((m) => (
                    <button
                    key={m}
                    onClick={() => !isBusy && setOnLoseMode(m)}
                    disabled={isBusy}
                    className={`flex-1 py-2 text-[10px] font-bold uppercase rounded transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${
                        onLoseMode === m ? "bg-[#213743] text-white shadow-sm" : "text-[#b1bad3] hover:text-white"
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
                    onBlur={() => setOnLosePctInput((s) => s.trim().replace(/^0+(?=\d)/, "") || "0")}
                    disabled={isBusy}
                    className="w-full bg-[#0f212e] border border-[#2f4553] rounded-md py-2 pl-7 pr-4 text-white font-mono focus:outline-none focus:border-[#00e701] transition-colors"
                    placeholder="0"
                    />
                </div>
              )}
            </div>

            <div className="space-y-2">
              <label className="text-xs font-bold text-[#b1bad3] uppercase tracking-wider">Stop on Profit</label>
              <div className="relative">
                <div className="absolute left-3 top-1/2 -translate-y-1/2 text-[#b1bad3]">$</div>
                <input
                  type="number"
                  value={stopProfitInput}
                  onChange={(e) => setStopProfitInput(e.target.value)}
                  onBlur={() => setStopProfitInput((s) => s.trim().replace(/^0+(?=\d)/, "") || "0")}
                  disabled={isBusy}
                  className="w-full bg-[#0f212e] border border-[#2f4553] rounded-md py-2 pl-7 pr-4 text-white font-mono focus:outline-none focus:border-[#00e701] transition-colors"
                  />
              </div>
            </div>

            <div className="space-y-2">
              <label className="text-xs font-bold text-[#b1bad3] uppercase tracking-wider">Stop on Loss</label>
              <div className="relative">
                <div className="absolute left-3 top-1/2 -translate-y-1/2 text-[#b1bad3]">$</div>
                <input
                  type="number"
                  value={stopLossInput}
                  onChange={(e) => setStopLossInput(e.target.value)}
                  onBlur={() => setStopLossInput((s) => s.trim().replace(/^0+(?=\d)/, "") || "0")}
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

        {gameState === "running" && (
          <div className="bg-[#0f212e] p-4 rounded border border-[#2f4553] text-center">
            <div className="text-[#b1bad3] text-sm">Current Win</div>
            <div className="text-2xl font-bold text-[#00e701]">${currentPayout.toFixed(2)}</div>
            <div className="text-sm text-[#b1bad3] mt-1">Current: {formatMultiplier(displayMultiplier)}x</div>
          </div>
        )}

        {gameState === "cashed" && lastWin > 0 && (
          <div className="p-4 rounded-md bg-[#213743] border border-[#00e701] text-center">
            <div className="text-xs uppercase text-[#b1bad3]">You Won</div>
            <div className="text-2xl font-bold text-[#00e701]">${lastWin.toFixed(2)}</div>
          </div>
        )}
      </div>

      <div className="flex-1 flex flex-col gap-4">
        <div className="flex-1 flex flex-col items-center justify-center bg-[#0f212e] rounded-xl p-4 sm:p-6 relative min-h-[240px] w-full overflow-hidden sm:aspect-[1000/520]">
          {gameState === "running" && <div className="absolute inset-0 pointer-events-none" style={{ background: "radial-gradient(circle at 50% 55%, rgba(47,69,83,0.22) 0%, rgba(15,33,46,0.0) 68%)", opacity: 0.9 }} />}
          
          {outcomeEffect === "loss" && <div className="limbo-lose-flash" />}
          {outcomeEffect === "win" && <div className="limbo-win-flash" />}

          {history.length > 0 && (
            <div className="absolute top-4 left-1/2 -translate-x-1/2 z-10 flex gap-2">
              {history.slice(-8).map((h, i) => {
                const mult = h.win ? (typeof h.cashedAt === "number" ? h.cashedAt : h.crashAt) : h.crashAt;
                return (
                  <div
                    key={i}
                    className={`w-10 h-8 rounded-full flex items-center justify-center text-[10px] font-bold shadow-md animate-scale-in ${
                      h.win ? "text-black" : "text-white"
                    }`}
                    style={{ backgroundColor: h.win ? "#00e701" : "#6b7280" }}
                  >
                    {formatMultiplier(mult)}x
                  </div>
                );
              })}
            </div>
          )}

          <div className="relative z-10 w-full h-full">
            <svg
              key={resultAnimNonce}
              viewBox={`0 0 ${chart.VB_W} ${chart.VB_H}`}
              className="w-full h-full"
            >
              {chart.yTicks
                .filter((v) => v >= chart.yMin - 1e-9)
                .map((v, idx) => {
                  const y = ((): number => {
                    const p = (clamp(v, chart.yMin, chart.yMax) - chart.yMin) / (chart.yMax - chart.yMin);
                    return chart.padT + (1 - p) * chart.plotH;
                  })();

                  const label = formatMultiplier(v);

                  return (
                    <g key={`y-${idx}`} opacity={1}>
                      <text x={chart.padL - 10} y={y + 4} textAnchor="end" fontSize={Math.max(10, Math.round(chart.plotW * 0.02))} fill="rgba(177,186,211,0.7)" fontFamily="ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', 'Courier New', monospace">
                        {label}x
                      </text>
                    </g>
                  );
                })}

              {chart.xTicks
                .filter((v) => v >= -1e-9)
                .map((v, idx) => {
                  const x = chart.padL + (v / chart.xMax) * chart.plotW;

                  return (
                    <g key={`x-${idx}`} opacity={1}>
                      <text x={x} y={chart.VB_H - chart.padB + 26} textAnchor="middle" fontSize={Math.max(10, Math.round(chart.plotW * 0.02))} fill="rgba(177,186,211,0.7)" fontFamily="ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', 'Courier New', monospace">
                        {idx === 0 ? "0s" : formatSeconds(v)}
                      </text>
                    </g>
                  );
                })}

              {/* Axes */}
              <line x1={chart.padL} y1={chart.padT} x2={chart.padL} y2={chart.VB_H - chart.padB} stroke="rgba(177,186,211,0.35)" strokeWidth={2} />
              <line x1={chart.padL} y1={chart.VB_H - chart.padB} x2={chart.VB_W - chart.padR} y2={chart.VB_H - chart.padB} stroke="rgba(177,186,211,0.35)" strokeWidth={2} />

              {gameState !== "idle" && (
                <>
                  <path
                    d={chart.d}
                    fill="none"
                    stroke={gameState === "crashed" ? "#ef4444" : "#00e701"}
                    strokeWidth={Math.max(2, Math.round(chart.plotW * 0.006))}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    style={{ filter: gameState === "crashed" ? "drop-shadow(0 0 10px rgba(239,68,68,0.25))" : "drop-shadow(0 0 12px rgba(0,231,1,0.25))" }}
                  />

                  <circle cx={chart.currentX} cy={chart.currentY} r={Math.max(4, Math.round(chart.plotW * 0.012))} fill={gameState === "crashed" ? "#ef4444" : "#00e701"} />
                  <circle cx={chart.currentX} cy={chart.currentY} r={Math.max(8, Math.round(chart.plotW * 0.024))} fill={gameState === "crashed" ? "rgba(239,68,68,0.18)" : "rgba(0,231,1,0.18)"} />
                </>
              )}
            </svg>

            {gameState !== "idle" && (
              <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                <div
                  className={`text-[clamp(1.8rem,6.5vw,5.5rem)] font-black font-mono leading-none transition-all duration-300 ${
                    gameState === "running"
                      ? "text-white"
                      : gameState === "cashed"
                        ? "text-[#00e701] drop-shadow-[0_0_30px_rgba(0,231,1,0.35)] scale-110 animate-limbo-win-pop"
                        : gameState === "crashed"
                          ? "text-[#ef4444] drop-shadow-[0_0_30px_rgba(239,68,68,0.35)] animate-limbo-lose-shake"
                          : "text-white"
                  }`}
                >
                  {formatMultiplier(displayMultiplier)}x
                </div>
              </div>
            )}
          </div>
        </div>

        <GameRecordsPanel gameId="crash"/>
      </div>
    </div>
  );
}
