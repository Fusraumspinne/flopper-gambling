"use client";

import React, {
  useCallback,
  useEffect,
  useMemo,
  useState,
  useRef,
} from "react";
import { useWallet } from "@/components/WalletProvider";
import { useSoundVolume } from "@/components/SoundVolumeProvider";
import {
  PlayArrow,
  DirectionsWalk,
  Flag,
  LocalFireDepartment,
} from "@mui/icons-material";
import GameRecordsPanel from "@/components/GameRecordsPanel";

type RiskLevel = "low" | "medium" | "high" | "expert";
type GameState = "idle" | "walking" | "crashed" | "cashed";

type StepInfo = {
  step: number;
  multiplier: number;
  chance: number;
};

type CarAnim = {
  id: number;
  stepIndex: number;
  lane: number;
  duration: number;
  delay: number;
  size: number;
  color: string;
  spawnedAt: number;
  removing?: boolean;
  crash?: {
    phase: "from" | "to";
    fromY: number;
    toY: number;
    startedAt: number;
  };
};

type FireAnim = {
  id: number;
  stepIndex: number;
  endsAt: number;
};

type DeathType = "car" | "fire";
type DeathAnim = {
  type: DeathType;
  step: number;
  lane: number;
  startedAt: number;
  carBaseDurationMs?: number;
  carDelayMs?: number;
};

function RoadBlockade({ visible }: { visible: boolean }) {
  if (!visible) return null;
  return (
    <div
      className="chicken-blockade"
      aria-hidden
      style={{
        position: "absolute",
        left: "50%",
        top: -28,
        transform: "translateX(-50%)",
        width: 56,
        height: 18,
        borderRadius: 10,
        border: "2px solid rgba(0,0,0,0.25)",
        background:
          "repeating-linear-gradient(135deg, #ffffff 0px, #ffffff 8px, #f97316 8px, #f97316 16px)",
        boxShadow: "0 10px 16px rgba(0,0,0,0.35)",
        zIndex: 55,
        pointerEvents: "none",
      }}
    >
      <div
        style={{
          position: "absolute",
          left: 8,
          bottom: -10,
          width: 8,
          height: 12,
          borderRadius: 6,
          background: "rgba(255,255,255,0.85)",
          border: "1px solid rgba(0,0,0,0.18)",
        }}
      />
      <div
        style={{
          position: "absolute",
          right: 8,
          bottom: -10,
          width: 8,
          height: 12,
          borderRadius: 6,
          background: "rgba(255,255,255,0.85)",
          border: "1px solid rgba(0,0,0,0.18)",
        }}
      />
    </div>
  );
}

function Manhole({ active, fire }: { active: boolean; fire: boolean }) {
  return (
    <div
      className="relative w-16 h-16 flex items-center justify-center"
      style={{ zIndex: 40 }}
    >
      <div
        className={`absolute inset-0 rounded-full bg-[#233240] border-2 border-[#1b2733] shadow-[0_2px_6px_rgba(0,0,0,0.35)]`}
      />
      <div className="absolute w-12 h-12 rounded-full border-2 border-[#111c26] bg-[#1a2430]" />
      <div className="absolute w-10 h-10 rounded-full border-2 border-[#283645] bg-[#0f1924]" />
      <div className="absolute flex gap-1">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="w-1.5 h-6 rounded bg-[#0b141d]" />
        ))}
      </div>
      {fire && (
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="chicken-flame-wrap" aria-hidden>
            <div className="chicken-flame-glow" />
            <div className="chicken-flame-sparks" />
            <div className="chicken-flame" />
            <div className="chicken-flame chicken-flame--back" />
          </div>
          <LocalFireDepartment
            className="chicken-fire"
            sx={{ fontSize: 18, color: "#fed7aa" }}
          />
        </div>
      )}
    </div>
  );
}

function getColorForMultiplier(mult: number): string {
  if (mult >= 100) return "#ef4444";
  if (mult >= 10) return "#f97316";
  if (mult >= 2) return "#eab308";
  if (mult >= 1.25) return "#84cc16";
  return "#b1bad3";
}

function ChickenSprite({
  state,
  variant,
  flattened,
}: {
  state: "idle" | "walk" | "crash";
  variant?: "normal" | "burned";
  flattened?: boolean;
}) {
  const bodyColor = variant === "burned" ? "#a16207" : "#ffffff";
  const bodyShade = variant === "burned" ? "#b45309" : "#ffffff";
  return (
    <div
      className={
        `relative w-12 h-12 select-none pointer-events-none ` +
        (state === "walk" ? "chicken-bob" : "") +
        (state === "crash" && !flattened ? " chicken-crash" : "") +
        (flattened ? " chicken-flat" : "")
      }
    >
      <div
        className="absolute inset-1.5 rounded-full border border-[#2f4553] chicken-body"
        style={{ background: bodyColor }}
      />
      <div className="absolute left-3.5 top-4.5 w-5 h-6 rounded-full bg-[#eab308] opacity-25" />
      <div
        className={
          "absolute left-1.5 top-4.5 w-5 h-5 rounded-full border border-[#2f4553] chicken-wing " +
          (state === "walk" ? "chicken-flap" : "")
        }
        style={{ background: bodyShade }}
      />

      <div className="absolute left-4 top-4.5 w-2.5 h-2.5 rounded-full bg-[#0f212e]" />
      <div className="absolute left-6.75 top-4.5 w-2.5 h-2.5 rounded-full bg-[#0f212e]" />
      <div className="absolute left-4.25 top-4.75 w-1 h-1 rounded-full bg-white opacity-80" />
      <div className="absolute left-7 top-4.75 w-1 h-1 rounded-full bg-white opacity-80" />

      <div className="absolute left-5.75 top-6.5 w-0 h-0 border-l-[6px] border-l-[#f97316] border-t-4 border-t-transparent border-b-4 border-b-transparent" />

      <div className="absolute left-5 top-1.5 w-5 h-3 rounded-full bg-[#ef4444] border border-[#2f4553]" />

      <div className="absolute left-4 bottom-1 w-2 h-1.5 bg-[#f97316] rounded-sm" />
      <div className="absolute left-7 bottom-1 w-2 h-1.5 bg-[#f97316] rounded-sm" />
    </div>
  );
}

const STEP_TABLE: Record<RiskLevel, StepInfo[]> = {
  low: [
    { step: 1, multiplier: 1.03, chance: 95 },
    { step: 2, multiplier: 1.09, chance: 90 },
    { step: 3, multiplier: 1.15, chance: 85 },
    { step: 4, multiplier: 1.23, chance: 80 },
    { step: 5, multiplier: 1.31, chance: 75 },
    { step: 6, multiplier: 1.4, chance: 70 },
    { step: 7, multiplier: 1.51, chance: 65 },
    { step: 8, multiplier: 1.63, chance: 60 },
    { step: 9, multiplier: 1.78, chance: 55 },
    { step: 10, multiplier: 1.96, chance: 50 },
    { step: 11, multiplier: 2.18, chance: 45 },
    { step: 12, multiplier: 2.45, chance: 40 },
    { step: 13, multiplier: 2.8, chance: 35 },
    { step: 14, multiplier: 3.27, chance: 30 },
    { step: 15, multiplier: 3.92, chance: 25 },
    { step: 16, multiplier: 4.9, chance: 20 },
    { step: 17, multiplier: 6.53, chance: 15 },
    { step: 18, multiplier: 9.8, chance: 10 },
    { step: 19, multiplier: 19.6, chance: 5 },
  ],
  medium: [
    { step: 1, multiplier: 1.15, chance: 85 },
    { step: 2, multiplier: 1.37, chance: 71.578947 },
    { step: 3, multiplier: 1.64, chance: 59.649123 },
    { step: 4, multiplier: 2, chance: 49.122807 },
    { step: 5, multiplier: 2.46, chance: 39.912281 },
    { step: 6, multiplier: 3.07, chance: 31.929825 },
    { step: 7, multiplier: 3.91, chance: 25.087719 },
    { step: 8, multiplier: 5.08, chance: 19.298246 },
    { step: 9, multiplier: 6.77, chance: 14.473684 },
    { step: 10, multiplier: 9.31, chance: 10.526316 },
    { step: 11, multiplier: 13.3, chance: 7.368421 },
    { step: 12, multiplier: 19.95, chance: 4.912281 },
    { step: 13, multiplier: 31.92, chance: 3.070175 },
    { step: 14, multiplier: 55.86, chance: 1.754386 },
    { step: 15, multiplier: 111.72, chance: 0.877193 },
    { step: 16, multiplier: 279.3, chance: 0.350877 },
    { step: 17, multiplier: 1117.2, chance: 0.087719 },
  ],
  high: [
    { step: 1, multiplier: 1.31, chance: 75 },
    { step: 2, multiplier: 1.77, chance: 55.263158 },
    { step: 3, multiplier: 2.46, chance: 39.912281 },
    { step: 4, multiplier: 3.48, chance: 28.173375 },
    { step: 5, multiplier: 5.06, chance: 19.369195 },
    { step: 6, multiplier: 7.59, chance: 12.912797 },
    { step: 7, multiplier: 11.81, chance: 8.301084 },
    { step: 8, multiplier: 19.18, chance: 5.108359 },
    { step: 9, multiplier: 32.89, chance: 2.979876 },
    { step: 10, multiplier: 60.29, chance: 1.625387 },
    { step: 11, multiplier: 120.59, chance: 0.812693 },
    { step: 12, multiplier: 271.32, chance: 0.361197 },
    { step: 13, multiplier: 723.52, chance: 0.135449 },
    { step: 14, multiplier: 2532.32, chance: 0.0387 },
    { step: 15, multiplier: 15193.92, chance: 0.00645 },
  ],
  expert: [
    { step: 1, multiplier: 1.96, chance: 50 },
    { step: 2, multiplier: 4.14, chance: 23.684211 },
    { step: 3, multiplier: 9.31, chance: 10.526316 },
    { step: 4, multiplier: 22.61, chance: 4.334365 },
    { step: 5, multiplier: 60.29, chance: 1.625387 },
    { step: 6, multiplier: 180.88, chance: 0.541796 },
    { step: 7, multiplier: 633.08, chance: 0.154799 },
    { step: 8, multiplier: 2743.35, chance: 0.035723 },
    { step: 9, multiplier: 16460.08, chance: 0.005954 },
    { step: 10, multiplier: 181060.88, chance: 0.000541 },
  ],
};

const MAX_COLUMNS = Math.max(
  ...Object.values(STEP_TABLE).map((arr) => arr.length)
);

const TILE_W = 84;
const TILE_H = 112;
const TILE_GAP = 12;
const LANES = 3;
const MANHOLE_SIZE = 64;
const ROAD_TOP = 96;
const LANE_HEIGHT = 70;
const ROAD_HEIGHT = ROAD_TOP * 2 + LANES * LANE_HEIGHT;
const CAR_LANE_OFFSET_X = 18;
const CAR_SIZE = 40;

function formatMultiplier(mult: number) {
  if (mult >= 100000) return mult.toFixed(0);
  if (mult >= 10000) return mult.toFixed(1);
  if (mult >= 1000) return mult.toFixed(2);
  if (mult >= 10) return mult.toFixed(3);
  return mult.toFixed(4);
}

function formatChance(chance: number) {
  if (chance >= 1) return `${chance.toFixed(2)}%`;
  if (chance >= 0.1) return `${chance.toFixed(3)}%`;
  return `${chance.toFixed(4)}%`;
}

function sleep(ms: number) {
  return new Promise<void>((resolve) => setTimeout(resolve, ms));
}

function generateCarWave(args: {
  count: number;
  stepsLength: number;
  minStepIndex: number;
  maxStepIndex: number;
}): CarAnim[] {
  const { count, stepsLength, minStepIndex, maxStepIndex } = args;

  const min = Math.max(0, Math.min(minStepIndex, stepsLength));
  const max = Math.max(0, Math.min(maxStepIndex, stepsLength));
  if (max < min) return [];

  return Array.from({ length: count }, (_, i) => {
    const stepIndex = min + Math.floor(Math.random() * (max - min + 1));
    const colors = ["#ef4444", "#f59e0b", "#22c55e", "#3b82f6"];
    return {
      id: Date.now() + i,
      stepIndex,
      lane: Math.floor(Math.random() * LANES),
      // increased base duration for a slower, smoother spawn
      duration: 1600 + Math.random() * 900,
      delay: Math.random() * 900,
      size: 28 + Math.random() * 12,
      color: colors[Math.floor(Math.random() * colors.length)],
      spawnedAt: Date.now(),
    };
  });
}

function clampInt(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, Math.floor(n)));
}

function laneOffsetXPx(lane: number) {
  const mid = (LANES - 1) / 2;
  return (lane - mid) * CAR_LANE_OFFSET_X;
}

export default function ChickenPage() {
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
  const [risk, setRisk] = useState<RiskLevel>("low");
  const [gameState, setGameState] = useState<GameState>("idle");
  const [currentStep, setCurrentStep] = useState<number>(0);
  const [plannedSafeSteps, setPlannedSafeSteps] = useState<number | null>(null);
  const [lastWin, setLastWin] = useState<number>(0);
  const [isAnimatingStep, setIsAnimatingStep] = useState<boolean>(false);

  const [playMode, setPlayMode] = useState<"manual" | "auto">("manual");
  const [onWinMode, setOnWinMode] = useState<"reset" | "raise">("reset");
  const [onWinPctInput, setOnWinPctInput] = useState<string>("0");
  const [onLoseMode, setOnLoseMode] = useState<"reset" | "raise">("reset");
  const [onLosePctInput, setOnLosePctInput] = useState<string>("0");
  const [stopProfitInput, setStopProfitInput] = useState<string>("0");
  const [stopLossInput, setStopLossInput] = useState<string>("0");
  const [autoStepsInput, setAutoStepsInput] = useState<string>("1");
  const [isAutoBetting, setIsAutoBetting] = useState(false);
  const [fires, setFires] = useState<FireAnim[]>([]);
  const [carWaves, setCarWaves] = useState<CarAnim[]>([]);
  const [sparkAtStep, setSparkAtStep] = useState<number | null>(null);

  const [deathAnim, setDeathAnim] = useState<DeathAnim | null>(null);
  const [isFlat, setIsFlat] = useState<boolean>(false);
  const [isBurned, setIsBurned] = useState<boolean>(false);

  const roadScrollRef = useRef<HTMLDivElement | null>(null);
  const lastCarLaneRef = useRef<number>(Math.floor(Math.random() * LANES));
  const recentCarColsByLaneRef = useRef<number[][]>(
    Array.from({ length: LANES }, () => [])
  );

  const carRef = useRef<CarAnim[]>([]);
  useEffect(() => {
    carRef.current = carWaves;
  }, [carWaves]);

  const crashTimersRef = useRef<number[]>([]);
  useEffect(() => {
    return () => {
      crashTimersRef.current.forEach((t) => window.clearTimeout(t));
      crashTimersRef.current = [];
    };
  }, []);

  const resultTimeoutRef = useRef<number | null>(null);
  const [resultFx, setResultFx] = useState<"rolling" | "win" | "lose" | null>(
    null
  );

  const audioRef = useRef<{
    bet: HTMLAudioElement | null;
    win: HTMLAudioElement | null;
    chickenJump: HTMLAudioElement | null;
    chickenFire: HTMLAudioElement | null;
    chickenSquash: HTMLAudioElement | null;
    barricade: HTMLAudioElement | null;
    chickenCarCrash: HTMLAudioElement | null;
  }>({
    bet: null,
    win: null,
    chickenJump: null,
    chickenFire: null,
    chickenSquash: null,
    barricade: null,
    chickenCarCrash: null,
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

  useEffect(() => {
    if (volume <= 0) return;

    if (!audioRef.current.bet) {
      audioRef.current = {
        bet: new Audio("/sounds/Bet.mp3"),
        win: new Audio("/sounds/Win.mp3"),
        chickenJump: new Audio("/sounds/ChickenJump.mp3"),
        chickenFire: new Audio("/sounds/ChickenFire.mp3"),
        chickenSquash: new Audio("/sounds/ChickenSquash.mp3"),
        barricade: new Audio("/sounds/Barricade.mp3"),
        chickenCarCrash: new Audio("/sounds/ChickenCarCrash.mp3"),
      };
    }

    const prime = async () => {
      try {
        const items = Object.values(audioRef.current) as HTMLAudioElement[];
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

  const [isCrashBlocking, setIsCrashBlocking] = useState(false);
  const isCrashBlockingRef = useRef<boolean>(false);

  const betAmountRef = useRef<number>(betAmount);
  const balanceRef = useRef<number>(balance);
  const riskRef = useRef<RiskLevel>(risk);
  const gameStateRef = useRef<GameState>(gameState);
  const currentStepRef = useRef<number>(currentStep);
  const plannedSafeStepsRef = useRef<number | null>(plannedSafeSteps);
  const isAnimatingStepRef = useRef<boolean>(isAnimatingStep);
  const isAutoBettingRef = useRef<boolean>(false);
  const autoOriginalBetRef = useRef<number>(0);

  useEffect(() => {
    return () => {
      if (resultTimeoutRef.current) {
        window.clearTimeout(resultTimeoutRef.current);
        resultTimeoutRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    isCrashBlockingRef.current = isCrashBlocking;
  }, [isCrashBlocking]);

  useEffect(() => {
    betAmountRef.current = betAmount;
  }, [betAmount]);
  useEffect(() => {
    balanceRef.current = balance;
  }, [balance]);
  useEffect(() => {
    riskRef.current = risk;
  }, [risk]);
  useEffect(() => {
    gameStateRef.current = gameState;
  }, [gameState]);
  useEffect(() => {
    currentStepRef.current = currentStep;
  }, [currentStep]);
  useEffect(() => {
    plannedSafeStepsRef.current = plannedSafeSteps;
  }, [plannedSafeSteps]);
  useEffect(() => {
    isAnimatingStepRef.current = isAnimatingStep;
  }, [isAnimatingStep]);
  useEffect(() => {
    isAutoBettingRef.current = isAutoBetting;
  }, [isAutoBetting]);

  const steps = useMemo(() => STEP_TABLE[risk], [risk]);

  const stepsMax = steps.length;
  useEffect(() => {
    const max = stepsMax;
    if (max <= 0) return;
    const n = Math.floor(parseNumberLoose(autoStepsInput));
    const clamped = clampInt(Number.isFinite(n) ? n : 1, 1, max);
    if (String(clamped) !== autoStepsInput.trim()) {
      setAutoStepsInput(String(clamped));
    }
  }, [autoStepsInput, stepsMax]);

  const multiplierForStep = useCallback((args: { step: number; risk: RiskLevel }) => {
    const step = args.step;
    const risk = args.risk;
    const arr = STEP_TABLE[risk];
    if (!arr || arr.length === 0) return 1;
    if (step <= 0) return 1;
    const entry = arr[Math.min(step - 1, arr.length - 1)];
    return entry?.multiplier ?? 1;
  }, []);

  const currentMultiplier = useMemo(() => {
    if (currentStep === 0) return 1;
    const entry = steps[Math.min(currentStep - 1, steps.length - 1)];
    return entry?.multiplier ?? 1;
  }, [currentStep, steps]);

  const nextInfo = steps[currentStep] ?? null;

  const currentWin =
    gameState === "walking" ? betAmount * currentMultiplier : 0;
  const potentialWin = currentWin;
  const nextStep =
    steps[currentStep] ?? steps[Math.min(currentStep, steps.length - 1)];
  const cashoutValue = betAmount * currentMultiplier;

  const canWalk =
    gameState === "walking" && !isAnimatingStep && currentStep < steps.length;
  const canCashout = gameState === "walking" && currentStep > 0;

  const computeSafePath = useCallback(() => {
    const entries = STEP_TABLE[risk];
    if (!entries || entries.length === 0) return 0;
    const roll = Math.random() * 100;
    let safe = 0;
    for (const entry of entries) {
      if (roll <= entry.chance) {
        safe += 1;
      } else {
        break;
      }
    }
    return safe;
  }, [risk]);

  const resetVisuals = useCallback(() => {
    setFires([]);
    setCarWaves([]);
    setDeathAnim(null);
    setIsFlat(false);
    setIsBurned(false);
  }, []);

  const startRound = useCallback(() => {
    const bet = normalizeMoney(betAmountRef.current);
    if (bet <= 0) return;
    if (bet > balanceRef.current) return;
    if (gameStateRef.current === "walking") return;

    subtractFromBalance(bet);
    playAudio(audioRef.current.bet);
    setGameState("walking");
    gameStateRef.current = "walking";
    setCurrentStep(0);
    currentStepRef.current = 0;
    setLastWin(0);

    const safeSteps = computeSafePath();
    setPlannedSafeSteps(safeSteps);
    plannedSafeStepsRef.current = safeSteps;
    resetVisuals();
    if (resultTimeoutRef.current) {
      window.clearTimeout(resultTimeoutRef.current);
      resultTimeoutRef.current = null;
    }
    setResultFx("rolling");
  }, [computeSafePath, resetVisuals, subtractFromBalance]);

  const handleCrash = useCallback(
    (crashStep?: number) => {
      const step = clampInt(
        crashStep ?? currentStepRef.current,
        0,
        STEP_TABLE[riskRef.current].length
      );
      const type: DeathType = Math.random() < 0.7 ? "car" : "fire";
      const lane = Math.floor(Math.random() * LANES);

      const carBaseDurationMs =
        type === "car" ? 1800 + Math.random() * 800 : undefined;
      const carDelayMs = type === "car" ? Math.random() * 400 : undefined;

      setDeathAnim({
        type,
        step,
        lane,
        startedAt: Date.now(),
        carBaseDurationMs,
        carDelayMs,
      });
      // play appropriate death sound
      if (type === "fire") {
        playAudio(audioRef.current.chickenFire);
      } else {
        playAudio(audioRef.current.chickenSquash);
      }
      if (resultTimeoutRef.current) {
        window.clearTimeout(resultTimeoutRef.current);
      }
      setResultFx("lose");
      // keep the crash-block active until the lose FX timeout finishes
      setIsCrashBlocking(true);
      isCrashBlockingRef.current = true;
      setGameState("crashed");
      gameStateRef.current = "crashed";
      resultTimeoutRef.current = window.setTimeout(() => {
        setResultFx(null);
        resultTimeoutRef.current = null;
        setIsCrashBlocking(false);
        isCrashBlockingRef.current = false;
      }, 500);
      finalizePendingLoss();
    },
    [finalizePendingLoss]
  );

  const handleCashout = useCallback(
    (auto = false) => {
      const step = currentStepRef.current;
      if (step === 0) return;
      const bet = normalizeMoney(betAmountRef.current);
      const mult = multiplierForStep({ step, risk: riskRef.current });
      const payout = normalizeMoney(bet * mult);
      addToBalance(payout);
      setLastWin(payout);
      setGameState("cashed");
      gameStateRef.current = "cashed";
      if (auto) {
        setIsAnimatingStep(false);
        isAnimatingStepRef.current = false;
      }
      if (resultTimeoutRef.current) {
        window.clearTimeout(resultTimeoutRef.current);
      }
      setResultFx("win");
      playAudio(audioRef.current.win);
      resultTimeoutRef.current = window.setTimeout(() => setResultFx(null), 900);
    },
    [addToBalance, multiplierForStep]
  );

  type RoundResult = {
    betAmount: number;
    winAmount: number;
    stepsTarget: number;
    stepsReached: number;
    didCrash: boolean;
  };

  const playRound = useCallback(
    async (opts?: { betAmount?: number; stepsTarget?: number }) => {
      const stepsArr = STEP_TABLE[riskRef.current];
      const stepsLen = stepsArr.length;
      if (stepsLen <= 0) return null as null | RoundResult;

      if (gameStateRef.current === "walking") return null as null | RoundResult;
      if (isAnimatingStepRef.current) return null as null | RoundResult;

      const bet = normalizeMoney(opts?.betAmount ?? betAmountRef.current);
      if (bet <= 0 || bet > balanceRef.current) return null as null | RoundResult;

      const desiredSteps = Math.floor(
        parseNumberLoose(opts?.stepsTarget != null ? String(opts.stepsTarget) : autoStepsInput)
      );
      const stepsTarget = clampInt(
        Number.isFinite(desiredSteps) ? desiredSteps : 1,
        1,
        stepsLen
      );

      subtractFromBalance(bet);
      playAudio(audioRef.current.bet);
      setGameState("walking");
      gameStateRef.current = "walking";
      setCurrentStep(0);
      currentStepRef.current = 0;
      setLastWin(0);

      const safeSteps = computeSafePath();
      setPlannedSafeSteps(safeSteps);
      plannedSafeStepsRef.current = safeSteps;
      resetVisuals();

      if (resultTimeoutRef.current) {
        window.clearTimeout(resultTimeoutRef.current);
        resultTimeoutRef.current = null;
      }
      setResultFx("rolling");

      for (let i = 0; i < stepsTarget; i++) {
        setIsAnimatingStep(true);
        isAnimatingStepRef.current = true;
        await sleep(260);

        const next = currentStepRef.current + 1;
        const safeLimit = plannedSafeStepsRef.current ?? stepsLen;

        if (next > stepsLen) {
          setIsAnimatingStep(false);
          isAnimatingStepRef.current = false;
          break;
        }

        if (next > safeLimit) {
          setCurrentStep(next);
          currentStepRef.current = next;
          setIsAnimatingStep(false);
          isAnimatingStepRef.current = false;

          handleCrash(next);
          await sleep(900);
          return {
            betAmount: bet,
            winAmount: 0,
            stepsTarget,
            stepsReached: next,
            didCrash: true,
          };
        }

        setCurrentStep(next);
        // step sound + barricade placement sound
        playAudio(audioRef.current.chickenJump);
        playAudio(audioRef.current.barricade);
        currentStepRef.current = next;
        setIsAnimatingStep(false);
        isAnimatingStepRef.current = false;

        if (next === stepsLen && safeLimit >= stepsLen) {
          handleCashout(true);
          const mult = multiplierForStep({ step: next, risk: riskRef.current });
          const winAmount = normalizeMoney(bet * mult);
          await sleep(900);
          return {
            betAmount: bet,
            winAmount,
            stepsTarget,
            stepsReached: next,
            didCrash: false,
          };
        }
      }

      const reached = currentStepRef.current;
      if (reached > 0) {
        handleCashout(true);
        const mult = multiplierForStep({ step: reached, risk: riskRef.current });
        const winAmount = normalizeMoney(bet * mult);
        await sleep(900);
        return {
          betAmount: bet,
          winAmount,
          stepsTarget,
          stepsReached: reached,
          didCrash: false,
        };
      }

      await sleep(900);
      return {
        betAmount: bet,
        winAmount: 0,
        stepsTarget,
        stepsReached: 0,
        didCrash: true,
      };
    },
    [
      autoStepsInput,
      computeSafePath,
      handleCashout,
      handleCrash,
      multiplierForStep,
      resetVisuals,
      subtractFromBalance,
    ]
  );

  const stopAutoBet = useCallback(() => {
    isAutoBettingRef.current = false;
    setIsAutoBetting(false);
    void syncBalance();
  }, [syncBalance]);

  const startAutoBet = useCallback(async () => {
    if (isAutoBettingRef.current) return;
    if (gameStateRef.current === "walking") return;
    if (isAnimatingStepRef.current) return;

    const startingBet = normalizeMoney(betAmountRef.current);
    if (startingBet <= 0 || startingBet > balanceRef.current) return;

    autoOriginalBetRef.current = startingBet;

    isAutoBettingRef.current = true;
    setIsAutoBetting(true);

    while (isAutoBettingRef.current) {
      const stopProfit = Math.max(0, normalizeMoney(parseNumberLoose(stopProfitInput)));
      const stopLoss = Math.max(0, normalizeMoney(parseNumberLoose(stopLossInput)));
      const onWinPct = Math.max(0, parseNumberLoose(onWinPctInput));
      const onLosePct = Math.max(0, parseNumberLoose(onLosePctInput));

      const stepsLen = STEP_TABLE[riskRef.current].length;
      const desiredSteps = Math.floor(parseNumberLoose(autoStepsInput));
      const stepsTarget = clampInt(
        Number.isFinite(desiredSteps) ? desiredSteps : 1,
        1,
        Math.max(1, stepsLen)
      );

      const roundBet = normalizeMoney(betAmountRef.current);
      if (roundBet <= 0) break;
      if (roundBet > balanceRef.current) break;

      const result = await playRound({ betAmount: roundBet, stepsTarget });
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
    void syncBalance();
  }, [
    autoStepsInput,
    onLoseMode,
    onLosePctInput,
    onWinMode,
    onWinPctInput,
    playRound,
    stopAutoBet,
    stopLossInput,
    stopProfitInput,
    syncBalance,
  ]);

  const changePlayMode = useCallback(
    (mode: "manual" | "auto") => {
      try {
        stopAutoBet();
      } catch {
      }

      if (resultTimeoutRef.current) {
        window.clearTimeout(resultTimeoutRef.current);
        resultTimeoutRef.current = null;
      }

      setGameState("idle");
      gameStateRef.current = "idle";
      setCurrentStep(0);
      currentStepRef.current = 0;
      setPlannedSafeSteps(null);
      plannedSafeStepsRef.current = null;
      setIsAnimatingStep(false);
      isAnimatingStepRef.current = false;
      setLastWin(0);
      setResultFx(null);
      resetVisuals();

      setBetBoth(100);
      betAmountRef.current = 100;
      setRisk("low");
      riskRef.current = "low";

      setAutoStepsInput("1");
      setOnWinMode("reset");
      setOnWinPctInput("0");
      setOnLoseMode("reset");
      setOnLosePctInput("0");
      setStopProfitInput("0");
      setStopLossInput("0");

      isAutoBettingRef.current = false;
      setIsAutoBetting(false);
      autoOriginalBetRef.current = 0;

      setPlayMode(mode);
    },
    [resetVisuals, stopAutoBet]
  );

  const walkOneStep = useCallback(async () => {
    if (!canWalk) return;
    setIsAnimatingStep(true);
    await sleep(260);

    const nextStep = currentStep + 1;
    const safeLimit = plannedSafeSteps ?? steps.length;

    if (nextStep > steps.length) {
      setIsAnimatingStep(false);
      return;
    }

    if (nextStep > safeLimit) {
      setCurrentStep(nextStep);
      setIsAnimatingStep(false);
      handleCrash(nextStep);
      return;
    }

    setCurrentStep(nextStep);
    // play jump + barricade sound for the step
    playAudio(audioRef.current.chickenJump);
    playAudio(audioRef.current.barricade);
    setIsAnimatingStep(false);

    if (nextStep === steps.length && safeLimit >= steps.length) {
      handleCashout(true);
    }
  }, [
    canWalk,
    currentStep,
    plannedSafeSteps,
    steps,
    handleCrash,
    handleCashout,
  ]);

  useEffect(() => {
    const TARGET_CARS_PER_SEC_PER_LANE = 2;
    const SPAWN_RATE_SCALE = 0.75;
    const tickMs = 100;
    const fadeMs = 240;

    const MAX_VISIBLE_PER_LANE = 6;
    const MAX_VISIBLE_GLOBAL = 18;

    const riskFactor =
      risk === "low"
        ? 1
        : risk === "medium"
        ? 1.05
        : risk === "high"
        ? 1.1
        : 1.15;
    const laneRate =
      TARGET_CARS_PER_SEC_PER_LANE * SPAWN_RATE_SCALE * riskFactor;

    const SPEED_MULTIPLIER = 1.3;

    const spawnCarAt = (args: { stepIndex: number; lane: number }) => {
      const { stepIndex, lane } = args;
      const now = Date.now();
      const duration = 1800 + Math.random() * 800;
      const car: CarAnim = {
        id: now + stepIndex + Math.floor(Math.random() * 10000),
        stepIndex,
        lane,
        duration,
        delay: Math.random() * 300,
        size: CAR_SIZE,
        color: ["#ef4444", "#f59e0b", "#22c55e", "#3b82f6"][
          Math.floor(Math.random() * 4)
        ],
        spawnedAt: now,
        removing: false,
      };

      setCarWaves((prev) => [...prev, car]);

      const driveTimeMs = Math.max(120, duration / 3 / SPEED_MULTIPLIER);
      const removeAfter = Math.max(220, driveTimeMs + 260) + (car.delay || 0);
      const markFadeAt = Math.max(80, removeAfter - fadeMs);

      window.setTimeout(() => {
        setCarWaves((prev) =>
          prev.map((c) =>
            c.id === car.id && !c.crash ? { ...c, removing: true } : c
          )
        );
      }, markFadeAt);

      window.setTimeout(() => {
        setCarWaves((prev) => prev.filter((c) => c.id !== car.id || !!c.crash));
      }, removeAfter + 60);
    };

    const pickSpawnColumnForLane = (args: {
      min: number;
      max: number;
      lane: number;
      visible: CarAnim[];
    }): number | null => {
      const { min, max, lane, visible } = args;

      const visibleInLane = visible.filter((c) => c.lane === lane);
      const occupiedInLane = new Set(visibleInLane.map((c) => c.stepIndex));

      const recent = recentCarColsByLaneRef.current[lane] ?? [];
      const recentSet = new Set(recent);

      for (let i = 0; i < 16; i++) {
        const col = min + Math.floor(Math.random() * (max - min + 1));
        if (occupiedInLane.has(col)) continue;
        if (recentSet.has(col) && Math.random() < 0.7) continue;
        return col;
      }

      for (let col = min; col <= max; col++) {
        if (!occupiedInLane.has(col)) return col;
      }

      return null;
    };

    const id = window.setInterval(() => {
      if (steps.length <= 0) return;

      const min = Math.max(1, currentStep + 1);
      const max = steps.length;
      if (min > max) return;

      const visibleCars = carRef.current.filter((c) => !c.removing);
      if (visibleCars.length >= MAX_VISIBLE_GLOBAL) return;

      const dtSeconds = tickMs / 1000;
      const perLaneSpawnP = 1 - Math.exp(-laneRate * dtSeconds);

      const visibleByLane = Array.from({ length: LANES }, (_, lane) =>
        visibleCars.filter((c) => c.lane === lane)
      );

      for (let lane = 0; lane < LANES; lane++) {
        if (visibleCars.length >= MAX_VISIBLE_GLOBAL) break;
        if (visibleByLane[lane].length >= MAX_VISIBLE_PER_LANE) continue;

        if (Math.random() < perLaneSpawnP) {
          const col = pickSpawnColumnForLane({
            min,
            max,
            lane,
            visible: visibleCars,
          });
          if (col === null) continue;

          spawnCarAt({ stepIndex: col, lane });

          const recent = recentCarColsByLaneRef.current[lane] ?? [];
          recent.unshift(col);
          recentCarColsByLaneRef.current[lane] = recent.slice(0, 4);

          lastCarLaneRef.current = lane;
        }
      }
    }, tickMs);

    return () => window.clearInterval(id);
  }, [currentStep, gameState, risk, steps.length]);

  useEffect(() => {
    if (gameState !== "walking") return;
    if (currentStep <= 0) return;

    const now = Date.now();
    const driveDistanceY = ROAD_HEIGHT + 28;
    const manholeTopPxLocal = ROAD_TOP + LANES * LANE_HEIGHT - MANHOLE_SIZE / 2;
    const barrierTranslateY = manholeTopPxLocal - 108;
    const animStartY = -32;
    const animEndY = driveDistanceY;

    const idsToCrash = carRef.current
      .filter((c) => c.stepIndex === currentStep && !c.removing && !c.crash)
      .map((c) => c.id);

    if (idsToCrash.length === 0) return;

    // play car->barricade crash sound
    playAudio(audioRef.current.chickenCarCrash);

    const computeCurrentY = (car: CarAnim) => {
      const durationMs = Math.max(1, car.duration / 3 / 2);
      const delayMs = car.delay ?? 0;
      const t = now - car.spawnedAt - delayMs;
      const p = Math.max(0, Math.min(1, t / durationMs));
      return animStartY + p * (animEndY - animStartY);
    };

    setCarWaves((prev) =>
      prev.map((c) => {
        if (!idsToCrash.includes(c.id)) return c;
        const fromY = computeCurrentY(c);
        return {
          ...c,
          crash: {
            phase: "from",
            fromY,
            toY: barrierTranslateY,
            startedAt: now,
          },
        };
      })
    );

    crashTimersRef.current.push(
      window.setTimeout(() => {
        setCarWaves((prev) =>
          prev.map((c) => {
            if (!idsToCrash.includes(c.id)) return c;
            if (!c.crash || c.crash.phase !== "from") return c;
            return { ...c, crash: { ...c.crash, phase: "to" } };
          })
        );
      }, 16)
    );
  }, [currentStep, gameState]);

  useEffect(() => {
    const riskFactor =
      risk === "low"
        ? 1
        : risk === "medium"
        ? 1.2
        : risk === "high"
        ? 1.45
        : 1.7;
    const intervalMs = Math.round(1100 / riskFactor);

    const id = window.setInterval(() => {
      if (steps.length <= 0) return;

      const now = Date.now();
      setFires((prev) => {
        const cleaned = prev.filter((f) => f.endsAt > now);

        const min = Math.max(1, currentStep + 1);
        const max = steps.length;
        if (min > max) return cleaned;

        const spawnCount =
          Math.random() < 0.4 ? 0 : Math.random() < 0.8 ? 1 : 2;
        const next = [...cleaned];

        for (let i = 0; i < spawnCount; i++) {
          const stepIndex = min + Math.floor(Math.random() * (max - min + 1));
          if (next.some((f) => f.stepIndex === stepIndex && f.endsAt > now))
            continue;
          next.push({
            id: now + i + Math.floor(Math.random() * 10000),
            stepIndex,
            endsAt: now + (650 + Math.random() * 650),
          });
        }

        return next;
      });
    }, intervalMs);

    return () => window.clearInterval(id);
  }, [currentStep, gameState, risk, steps.length]);

  useEffect(() => {
    setPlannedSafeSteps(null);
    setCurrentStep(0);
    setGameState("idle");
    resetVisuals();
  }, [risk, resetVisuals]);

  useEffect(() => {
    return () => {
      isAutoBettingRef.current = false;
    };
  }, []);

  useEffect(() => {
    if (gameState !== "walking") {
      setSparkAtStep(null);
      return;
    }
    if (currentStep <= 0) return;
    setSparkAtStep(currentStep);
    const id = window.setTimeout(() => setSparkAtStep(null), 260);
    return () => window.clearTimeout(id);
  }, [currentStep, gameState]);

  const riskLabel = useMemo(() => {
    switch (risk) {
      case "low":
        return "Easy";
      case "medium":
        return "Medium";
      case "high":
        return "Hard";
      case "expert":
        return "Expert";
      default:
        return "";
    }
  }, [risk]);

  const roadWidthPx =
    (steps.length + 2) * TILE_W + (steps.length + 1) * TILE_GAP;
  const manholeTopPx = ROAD_TOP + LANES * LANE_HEIGHT - MANHOLE_SIZE / 2;

  const stepCenterX = (stepIndex: number) => {
    const idx = clampInt(stepIndex, 0, steps.length);
    return idx * (TILE_W + TILE_GAP) + TILE_W / 2;
  };

  useEffect(() => {
    const el = roadScrollRef.current;
    if (!el) return;

    const containerW = el.clientWidth;
    if (containerW <= 0) return;

    const idx = clampInt(currentStep, 0, steps.length);
    const centerX = idx * (TILE_W + TILE_GAP) + TILE_W / 2;

    const maxScroll = Math.max(0, roadWidthPx - containerW);
    const targetLeft = Math.max(
      0,
      Math.min(maxScroll, centerX - containerW / 2)
    );

    el.scrollTo({
      left: targetLeft,
      behavior: gameState === "walking" ? "smooth" : "auto",
    });
  }, [currentStep, gameState, roadWidthPx, steps.length]);

  const chickenLeftPx = stepCenterX(currentStep) - 24;
  const chickenTopPx = manholeTopPx + MANHOLE_SIZE / 2 - 24;
  const chickenState: "idle" | "walk" | "crash" =
    gameState === "walking"
      ? "walk"
      : gameState === "crashed" && deathAnim?.type === "fire"
      ? "crash"
      : "idle";
  const chickenVariant: "normal" | "burned" = isBurned ? "burned" : "normal";

  useEffect(() => {
    if (gameState !== "crashed" || !deathAnim) return;

    setIsFlat(false);
    setIsBurned(false);

    const timers: number[] = [];

    if (deathAnim.type === "car") {
      const topPx = 8;
      const startY = -32;
      const endY = ROAD_HEIGHT + 28;

      const base = deathAnim.carBaseDurationMs ?? 2100;
      const delay = deathAnim.carDelayMs ?? 0;
      const animDurationMs = base / 3 / 2;

      const desiredY = chickenTopPx + 18 - topPx;
      const progress = Math.max(
        0,
        Math.min(1, (desiredY - startY) / (endY - startY))
      );
      const impactMs = Math.round(delay + animDurationMs * progress);

      timers.push(window.setTimeout(() => setIsFlat(true), impactMs));
    } else {
      timers.push(window.setTimeout(() => setIsBurned(true), 260));
    }

    return () => {
      timers.forEach((t) => window.clearTimeout(t));
    };
  }, [chickenTopPx, deathAnim?.startedAt, deathAnim?.type, gameState]);

  const isBusy = gameState === "walking" || isAutoBetting;

  return (
    <>
    <div className="p-2 sm:p-4 lg:p-6 max-w-350 mx-auto flex flex-col lg:flex-row gap-4 lg:gap-8 overflow-x-hidden">
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
                betAmountRef.current = normalizeMoney(num);
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
                betAmountRef.current = normalizeMoney(newBet);
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
                betAmountRef.current = normalizeMoney(newBet);
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
                betAmountRef.current = normalizeMoney(newBet);
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
            {(["low", "medium", "high", "expert"] as RiskLevel[]).map(
              (level) => (
                <button
                  key={level}
                  onClick={() => setRisk(level)}
                  disabled={isBusy}
                  className={`flex-1 py-2 text-[10px] font-bold uppercase rounded transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${
                    risk === level
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

        {playMode === "auto" && (
          <>
            <div className="space-y-2">
              <label className="text-xs font-bold text-[#b1bad3] uppercase tracking-wider">
                Steps
              </label>
              <input
                type="number"
                min={1}
                max={steps.length}
                value={autoStepsInput}
                onChange={(e) => setAutoStepsInput(e.target.value)}
                onBlur={() => {
                  const max = Math.max(1, steps.length);
                  const raw = autoStepsInput.trim();
                  const sanitized = raw.replace(/^0+(?=\d)/, "") || "0";
                  const n = Math.floor(parseNumberLoose(sanitized));
                  const clamped = clampInt(Number.isFinite(n) ? n : 1, 1, max);
                  setAutoStepsInput(String(clamped));
                }}
                disabled={isBusy}
                className="w-full bg-[#0f212e] border border-[#2f4553] rounded-md py-2 px-4 text-white font-mono focus:outline-none focus:border-[#00e701] transition-colors disabled:opacity-50"
              />
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
          </>
        )}

        <div>
          {playMode === "manual" ? (
            gameState === "walking" ? (
              <div className="flex flex-col gap-3">
                <div className="grid grid-cols-2 gap-2">
                  <button
                    onClick={walkOneStep}
                    disabled={!canWalk}
                    className="bg-[#2f4553] hover:bg-[#3e5666] text-white py-3 rounded-md font-bold text-lg transition-all active:scale-95 flex items-center justify-center gap-2 disabled:opacity-50"
                  >
                    Step
                  </button>
                  <button
                    onClick={() => handleCashout(false)}
                    disabled={!canCashout}
                    className="bg-[#00e701] hover:bg-[#00c201] text-black py-3 rounded-md font-bold text-lg shadow-[0_0_20px_rgba(0,231,1,0.2)] transition-all active:scale-95 flex items-center justify-center gap-2 disabled:opacity-50"
                  >
                    Cashout
                  </button>
                </div>
              </div>
            ) : (
              <button
                onClick={startRound}
                disabled={isAutoBetting || isCrashBlocking}
                className="w-full bg-[#00e701] hover:bg-[#00c201] disabled:opacity-50 disabled:cursor-not-allowed text-black py-3 rounded-md font-bold text-lg shadow-[0_0_20px_rgba(0,231,1,0.2)] transition-all active:scale-95 flex items-center justify-center gap-2"
              >
                <PlayArrow /> Bet
              </button>
            )
          ) : !isAutoBetting ? (
            <button
              onClick={startAutoBet}
              disabled={gameState === "walking"}
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
        </div>

        {gameState == "walking" && (
          <div className="bg-[#0f212e] p-4 rounded border border-[#2f4553] text-center">
            <div className="text-[#b1bad3] text-sm">Current Win</div>
            <div className="text-2xl font-bold text-[#00e701]">
              ${potentialWin.toFixed(2)}
            </div>
            <div className="text-sm text-[#b1bad3] mt-1">
              Next: {nextStep.multiplier}x
            </div>
          </div>
        )}

        {gameState === "cashed" && lastWin > 0 && (
          <div className="p-4 rounded-md bg-[#213743] border border-[#00e701] text-center">
            <div className="text-xs uppercase text-[#b1bad3]">You Won</div>
            <div className="text-2xl font-bold text-[#00e701]">
              ${lastWin.toFixed(2)}
            </div>
          </div>
        )}
      </div>

      <div className="flex-1 min-w-0 flex flex-col gap-4 overflow-x-hidden">
        <div className="bg-[#0f212e] rounded-xl p-3 sm:p-4 relative overflow-hidden min-h-125 border border-[#152a38]">
            {resultFx === "rolling" && (
              <div className="limbo-roll-glow absolute inset-0 pointer-events-none z-0" />
            )}
            {resultFx === "win" && (
              <div className="limbo-win-flash absolute inset-0 pointer-events-none z-0" />
            )}
            {resultFx === "lose" && (
              <div className="limbo-lose-flash absolute inset-0 pointer-events-none z-0" />
            )}

          <div
            className="relative w-full min-w-0"
            style={{ minHeight: ROAD_HEIGHT + 32 }}
          >
            <div
              ref={roadScrollRef}
              className="relative w-full max-w-full overflow-x-auto overflow-y-hidden chicken-scroll"
            >
              <div
                className="relative"
                style={{ width: roadWidthPx, height: ROAD_HEIGHT + 24 }}
              >
                <div className="absolute inset-0 pointer-events-none">
                  {carWaves.map((car) => (
                    <div
                      key={`${car.id}-${car.stepIndex}-${car.lane}`}
                      className={`absolute chicken-car${
                        car.removing ? " removing" : ""
                      }${car.crash ? " chicken-car-barrier-crash" : ""}`}
                      style={{
                        left: `${stepCenterX(car.stepIndex)}px`,
                        top: 8,
                        width: `${CAR_SIZE}px`,
                        height: `${CAR_SIZE * 1.7}px`,
                        opacity: 0.95,
                        background: car.color,
                        ["--drive-distance-y" as any]: `${ROAD_HEIGHT + 28}px`,
                        animationName: car.crash ? "none" : undefined,
                        animationDuration: car.crash
                          ? undefined
                          : `${car.duration / 3 / 2}ms`,
                        animationDelay: car.crash
                          ? undefined
                          : `${car.delay}ms`,
                        transform: car.crash
                          ? `translate(-50%, ${
                              car.crash.phase === "from"
                                ? car.crash.fromY
                                : car.crash.toY
                            }px)`
                          : undefined,
                      }}
                    >
                      <div className="car-window" />
                      <div className="car-light car-light-left" />
                      <div className="car-light car-light-right" />
                    </div>
                  ))}
                </div>

                <div
                  className="absolute left-0 right-0 rounded-xl border border-[#152a38] overflow-hidden"
                  style={{ top: 8, height: ROAD_HEIGHT + 8, zIndex: 6 }}
                >
                  {Array.from({ length: steps.length + 2 }).map((_, colIdx) => {
                    const left = colIdx * (TILE_W + TILE_GAP);
                    const isStartCol = colIdx === 0;
                    const isEndCol = colIdx === steps.length + 1;
                    const isGrassCol = isStartCol || isEndCol;
                    const bg = isGrassCol ? "#6bbf59" : "#0e1c27";
                    const innerShadow = isGrassCol
                      ? "inset 0 -4px 10px rgba(0,0,0,0.06)"
                      : "inset 0 1px 0 rgba(255,255,255,0.02)";
                    const border = isGrassCol
                      ? "1px solid rgba(0,0,0,0.06)"
                      : undefined;
                    return (
                      <div
                        key={colIdx}
                        className="absolute rounded-md"
                        style={{
                          left,
                          top: 0,
                          width: TILE_W,
                          height: ROAD_HEIGHT + 8,
                          background: bg,
                          boxShadow: innerShadow,
                          border: border,
                        }}
                      >
                        {isGrassCol && (
                          <>
                            <div
                              aria-hidden
                              style={{
                                position: "absolute",
                                top: 0,
                                ...(isStartCol ? { right: 0 } : { left: 0 }),
                                width: 12,
                                height: "100%",
                                background: isStartCol
                                  ? "linear-gradient(90deg, rgba(15,33,46,0.0) 0%, rgba(0,0,0,0.10) 22%, rgba(148,163,184,0.85) 55%, rgba(226,232,240,0.95) 100%)"
                                  : "linear-gradient(270deg, rgba(15,33,46,0.0) 0%, rgba(0,0,0,0.10) 22%, rgba(148,163,184,0.85) 55%, rgba(226,232,240,0.95) 100%)",
                                ...(isStartCol
                                  ? {
                                      borderLeft: "1px solid rgba(0,0,0,0.22)",
                                      boxShadow:
                                        "inset 1px 0 0 rgba(255,255,255,0.18)",
                                    }
                                  : {
                                      borderRight: "1px solid rgba(0,0,0,0.22)",
                                      boxShadow:
                                        "inset -1px 0 0 rgba(255,255,255,0.18)",
                                    }),
                                opacity: 0.95,
                                pointerEvents: "none",
                              }}
                            />

                            <div
                              aria-hidden
                              style={{
                                position: "absolute",
                                ...(isStartCol ? { left: 10 } : { right: 10 }),
                                bottom: 14,
                                width: 22,
                                height: 14,
                                borderRadius: 999,
                                background:
                                  "radial-gradient(circle at 30% 40%, rgba(34,197,94,0.90) 0%, rgba(34,197,94,0.55) 55%, rgba(34,197,94,0.0) 72%)",
                                filter:
                                  "drop-shadow(0 2px 2px rgba(0,0,0,0.20))",
                                pointerEvents: "none",
                              }}
                            />
                            <div
                              aria-hidden
                              style={{
                                position: "absolute",
                                ...(isStartCol ? { left: 24 } : { right: 24 }),
                                bottom: 30,
                                width: 18,
                                height: 12,
                                borderRadius: 999,
                                background:
                                  "radial-gradient(circle at 45% 55%, rgba(74,222,128,0.85) 0%, rgba(74,222,128,0.45) 55%, rgba(74,222,128,0.0) 72%)",
                                filter:
                                  "drop-shadow(0 2px 2px rgba(0,0,0,0.18))",
                                pointerEvents: "none",
                              }}
                            />
                            <div
                              aria-hidden
                              style={{
                                position: "absolute",
                                ...(isStartCol ? { left: 12 } : { right: 12 }),
                                bottom: 44,
                                width: 14,
                                height: 10,
                                borderRadius: 999,
                                background:
                                  "radial-gradient(circle at 50% 60%, rgba(22,163,74,0.75) 0%, rgba(22,163,74,0.40) 58%, rgba(22,163,74,0.0) 74%)",
                                filter:
                                  "drop-shadow(0 2px 2px rgba(0,0,0,0.16))",
                                pointerEvents: "none",
                              }}
                            />
                          </>
                        )}
                      </div>
                    );
                  })}

                  {Array.from({ length: steps.length + 1 }).map((_, sepIdx) => {
                    const leftPx =
                      (sepIdx + 1) * (TILE_W + TILE_GAP) - TILE_GAP / 2;
                    return (
                      <div
                        key={`street-sep-${sepIdx}`}
                        style={{
                          position: "absolute",
                          left: `${leftPx}px`,
                          top: 10,
                          transform: "translateX(-50%)",
                          width: 4,
                          height: `calc(100% - 20px)`,
                          backgroundImage:
                            "repeating-linear-gradient(180deg, rgba(255,255,255,0.06) 0px, rgba(255,255,255,0.06) 6px, transparent 6px, transparent 18px)",
                          zIndex: 12,
                        }}
                      />
                    );
                  })}
                </div>

                <div
                  className="absolute left-0 flex items-end"
                  style={{ top: manholeTopPx, gap: TILE_GAP }}
                >
                  <div
                    className="flex flex-col items-center"
                    style={{ width: TILE_W }}
                  >
                    <div
                      className="relative w-16 h-16 flex items-center justify-center"
                      style={{ zIndex: 40 }}
                    ></div>
                    <div className="mt-2 px-3 py-1 rounded-full bg-[#e6ece6] text-[#21313a] text-[11px] font-semibold shadow-[0_2px_0_#ffffff1a]">
                      Start
                    </div>
                  </div>

                  {steps.map((info, idx) => {
                    const tileStep = idx + 1;
                    const isVisited = currentStep >= tileStep;
                    const isCurrent =
                      currentStep === tileStep && gameState === "walking";
                    const isDeathTile =
                      gameState === "crashed" && deathAnim?.step === tileStep;
                    const hasFire =
                      tileStep > currentStep &&
                      fires.some(
                        (f) => f.stepIndex === tileStep && f.endsAt > Date.now()
                      );
                    const multColor = getColorForMultiplier(info.multiplier);

                    const pillClasses = isCurrent
                      ? "bg-[#00e701] text-[#0b1b12]"
                      : isVisited
                      ? "bg-[#1f2d3a] text-white"
                      : "bg-[#1f2d3a] text-[#e5e7eb]";

                    return (
                      <div
                        key={info.step}
                        className="flex flex-col items-center"
                        style={{ width: TILE_W }}
                      >
                        <div
                          className="relative"
                          style={{ width: MANHOLE_SIZE, height: MANHOLE_SIZE }}
                        >
                          <RoadBlockade visible={isVisited && !isDeathTile} />
                          <Manhole
                            active={isCurrent || isVisited}
                            fire={hasFire && !isVisited}
                          />
                        </div>
                        <div
                          className={`mt-2 px-3 py-1 rounded-full text-[11px] font-extrabold shadow-[0_2px_0_#111a23] border border-[#101823] ${pillClasses}`}
                          style={{ color: isCurrent ? "#0b1b12" : multColor }}
                        >
                          {formatMultiplier(info.multiplier)}x
                        </div>
                        <div className="mt-1 text-[10px] text-[#758295]">
                          {formatChance(info.chance)}
                        </div>
                      </div>
                    );
                  })}
                </div>

                <div
                  className="absolute left-0 flex items-center text-center"
                  style={{
                    top: manholeTopPx + MANHOLE_SIZE + 8,
                    gap: TILE_GAP,
                    zIndex: 20,
                  }}
                >
                  <div
                    className="flex flex-col items-center"
                    style={{ width: TILE_W }}
                  ></div>
                  {steps.map((info) => (
                    <div
                      key={`meta-${info.step}`}
                      className="flex flex-col items-center"
                      style={{ width: TILE_W }}
                    >
                      <div className="bg-[#0f2a30] px-2 py-1 rounded-md border border-[#102428]">
                        <div className="text-[11px] font-medium text-[#b1bad3]">
                          {formatMultiplier(info.multiplier)}x
                        </div>
                        <div className="text-[9px] text-[#758295] mt-0.5">
                          {formatChance(info.chance)}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div
                className="absolute"
                style={{
                  left: `${chickenLeftPx}px`,
                  top: `${chickenTopPx}px`,
                  transition: "left 260ms cubic-bezier(0.2,0.9,0.2,1)",
                  zIndex: 40,
                }}
              >
                <ChickenSprite
                  state={chickenState}
                  variant={chickenVariant}
                  flattened={isFlat}
                />
                {sparkAtStep !== null && sparkAtStep === currentStep && (
                  <div className="absolute inset-0 chicken-sparkle" />
                )}

                {gameState === "crashed" && deathAnim?.type === "fire" && (
                  <div className="absolute inset-0 flex items-center justify-center chicken-burn-overlay">
                    <div
                      className="chicken-flame-wrap chicken-flame-wrap--death"
                      aria-hidden
                    >
                      <div className="chicken-flame-glow" />
                      <div className="chicken-flame-sparks" />
                      <div className="chicken-flame-smoke" />
                      <div className="chicken-flame" />
                      <div className="chicken-flame chicken-flame--back" />
                    </div>
                    <LocalFireDepartment
                      className="chicken-fire chicken-fire--death"
                      sx={{ fontSize: 40, color: "#fff7ed" }}
                    />
                  </div>
                )}
              </div>

              {gameState === "crashed" && deathAnim?.type === "car" && (
                <div
                  key={`killcar-${deathAnim.startedAt}`}
                  className="absolute chicken-car chicken-killcar"
                  style={{
                    left: `${stepCenterX(deathAnim.step)}px`,
                    top: 8,
                    width: `${CAR_SIZE}px`,
                    height: `${CAR_SIZE * 1.7}px`,
                    background: "#ef4444",
                    opacity: 0.98,
                    zIndex: 120,
                    ["--drive-distance-y" as any]: `${ROAD_HEIGHT + 28}px`,
                    animationDuration: `${(
                      (deathAnim.carBaseDurationMs ?? 2100) /
                      3 /
                      2
                    ).toFixed(0)}ms`,
                    animationDelay: `${(deathAnim.carDelayMs ?? 0).toFixed(
                      0
                    )}ms`,
                  }}
                >
                  <div className="car-window" />
                  <div className="car-light car-light-left" />
                  <div className="car-light car-light-right" />
                </div>
              )}
            </div>
          </div>
        </div>

        <GameRecordsPanel gameId="chicken" />
      </div>

      <style jsx global>{`
        @keyframes chicken-car-drive-down {
          0% {
            transform: translate(-50%, -32px);
            opacity: 0;
          }
          8% {
            opacity: 0.95;
          }
          100% {
            transform: translate(-50%, var(--drive-distance-y));
            opacity: 0.9;
          }
        }
        .chicken-car {
          position: absolute;
          will-change: transform;
          border-radius: 12px;
          border: 2px solid rgba(255, 255, 255, 0.18);
          display: flex;
          align-items: center;
          justify-content: center;
          z-index: 100;
          animation-name: chicken-car-drive-down;
          animation-timing-function: linear;
          animation-iteration-count: 1;
          /* Apply 0% keyframe during animation-delay to prevent a brief "frozen"/offset render before the car starts moving */
          animation-fill-mode: both;
          filter: drop-shadow(0 8px 12px rgba(0, 0, 0, 0.45));
          transition: opacity 260ms ease, transform 260ms ease,
            filter 260ms ease;
        }
        .chicken-car.removing {
          opacity: 0;
          transform: translate(-50%, var(--drive-distance-y)) scale(0.92);
          filter: drop-shadow(0 4px 8px rgba(0, 0, 0, 0.35));
        }
        .chicken-car::before {
          content: "";
          position: absolute;
          top: 4px;
          left: 4px;
          right: 4px;
          height: 10px;
          border-radius: 10px;
          background: rgba(255, 255, 255, 0.18);
        }
        .chicken-car .car-window {
          position: absolute;
          top: 18px;
          left: 6px;
          right: 6px;
          height: 18px;
          border-radius: 10px;
          background: rgba(15, 33, 46, 0.65);
          border: 1px solid rgba(255, 255, 255, 0.12);
          box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.08);
        }
        .chicken-car .car-light {
          position: absolute;
          bottom: 6px;
          width: 6px;
          height: 10px;
          border-radius: 6px;
          background: rgba(255, 255, 255, 0.7);
          box-shadow: 0 0 10px rgba(255, 255, 255, 0.25);
        }
        .chicken-car .car-light-left {
          left: 6px;
        }
        .chicken-car .car-light-right {
          right: 6px;
        }
        @keyframes chicken-fire-pulse {
          0% {
            opacity: 0.35;
            transform: scale(0.9);
          }
          50% {
            opacity: 0.9;
            transform: scale(1.08);
          }
          100% {
            opacity: 0.35;
            transform: scale(0.9);
          }
        }
        .chicken-fire {
          animation: chicken-fire-pulse 1s ease-in-out infinite;
        }
        .chicken-fire--death {
          animation-duration: 720ms;
          filter: drop-shadow(0 0 10px rgba(249, 115, 22, 0.55));
          opacity: 0.95;
        }

        /* richer manhole fire effect (glow + flame + sparks) */
        .chicken-flame-wrap {
          position: absolute;
          width: 54px;
          height: 54px;
          left: 50%;
          top: 50%;
          transform: translate(-50%, -55%);
          pointer-events: none;
          z-index: 1;
        }
        .chicken-flame-wrap--death {
          width: 74px;
          height: 74px;
          transform: translate(-50%, -60%);
        }
        .chicken-flame-glow {
          position: absolute;
          inset: -10px;
          border-radius: 9999px;
          background: radial-gradient(
            circle at 50% 60%,
            rgba(249, 115, 22, 0.45) 0%,
            rgba(249, 115, 22, 0.22) 35%,
            rgba(239, 68, 68, 0) 70%
          );
          filter: blur(6px);
          animation: chicken-flame-glow 720ms ease-in-out infinite;
          opacity: 0.95;
        }
        .chicken-flame {
          position: absolute;
          left: 50%;
          top: 50%;
          width: 26px;
          height: 34px;
          transform: translate(-50%, -50%);
          border-radius: 60% 40% 55% 45% / 62% 62% 38% 38%;
          background: radial-gradient(
            circle at 50% 75%,
            rgba(254, 215, 170, 0.95) 0%,
            rgba(249, 115, 22, 0.9) 34%,
            rgba(239, 68, 68, 0.4) 62%,
            rgba(239, 68, 68, 0) 78%
          );
          filter: drop-shadow(0 0 10px rgba(249, 115, 22, 0.45));
          animation: chicken-flame-flicker 520ms ease-in-out infinite;
          opacity: 0.95;
        }
        .chicken-flame--back {
          width: 30px;
          height: 40px;
          opacity: 0.55;
          filter: blur(0.2px) drop-shadow(0 0 12px rgba(249, 115, 22, 0.35));
          animation-duration: 650ms;
          transform: translate(-50%, -45%) scale(1.08);
        }
        .chicken-flame-sparks {
          position: absolute;
          inset: -6px;
          border-radius: 9999px;
          background-image: radial-gradient(
              circle,
              rgba(254, 215, 170, 0.9) 0 1.2px,
              transparent 1.3px
            ),
            radial-gradient(
              circle,
              rgba(249, 115, 22, 0.75) 0 1.1px,
              transparent 1.2px
            ),
            radial-gradient(
              circle,
              rgba(239, 68, 68, 0.55) 0 1px,
              transparent 1.1px
            );
          background-size: 14px 14px, 18px 18px, 22px 22px;
          background-position: 0 0, 6px 10px, 10px 4px;
          filter: blur(0.2px);
          opacity: 0.65;
          animation: chicken-flame-sparks 900ms linear infinite;
          mask-image: radial-gradient(
            circle at 50% 65%,
            rgba(0, 0, 0, 1) 0%,
            rgba(0, 0, 0, 0.85) 35%,
            rgba(0, 0, 0, 0) 70%
          );
        }
        .chicken-flame-smoke {
          position: absolute;
          left: 50%;
          top: 50%;
          width: 70px;
          height: 70px;
          transform: translate(-50%, -60%);
          border-radius: 9999px;
          background: radial-gradient(
            circle at 50% 65%,
            rgba(15, 33, 46, 0) 0%,
            rgba(15, 33, 46, 0) 35%,
            rgba(15, 33, 46, 0.35) 62%,
            rgba(15, 33, 46, 0) 78%
          );
          filter: blur(6px);
          opacity: 0.55;
          animation: chicken-flame-smoke 900ms ease-in-out infinite;
          pointer-events: none;
        }
        @keyframes chicken-flame-flicker {
          0% {
            transform: translate(-50%, -50%) rotate(-2deg) scale(0.96);
          }
          35% {
            transform: translate(-50%, -54%) rotate(2deg) scale(1.06);
          }
          70% {
            transform: translate(-50%, -48%) rotate(-1deg) scale(0.99);
          }
          100% {
            transform: translate(-50%, -50%) rotate(-2deg) scale(0.96);
          }
        }
        @keyframes chicken-flame-glow {
          0% {
            transform: scale(0.92);
            opacity: 0.7;
          }
          50% {
            transform: scale(1.06);
            opacity: 1;
          }
          100% {
            transform: scale(0.92);
            opacity: 0.7;
          }
        }
        @keyframes chicken-flame-sparks {
          0% {
            background-position: 0 16px, 6px 22px, 10px 18px;
          }
          100% {
            background-position: 0 -10px, 6px -16px, 10px -12px;
          }
        }
        @keyframes chicken-flame-smoke {
          0% {
            transform: translate(-50%, -55%) scale(0.98);
            opacity: 0.35;
          }
          50% {
            transform: translate(-50%, -70%) scale(1.06);
            opacity: 0.6;
          }
          100% {
            transform: translate(-50%, -80%) scale(1.12);
            opacity: 0.25;
          }
        }
        @keyframes chicken-hop-keyframes {
          0% {
            transform: translateY(0);
          }
          50% {
            transform: translateY(-6px);
          }
          100% {
            transform: translateY(0);
          }
        }
        .chicken-hop {
          animation: chicken-hop-keyframes 0.9s ease-in-out infinite;
        }

        @keyframes chicken-bob-keyframes {
          0% {
            transform: translateY(0) rotate(0deg);
          }
          35% {
            transform: translateY(-4px) rotate(-1deg);
          }
          70% {
            transform: translateY(0) rotate(1deg);
          }
          100% {
            transform: translateY(0) rotate(0deg);
          }
        }
        .chicken-bob {
          animation: chicken-bob-keyframes 520ms ease-in-out infinite;
        }
        @keyframes chicken-flat-keyframes {
          0% {
            transform: scale(1) translateY(0);
          }
          70% {
            transform: scaleX(1.32) scaleY(0.3) translateY(17px);
          }
          100% {
            transform: scaleX(1.22) scaleY(0.38) translateY(15px);
          }
        }
        .chicken-flat {
          transform-origin: center bottom;
          animation: chicken-flat-keyframes 160ms ease-out both;
        }
        @keyframes chicken-flap-keyframes {
          0% {
            transform: rotate(0deg) translateY(0);
          }
          50% {
            transform: rotate(-10deg) translateY(-2px);
          }
          100% {
            transform: rotate(0deg) translateY(0);
          }
        }
        .chicken-flap {
          transform-origin: right bottom;
          animation: chicken-flap-keyframes 420ms ease-in-out infinite;
        }
        @keyframes chicken-crash-keyframes {
          0% {
            transform: rotate(0deg) translateY(0);
            opacity: 1;
          }
          100% {
            transform: rotate(80deg) translateY(8px);
            opacity: 0.9;
          }
        }
        .chicken-crash {
          animation: chicken-crash-keyframes 280ms ease-out both;
        }
        @keyframes chicken-sparkle-keyframes {
          0% {
            transform: scale(0.7);
            opacity: 0;
          }
          35% {
            opacity: 0.9;
          }
          100% {
            transform: scale(1.25);
            opacity: 0;
          }
        }
        .chicken-sparkle {
          border-radius: 9999px;
          box-shadow: 0 0 0 0 rgba(0, 231, 1, 0);
          animation: chicken-sparkle-keyframes 260ms ease-out both;
          background: radial-gradient(
            circle,
            rgba(0, 231, 1, 0.35) 0%,
            rgba(0, 231, 1, 0) 60%
          );
          filter: blur(0.2px);
        }

        @keyframes chicken-killcar-drive-down {
          0% {
            transform: translate(-50%, -32px);
            opacity: 0;
          }
          8% {
            opacity: 0.98;
          }
          85% {
            opacity: 0.95;
          }
          100% {
            transform: translate(-50%, var(--drive-distance-y));
            opacity: 0;
          }
        }
        .chicken-killcar {
          z-index: 120;
          animation-name: chicken-killcar-drive-down;
          filter: drop-shadow(0 10px 14px rgba(0, 0, 0, 0.55));
        }
        @keyframes chicken-burn-overlay-keyframes {
          0% {
            opacity: 0;
            transform: scale(0.85) translateY(2px);
            filter: blur(0px);
          }
          12% {
            opacity: 1;
            transform: scale(1.05) translateY(-2px);
            filter: blur(0px);
          }
          70% {
            opacity: 0.85;
            transform: scale(1.08) translateY(-6px);
            filter: blur(0px);
          }
          100% {
            opacity: 0;
            transform: scale(1.12) translateY(-10px);
            filter: blur(0.2px);
          }
        }
        .chicken-burn-overlay {
          animation: chicken-burn-overlay-keyframes 720ms ease-out both;
          pointer-events: none;
        }

        .chicken-body,
        .chicken-wing {
          transition: background-color 260ms ease;
        }

        /* slim horizontal scrollbar for the road area (only when needed) */
        .chicken-scroll {
          scrollbar-gutter: stable;
          scrollbar-width: thin; /* Firefox */
          scrollbar-color: #2f4553 #0b1b26; /* thumb track */
        }
        .chicken-scroll::-webkit-scrollbar {
          height: 8px;
        }
        .chicken-scroll::-webkit-scrollbar-track {
          background: #0b1b26;
          border-radius: 9999px;
        }
        .chicken-scroll::-webkit-scrollbar-thumb {
          background: #2f4553;
          border-radius: 9999px;
        }
        .chicken-scroll::-webkit-scrollbar-thumb:hover {
          background: #557086;
        }

        .chicken-blockade {
          will-change: transform, opacity;
        }

        .chicken-car-barrier-crash {
          transition: opacity 260ms ease,
            transform 240ms cubic-bezier(0.2, 0.9, 0.2, 1), filter 260ms ease;
          filter: drop-shadow(0 10px 14px rgba(0, 0, 0, 0.55));
        }
      `}</style>
    </div>
    </>
  );
}
