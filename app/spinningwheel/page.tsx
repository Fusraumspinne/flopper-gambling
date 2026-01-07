"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useWallet } from "@/components/WalletProvider";
import { useSoundVolume } from "@/components/SoundVolumeProvider";
import { PlayArrow } from "@mui/icons-material";
import GameRecordsPanel from "@/components/GameRecordsPanel";

type RiskLevel = "low" | "medium" | "high";
type SegmentCount = 10 | 20 | 30 | 40 | 50;

type Segment = {
  multiplier: number;
  color: string;
};

const SEGMENT_OPTIONS: SegmentCount[] = [10, 20, 30, 40, 50];

const LOW_BASE_10: Array<{ m: number; c: number }> = [
  { m: 0, c: 2 },
  { m: 1.2, c: 7 },
  { m: 1.5, c: 1 },
];

const MEDIUM_BY_COUNT: Record<SegmentCount, Array<{ m: number; c: number }>> = {
  10: [
    { m: 0, c: 5 },
    { m: 1.5, c: 2 },
    { m: 1.9, c: 1 },
    { m: 2, c: 1 },
    { m: 3, c: 1 },
  ],
  20: [
    { m: 0, c: 10 },
    { m: 1.5, c: 2 },
    { m: 1.8, c: 1 },
    { m: 2, c: 6 },
    { m: 3, c: 1 },
  ],
  30: [
    { m: 0, c: 15 },
    { m: 1.5, c: 6 },
    { m: 1.7, c: 1 },
    { m: 2, c: 6 },
    { m: 3, c: 1 },
    { m: 4, c: 1 },
  ],
  40: [
    { m: 0, c: 20 },
    { m: 1.5, c: 8 },
    { m: 1.6, c: 1 },
    { m: 2, c: 7 },
    { m: 3, c: 4 },
  ],
  50: [
    { m: 0, c: 25 },
    { m: 1.5, c: 13 },
    { m: 2, c: 8 },
    { m: 3, c: 3 },
    { m: 5, c: 1 },
  ],
};

const HIGH_BY_COUNT: Record<SegmentCount, Array<{ m: number; c: number }>> = {
  10: [
    { m: 0, c: 9 },
    { m: 9.9, c: 1 },
  ],
  20: [
    { m: 0, c: 19 },
    { m: 19.8, c: 1 },
  ],
  30: [
    { m: 0, c: 29 },
    { m: 29.7, c: 1 },
  ],
  40: [
    { m: 0, c: 39 },
    { m: 39.7, c: 1 },
  ],
  50: [
    { m: 0, c: 49 },
    { m: 49.5, c: 1 },
  ],
};

function cn(...parts: Array<string | false | null | undefined>) {
  return parts.filter(Boolean).join(" ");
}

function hexToRgb(hex: string): { r: number; g: number; b: number } | null {
  const raw = hex.trim();
  if (!raw.startsWith("#")) return null;
  const h = raw.slice(1);
  if (h.length === 3) {
    const r = Number.parseInt(h[0] + h[0], 16);
    const g = Number.parseInt(h[1] + h[1], 16);
    const b = Number.parseInt(h[2] + h[2], 16);
    if ([r, g, b].some((v) => Number.isNaN(v))) return null;
    return { r, g, b };
  }
  if (h.length === 6) {
    const r = Number.parseInt(h.slice(0, 2), 16);
    const g = Number.parseInt(h.slice(2, 4), 16);
    const b = Number.parseInt(h.slice(4, 6), 16);
    if ([r, g, b].some((v) => Number.isNaN(v))) return null;
    return { r, g, b };
  }
  return null;
}

function rgbaFromHex(hex: string, alpha: number) {
  const rgb = hexToRgb(hex);
  if (!rgb) return null;
  const a = Math.min(1, Math.max(0, alpha));
  return `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, ${a})`;
}

function readElementRotationDeg(el: HTMLElement): number {
  const t = window.getComputedStyle(el).transform;
  if (!t || t === "none") return 0;

  if (t.startsWith("matrix(")) {
    const nums = t
      .slice(7, -1)
      .split(",")
      .map((s) => Number.parseFloat(s.trim()));
    const a = nums[0] ?? 1;
    const b = nums[1] ?? 0;
    const deg = (Math.atan2(b, a) * 180) / Math.PI;
    return ((deg % 360) + 360) % 360;
  }

  if (t.startsWith("matrix3d(")) {
    const nums = t
      .slice(9, -1)
      .split(",")
      .map((s) => Number.parseFloat(s.trim()));
    const a = nums[0] ?? 1;
    const b = nums[1] ?? 0;
    const deg = (Math.atan2(b, a) * 180) / Math.PI;
    return ((deg % 360) + 360) % 360;
  }

  return 0;
}

function formatMultiplierShort(mult: number) {
  if (!Number.isFinite(mult)) return "0";
  const rounded = Number.parseFloat(mult.toFixed(6));
  return rounded.toString();
}

function buildCounts(risk: RiskLevel, segments: SegmentCount): Array<{ m: number; c: number }> {
  if (risk === "low") {
    const factor = segments / 10;
    return LOW_BASE_10.map((x) => ({ m: x.m, c: x.c * factor }));
  }
  if (risk === "medium") return MEDIUM_BY_COUNT[segments];
  return HIGH_BY_COUNT[segments];
}

function expandSegments(counts: Array<{ m: number; c: number }>): number[] {
  const list: number[] = [];
  for (const { m, c } of counts) {
    for (let i = 0; i < c; i++) list.push(m);
  }
  return list;
}

function adjacentEqualScore(arr: number[]) {
  if (arr.length <= 1) return 0;
  let score = 0;
  for (let i = 0; i < arr.length; i++) {
    if (arr[i] === arr[(i + 1) % arr.length]) score++;
  }
  return score;
}

function mulberry32(seed: number) {
  let t = seed >>> 0;
  return () => {
    t += 0x6d2b79f5;
    let x = t;
    x = Math.imul(x ^ (x >>> 15), x | 1);
    x ^= x + Math.imul(x ^ (x >>> 7), x | 61);
    return ((x ^ (x >>> 14)) >>> 0) / 4294967296;
  };
}

function shuffleInPlace<T>(arr: T[], rnd: () => number) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    const tmp = arr[i];
    arr[i] = arr[j];
    arr[j] = tmp;
  }
  return arr;
}

function arrangeCircular(values: number[], seed: number): number[] {
  const n = values.length;
  if (n <= 2) return values.slice();

  const base = values.slice();
  let best = base;
  let bestScore = Number.POSITIVE_INFINITY;

  const tries = Math.min(48, 12 + n);
  for (let t = 0; t < tries; t++) {
    const rnd = mulberry32((seed + 1013 * (t + 1)) >>> 0);
    const candidate = shuffleInPlace(base.slice(), rnd);
    let score = adjacentEqualScore(candidate);

    let temp = 1.6;
    const steps = 1200 + n * 80;
    for (let step = 0; step < steps && score > 0; step++) {
      const i = Math.floor(rnd() * n);
      let j = Math.floor(rnd() * n);
      if (j === i) j = (j + 1) % n;
      if (candidate[i] === candidate[j]) {
        temp *= 0.995;
        continue;
      }

      const tmp = candidate[i];
      candidate[i] = candidate[j];
      candidate[j] = tmp;

      const nextScore = adjacentEqualScore(candidate);
      const delta = nextScore - score;
      const accept = delta <= 0 || rnd() < Math.exp(-delta / Math.max(0.001, temp));
      if (accept) {
        score = nextScore;
      } else {
        const tmp2 = candidate[i];
        candidate[i] = candidate[j];
        candidate[j] = tmp2;
      }

      temp *= 0.995;
    }

    if (score < bestScore) {
      best = candidate.slice();
      bestScore = score;
      if (bestScore === 0) break;
    }
  }

  return best;
}

function buildConicGradient(segments: Segment[], anglePer: number) {
  const stops = segments
    .map((seg, i) => {
      const start = i * anglePer;
      const end = (i + 1) * anglePer;
      return `${seg.color} ${start}deg ${end}deg`;
    })
    .join(", ");
  return `conic-gradient(from 0deg, ${stops})`;
}

function formatChancePercent(p: number) {
  if (!Number.isFinite(p) || p <= 0) return "0%";
  if (p >= 1) return `${p.toFixed(p % 1 === 0 ? 0 : 2)}%`;
  return `${Number(p.toPrecision(3))}%`;
}

function polar(cx: number, cy: number, r: number, degFromTopClockwise: number) {
  const rad = ((degFromTopClockwise - 90) * Math.PI) / 180;
  return { x: cx + r * Math.cos(rad), y: cy + r * Math.sin(rad) };
}

function ringSlicePath(cx: number, cy: number, rOuter: number, rInner: number, startDeg: number, endDeg: number) {
  const largeArc = endDeg - startDeg > 180 ? 1 : 0;
  const p1 = polar(cx, cy, rOuter, startDeg);
  const p2 = polar(cx, cy, rOuter, endDeg);
  const p3 = polar(cx, cy, rInner, endDeg);
  const p4 = polar(cx, cy, rInner, startDeg);
  return [
    `M ${p1.x} ${p1.y}`,
    `A ${rOuter} ${rOuter} 0 ${largeArc} 1 ${p2.x} ${p2.y}`,
    `L ${p3.x} ${p3.y}`,
    `A ${rInner} ${rInner} 0 ${largeArc} 0 ${p4.x} ${p4.y}`,
    "Z",
  ].join(" ");
}

function topIndexFromRotation(rotationDeg: number, anglePer: number, len: number) {
  if (len <= 0 || !Number.isFinite(anglePer) || anglePer <= 0) return 0;
  const rot = ((rotationDeg % 360) + 360) % 360;
  const wheelAngleAtPointer = ((360 - rot) % 360 + 360) % 360;
  return Math.floor(wheelAngleAtPointer / anglePer) % len;
}

export default function SpinningWheelPage() {
  const { balance, subtractFromBalance, addToBalance, finalizePendingLoss } = useWallet();

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

  const [betAmount, setBetAmount] = useState<number>(100);
  const [betInput, setBetInput] = useState<string>("100");

  const setBetBoth = (next: number) => {
    const v = normalizeMoney(next);
    setBetAmount(v);
    setBetInput(String(v));
  };

  const [risk, setRisk] = useState<RiskLevel>("low");
  const [segmentsCount, setSegmentsCount] = useState<SegmentCount>(10);

  const [playMode, setPlayMode] = useState<"manual" | "auto">("manual");
  const [onWinMode, setOnWinMode] = useState<"reset" | "raise">("reset");
  const [onWinPctInput, setOnWinPctInput] = useState<string>("0");
  const [onLoseMode, setOnLoseMode] = useState<"reset" | "raise">("reset");
  const [onLosePctInput, setOnLosePctInput] = useState<string>("0");
  const [stopProfitInput, setStopProfitInput] = useState<string>("0");
  const [stopLossInput, setStopLossInput] = useState<string>("0");
  const [isAutoBetting, setIsAutoBetting] = useState(false);

  const [isSpinning, setIsSpinning] = useState(false);
  const [rotationDeg, setRotationDeg] = useState(0);
  const [lastMultiplier, setLastMultiplier] = useState<number | null>(null);
  const [lastWin, setLastWin] = useState(0);
  const [lastColor, setLastColor] = useState<string | null>(null);
  const [topPointerColor, setTopPointerColor] = useState<string | null>(null);
  const [topPointerIndex, setTopPointerIndex] = useState<number | null>(null);

  const [layoutSeed, setLayoutSeed] = useState<number>(() => (Date.now() >>> 0));

  const settleTimerRef = useRef<number | null>(null);
  const wheelRef = useRef<HTMLDivElement | null>(null);
  const rafRef = useRef<number | null>(null);
  const lastTopIndexRef = useRef<number | null>(null);
  const resultTimeoutRef = useRef<number | null>(null);
  const [resultFx, setResultFx] = useState<"rolling" | "win" | "lose" | null>(null);

  const audioRef = useRef<{
    bet: HTMLAudioElement | null;
    win: HTMLAudioElement | null;
    limboLose: HTMLAudioElement | null;
  }>({ bet: null, win: null, limboLose: null });

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

  const betAmountRef = useRef<number>(100);
  const balanceRef = useRef<number>(0);
  const isSpinningRef = useRef(false);
  const rotationDegRef = useRef<number>(0);
  const isAutoBettingRef = useRef(false);
  const segmentsRef = useRef<Segment[]>([]);
  const autoOriginalBetRef = useRef<number>(0);
  const autoNetRef = useRef<number>(0);

  useEffect(() => {
    setLayoutSeed((Date.now() + Math.floor(Math.random() * 1_000_000)) >>> 0);
    setLastMultiplier(null);
    setLastColor(null);
    setTopPointerColor(null);
    setTopPointerIndex(null);
    if (rafRef.current) {
      window.cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
  }, [risk, segmentsCount]);

  useEffect(() => {
    return () => {
      if (settleTimerRef.current) window.clearTimeout(settleTimerRef.current);
      if (rafRef.current) window.cancelAnimationFrame(rafRef.current);
      if (resultTimeoutRef.current) {
        clearTimeout(resultTimeoutRef.current);
        resultTimeoutRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    betAmountRef.current = betAmount;
  }, [betAmount]);

  useEffect(() => {
    balanceRef.current = balance;
  }, [balance]);

  useEffect(() => {
    isSpinningRef.current = isSpinning;
  }, [isSpinning]);

  useEffect(() => {
    rotationDegRef.current = rotationDeg;
  }, [rotationDeg]);

  useEffect(() => {
    isAutoBettingRef.current = isAutoBetting;
  }, [isAutoBetting]);

  const segments = useMemo<Segment[]>(() => {
    const counts = buildCounts(risk, segmentsCount);
    const expanded = expandSegments(counts);

    const unique = Array.from(new Set(expanded)).sort((a, b) => a - b);
    const palette = ["#00e701", "#8b5cf6", "#3b82f6", "#84cc16", "#eab308", "#f97316", "#ef4444"];
    const colorMap = new Map<number, string>();
    colorMap.set(0, "#2f4553");
    let idx = 0;
    for (const m of unique) {
      if (m === 0) continue;
      colorMap.set(m, palette[idx % palette.length]);
      idx++;
    }

    const arranged = arrangeCircular(expanded, layoutSeed);
    return arranged.map((m) => ({ multiplier: m, color: colorMap.get(m) ?? "#2f4553" }));
  }, [layoutSeed, risk, segmentsCount]);

  useEffect(() => {
    segmentsRef.current = segments;
  }, [segments]);

  const distribution = useMemo(() => {
    const total = segments.length;
    const map = new Map<number, { multiplier: number; color: string; count: number }>();
    for (const seg of segments) {
      const prev = map.get(seg.multiplier);
      if (prev) prev.count += 1;
      else map.set(seg.multiplier, { multiplier: seg.multiplier, color: seg.color, count: 1 });
    }
    const items = Array.from(map.values()).sort((a, b) => a.multiplier - b.multiplier);
    return items.map((it) => ({
      ...it,
      chancePct: total > 0 ? (it.count / total) * 100 : 0,
      total,
    }));
  }, [segments]);

  const anglePer = 360 / segments.length;

  useEffect(() => {
    if (!isSpinning) {
      setTopPointerColor(null);
      setTopPointerIndex(null);
      lastTopIndexRef.current = null;
      if (rafRef.current) {
        window.cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
      return;
    }

    const tick = () => {
      const el = wheelRef.current;
      if (el && segments.length > 0) {
        const rot = readElementRotationDeg(el);

        const wheelAngleAtPointer = ((360 - rot) % 360 + 360) % 360;
        const idx = Math.floor(wheelAngleAtPointer / anglePer) % segments.length;

        if (lastTopIndexRef.current !== idx) {
          lastTopIndexRef.current = idx;
          setTopPointerColor(segments[idx]?.color ?? null);
          setTopPointerIndex(idx);
        }
      }
      rafRef.current = window.requestAnimationFrame(tick);
    };

    rafRef.current = window.requestAnimationFrame(tick);
    return () => {
      if (rafRef.current) {
        window.cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
    };
  }, [anglePer, isSpinning, segments]);

  const showWheelHighlight = !isSpinning && lastMultiplier !== null;
  const highlightInner = lastColor ? rgbaFromHex(lastColor, 0.55) : null;
  const highlightOuter = lastColor ? rgbaFromHex(lastColor, 0.35) : null;
  const wheelShadow =
    showWheelHighlight && highlightInner && highlightOuter
      ? `0 0 18px ${highlightInner}, 0 0 54px ${highlightOuter}`
      : "0 0 18px rgba(0,0,0,0.35)";

  const spinningBehindWheel = isSpinning && topPointerColor ? rgbaFromHex(topPointerColor, 0.22) : null;

  const activeSegmentIndex = isSpinning
    ? (topPointerIndex ?? topIndexFromRotation(rotationDeg, anglePer, segments.length))
    : topIndexFromRotation(rotationDeg, anglePer, segments.length);

  const canSpin = !isSpinning && betAmount > 0 && betAmount <= balance;

  const playRound = useCallback(
    async (opts?: { betAmount?: number }) => {
      const segs = segmentsRef.current;
      const bet = normalizeMoney(opts?.betAmount ?? betAmountRef.current);

      if (segs.length === 0 || bet <= 0 || bet > balanceRef.current || isSpinningRef.current) {
        return null as null | { betAmount: number; multiplier: number; winAmount: number };
      }

      subtractFromBalance(bet);
      playAudio(audioRef.current.bet);
      setLastWin(0);
      setLastMultiplier(null);
      setLastColor(null);

      const chosenIndex = Math.floor(Math.random() * segs.length);
      const chosen = segs[chosenIndex];

      const currentRotation = rotationDegRef.current;
      const currentMod = ((currentRotation % 360) + 360) % 360;
      const targetCenter = chosenIndex * anglePer + anglePer / 2;
      const desiredMod = ((360 - targetCenter) % 360 + 360) % 360;

      let delta = desiredMod - currentMod;
      if (delta < 0) delta += 360;

      const extraSpins = 6 + Math.floor(Math.random() * 3);
      const nextRotation = currentRotation + extraSpins * 360 + delta;

      setIsSpinning(true);
      isSpinningRef.current = true;
      setRotationDeg(nextRotation);
      rotationDegRef.current = nextRotation;
      setResultFx("rolling");

      if (settleTimerRef.current) window.clearTimeout(settleTimerRef.current);

      return await new Promise<{ betAmount: number; multiplier: number; winAmount: number }>((resolve) => {
        settleTimerRef.current = window.setTimeout(() => {
          setIsSpinning(false);
          isSpinningRef.current = false;
          setLastMultiplier(chosen.multiplier);
          setLastColor(chosen.color);

          const winAmount = normalizeMoney(bet * chosen.multiplier);
          if (chosen.multiplier > 0) {
            addToBalance(winAmount);
            setLastWin(winAmount);
          } else {
            finalizePendingLoss();
          }

          // Play sounds: Win only for multis >= 1x, otherwise Limbo lose
          if (chosen.multiplier >= 1) {
            playAudio(audioRef.current.win);
          } else {
            playAudio(audioRef.current.limboLose);
          }

          if (resultTimeoutRef.current) {
            clearTimeout(resultTimeoutRef.current);
            resultTimeoutRef.current = null;
          }
          if (chosen.multiplier < 1) setResultFx("lose");
          else setResultFx("win");

          const resultObj = { betAmount: bet, multiplier: chosen.multiplier, winAmount };
          resultTimeoutRef.current = window.setTimeout(() => {
            setResultFx(null);
            resultTimeoutRef.current = null;
            resolve(resultObj);
          }, 900);
        }, 4200);
      });
    },
    [addToBalance, anglePer, finalizePendingLoss, subtractFromBalance]
  );

  const playGame = useCallback(async () => {
    await playRound();
  }, [playRound]);

  const stopAutoBet = useCallback(() => {
    isAutoBettingRef.current = false;
    setIsAutoBetting(false);
    autoOriginalBetRef.current = 0;
    autoNetRef.current = 0;
  }, []);

  const startAutoBet = useCallback(async () => {
    if (isAutoBettingRef.current) return;

    const startingBet = normalizeMoney(betAmountRef.current);
    if (segmentsRef.current.length === 0) return;
    if (startingBet <= 0 || startingBet > balanceRef.current) return;
    if (isSpinningRef.current) return;

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
      if (segmentsRef.current.length === 0) break;

      const result = await playRound({ betAmount: roundBet });
      if (!result) break;

      const lastNet = normalizeMoney(result.winAmount - result.betAmount);
      const isWin = result.multiplier >= 1;
      autoNetRef.current = normalizeMoney(autoNetRef.current + lastNet);

      if (isWin) {
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
    stopLossInput,
    stopProfitInput,
    stopAutoBet,
  ]);

  const changePlayMode = useCallback((mode: "manual" | "auto") => {
    try {
      stopAutoBet();
    } catch (e) {
    }

    if (settleTimerRef.current) {
      window.clearTimeout(settleTimerRef.current);
      settleTimerRef.current = null;
    }
    if (rafRef.current) {
      window.cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
    if (resultTimeoutRef.current) {
      clearTimeout(resultTimeoutRef.current);
      resultTimeoutRef.current = null;
    }

    setIsSpinning(false);
    isSpinningRef.current = false;
    setRotationDeg(0);
    rotationDegRef.current = 0;
    setResultFx(null);

    setLastMultiplier(null);
    setLastColor(null);
    setLastWin(0);
    lastTopIndexRef.current = null;
    setTopPointerColor(null);
    setTopPointerIndex(null);

    setLayoutSeed((Date.now() >>> 0));

    setBetBoth(100);
    betAmountRef.current = 100;

    setRisk("low");
    setSegmentsCount(10);

    setOnWinMode("reset");
    setOnWinPctInput("0");
    setOnLoseMode("reset");
    setOnLosePctInput("0");
    setStopProfitInput("0");
    setStopLossInput("0");

    stopAutoBet();
    isAutoBettingRef.current = false;
    setIsAutoBetting(false);
    autoOriginalBetRef.current = 0;
    autoNetRef.current = 0;

    setPlayMode(mode);
  }, [stopAutoBet]);

  const tile3d =
    "shadow-[0_4px_0_#1a2c38] hover:-translate-y-1 active:translate-y-0 active:shadow-none transition-all duration-100";

  const isBusy = isSpinning || isAutoBetting;

  return (
    <>
    <div className="p-2 sm:p-4 lg:p-6 max-w-350 mx-auto flex flex-col lg:flex-row gap-4 lg:gap-8">
      <div className="w-full lg:w-60 flex flex-col gap-3 bg-[#0f212e] p-2 sm:p-3 rounded-xl h-fit text-xs">
        <div className="space-y-2">
          <label className="text-xs font-bold text-[#b1bad3] uppercase tracking-wider">Mode</label>
          <div className="bg-[#0f212e] p-1 rounded-md border border-[#2f4553] flex">
            {(["manual", "auto"] as const).map((mode) => (
              <button
                key={mode}
                onClick={() => !isBusy && changePlayMode(mode)}
                disabled={isBusy}
                className={cn(
                  "flex-1 py-2 text-[10px] font-bold uppercase rounded transition-colors disabled:opacity-50 disabled:cursor-not-allowed",
                  playMode === mode ? "bg-[#213743] text-white shadow-sm" : "text-[#b1bad3] hover:text-white"
                )}
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
          <label className="text-xs font-bold text-[#b1bad3] uppercase tracking-wider">Segments</label>
          <div className="bg-[#0f212e] p-1 rounded-md border border-[#2f4553] flex">
            {SEGMENT_OPTIONS.map((n) => (
              <button
                key={n}
                onClick={() => setSegmentsCount(n)}
                disabled={isBusy}
                className={cn(
                  "flex-1 py-2 text-xs font-bold uppercase rounded transition-colors disabled:opacity-50 disabled:cursor-not-allowed",
                  segmentsCount === n ? "bg-[#213743] text-white shadow-sm" : "text-[#b1bad3] hover:text-white"
                )}
              >
                {n}
              </button>
            ))}
          </div>
        </div>

        <div className="space-y-2">
          <label className="text-xs font-bold text-[#b1bad3] uppercase tracking-wider">Risk</label>
          <div className="bg-[#0f212e] p-1 rounded-md border border-[#2f4553] flex">
            {(["low", "medium", "high"] as RiskLevel[]).map((level) => (
              <button
                key={level}
                onClick={() => !isBusy && setRisk(level)}
                disabled={isBusy}
                className={cn(
                  "flex-1 py-2 text-[10px] font-bold uppercase rounded transition-colors disabled:opacity-50 disabled:cursor-not-allowed",
                  risk === level ? "bg-[#213743] text-white shadow-sm" : "text-[#b1bad3] hover:text-white"
                )}
              >
                {level}
              </button>
            ))}
          </div>
        </div>

        {playMode === "manual" && (
          <button
            onClick={playGame}
            disabled={!canSpin}
            className="w-full bg-[#00e701] hover:bg-[#00c201] disabled:opacity-50 disabled:cursor-not-allowed text-black py-3 rounded-md font-bold text-lg shadow-[0_0_20px_rgba(0,231,1,0.2)] transition-all active:scale-95 flex items-center justify-center gap-2"
          >
            <PlayArrow sx={{ fontSize: 22 }} /> Bet
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
                    className={cn(
                      "flex-1 py-2 text-[10px] font-bold uppercase rounded transition-colors disabled:opacity-50 disabled:cursor-not-allowed",
                      onWinMode === m ? "bg-[#213743] text-white shadow-sm" : "text-[#b1bad3] hover:text-white"
                    )}
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
              <label className="text-xs font-bold text-[#b1bad3] uppercase tracking-wider">On Loss</label>
              <div className="bg-[#0f212e] p-1 rounded-md border border-[#2f4553] flex">
                {(["reset", "raise"] as const).map((m) => (
                  <button
                    key={m}
                    onClick={() => !isBusy && setOnLoseMode(m)}
                    disabled={isBusy}
                    className={cn(
                      "flex-1 py-2 text-[10px] font-bold uppercase rounded transition-colors disabled:opacity-50 disabled:cursor-not-allowed",
                      onLoseMode === m ? "bg-[#213743] text-white shadow-sm" : "text-[#b1bad3] hover:text-white"
                    )}
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
              <label className="text-xs font-bold text-[#b1bad3] uppercase tracking-wider">Stop on Profit</label>
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
              <label className="text-xs font-bold text-[#b1bad3] uppercase tracking-wider">Stop on Loss</label>
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
                disabled={isSpinning || betAmount <= 0 || betAmount > balance}
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

        {lastMultiplier !== null && lastMultiplier > 0 && (
            <div className="p-4 bg-[#213743] border border-[#00e701] rounded-md text-center animate-pulse">
                <div className="text-xs text-[#b1bad3] uppercase">You Won</div>
                <div className="text-2xl font-bold text-[#00e701]">
                    {"$" + lastWin.toFixed(2)}
                </div>
            </div>
        )}
      </div>

      <div className="flex-1 min-w-0 flex flex-col gap-4">
        <div className="bg-[#0f212e] rounded-xl p-4 sm:p-6 pt-8 sm:pt-10">
          <div className="max-w-130 w-full mx-auto">
            <div className="relative aspect-square">
              <div className="absolute left-1/2 -translate-x-1/2 -top-3 z-30">
                <div className="relative">
                  <div className="absolute left-1/2 -translate-x-1/2 -top-1 w-0.5 h-10 bg-[#ef4444] shadow-[0_4px_0_#1a2c38]" />
                  <div className="w-0 h-0 border-l-10 border-r-10 border-b-18 border-l-transparent border-r-transparent border-b-[#ef4444] drop-shadow-[0_4px_0_#1a2c38]" />
                  <div className="absolute left-1/2 -translate-x-1/2 -top-3 w-7 h-7 rounded-full bg-[#0f212e] border border-[#2f4553] shadow-[0_6px_0_#1a2c38]">
                    <div className="absolute inset-1.5 rounded-full bg-[#1a2c38]" />
                    <div className="absolute inset-2.5 rounded-full bg-[#0f212e]" />
                  </div>
                </div>
              </div>

                {resultFx === "rolling" && <div className="limbo-roll-glow absolute inset-0 pointer-events-none z-20" />}
                {resultFx === "win" && <div className="limbo-win-flash absolute inset-0 pointer-events-none z-20" />}
                {resultFx === "lose" && <div className="limbo-lose-flash absolute inset-0 pointer-events-none z-20" />}

                {resultFx === "rolling" && (
                  <div
                    className="absolute inset-0 pointer-events-none z-18"
                    style={{
                      background:
                        "radial-gradient(circle at 50% 55%, rgba(47,69,83,0.22) 0%, rgba(15,33,46,0.0) 68%)",
                      opacity: 0.85,
                    }}
                  />
                )}

                <div className="absolute inset-0 rounded-full bg-[#0f212e] border border-[#2f4553] shadow-[0_20px_60px_rgba(0,0,0,0.55)]" />
              <div
                className="absolute inset-2 rounded-full border border-[#2f4553] transition-colors duration-75"
                style={{ backgroundColor: spinningBehindWheel ?? "#213743" }}
              />

              <div
                ref={wheelRef}
                className={cn("absolute inset-3 rounded-full")}
                style={{
                  transform: `rotate(${rotationDeg}deg)`,
                  transition: isSpinning
                    ? "transform 4.1s cubic-bezier(0.12, 0.7, 0.12, 1)"
                    : "transform 0.15s ease-out",
                  boxShadow: wheelShadow,
                  zIndex: 10,
                }}
              >
                <svg viewBox="0 0 200 200" className="w-full h-full rounded-full">
                  <defs>
                    <filter id="wheelShadow" x="-50%" y="-50%" width="200%" height="200%">
                      <feDropShadow dx="0" dy="2" stdDeviation="2" floodColor="#000" floodOpacity="0.35" />
                    </filter>
                  </defs>

                  <circle cx="100" cy="100" r="98" fill="#0f212e" />
                  <circle cx="100" cy="100" r="96" fill="#213743" />

                  <g filter="url(#wheelShadow)">
                    {segments.map((seg, i) => {
                      const start = i * anglePer;
                      const end = (i + 1) * anglePer;
                      const path = ringSlicePath(100, 100, 92, 44, start, end);
                      const isActive = i === activeSegmentIndex;
                      return (
                        <path
                          key={i}
                          d={path}
                          fill={seg.color}
                          stroke="#0f212e"
                          strokeWidth={1.2}
                          style={{
                            transform: isActive
                              ? "translate(100px, 100px) scale(1.05) translate(-100px, -100px)"
                              : "translate(100px, 100px) scale(1) translate(-100px, -100px)",
                            transition: "transform 120ms ease-out",
                          }}
                        />
                      );
                    })}
                  </g>

                  <g>
                    {segments.map((_, i) => {
                      const a = i * anglePer;
                      const p1 = polar(100, 100, 94, a);
                      const p2 = polar(100, 100, 88, a);
                      return (
                        <line
                          key={i}
                          x1={p1.x}
                          y1={p1.y}
                          x2={p2.x}
                          y2={p2.y}
                          stroke="#0f212e"
                          strokeWidth={1.2}
                          opacity={0.6}
                        />
                      );
                    })}
                  </g>

                  <circle cx="100" cy="100" r="44" fill="#0f212e" />
                  <circle cx="100" cy="100" r="42" fill="#1a2c38" />
                  <circle cx="100" cy="100" r="38" fill="#0f212e" />
                </svg>
              </div>

              <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-30">
                <div className="w-24 h-24 sm:w-28 sm:h-28 rounded-full bg-[#0f212e] border border-[#2f4553] flex flex-col items-center justify-center shadow-[inset_0_0_0_2px_#1a2c38,0_0_22px_rgba(0,0,0,0.55)]">
                  {!isSpinning && lastMultiplier !== null && (
                    <>
                      <div className="text-2xl sm:text-3xl font-extrabold text-white leading-none">
                        {formatMultiplierShort(lastMultiplier)}x
                      </div>
                    </>
                  )}
                </div>
              </div>
            </div>

            <div className="mt-4 flex flex-nowrap gap-1 items-center justify-center overflow-hidden">
              {distribution.map((d) => (
                <div
                  key={d.multiplier}
                  className="bg-[#0f212e] border border-[#2f4553] rounded-md px-2 py-1 flex items-center gap-1 whitespace-nowrap"
                >
                  <span
                    className="w-2.5 h-2.5 rounded-full border border-[#2f4553]"
                    style={{ backgroundColor: d.color }}
                    aria-hidden
                  />
                  <span className="text-[12px] text-white font-bold">{formatMultiplierShort(d.multiplier)}x</span>
                  <span className="text-[10px] text-[#b1bad3] font-mono">{formatChancePercent(d.chancePct)}</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        <GameRecordsPanel gameId="spinningwheel" />
      </div>
    </div>
    </>
  );
}
