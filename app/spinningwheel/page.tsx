"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useWallet } from "@/components/WalletProvider";
import { Casino } from "@mui/icons-material";

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

export default function SpinningWheelPage() {
  const { balance, subtractFromBalance, addToBalance, finalizePendingLoss } = useWallet();

  const [betAmount, setBetAmount] = useState<number>(10);
  const [betInput, setBetInput] = useState<string>("10");

  const [risk, setRisk] = useState<RiskLevel>("low");
  const [segmentsCount, setSegmentsCount] = useState<SegmentCount>(10);

  const [isSpinning, setIsSpinning] = useState(false);
  const [rotationDeg, setRotationDeg] = useState(0);
  const [lastMultiplier, setLastMultiplier] = useState<number | null>(null);
  const [lastWin, setLastWin] = useState(0);

  const [layoutSeed, setLayoutSeed] = useState<number>(() => (Date.now() >>> 0));

  const settleTimerRef = useRef<number | null>(null);

  useEffect(() => {
    setLayoutSeed((Date.now() + Math.floor(Math.random() * 1_000_000)) >>> 0);
  }, [risk, segmentsCount]);

  useEffect(() => {
    return () => {
      if (settleTimerRef.current) window.clearTimeout(settleTimerRef.current);
    };
  }, []);

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

  const canSpin = !isSpinning && betAmount > 0 && betAmount <= balance;

  const spin = useCallback(() => {
    if (!canSpin) return;

    subtractFromBalance(betAmount);
    setLastWin(0);
    setLastMultiplier(null);

    const chosenIndex = Math.floor(Math.random() * segments.length);
    const chosen = segments[chosenIndex];

    const currentMod = ((rotationDeg % 360) + 360) % 360;
    const targetCenter = chosenIndex * anglePer + anglePer / 2;
    const desiredMod = ((360 - targetCenter) % 360 + 360) % 360;

    let delta = desiredMod - currentMod;
    if (delta < 0) delta += 360;

    const extraSpins = 6 + Math.floor(Math.random() * 3);
    const nextRotation = rotationDeg + extraSpins * 360 + delta;

    setIsSpinning(true);
    setRotationDeg(nextRotation);

    if (settleTimerRef.current) window.clearTimeout(settleTimerRef.current);
    settleTimerRef.current = window.setTimeout(() => {
      setIsSpinning(false);
      setLastMultiplier(chosen.multiplier);

      const win = betAmount * chosen.multiplier;
      if (chosen.multiplier > 0) {
        addToBalance(win);
        setLastWin(win);
      } else {
        finalizePendingLoss();
      }
    }, 4200);
  }, [addToBalance, anglePer, betAmount, canSpin, finalizePendingLoss, rotationDeg, segments, subtractFromBalance]);

  const tile3d =
    "shadow-[0_4px_0_#1a2c38] hover:-translate-y-1 active:translate-y-0 active:shadow-none transition-all duration-100";

  return (
    <div className="p-2 sm:p-4 lg:p-6 max-w-350 mx-auto flex flex-col lg:flex-row gap-4 lg:gap-8">
      <div className="w-full lg:w-[240px] flex flex-col gap-3 bg-[#0f212e] p-2 sm:p-3 rounded-xl h-fit text-xs">
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
                setBetAmount(num);
                setBetInput(sanitized);
              }}
              disabled={isSpinning}
              className="w-full bg-[#0f212e] border border-[#2f4553] rounded-md py-2 pl-7 pr-4 text-white font-mono focus:outline-none focus:border-[#00e701] transition-colors disabled:opacity-50"
            />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <button
              onClick={() => {
                const newBet = Number((betAmount / 2).toFixed(2));
                setBetAmount(newBet);
                setBetInput(String(newBet));
              }}
              disabled={isSpinning}
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
              disabled={isSpinning}
              className="bg-[#2f4553] hover:bg-[#3e5666] text-xs py-1 rounded text-[#b1bad3] disabled:opacity-50"
            >
              2×
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
                disabled={isSpinning}
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
                onClick={() => !isSpinning && setRisk(level)}
                disabled={isSpinning}
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

        <button
          onClick={spin}
          disabled={!canSpin}
          className="w-full bg-[#00e701] hover:bg-[#00c201] disabled:opacity-50 disabled:cursor-not-allowed text-black py-3 rounded-md font-bold text-lg shadow-[0_0_20px_rgba(0,231,1,0.2)] transition-all active:scale-95 flex items-center justify-center gap-2"
        >
          <Casino sx={{ fontSize: 22 }} /> Spin
        </button>

        {lastMultiplier !== null && lastMultiplier > 0 && (
            <div className="mt-2 p-4 bg-[#213743] border border-[#00e701] rounded-md text-center animate-pulse">
                <div className="text-xs text-[#b1bad3] uppercase">You Won</div>
                <div className="text-2xl font-bold text-[#00e701]">
                    {"$" + lastWin.toFixed(2)}
                </div>
            </div>
        )}
      </div>

      <div className="flex-1 flex flex-col gap-4">
        <div className="bg-[#0f212e] rounded-xl p-4 sm:p-6">
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

              <div className="absolute inset-0 rounded-full bg-[#0f212e] border border-[#2f4553] shadow-[0_20px_60px_rgba(0,0,0,0.55)]" />
              <div className="absolute inset-2 rounded-full bg-[#213743] border border-[#2f4553]" />

              <div
                className={cn(
                  "absolute inset-3 rounded-full",
                  isSpinning ? "shadow-[0_0_26px_rgba(0,231,1,0.18)]" : "shadow-[0_0_18px_rgba(0,0,0,0.35)]"
                )}
                style={{
                  transform: `rotate(${rotationDeg}deg)`,
                  transition: isSpinning
                    ? "transform 4.1s cubic-bezier(0.12, 0.7, 0.12, 1)"
                    : "transform 0.15s ease-out",
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
                      return (
                        <path
                          key={i}
                          d={path}
                          fill={seg.color}
                          stroke="#0f212e"
                          strokeWidth={1.2}
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
      </div>
    </div>
  );
}
