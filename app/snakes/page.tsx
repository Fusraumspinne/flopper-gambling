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
import {
  Casino,
  Flag,
  PlayArrow,
  Refresh,
  LocalFireDepartment,
} from "@mui/icons-material";
import GameRecordsPanel from "@/components/GameRecordsPanel";

type RiskLevel = "low" | "medium" | "high" | "expert" | "master";
type GameState = "idle" | "playing" | "dead" | "cashed";

type TileValue = number | "dead" | "start";

type RollEntry = {
  die1: number;
  die2: number;
  steps: number;
  landing: number;
  value: TileValue;
  multiplierAfter: number;
};

const BOARD_BY_RISK: Record<RiskLevel, TileValue[]> = {
  low: ["start", 2, 1.3, 1.2, 1.1, 1.01, "dead", 1.01, 1.1, 1.2, 1.3, 2],
  medium: [
    "start",
    4,
    2.5,
    1.4,
    1.11,
    "dead",
    "dead",
    "dead",
    1.11,
    1.4,
    2.5,
    4,
  ],
  high: [
    "start",
    7.5,
    3,
    1.38,
    "dead",
    "dead",
    "dead",
    "dead",
    "dead",
    1.38,
    3,
    7.5,
  ],
  expert: [
    "start",
    10,
    3.82,
    "dead",
    "dead",
    "dead",
    "dead",
    "dead",
    "dead",
    "dead",
    3.82,
    10,
  ],
  master: [
    "start",
    17.64,
    "dead",
    "dead",
    "dead",
    "dead",
    "dead",
    "dead",
    "dead",
    "dead",
    "dead",
    17.64,
  ],
};

const GRID_TEMPLATE = `
"a b c d"
"l center center e"
"k center center f"
"j i h g"
`;

const BOARD_AREAS: Array<{ area: string; boardIndex: number }> = [
  { area: "a", boardIndex: 0 },
  { area: "b", boardIndex: 1 },
  { area: "c", boardIndex: 2 },
  { area: "d", boardIndex: 3 },
  { area: "e", boardIndex: 4 },
  { area: "f", boardIndex: 5 },
  { area: "g", boardIndex: 6 },
  { area: "h", boardIndex: 7 },
  { area: "i", boardIndex: 8 },
  { area: "j", boardIndex: 9 },
  { area: "k", boardIndex: 10 },
  { area: "l", boardIndex: 11 },
];

function formatMultiplier(mult: number) {
  if (mult >= 1000) return mult.toFixed(0);
  if (mult >= 100) return mult.toFixed(1);
  if (mult >= 10) return mult.toFixed(2);
  return mult.toFixed(3);
}

function formatMultiplierShort(mult: number) {
  const rounded = Number.parseFloat(mult.toFixed(6));
  return rounded.toString();
}

// probability helpers for two dice sums (2..12)
function waysForSum(s: number) {
  const map: Record<number, number> = {
    2: 1,
    3: 2,
    4: 3,
    5: 4,
    6: 5,
    7: 6,
    8: 5,
    9: 4,
    10: 3,
    11: 2,
    12: 1,
  };
  return map[s] || 0;
}

function probPercentForBoardIndex(index: number) {
  const sum = index + 1;
  if (sum < 2 || sum > 12) return "0%";
  const ways = waysForSum(sum);
  const pct = (ways / 36) * 100;
  return `${pct.toFixed(2)}%`;
}

function DiceFace({ value }: { value: number | null }) {
  const pipMap: Record<number, number[]> = {
    1: [4],
    2: [0, 8],
    3: [0, 4, 8],
    4: [0, 2, 6, 8],
    5: [0, 2, 4, 6, 8],
    6: [0, 2, 3, 5, 6, 8],
  };

  return (
    <div className="w-full aspect-square bg-white rounded-lg border border-[#d1d5db] shadow-sm flex items-center justify-center">
      {value ? (
        <div className="grid grid-cols-3 grid-rows-3 gap-[2px] w-14 h-14">
          {Array.from({ length: 9 }).map((_, i) => (
            <span
              key={i}
              className={`flex items-center justify-center ${
                pipMap[value]?.includes(i)
                  ? "bg-black rounded-full w-2.5 h-2.5"
                  : ""
              }`}
            />
          ))}
        </div>
      ) : (
        <div className="text-sm font-semibold text-[#4b5563]">-</div>
      )}
    </div>
  );
}

function cn(...parts: Array<string | false | null | undefined>) {
  return parts.filter(Boolean).join(" ");
}

function sleep(ms: number) {
  return new Promise<void>((resolve) => setTimeout(resolve, ms));
}

export default function SnakesPage() {
  const { balance, subtractFromBalance, addToBalance, finalizePendingLoss } =
    useWallet();

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
    betAmountRef.current = v;
  };

  const [betAmount, setBetAmount] = useState<number>(100);
  const [betInput, setBetInput] = useState<string>("100");
  const [risk, setRisk] = useState<RiskLevel>("low");
  const [gameState, setGameState] = useState<GameState>("idle");
  const [currentPos, setCurrentPos] = useState<number>(-1);
  const [totalMultiplier, setTotalMultiplier] = useState<number>(1);
  const [rolls, setRolls] = useState<RollEntry[]>([]);
  const [lastWin, setLastWin] = useState<number>(0);
  const [dice, setDice] = useState<[number | null, number | null]>([1, 1]);
  const [isAnimating, setIsAnimating] = useState<boolean>(false);
  const [isRolling, setIsRolling] = useState<boolean>(false);
  const [displayMultiplier, setDisplayMultiplier] = useState<number>(1);
  const prevMultRef = useRef<number>(1);
  const [deadFx, setDeadFx] = useState<boolean>(false);
  const [resultFx, setResultFx] = useState<"rolling" | "win" | "lose" | null>(
    null
  );
  const resultTimeoutRef = React.useRef<number | null>(null);

  const [playMode, setPlayMode] = useState<"manual" | "auto">("manual");
  const [onWinMode, setOnWinMode] = useState<"reset" | "raise">("reset");
  const [onWinPctInput, setOnWinPctInput] = useState<string>("0");
  const [onLoseMode, setOnLoseMode] = useState<"reset" | "raise">("reset");
  const [onLosePctInput, setOnLosePctInput] = useState<string>("0");
  const [stopProfitInput, setStopProfitInput] = useState<string>("0");
  const [stopLossInput, setStopLossInput] = useState<string>("0");
  const [autoRollsInput, setAutoRollsInput] = useState<string>("1");
  const [isAutoBetting, setIsAutoBetting] = useState(false);

  const betAmountRef = useRef<number>(betAmount);
  const balanceRef = useRef<number>(balance);
  const riskRef = useRef<RiskLevel>(risk);
  const gameStateRef = useRef<GameState>(gameState);
  const totalMultiplierRef = useRef<number>(totalMultiplier);
  const rollsRef = useRef<RollEntry[]>(rolls);
  const isAnimatingRef = useRef<boolean>(isAnimating);
  const isAutoBettingRef = useRef<boolean>(false);
  const stopRequestedRef = useRef<boolean>(false);
  const autoOriginalBetRef = useRef<number>(0);
  const autoNetRef = useRef<number>(0);

  const audioRef = useRef<{
    bet: HTMLAudioElement | null;
    win: HTMLAudioElement | null;
    limboLose: HTMLAudioElement | null;
    rollDice: HTMLAudioElement | null;
    tick: HTMLAudioElement | null;
    kenoReveal: HTMLAudioElement | null;
  }>({ bet: null, win: null, limboLose: null, rollDice: null, tick: null, kenoReveal: null });

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
        limboLose: new Audio("/sounds/LimboLose.mp3"),
        rollDice: new Audio("/sounds/RollDice.mp3"),
        tick: new Audio("/sounds/Tick.mp3"),
        kenoReveal: new Audio("/sounds/KenoReveal.mp3"),
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
    totalMultiplierRef.current = totalMultiplier;
  }, [totalMultiplier]);
  useEffect(() => {
    rollsRef.current = rolls;
  }, [rolls]);
  useEffect(() => {
    isAnimatingRef.current = isAnimating;
  }, [isAnimating]);
  useEffect(() => {
    isAutoBettingRef.current = isAutoBetting;
  }, [isAutoBetting]);

  const board = useMemo(() => BOARD_BY_RISK[risk], [risk]);

  useEffect(() => {
    if (gameState === "idle") {
      prevMultRef.current = 1;
      setDisplayMultiplier(1);
      return;
    }

    const from = prevMultRef.current;
    const to = totalMultiplier;
    if (from === to) return;

    const start = performance.now();
    const durationMs = 260;
    let raf = 0;

    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / durationMs);
      const eased = 1 - Math.pow(1 - t, 3);
      const next = from + (to - from) * eased;
      setDisplayMultiplier(next);
      if (t < 1) {
        raf = requestAnimationFrame(tick);
      } else {
        prevMultRef.current = to;
      }
    };

    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [gameState, totalMultiplier]);

  useEffect(() => {
    if (!deadFx) return;
    const t = window.setTimeout(() => setDeadFx(false), 560);
    return () => window.clearTimeout(t);
  }, [deadFx]);

  useEffect(() => {
    return () => {
      if (resultTimeoutRef.current) {
        clearTimeout(resultTimeoutRef.current);
        resultTimeoutRef.current = null;
      }
    };
  }, []);

  const startNewRound = useCallback(
    (opts?: { betAmount?: number }) => {
      const bet = normalizeMoney(opts?.betAmount ?? betAmountRef.current);
      if (bet <= 0) return false;
      if (bet > balanceRef.current) return false;

      setBetBoth(bet);
      subtractFromBalance(bet);

      playAudio(audioRef.current.bet);

      // reset round state
      gameStateRef.current = "playing";
      setGameState("playing");
      setCurrentPos(-1);
      totalMultiplierRef.current = 1;
      setTotalMultiplier(1);
      prevMultRef.current = 1;
      setDisplayMultiplier(1);
      setIsRolling(false);
      setRolls([]);
      setLastWin(0);
      setDice([1, 1]);
      return true;
    },
    [subtractFromBalance]
  );

  const landOnTile = useCallback(
    (
      landingIndex: number,
      currentMult: number
    ): { nextMult: number; newState: GameState } => {
      const value = board[landingIndex];
      if (value === "dead") {
        return { nextMult: currentMult, newState: "dead" };
      }
      if (typeof value === "number") {
        return {
          nextMult: parseFloat((currentMult * value).toFixed(4)),
          newState: "playing",
        };
      }
      return { nextMult: currentMult, newState: "playing" };
    },
    [board]
  );

  const handleCashout = useCallback(
    (mult: number, auto = false) => {
      const payout = normalizeMoney(betAmountRef.current * mult);
      if (payout > 0) {
        addToBalance(payout);
        setLastWin(payout);
        playAudio(audioRef.current.win);
        if (resultTimeoutRef.current) {
          clearTimeout(resultTimeoutRef.current);
          resultTimeoutRef.current = null;
        }
        setResultFx("win");
        resultTimeoutRef.current = window.setTimeout(
          () => setResultFx(null),
          900
        );
      } else {
        finalizePendingLoss();
      }
      gameStateRef.current = "cashed";
      setGameState("cashed");
      if (auto) {
        setDice((prev) => prev);
      }
    },
    [addToBalance, finalizePendingLoss]
  );

  const changeRisk = useCallback(
    (level: RiskLevel) => {
      if (level === risk) return;
      if (gameStateRef.current === "playing") {
        handleCashout(totalMultiplierRef.current);
        setRisk(level);
        return;
      }

      if (gameStateRef.current === "dead" || gameStateRef.current === "cashed") {
        setRisk(level);
        gameStateRef.current = "idle";
        setGameState("idle");
        setCurrentPos(-1);
        totalMultiplierRef.current = 1;
        setTotalMultiplier(1);
        setRolls([]);
        setLastWin(0);
        setDice([1, 1]);
        return;
      }

      setRisk(level);
    },
    [risk, handleCashout]
  );

  const rollDice = useCallback(async () => {
    if (isAnimatingRef.current) return;

    // Keep the ref in sync immediately (effects are async)
    isAnimatingRef.current = true;

    let wasPlaying = gameStateRef.current === "playing";
    let baseMult = totalMultiplierRef.current;

    if (!wasPlaying) {
      const ok = startNewRound();
      if (!ok) return;
      wasPlaying = false;
      baseMult = 1;
    }

    setIsAnimating(true);
    setIsRolling(true);
    setCurrentPos(-1);
    setResultFx("rolling");

    playAudio(audioRef.current.rollDice);

    const finalDie1 = Math.floor(Math.random() * 6) + 1;
    const finalDie2 = Math.floor(Math.random() * 6) + 1;

    for (let t = 0; t < 6; t++) {
      const d1 = t < 4 ? Math.floor(Math.random() * 6) + 1 : finalDie1;
      const d2 = t < 6 ? Math.floor(Math.random() * 6) + 1 : finalDie2;
      setDice([d1, d2]);
      await sleep(90);
    }
    setDice([finalDie1, finalDie2]);
    setIsRolling(false);

    const steps = finalDie1 + finalDie2;
    const landing = (steps - 1) % board.length;

    for (let s = 1; s <= steps; s++) {
      const idx = (s - 1) % board.length;
      setCurrentPos(idx);
      // reveal sound for each highlighted tile
      playAudio(audioRef.current.kenoReveal);
      // step animation delay
      await sleep(120);
    }

    const { nextMult, newState } = landOnTile(landing, baseMult);
    const entry: RollEntry = {
      die1: finalDie1,
      die2: finalDie2,
      steps,
      landing,
      value: board[landing],
      multiplierAfter: nextMult,
    };

    setRolls((prev) => (wasPlaying ? [...prev, entry] : [entry]));
    setCurrentPos(landing);
    totalMultiplierRef.current = nextMult;
    setTotalMultiplier(nextMult);

    // play tick when multiplier increases compared to base
    if (nextMult > baseMult) {
      playAudio(audioRef.current.tick);
    }

    if (newState === "dead") {
      gameStateRef.current = "dead";
      setGameState("dead");
      setDeadFx(true);
      if (resultTimeoutRef.current) {
        clearTimeout(resultTimeoutRef.current);
        resultTimeoutRef.current = null;
      }
      setResultFx("lose");
      playAudio(audioRef.current.limboLose);
      resultTimeoutRef.current = window.setTimeout(
        () => setResultFx(null),
        900
      );
      finalizePendingLoss();
      isAnimatingRef.current = false;
      setIsAnimating(false);
      setIsRolling(false);
      return;
    }

    gameStateRef.current = "playing";
    setGameState("playing");
    isAnimatingRef.current = false;
    setIsAnimating(false);
    setIsRolling(false);
  }, [
    board,
    finalizePendingLoss,
    landOnTile,
    startNewRound,
  ]);

  const manualCashout = useCallback(() => {
    if (gameStateRef.current !== "playing") return;
    if (rollsRef.current.length === 0) return;
    handleCashout(totalMultiplierRef.current);
  }, [handleCashout]);

  const canRoll = !isAnimating;
  const canCashout = gameState === "playing" && rolls.length > 0;

  const currentWin =
    gameState === "playing" ? betAmountRef.current * totalMultiplier : 0;

  const currentTileValue = currentPos >= 0 ? board[currentPos] : undefined;

  const tile3d =
    "shadow-[0_4px_0_#1a2c38] hover:-translate-y-1 active:translate-y-0 active:shadow-none transition-all duration-100";
  const tileTravelHighlight =
    "ring-4 ring-[#8b5cf6] shadow-[0_0_18px_rgba(139,92,246,0.35)] scale-110 z-10";
  const tileTravelHighlightDead =
    "ring-4 ring-[#ef4444] shadow-[0_0_18px_rgba(239,68,68,0.35)] scale-110 z-10";
  const tileLandedMulti =
    "bg-[#8b5cf6] text-white shadow-[0_0_18px_rgba(139,92,246,0.35)] z-10";
  const tileLandedDead =
    "bg-[#ef4444] text-black shadow-[0_0_18px_rgba(239,68,68,0.35)] z-10";

  const isBusy = isAnimating || isAutoBetting;
  const stopAutoBet = useCallback(() => {
    stopRequestedRef.current = true;
    setIsAutoBetting(false);
  }, []);

  const playRound = useCallback(
    async (opts?: { betAmount?: number; rollsToMake?: number }) => {
      const bet = normalizeMoney(opts?.betAmount ?? betAmountRef.current);
      const rollsToMake = Math.max(1, Math.floor(opts?.rollsToMake ?? 1));

      if (bet <= 0 || bet > balanceRef.current) {
        return null as null | { betAmount: number; winAmount: number; didWin: boolean };
      }
      if (isAnimatingRef.current) {
        return null as null | { betAmount: number; winAmount: number; didWin: boolean };
      }

      if (resultTimeoutRef.current) {
        clearTimeout(resultTimeoutRef.current);
        resultTimeoutRef.current = null;
      }
      setResultFx(null);
      setDeadFx(false);
      setIsRolling(false);
      setDice([1, 1]);

      const ok = startNewRound({ betAmount: bet });
      if (!ok) {
        return null as null | { betAmount: number; winAmount: number; didWin: boolean };
      }

      let madeRolls = 0;
      for (let i = 0; i < rollsToMake; i++) {
        await rollDice();
        madeRolls++;
        if (gameStateRef.current === "dead") {
          return { betAmount: bet, winAmount: 0, didWin: false };
        }
      }

      if (gameStateRef.current === "dead") {
        return { betAmount: bet, winAmount: 0, didWin: false };
      }

      if (gameStateRef.current === "playing" && madeRolls > 0) {
        const payout = normalizeMoney(bet * totalMultiplierRef.current);
        handleCashout(totalMultiplierRef.current, true);
        return { betAmount: bet, winAmount: payout, didWin: payout > 0 };
      }

      finalizePendingLoss();
      gameStateRef.current = "dead";
      setGameState("dead");
      return { betAmount: bet, winAmount: 0, didWin: false };
    },
    [finalizePendingLoss, handleCashout, rollDice, startNewRound]
  );

  const startAutoBet = useCallback(async () => {
    if (isAutoBettingRef.current) return;

    const startingBet = normalizeMoney(betAmountRef.current);
    if (startingBet <= 0 || startingBet > balanceRef.current) return;
    if (isAnimatingRef.current) return;

    const rollsToMake = Math.max(1, Math.floor(parseNumberLoose(autoRollsInput)));
    if (rollsToMake <= 0) return;

    autoOriginalBetRef.current = startingBet;
    autoNetRef.current = 0;

    isAutoBettingRef.current = true;
    setIsAutoBetting(true);

    stopRequestedRef.current = false;

    while (isAutoBettingRef.current) {
      const stopProfit = Math.max(0, normalizeMoney(parseNumberLoose(stopProfitInput)));
      const stopLoss = Math.max(0, normalizeMoney(parseNumberLoose(stopLossInput)));
      const onWinPct = Math.max(0, parseNumberLoose(onWinPctInput));
      const onLosePct = Math.max(0, parseNumberLoose(onLosePctInput));
      const rollsPerRound = Math.max(1, Math.floor(parseNumberLoose(autoRollsInput)));

      const roundBet = normalizeMoney(betAmountRef.current);
      if (stopRequestedRef.current) {
        isAutoBettingRef.current = false;
        break;
      }
      if (roundBet <= 0) break;
      if (roundBet > balanceRef.current) break;
      if (isAnimatingRef.current) {
        await sleep(120);
        continue;
      }
      if (gameStateRef.current === "playing") {
        await sleep(120);
        continue;
      }

      const result = await playRound({ betAmount: roundBet, rollsToMake: rollsPerRound });
      if (!result) break;

      const lastNet = normalizeMoney((result.winAmount ?? 0) - result.betAmount);
      autoNetRef.current = normalizeMoney(autoNetRef.current + lastNet);

      if (result.didWin && result.winAmount > 0) {
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
        stopRequestedRef.current = true;
      }
      if (stopLoss > 0 && lastNet <= -stopLoss) {
        stopRequestedRef.current = true;
      }

      if (stopRequestedRef.current) {
        isAutoBettingRef.current = false;
        break;
      }

      await sleep(800);
    }

    isAutoBettingRef.current = false;
    setIsAutoBetting(false);
  }, [
    autoRollsInput,
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
      if (gameStateRef.current === "playing" || isAnimatingRef.current) return;

      try {
        stopAutoBet();
      } catch (e) {}

      if (resultTimeoutRef.current) {
        clearTimeout(resultTimeoutRef.current);
        resultTimeoutRef.current = null;
      }
      setResultFx(null);
      setDeadFx(false);

      gameStateRef.current = "idle";
      setGameState("idle");
      setCurrentPos(-1);
      totalMultiplierRef.current = 1;
      setTotalMultiplier(1);
      prevMultRef.current = 1;
      setDisplayMultiplier(1);
      setIsRolling(false);
      setRolls([]);
      setLastWin(0);
      setDice([1, 1]);

      setBetBoth(100);
      setRisk("low");

      setOnWinMode("reset");
      setOnWinPctInput("0");
      setOnLoseMode("reset");
      setOnLosePctInput("0");
      setStopProfitInput("0");
      setStopLossInput("0");
      setAutoRollsInput("1");

      isAutoBettingRef.current = false;
      setIsAutoBetting(false);
      autoOriginalBetRef.current = 0;
      autoNetRef.current = 0;

      setPlayMode(mode);
    },
    [stopAutoBet]
  );

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
                disabled={isBusy || gameState === "playing"}
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
              disabled={isBusy || gameState === "playing"}
              className="w-full bg-[#0f212e] border border-[#2f4553] rounded-md py-2 pl-7 pr-4 text-white font-mono focus:outline-none focus:border-[#00e701] transition-colors disabled:opacity-50"
            />
          </div>
          <div className="grid grid-cols-3 gap-2">
            <button
              onClick={() => {
                const newBet = normalizeMoney(betAmount / 2);
                setBetBoth(newBet);
              }}
              disabled={isBusy || gameState === "playing"}
              className="bg-[#2f4553] hover:bg-[#3e5666] text-xs py-1 rounded text-[#b1bad3] disabled:opacity-50"
            >
              ½
            </button>
            <button
              onClick={() => {
                const newBet = normalizeMoney(betAmount * 2);
                setBetBoth(newBet);
              }}
              disabled={isBusy || gameState === "playing"}
              className="bg-[#2f4553] hover:bg-[#3e5666] text-xs py-1 rounded text-[#b1bad3] disabled:opacity-50"
            >
              2×
            </button>
            <button
              onClick={() => {
                const newBet = normalizeMoney(balance);
                setBetBoth(newBet);
              }}
              disabled={isBusy || gameState === "playing"}
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
            {(["low", "medium", "high", "expert", "master"] as RiskLevel[]).map(
              (level) => (
                <button
                  key={level}
                  onClick={() => !isBusy && changeRisk(level)}
                  disabled={isBusy || gameState === "playing"}
                  className={`flex-1 py-2 text-[10px] font-bold uppercase rounded transition-colors ${
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

        {playMode === "manual" && (
          <div>
            {gameState === "playing" ? (
            <div className="flex gap-2">
              <button
                onClick={rollDice}
                disabled={!canRoll}
                className="flex-1 bg-[#2f4553] hover:bg-[#3e5666] disabled:opacity-50 disabled:cursor-not-allowed text-white py-3 rounded-md font-bold text-lg transition-all active:scale-95 flex items-center justify-center gap-2"
              >
                {isAnimating ? <Refresh className="animate-spin" /> : "Roll"}
              </button>
              <button
                onClick={manualCashout}
                disabled={!canCashout || isAnimating}
                className="px-4 bg-[#00e701] hover:bg-[#00c201] text-black rounded-md font-bold text-lg disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 shadow-[0_0_20px_rgba(0,231,1,0.2)]"
              >
                Cashout
              </button>
            </div>
            ) : (
            <div className="flex gap-2">
              <button
                onClick={rollDice}
                disabled={!canRoll}
                className="flex-1 bg-[#00e701] hover:bg-[#00c201] disabled:opacity-50 disabled:cursor-not-allowed text-black py-3 rounded-md font-bold text-lg shadow-[0_0_20px_rgba(0,231,1,0.2)] transition-all active:scale-95 flex items-center justify-center gap-2"
              >
                <PlayArrow sx={{ fontSize: 22 }} /> Bet
              </button>
            </div>
            )}
          </div>
        )}

        {playMode === "auto" && (
          <>
            <div className="space-y-2">
              <label className="text-xs font-bold text-[#b1bad3] uppercase tracking-wider">
                Rolls
              </label>
              <div className="relative">
                <input
                  type="number"
                  value={autoRollsInput}
                  onChange={(e) => setAutoRollsInput(e.target.value)}
                  onBlur={() => {
                    const raw = autoRollsInput.trim();
                    const sanitized = raw.replace(/^0+(?=\d)/, "") || "1";
                    const v = Math.max(1, Math.floor(parseNumberLoose(sanitized)));
                    setAutoRollsInput(String(v));
                  }}
                  disabled={isBusy}
                  className="w-full bg-[#0f212e] border border-[#2f4553] rounded-md py-2 px-4 text-white font-mono focus:outline-none focus:border-[#00e701] transition-colors"
                  placeholder="1"
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
                <div className="absolute left-3 top-1/2 -translate-y-1/2 text-[#b1bad3]">$</div>
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
                <div className="absolute left-3 top-1/2 -translate-y-1/2 text-[#b1bad3]">$</div>
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
                disabled={isBusy || betAmount <= 0}
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

        {gameState === "playing" && (
          <div className="bg-[#0f212e] p-4 rounded border border-[#2f4553] text-center">
            <div className="text-[#b1bad3] text-sm">Current Win</div>
            <div className="text-2xl font-bold text-[#00e701]">
              ${currentWin.toFixed(2)}
            </div>
            <div className="text-sm text-[#b1bad3] mt-1">
              Current: {totalMultiplier}x
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

      <div className="flex-1 min-w-0 flex flex-col gap-4">
        <div className="bg-[#0f212e] rounded-xl p-4 sm:p-6 relative overflow-hidden">
          {resultFx === "rolling" && <div className="limbo-roll-glow" />}
          {resultFx === "win" && <div className="limbo-win-flash" />}
          {resultFx === "lose" && <div className="limbo-lose-flash" />}
          <div
            className={cn(
              "relative z-10 grid gap-2 sm:gap-2 max-w-[390px] w-full mx-auto aspect-square",
              deadFx && "sn-dead-flash"
            )}
            style={{
              gridTemplateAreas: GRID_TEMPLATE,
              gridTemplateColumns: "repeat(4, minmax(0, 1fr))",
              gridTemplateRows: "repeat(4, minmax(0, 1fr))",
            }}
          >
            {[
              ...BOARD_AREAS.map((item) => ({
                ...item,
                type: "board" as const,
              })),
              { area: "center", type: "center" as const },
            ].map((item) => {
              if (item.type === "board") {
                const value = board[item.boardIndex];
                const isCurrent = currentPos === item.boardIndex;
                const isDead = value === "dead";
                const isStart = value === "start";
                const isVisited =
                  rolls.some((r) => r.landing === item.boardIndex) ||
                  item.boardIndex === 0;

                const baseBg = !isAnimating && isCurrent ? "" : "bg-[#213743]";
                const baseBorder = "border border-[#2f4553]";
                const active =
                  isCurrent && !isAnimating && isStart
                    ? "shadow-[0_0_0_2px_#8b5cf6]"
                    : "";
                const visited = !isCurrent && isVisited ? "opacity-95" : "";
                const isTravel = isAnimating && isCurrent;
                const landed =
                  !isAnimating && isCurrent
                    ? isDead
                      ? tileLandedDead
                      : typeof value === "number"
                      ? tileLandedMulti
                      : ""
                    : "";
                const pop = !isAnimating && isCurrent ? "sn-pop" : "";
                const pulse = isTravel
                  ? isDead
                    ? tileTravelHighlightDead
                    : tileTravelHighlight
                  : "";

                return (
                  <div
                    key={item.area}
                    style={{ gridArea: item.area }}
                    className={cn(
                      "aspect-square rounded-lg flex items-center justify-center",
                      baseBg,
                      baseBorder,
                      tile3d,
                      pulse,
                      landed,
                      pop,
                      active,
                      visited
                    )}
                  >
                    {isStart ? (
                      <PlayArrow sx={{ fontSize: 34, color: "#8b5cf6" }} />
                    ) : isDead ? (
                      <div className="flex flex-col items-center">
                        <LocalFireDepartment
                          sx={{
                            fontSize: 30,
                            color:
                              !isAnimating && isCurrent ? "#0f212e" : "#ef4444",
                          }}
                        />
                        <div className="text-[10px] text-[#b1bad3] mt-1">
                          {probPercentForBoardIndex(item.boardIndex)}
                        </div>
                      </div>
                    ) : (
                      <div className="flex flex-col items-center">
                        <span className="text-white font-bold text-lg">
                          {typeof value === "number" ? `${value}x` : ""}
                        </span>
                        {(typeof value === "number" || value === "dead") && (
                          <div className="text-[10px] text-[#b1bad3] mt-1">
                            {probPercentForBoardIndex(item.boardIndex)}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                );
              }

              return (
                <div
                  key={item.area}
                  style={{ gridArea: item.area }}
                  className={cn(
                    "rounded-lg bg-[#213743] border border-[#2f4553]",
                    tile3d,
                    "flex flex-col items-center justify-center p-3"
                  )}
                >
                  <div
                    className={cn(
                      "w-full flex items-center justify-center gap-3",
                      isRolling && "sn-dice-jitter"
                    )}
                  >
                    <div className="w-[42%]">
                      <DiceFace value={dice[0]} />
                    </div>
                    <div className="w-[42%]">
                      <DiceFace value={dice[1]} />
                    </div>
                  </div>
                  <div className="mt-3 bg-[#0f212e] border border-[#2f4553] rounded-md px-4 py-2">
                    <div className="text-lg font-bold text-white">
                      {formatMultiplierShort(displayMultiplier)}x
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
        <GameRecordsPanel gameId="snakes" />
      </div>
    </div>
    </>
  );
}
