"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { PlayArrow } from "@mui/icons-material";
import { useWallet } from "@/components/WalletProvider";
import { useSoundVolume } from "@/components/SoundVolumeProvider";
import GameRecordsPanel from "@/components/GameRecordsPanel";

type GameState = "idle" | "drilling" | "won" | "lost";
type DrillId = "blue" | "yellow" | "green";

type DrillSpec = {
  id: DrillId;
  label: string;
  accent: string;
  bg: string;
  gem: string;
};

const HOUSE_EDGE = 0.99;
const MIN_TARGET = 1.01;
const MAX_TARGET = Infinity;

const growthK = 0.14;
const growthEXP = 1.35;

const DRILLS: DrillSpec[] = [
  { id: "blue", label: "Blue Drill", accent: "#38bdf8", bg: "#1f3344", gem: "square" },
  { id: "yellow", label: "Yellow Drill", accent: "#facc15", bg: "#2f3d22", gem: "circle" },
  { id: "green", label: "Green Drill", accent: "#22c55e", bg: "#1f3b2d", gem: "triangle" },
];

const clamp = (v: number, min: number, max: number) => Math.max(min, Math.min(max, v));

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

const formatMultiplier = (m: number) => {
  if (!Number.isFinite(m) || m <= 0) return "—";
  if (m < 10) return m.toFixed(2);
  if (m < 100) return m.toFixed(1);
  return m.toFixed(0);
};

const formatChance = (p: number) => {
  if (!Number.isFinite(p) || p < 0) return "0.00";
  return p < 10 ? p.toFixed(2) : p.toFixed(1);
};

function sampleMultiplier() {
  const u = Math.random();
  const raw = HOUSE_EDGE / (u || 0.00000001);
  return Math.max(1, raw);
}

function growthMultiplier(elapsedMs: number): number {
  const t = Math.max(0, elapsedMs) / 1000;
  const m = Math.exp(growthK * Math.pow(t, growthEXP));
  return m;
}

function estimateTimeMs(multiplier: number): number {
  if (!Number.isFinite(multiplier) || multiplier <= 1) return 0;
  const ln = Math.log(multiplier);
  if (ln <= 0) return 0;
  const tSec = Math.pow(ln / growthK, 1 / growthEXP);
  return tSec * 1000;
}

const DrillBit = React.memo(function DrillBit({ isSpinning, speedMultiplier = 1 }: { isSpinning: boolean; speedMultiplier?: number }) {
  const duration = Math.max(0.08, 0.5 / Math.pow(Math.max(1, speedMultiplier), 0.4));

  return (
    <div className="flex flex-col items-center">
      <div className="w-12 h-3 bg-[#334155] border-x border-[#1e293b]" />
      
      <div className="relative w-24 h-24 -mt-0.5 filter drop-shadow-lg">
        <svg viewBox="0 0 100 100" className="w-full h-full text-[#94a3b8]">
          <defs>
            <clipPath id="coneClip">
              <path d="M0 0 L100 0 L50 100 Z" />
            </clipPath>
          </defs>
          
          <g clipPath="url(#coneClip)">
            <rect width="100" height="100" fill="currentColor" />
            <g
              style={{
                animation: isSpinning ? `spinDrill ${duration}s linear infinite` : "none",
              }}
            >
               {[0, 25, 50, 75, 100, 125].map(y => (
                 <path 
                   key={y}
                   d={`M-20 ${y} L120 ${y+20} L120 ${y+35} L-20 ${y+15} Z`} 
                   fill="#475569" 
                   opacity="0.8"
                   transform="rotate(-15 50 50)"
                 />
               ))}
               {[0, 25, 50, 75, 100, 125].map(y => (
                 <path 
                   key={`dup-${y}`}
                   d={`M-20 ${y-100} L120 ${y-80} L120 ${y-65} L-20 ${y-85} Z`} 
                   fill="#475569" 
                   opacity="0.8"
                   transform="rotate(-15 50 50)"
                 />
               ))}
            </g>
          </g>
        </svg>
      </div>

      <style jsx>{`
        @keyframes spinDrill {
          from { transform: translateY(0%); }
          to { transform: translateY(50%); } 
        }
      `}</style>
    </div>
  );
});

const Fossil = React.memo(function Fossil({ type, top, left, viewOffset }: { type: number, top: number, left: string, viewOffset: number }) {
  const y = top - viewOffset;
  if (y < -100 || y > 500) return null;

  return (
    <div 
      className="absolute opacity-20 pointer-events-none"
      style={{ top: `${y}px`, left, willChange: 'transform' }}
    >
      {type === 0 && ( 
        <svg width="24" height="20" viewBox="0 0 24 20" fill="none">
          <path d="M4 16L2 10L6 2L18 4L22 12L18 18H4Z" fill="#94a3b8" />
        </svg>
      )}
      {type === 1 && ( 
        <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
          <path d="M10 2C5.58 2 2 5.58 2 10C2 14.42 5.58 18 10 18C14.42 18 18 14.42 18 10" stroke="#94a3b8" strokeWidth="2" strokeLinecap="round" />
          <path d="M10 6C7.79 6 6 7.79 6 10C6 12.21 7.79 14 10 14" stroke="#94a3b8" strokeWidth="2" strokeLinecap="round" />
          <circle cx="10" cy="10" r="1.5" fill="#94a3b8" />
        </svg>
      )}
      {type === 2 && ( 
        <svg width="24" height="12" viewBox="0 0 24 12" fill="none">
          <rect x="6" y="4" width="12" height="4" rx="2" fill="#94a3b8" />
          <circle cx="4" cy="4" r="3" fill="#94a3b8" />
          <circle cx="4" cy="8" r="3" fill="#94a3b8" />
          <circle cx="20" cy="4" r="3" fill="#94a3b8" />
          <circle cx="20" cy="8" r="3" fill="#94a3b8" />
        </svg>
      )}
    </div>
  );
});

function GemIcon({ type, color }: { type: string; color: string }) {
  if (type === "square") {
    return (
      <svg width="40" height="40" viewBox="0 0 32 32" fill="none">
        <rect x="8" y="8" width="16" height="16" fill={color} transform="rotate(45 16 16)" />
        <rect x="8" y="8" width="16" height="16" stroke="rgba(255,255,255,0.3)" strokeWidth="1" transform="rotate(45 16 16)" />
      </svg>
    );
  }
  if (type === "diamond") {
    return (
      <svg width="32" height="32" viewBox="0 0 32 32" fill="none">
        <path d="M16 2L28 12L16 30L4 12Z" fill={color} />
        <path d="M16 2L28 12L16 30L4 12Z" stroke="rgba(255,255,255,0.3)" strokeWidth="1" />
      </svg>
    );
  }
  if (type === "circle") {
    return (
      <svg width="32" height="32" viewBox="0 0 32 32" fill="none">
        <circle cx="16" cy="16" r="14" fill={color} />
        <circle cx="16" cy="16" r="14" stroke="rgba(255,255,255,0.3)" strokeWidth="s1" />
      </svg>
    );
  }
  if (type === "triangle") {
    return (
      <svg width="32" height="32" viewBox="0 0 32 32" fill="none">
        <path d="M16 2L30 28H2Z" fill={color} />
        <path d="M16 2L30 28H2Z" stroke="rgba(255,255,255,0.3)" strokeWidth="1" />
      </svg>
    );
  }
  return null;
}

export default function DrillPage() {
  const { balance, subtractFromBalance, addToBalance, finalizePendingLoss, syncBalance } = useWallet();
  const { volume } = useSoundVolume();

  const [betAmount, setBetAmount] = useState(100);
  const [betInput, setBetInput] = useState("100");

  const [targetMultiplier, setTargetMultiplier] = useState(2);
  const [targetInput, setTargetInput] = useState("2.00");

  const [selectedDrill, setSelectedDrill] = useState<DrillId>("yellow");

  const [gameState, setGameState] = useState<GameState>("idle");
  const [liveMultipliers, setLiveMultipliers] = useState<Record<DrillId, number>>({
    blue: 1,
    yellow: 1,
    green: 1,
  });
  const [finalMultipliers, setFinalMultipliers] = useState<Record<DrillId, number> | null>(null);

  const [lastWin, setLastWin] = useState(0);
  const [resultNonce, setResultNonce] = useState(0);
  const [history, setHistory] = useState<{ drill: DrillId; multiplier: number; win: boolean }[]>([]);

  const [playMode, setPlayMode] = useState<"manual" | "auto">("manual");
  const [onWinMode, setOnWinMode] = useState<"reset" | "raise">("reset");
  const [onWinPctInput, setOnWinPctInput] = useState<string>("0");
  const [onLoseMode, setOnLoseMode] = useState<"reset" | "raise">("reset");
  const [onLosePctInput, setOnLosePctInput] = useState<string>("0");
  const [isAutoBetting, setIsAutoBetting] = useState(false);

  const betAmountRef = useRef<number>(betAmount);
  const balanceRef = useRef<number>(0);
  const isAutoBettingRef = useRef<boolean>(false);
  const autoOriginalBetRef = useRef<number>(0);

  const fossils = useMemo(() => {
    const generate = () => {
      const items = [];
      let y = 0;
      while (y < 50000) {
        y += Math.floor(Math.random() * 120 + 40);
        items.push({
          top: y,
          left: `${Math.floor(Math.random() * 70 + 15)}%`,
          type: Math.floor(Math.random() * 3),
        });
      }
      return items;
    };

    return {
      blue: generate(),
      yellow: generate(),
      green: generate(),
    };
  }, []);

  const rafRef = useRef<number | null>(null);
  const runningRef = useRef(false);
  const resultTimeoutRef = useRef<number | null>(null);

  const audioRef = useRef<{
    bet: HTMLAudioElement | null;
    win: HTMLAudioElement | null;
    lose: HTMLAudioElement | null;
    drill: HTMLAudioElement | null;
    audioContext: AudioContext | null;
    drillBuffer: AudioBuffer | null;
    drillSource: AudioBufferSourceNode | null;
    drillGain: GainNode | null;
  }>(
    {
      bet: null,
      win: null,
      lose: null,
      drill: null,
      audioContext: null,
      drillBuffer: null,
      drillSource: null,
      drillGain: null,
    }
  );

  const ensureAudio = async () => {
    if (audioRef.current.bet) return;
    audioRef.current.bet = new Audio("/sounds/Bet.mp3");
    audioRef.current.win = new Audio("/sounds/Win.mp3");
    audioRef.current.lose = new Audio("/sounds/LimboLose.mp3");
    audioRef.current.drill = new Audio("/sounds/Drill.mp3");

    try {
      const AC = window.AudioContext || (window as any).webkitAudioContext;
      if (AC) {
        const ctx = new AC();
        audioRef.current.audioContext = ctx;
        audioRef.current.drillGain = ctx.createGain();
        audioRef.current.drillGain.connect(ctx.destination);

        try {
          const resp = await fetch("/sounds/Drill.mp3");
          const arr = await resp.arrayBuffer();
          const decoded = await ctx.decodeAudioData(arr.slice(0));
          audioRef.current.drillBuffer = decoded;
        } catch {
          audioRef.current.drillBuffer = null;
        }
      }
    } catch {}
  };

  const startDrillLoop = async () => {
    await ensureAudio();
    const ctx = audioRef.current.audioContext;
    const vol = typeof window !== "undefined" && typeof (window as any).__flopper_sound_volume__ === "number"
      ? (window as any).__flopper_sound_volume__
      : volume ?? 1;

    if (ctx && audioRef.current.drillBuffer && audioRef.current.drillGain) {
      try {
        if (ctx.state === "suspended") {
          await ctx.resume();
        }

        try {
          if (audioRef.current.drillSource) {
            audioRef.current.drillSource.stop();
            audioRef.current.drillSource.disconnect();
            audioRef.current.drillSource = null;
          }
        } catch {}

        const src = ctx.createBufferSource();
        src.buffer = audioRef.current.drillBuffer!;
        src.loop = true;
        const gain = audioRef.current.drillGain!;
        gain.gain.value = vol ?? 1;
        src.connect(gain);
        src.start(0);
        audioRef.current.drillSource = src;
        return;
      } catch {}
    }

    const d = audioRef.current.drill;
    if (!d) return;
    try {
      d.loop = true;
      d.volume = vol ?? 1;
      d.currentTime = 0;
      void d.play();
    } catch {}
  };

  const stopDrillLoop = () => {
    try {
      if (audioRef.current.drillSource) {
        try {
          audioRef.current.drillSource.stop();
        } catch {}
        try {
          audioRef.current.drillSource.disconnect();
        } catch {}
        audioRef.current.drillSource = null;
      }
      const d = audioRef.current.drill;
      if (d) {
        d.loop = false;
        try {
          d.pause();
          d.currentTime = 0;
        } catch {}
      }
    } catch {}
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
    betAmountRef.current = betAmount;
  }, [betAmount]);

  useEffect(() => {
    balanceRef.current = balance;
  }, [balance]);

  useEffect(() => {
    isAutoBettingRef.current = isAutoBetting;
  }, [isAutoBetting]);

  useEffect(() => {
    if (volume <= 0) return;

    const prime = async () => {
      try {
        await ensureAudio();
        try {
          if (audioRef.current.audioContext && audioRef.current.audioContext.state === "suspended") {
            await audioRef.current.audioContext.resume();
          }
        } catch {}

        const list = [audioRef.current.bet, audioRef.current.win, audioRef.current.lose, audioRef.current.drill];
        for (const a of list) {
          if (!a) continue;
          try {
            a.muted = true;
            await a.play();
            a.pause();
            a.currentTime = 0;
            a.muted = false;
          } catch {
            try {
              a.muted = false;
            } catch {}
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
      if (resultTimeoutRef.current !== null) {
        window.clearTimeout(resultTimeoutRef.current);
        resultTimeoutRef.current = null;
      }
      try {
        if (audioRef.current.drillSource) {
          try {
            audioRef.current.drillSource.stop();
          } catch {}
          try {
            audioRef.current.drillSource.disconnect();
          } catch {}
          audioRef.current.drillSource = null;
        }
        const d = audioRef.current.drill;
        if (d) {
          d.loop = false;
          d.pause();
          d.currentTime = 0;
        }
        if (audioRef.current.audioContext) {
          try {
            audioRef.current.audioContext.close();
          } catch {}
          audioRef.current.audioContext = null;
        }
      } catch {}
    };
  }, []);

  const liveChancePercent = useMemo(() => {
    const t = targetMultiplier;
    if (!Number.isFinite(t) || t <= 0) return 0;
    return clamp((HOUSE_EDGE / t) * 100, 0, 100);
  }, [targetMultiplier]);

  const isLocked = gameState === "drilling";
  const isBusy = isLocked || isAutoBetting;

  const handleTargetBlur = useCallback(() => {
    const raw = targetInput.trim();
    const sanitized = raw.replace(/^0+(?=\d)/, "") || "0";
    const value = clamp(parseNumberLoose(sanitized), MIN_TARGET, MAX_TARGET);
    const rounded = Math.round(value * 100) / 100;
    setTargetMultiplier(rounded);
    setTargetInput(rounded.toFixed(2));
  }, [targetInput]);

  const setBetBoth = (next: number) => {
    const v = normalizeMoney(next);
    setBetAmount(v);
    setBetInput(String(v));
    betAmountRef.current = v;
  };

  const runRound = useCallback(async (opts?: { betAmount?: number }) => {
    await syncBalance();

    const stake = normalizeMoney(opts?.betAmount ?? parseNumberLoose(betInput));
    const target = clamp(parseNumberLoose(targetInput), MIN_TARGET, MAX_TARGET);

    if (stake <= 0 || stake > balanceRef.current || runningRef.current) return null;

    runningRef.current = true;
    setGameState("drilling");
    setLastWin(0);
    setResultNonce((n) => n + 1);

    const sampled: Record<DrillId, number> = {
      blue: sampleMultiplier(),
      yellow: sampleMultiplier(),
      green: sampleMultiplier(),
    };

    setFinalMultipliers(sampled);
    setLiveMultipliers({ blue: 1, yellow: 1, green: 1 });

    subtractFromBalance(stake);
    playAudio(audioRef.current.bet);
    void startDrillLoop();

    const drillDurations = {
      blue: estimateTimeMs(sampled.blue),
      yellow: estimateTimeMs(sampled.yellow),
      green: estimateTimeMs(sampled.green),
    };
    const maxDuration = Math.max(...Object.values(drillDurations), 1500);

    const start = performance.now();

    await new Promise<void>((resolve) => {
      const frame = (now: number) => {
        const elapsed = now - start;

        const nextMults: Record<DrillId, number> = {
          blue: elapsed >= drillDurations.blue ? sampled.blue : Math.min(sampled.blue, growthMultiplier(elapsed)),
          yellow: elapsed >= drillDurations.yellow ? sampled.yellow : Math.min(sampled.yellow, growthMultiplier(elapsed)),
          green: elapsed >= drillDurations.green ? sampled.green : Math.min(sampled.green, growthMultiplier(elapsed)),
        };

        setLiveMultipliers(nextMults);

        if (elapsed < maxDuration) {
          rafRef.current = requestAnimationFrame(frame);
        } else {
          rafRef.current = null;
          resolve();
        }
      };

      rafRef.current = requestAnimationFrame(frame);
    });

    stopDrillLoop();

    const selectedFinal = sampled[selectedDrill];
    const isWin = selectedFinal >= target;

    setHistory((prev) => [...prev, { drill: selectedDrill, multiplier: selectedFinal, win: isWin }].slice(-8));

    let winAmt = 0;
    if (isWin) {
      const payout = normalizeMoney(stake * target);
      addToBalance(payout);
      setLastWin(payout);
      setGameState("won");
      setResultNonce((n) => n + 1);
      playAudio(audioRef.current.win);
      winAmt = payout;
    } else {
      finalizePendingLoss();
      setGameState("lost");
      setResultNonce((n) => n + 1);
      playAudio(audioRef.current.lose);
      winAmt = 0;
    }

    await syncBalance();

    await new Promise<void>((resolve) => {
      resultTimeoutRef.current = window.setTimeout(() => {
        resultTimeoutRef.current = null;
        resolve();
      }, 200);
    });

    runningRef.current = false;
    return { betAmount: stake, winAmount: winAmt, isWin };
  }, [addToBalance, betInput, finalizePendingLoss, selectedDrill, subtractFromBalance, syncBalance, targetInput]);

  const startAutoBet = useCallback(async () => {
    if (isAutoBettingRef.current) return;

    const startingBet = normalizeMoney(betAmountRef.current);
    if (startingBet <= 0 || startingBet > balanceRef.current) return;
    if (runningRef.current) return;

    autoOriginalBetRef.current = startingBet;
    isAutoBettingRef.current = true;
    setIsAutoBetting(true);

    while (isAutoBettingRef.current) {
      const onWinPct = Math.max(0, parseNumberLoose(onWinPctInput));
      const onLosePct = Math.max(0, parseNumberLoose(onLosePctInput));

      const roundBet = normalizeMoney(betAmountRef.current);
      if (roundBet <= 0 || roundBet > balanceRef.current) break;

      const result = await runRound({ betAmount: roundBet });
      if (!result) break;

      if (!isAutoBettingRef.current) break;

      if (result.isWin) {
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
    }

    isAutoBettingRef.current = false;
    setIsAutoBetting(false);
    void syncBalance();
  }, [onWinMode, onWinPctInput, onLoseMode, onLosePctInput, runRound, syncBalance]);

  const stopAutoBet = useCallback(() => {
    isAutoBettingRef.current = false;
    setIsAutoBetting(false);
    void syncBalance();
  }, [syncBalance]);

  const changePlayMode = (mode: "manual" | "auto") => {
    if (isAutoBetting) stopAutoBet();
    setPlayMode(mode);
  };

  return (
    <div className="p-2 sm:p-4 lg:p-6 max-w-[1400px] mx-auto flex flex-col lg:flex-row gap-4 lg:gap-8">
      <div className="w-full lg:w-60 lg:shrink-0 flex flex-col gap-3 bg-[#0f212e] p-2 sm:p-3 rounded-xl h-fit text-xs">
        <div className="space-y-2">
          <label className="text-xs font-bold text-[#b1bad3] uppercase tracking-wider">Mode</label>
          <div className="bg-[#0f212e] p-1 rounded-md border border-[#2f4553] flex">
            {(["manual", "auto"] as const).map((mode) => (
              <button
                key={mode}
                onClick={() => !isBusy && changePlayMode(mode)}
                disabled={isBusy}
                className={`flex-1 py-2 text-[10px] font-bold uppercase rounded transition-colors disabled:opacity-50 ${
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
                const num = Number(sanitized.replace(",", "."));
                setBetBoth(Number.isFinite(num) ? num : 0);
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
          <label className="text-xs font-bold text-[#b1bad3] uppercase tracking-wider">Select Drill</label>
          <div className="grid grid-cols-3 gap-2">
            {DRILLS.map((drill) => (
              <button
                key={drill.id}
                disabled={isBusy}
                onClick={() => setSelectedDrill(drill.id)}
                className={`rounded-md py-2 text-[11px] font-bold uppercase border transition-colors disabled:opacity-50 ${
                  selectedDrill === drill.id
                    ? "text-white border-transparent"
                    : "text-[#b1bad3] border-[#2f4553] hover:text-white"
                }`}
                style={selectedDrill === drill.id ? { backgroundColor: drill.accent, color: "#0b1720" } : undefined}
              >
                {drill.label.split(" ")[0]}
              </button>
            ))}
          </div>
        </div>

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
              disabled={isBusy}
              className="w-full bg-[#0f212e] border border-[#2f4553] rounded-md py-2 px-4 text-white font-mono focus:outline-none focus:border-[#00e701] transition-colors disabled:opacity-50"
            />
            <div className="absolute right-3 top-1/2 -translate-y-1/2 text-[#b1bad3] text-sm">x</div>
          </div>
          <div className="text-[11px] text-[#b1bad3]">Chance: <span className="font-mono text-white">{formatChance(liveChancePercent)}%</span></div>
        </div>

        {playMode === "manual" ? (
          <button
            onClick={() => runRound()}
            disabled={isBusy || betAmount <= 0 || betAmount > balance}
            className="w-full bg-[#00e701] hover:bg-[#00c201] text-black py-3 rounded-md font-bold text-lg shadow-[0_0_20px_rgba(0,231,1,0.2)] transition-all active:scale-95 flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
          >
              {!isLocked && <PlayArrow sx={{ fill: "currentColor" }} />}
            {isLocked ? "Playing" : "Bet"}
          </button>
        ) : (
          <div className="flex flex-col gap-3">
             <div className="space-y-2">
                <label className="text-xs font-bold text-[#b1bad3] uppercase tracking-wider">On Win</label>
                <div className="bg-[#0f212e] p-1 rounded-md border border-[#2f4553] flex">
                  {(["reset", "raise"] as const).map((m) => (
                    <button
                      key={m}
                      onClick={() => !isBusy && setOnWinMode(m)}
                      disabled={isBusy}
                      className={`flex-1 py-2 text-[10px] font-bold uppercase rounded transition-colors disabled:opacity-50 ${onWinMode === m ? "bg-[#213743] text-white shadow-sm" : "text-[#b1bad3] hover:text-white"}`}
                    >
                      {m === "reset" ? "Reset" : "Raise"}
                    </button>
                  ))}
                </div>
                {onWinMode === "raise" && (
                  <div className="relative">
                    <input
                      type="number"
                      value={onWinPctInput}
                      onChange={(e) => setOnWinPctInput(e.target.value)}
                      className="w-full bg-[#0f212e] border border-[#2f4553] rounded-md py-2 px-3 text-white font-mono focus:outline-none"
                      placeholder="0"
                    />
                    <div className="absolute right-3 top-1/2 -translate-y-1/2 text-[#b1bad3]">%</div>
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
                      className={`flex-1 py-2 text-[10px] font-bold uppercase rounded transition-colors disabled:opacity-50 ${onLoseMode === m ? "bg-[#213743] text-white shadow-sm" : "text-[#b1bad3] hover:text-white"}`}
                    >
                      {m === "reset" ? "Reset" : "Raise"}
                    </button>
                  ))}
                </div>
                {onLoseMode === "raise" && (
                  <div className="relative">
                    <input
                      type="number"
                      value={onLosePctInput}
                      onChange={(e) => setOnLosePctInput(e.target.value)}
                      className="w-full bg-[#0f212e] border border-[#2f4553] rounded-md py-2 px-3 text-white font-mono focus:outline-none"
                      placeholder="0"
                    />
                    <div className="absolute right-3 top-1/2 -translate-y-1/2 text-[#b1bad3]">%</div>
                  </div>
                )}
             </div>

             {isAutoBetting ? (
                <button
                  onClick={stopAutoBet}
                  className="w-full bg-red-600 hover:bg-red-500 text-white py-3 rounded-md font-bold text-lg transition-all active:scale-95"
                >
                  Stop Autobet
                </button>
             ) : (
                <button
                  onClick={startAutoBet}
                  disabled={isLocked || betAmount <= 0}
                  className="w-full bg-[#00e701] hover:bg-[#00c201] text-black py-3 rounded-md font-bold text-lg shadow-[0_0_20px_rgba(0,231,1,0.2)] transition-all active:scale-95 disabled:opacity-50"
                >
                  Start Autobet
                </button>
             )}
          </div>
        )}

        {gameState === "won" && lastWin > 0 && (
          <div className="p-4 rounded-md bg-[#213743] border border-[#00e701] text-center">
            <div className="text-xs uppercase text-[#b1bad3]">You Won</div>
            <div className="text-2xl font-bold text-[#00e701]">${lastWin.toFixed(2)}</div>
          </div>
        )}
      </div>

      <div className="flex-1 min-w-0 flex flex-col gap-4">
        <div className="flex-1 flex flex-col items-center justify-center bg-[#0f212e] rounded-xl p-4 sm:p-6 relative min-h-[400px] sm:min-h-[550px] lg:min-h-[700px] overflow-hidden">
          {gameState === "drilling" && <div className="limbo-roll-glow" />}
          {gameState === "won" && <div className="limbo-win-flash" />}
          {gameState === "lost" && <div className="limbo-lose-flash" />}

          {history.length > 0 && (
            <div className="absolute top-4 left-1/2 -translate-x-1/2 z-20 flex gap-2">
              {history.map((h, i) => {
                const d = DRILLS.find((x) => x.id === h.drill)!;
                return (
                  <div
                    key={`${h.drill}-${i}-${h.multiplier}`}
                    className={`h-8 px-3 rounded-full flex items-center justify-center text-[10px] font-bold shadow-md animate-scale-in ${h.win ? "text-black" : "text-white"}`}
                    style={{ backgroundColor: h.win ? d.accent : "#6b7280" }}
                  >
                    {formatMultiplier(h.multiplier)}x
                  </div>
                );
              })}
            </div>
          )}

          <div key={resultNonce} className="relative z-10 w-full max-w-362.5 h-full flex items-center justify-center">
            <div className="w-full grid grid-cols-3 gap-2 sm:gap-6 items-start py-8">
              {DRILLS.map((drill) => {
                const live = liveMultipliers[drill.id];
                const showMultiplier = gameState === "drilling" ? live : (finalMultipliers?.[drill.id] ?? live);
                
                const depths = DRILLS.map(d => {
                  const val = Math.max(0, Math.log(Math.max(1, liveMultipliers[d.id])));
                  const boosted = val + 0.6;
                  return Math.pow(boosted, 2.2) * 110;
                });
                const maxCurrentDepth = Math.max(...depths);

                const startOffset = 5; 
                const stopPoint = 65; 

                const viewOffset = Math.max(0, maxCurrentDepth - stopPoint);
                
                const logVal = Math.max(0, Math.log(Math.max(1, live)));
                const boosted = logVal + 0.6;
                const myDepth = Math.min(Math.pow(boosted, 2.2) * 110, 20000);

                const visualY = (myDepth - viewOffset) + startOffset;

                const isStillDrilling = gameState === "drilling" && live < (finalMultipliers?.[drill.id] ?? Infinity);
                const isSelected = selectedDrill === drill.id;
                
                return (
                  <div key={drill.id} className="flex flex-col items-center">
                    <div 
                      className="mb-4 w-full max-w-36 h-12 rounded-full flex items-center justify-center transition-colors duration-300 z-20 shadow-md border-b-4 border-black/20"
                      style={{ 
                        backgroundColor: isSelected ? drill.accent : "#334155",
                        color: isSelected ? "#0f172a" : "#e2e8f0"
                      }}
                    >
                      <span className="font-black text-lg sm:text-xl tracking-tight">
                        {formatMultiplier(showMultiplier)}×
                      </span>
                    </div>

                    <div className="relative w-full max-w-48 h-80 sm:h-[400px] lg:h-[500px] bg-[#0f172a] rounded-b-[4rem] rounded-t-3xl overflow-hidden border border-[#334155] shadow-inner">
                       <div className="absolute inset-y-0 left-1/2 -translate-x-1/2 w-32 bg-[#1e293b]/50" />

                       {fossils[drill.id]
                         .filter(f => f.top > viewOffset - 200 && f.top < viewOffset + 600)
                         .map((f, idx) => (
                           <Fossil key={idx} {...f} viewOffset={viewOffset} />
                         ))}

                      <div
                        className="absolute left-1/2 top-0 flex flex-col items-center z-10 w-full origin-top"
                        style={{
                          transform: `translate3d(-50%, ${visualY}px, 0)`,
                          transition: gameState === "drilling" ? "none" : "transform 400ms cubic-bezier(0.1, 0.5, 0.1, 1)",
                          willChange: 'transform'
                        }}
                      >
                        <div 
                          className="w-24 h-20 bg-[#334155] rounded-xl flex items-center justify-center relative shadow-xl z-20"
                        >
                            <div className="absolute bottom-0 inset-x-3 h-2 rounded-t-sm" style={{ backgroundColor: drill.accent }} />
                            
                            <GemIcon type={drill.gem} color={drill.accent} />
                        </div>

                        <DrillBit isSpinning={isStillDrilling} speedMultiplier={live} />
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          <style jsx global>{`
            @keyframes drill-bit-spin-p {
              from { transform: translateY(0%); }
              to { transform: translateY(100%); }
            }
            @keyframes drill-bit-vibe {
              0% { transform: translateX(0px); }
              25% { transform: translateX(1px); }
              75% { transform: translateX(-1px); }
              100% { transform: translateX(0px); }
            }
          `}</style>
        </div>

        <GameRecordsPanel gameId="drill" />
      </div>
    </div>
  );
}
