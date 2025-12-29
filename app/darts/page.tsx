"use client";

import React, { useMemo, useState, useEffect } from "react";
import { useWallet } from "@/components/WalletProvider";
import { PlayArrow, Refresh } from "@mui/icons-material";

type RiskLevel = "Low" | "Medium" | "High" | "Expert";

interface GameConfig {
  multipliers: {
    green: number;
    darkGrey: number;
    lightGrey: number;
    yellow: number;
    orange: number;
    red: number;
  };
  probabilities: {
    green: number;
    darkGrey: number;
    lightGrey: number;
    yellow: number;
    orange: number;
    red: number;
  };
  segments: {
    yellow: number;
    orange: number;
    red: number;
  };
  segmentWidthFactor: number;
  segmentThicknessFactor: number;
}

const RISK_CONFIG: Record<RiskLevel, GameConfig> = {
  Low: {
    multipliers: {
      green: 8.5,
      darkGrey: 0.5,
      lightGrey: 0.8,
      yellow: 1.2,
      orange: 1.5,
      red: 2.7,
    },
    probabilities: {
      darkGrey: 48.0,
      lightGrey: 26.0,
      yellow: 12.0,
      orange: 7.0,
      red: 5.0,
      green: 2.0,
    },
    segments: { yellow: 9, orange: 5, red: 4 },
    segmentWidthFactor: 0.9,
    segmentThicknessFactor: 0.9,
  },

  Medium: {
    multipliers: {
      green: 16,
      darkGrey: 0.4,
      lightGrey: 0.6,
      yellow: 1.3,
      orange: 3.1,
      red: 6,
    },
    probabilities: {
      darkGrey: 55.5,
      lightGrey: 27.5,
      yellow: 8.0,
      orange: 4.5,
      red: 3.8,
      green: 0.7,
    },
    segments: { yellow: 9, orange: 5, red: 4 },
    segmentWidthFactor: 0.7,
    segmentThicknessFactor: 0.7,
  },

  High: {
    multipliers: {
      green: 63,
      darkGrey: 0.2,
      lightGrey: 0.5,
      yellow: 2.5,
      orange: 3.6,
      red: 8.8,
    },
    probabilities: {
      darkGrey: 59.5,
      lightGrey: 26.5,
      yellow: 6.8,
      orange: 4.2,
      red: 2.6,
      green: 0.4,
    },
    segments: { yellow: 9, orange: 6, red: 3 },
    segmentWidthFactor: 0.5,
    segmentThicknessFactor: 0.5,
  },

  Expert: {
    multipliers: {
      green: 500,
      darkGrey: 0.1,
      lightGrey: 0.5,
      yellow: 4.8,
      orange: 9.6,
      red: 42,
    },
    probabilities: {
      darkGrey: 68.8,
      lightGrey: 24.5,
      yellow: 4.0,
      orange: 1.9,
      red: 0.7,
      green: 0.1,
    },
    segments: { yellow: 6, orange: 4, red: 2 },
    segmentWidthFactor: 0.3,
    segmentThicknessFactor: 0.3,
  },
};

const COLORS = {
  green: "#22c55e",
  darkGrey: "#1f2937",
  lightGrey: "#4b5563",
  yellow: "#eab308",
  orange: "#f97316",
  red: "#ef4444",
  background: "#111827",
};

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

const getSegmentPattern = (risk: RiskLevel) => {
  const config = RISK_CONFIG[risk];
  const counts = config.segments;
  const total = counts.yellow + counts.orange + counts.red;
  const result: string[] = new Array(total).fill(null) as string[];

  const placeColorEvenly = (color: keyof typeof counts) => {
    const cnt = counts[color];
    if (cnt <= 0) return;
    for (let k = 0; k < cnt; k++) {
      const pos = Math.round((k * total) / cnt);
      let offset = 0;
      let idx = (pos + offset) % total;
      while (result[idx] !== null && offset < total) {
        offset++;
        idx = (pos + offset) % total;
      }
      result[idx] = color;
    }
  };

  placeColorEvenly("yellow");
  placeColorEvenly("orange");
  placeColorEvenly("red");

  for (let i = 0; i < total; i++) if (!result[i]) result[i] = "yellow";

  return result;
};

export default function DartsPage() {
  const { balance, addToBalance, subtractFromBalance } = useWallet();
  const [bet, setBet] = useState<number>(100);
  const [risk, setRisk] = useState<RiskLevel>("Low");
  const [isPlaying, setIsPlaying] = useState(false);
  const [lastWin, setLastWin] = useState<number | null>(null);
  const [lastHitColor, setLastHitColor] = useState<string | null>(null);
  const [lastMultiplier, setLastMultiplier] = useState<number | null>(null);
  const [dartPosition, setDartPosition] = useState<{
    x: number;
    y: number;
  } | null>(null);
  const [history, setHistory] = useState<
    { multiplier: number; color: string }[]
  >([]);
  const [isFlying, setIsFlying] = useState(false);
  const [showArrow, setShowArrow] = useState(false);
  const [arrowPos, setArrowPos] = useState<{
    x: number;
    y: number;
    rot: number;
    scale: number;
  } | null>(null);

  const radius = 150;
  const center = 150;
  const config = RISK_CONFIG[risk];

  const rGreen = 10 * config.segmentWidthFactor;
  const rRing1 = 60;
  const baseRingInner = 85;
  const baseRingOuter = 125;
  const rRing4 = 150;

  const segThickness =
    (baseRingOuter - baseRingInner) * config.segmentThicknessFactor;
  const segMid = (baseRingInner + baseRingOuter) / 2;
  const rRing2 = segMid - segThickness / 2;
  const rRing3 = segMid + segThickness / 2;

  const segmentPattern = useMemo(() => getSegmentPattern(risk), [risk]);
  const totalSegments = segmentPattern.length;
  const anglePerSegment = 360 / totalSegments;
  const anglePer = anglePerSegment;

  const distribution = useMemo(() => {
    const p = config.probabilities;
    const items = [
      {
        multiplier: config.multipliers.darkGrey,
        color: COLORS.darkGrey,
        chancePct: p.darkGrey,
      },
      {
        multiplier: config.multipliers.lightGrey,
        color: COLORS.lightGrey,
        chancePct: p.lightGrey,
      },
      {
        multiplier: config.multipliers.yellow,
        color: COLORS.yellow,
        chancePct: p.yellow,
      },
      {
        multiplier: config.multipliers.orange,
        color: COLORS.orange,
        chancePct: p.orange,
      },
      {
        multiplier: config.multipliers.red,
        color: COLORS.red,
        chancePct: p.red,
      },
      {
        multiplier: config.multipliers.green,
        color: COLORS.green,
        chancePct: p.green,
      },
    ];
    return items;
  }, [config]);

  const formatChance = (v: number) => {
    const s = Number(v).toFixed(3);
    return s.replace(/\.?0+$/, "");
  };

  const boardGlowInner = lastHitColor ? rgbaFromHex(lastHitColor, 0.22) : null;
  const boardGlowOuter = lastHitColor ? rgbaFromHex(lastHitColor, 0.16) : null;
  const boardGlowShadow =
    boardGlowInner && boardGlowOuter
      ? `0 0 28px ${boardGlowInner}, 0 0 90px ${boardGlowOuter}`
      : "0 0 0 rgba(0,0,0,0)";

  const handlePlay = async () => {
    if (bet <= 0 || bet > balance || isPlaying) return;

    setIsPlaying(true);
    setLastWin(null);
    setLastHitColor(null);
    setLastMultiplier(null);
    setDartPosition(null);
    setIsFlying(true);
    subtractFromBalance(bet);

    const rand = Math.random() * 100;
    const probs = config.probabilities;

    let outcome: keyof typeof probs = "darkGrey";

    if (rand < probs.green) outcome = "green";
    else if (rand < probs.green + probs.lightGrey) outcome = "lightGrey";
    else if (rand < probs.green + probs.lightGrey + probs.yellow)
      outcome = "yellow";
    else if (rand < probs.green + probs.lightGrey + probs.yellow + probs.orange)
      outcome = "orange";
    else if (
      rand <
      probs.green + probs.lightGrey + probs.yellow + probs.orange + probs.red
    )
      outcome = "red";
    else outcome = "darkGrey";

    const multiplier = config.multipliers[outcome];
    const winAmount = bet * multiplier;

    let r = 0,
      theta = 0;

    if (outcome === "green") {
      r = Math.random() * rGreen;
      theta = Math.random() * 2 * Math.PI;
    } else if (outcome === "lightGrey") {
      r = rRing1 + Math.random() * (rRing2 - rRing1);
      theta = Math.random() * 2 * Math.PI;
    } else if (outcome === "darkGrey") {
      const subRand = Math.random();
      if (subRand < 0.4) {
        r = rGreen + Math.random() * (rRing1 - rGreen);
        theta = Math.random() * 2 * Math.PI;
      } else {
        r = rRing3 + Math.random() * (rRing4 - rRing3);
        theta = Math.random() * 2 * Math.PI;
      }
    } else {
      const indices = segmentPattern
        .map((c, i) => (c === outcome ? i : -1))
        .filter((i) => i !== -1);
      const segIndex = indices[Math.floor(Math.random() * indices.length)];
      const segAngleStart = segIndex * anglePerSegment;
      const segCenter = segAngleStart + anglePerSegment / 2;
      const coloredWidth = anglePerSegment * config.segmentWidthFactor;
      const offset = (Math.random() - 0.5) * coloredWidth;
      const angleDeg = segCenter + offset;
      theta = (angleDeg * Math.PI) / 180;
      r = rRing2 + Math.random() * (rRing3 - rRing2);
    }

    const x = r * Math.cos(theta);
    const y = r * Math.sin(theta);

    const finalX = center + x;
    const finalY = center + y;

    const startX = finalX;
    const startY = rRing4 + 60;

    setShowArrow(true);
    setArrowPos({ x: startX, y: startY, rot: -8, scale: 1.18 });

    const peakY = finalY - 48;
    setTimeout(() => {
      setArrowPos({ x: finalX, y: peakY, rot: -4, scale: 1.02 });
    }, 100);

    setTimeout(() => {
      setArrowPos({ x: finalX, y: finalY - 18, rot: 6, scale: 0.96 });
    }, 240);

    setTimeout(() => {
      setArrowPos({ x: finalX, y: finalY, rot: 14, scale: 0.86 });
    }, 380);

    setTimeout(() => {
        setIsFlying(false);
        setLastHitColor(COLORS[outcome]);
        setLastMultiplier(multiplier);
        setDartPosition({ x, y });

      setTimeout(() => {
        if (winAmount > 0) addToBalance(winAmount);
        setLastWin(winAmount);
        setHistory((prev) =>
          [{ multiplier, color: COLORS[outcome] }, ...prev].slice(0, 5)
        );
        setIsPlaying(false);
      }, 300);
    }, 520);
  };

  useEffect(() => {
    setLastMultiplier(null);
    setLastHitColor(null);
  }, [risk]);

  const renderSegmentedRing = () => {
    const paths = [];
    const coloredWidth = anglePerSegment;

    for (let i = 0; i < totalSegments; i++) {
      const colorName = segmentPattern[i];
      const color = COLORS[colorName as keyof typeof COLORS];

      const startAngle = i * anglePerSegment;
      const endAngle = startAngle + anglePerSegment;

      const startRad = (startAngle * Math.PI) / 180;
      const endRad = (endAngle * Math.PI) / 180;

      const x1 = center + rRing3 * Math.cos(startRad);
      const y1 = center + rRing3 * Math.sin(startRad);
      const x2 = center + rRing3 * Math.cos(endRad);
      const y2 = center + rRing3 * Math.sin(endRad);

      const x3 = center + rRing2 * Math.cos(endRad);
      const y3 = center + rRing2 * Math.sin(endRad);
      const x4 = center + rRing2 * Math.cos(startRad);
      const y4 = center + rRing2 * Math.sin(startRad);

      const largeArc = coloredWidth > 180 ? 1 : 0;

      const d = [
        `M ${x1} ${y1}`,
        `A ${rRing3} ${rRing3} 0 ${largeArc} 1 ${x2} ${y2}`,
        `L ${x3} ${y3}`,
        `A ${rRing2} ${rRing2} 0 ${largeArc} 0 ${x4} ${y4}`,
        "Z",
      ].join(" ");

      paths.push(<path key={i} d={d} fill={color} stroke="none" />);
    }

    return paths;
  };

  return (
    <div className="p-2 sm:p-4 lg:p-6 max-w-350 mx-auto flex flex-col lg:flex-row gap-4 lg:gap-8">
      <div className="w-full lg:w-[240px] flex flex-col gap-3 bg-[#0f212e] p-2 sm:p-3 rounded-xl h-fit text-xs">
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
              value={bet}
              onChange={(e) => setBet(Number(e.target.value))}
              disabled={isPlaying}
              className="w-full bg-[#0f212e] border border-[#2f4553] rounded-md py-2 pl-7 pr-4 text-white font-mono focus:outline-none focus:border-[#00e701] transition-colors disabled:opacity-50"
            />
          </div>

          <div className="grid grid-cols-3 gap-2">
            <button
              onClick={() => setBet(Number((bet / 2).toFixed(2)))}
              disabled={isPlaying}
              className="bg-[#2f4553] hover:bg-[#3e5666] text-xs py-1 rounded text-[#b1bad3] disabled:opacity-50"
            >
              ½
            </button>
            <button
              onClick={() => setBet(Number((bet * 2).toFixed(2)))}
              disabled={isFlying}
              className="bg-[#2f4553] hover:bg-[#3e5666] text-xs py-1 rounded text-[#b1bad3] disabled:opacity-50"
            >
              2×
            </button>
            <button
              onClick={() => setBet(Number(balance.toFixed(2)))}
              disabled={isPlaying}
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
            {Object.keys(RISK_CONFIG).map((r) => (
              <button
                key={r}
                onClick={() => !isPlaying && setRisk(r as RiskLevel)}
                disabled={isPlaying}
                className={
                  r === risk
                    ? "flex-1 py-2 text-[10px] font-bold uppercase rounded bg-[#213743] text-white shadow-sm"
                    : "flex-1 py-2 text-[10px] font-bold uppercase rounded text-[#b1bad3] hover:text-white"
                }
              >
                {r}
              </button>
            ))}
          </div>
        </div>

        <button
          onClick={handlePlay}
          disabled={isPlaying || bet <= 0 || bet > balance}
          className="w-full bg-[#00e701] hover:bg-[#00c201] disabled:opacity-50 disabled:cursor-not-allowed text-black py-3 rounded-md font-bold text-lg shadow-[0_0_20px_rgba(0,231,1,0.2)] transition-all active:scale-95 flex items-center justify-center gap-2"
        >
          {isPlaying ? (
            <Refresh className="animate-spin" />
          ) : (
            <PlayArrow sx={{ fill: "currentColor" }} />
          )}
          {isPlaying ? "Playing..." : "Bet"}
        </button>

        {lastWin !== null && lastWin > 0 && (
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
              <div
                aria-hidden
                className="absolute inset-0 rounded-full pointer-events-none"
                style={{
                  boxShadow: boardGlowShadow,
                  transition: "box-shadow 220ms ease",
                }}
              />
              <div className="absolute inset-0 rounded-full bg-[#0f212e] border border-[#2f4553] shadow-[0_20px_60px_rgba(0,0,0,0.55)]" />
              <div className="absolute inset-2 rounded-full bg-[#213743] border border-[#2f4553]" />

              <div
                className={"absolute inset-3 rounded-full"}
                style={{ transform: `rotate(0deg)` }}
              >
                <svg
                  viewBox={`0 0 ${radius * 2} ${radius * 2}`}
                  className="w-full h-full rounded-full"
                >
                  <circle
                    cx={center}
                    cy={center}
                    r={rRing4}
                    fill={COLORS.darkGrey}
                  />
                  <circle
                    cx={center}
                    cy={center}
                    r={rRing3}
                    fill={COLORS.darkGrey}
                  />

                  {renderSegmentedRing()}

                  <circle
                    cx={center}
                    cy={center}
                    r={rRing2}
                    fill={COLORS.lightGrey}
                  />

                  <circle
                    cx={center}
                    cy={center}
                    r={rRing1}
                    fill={COLORS.darkGrey}
                  />

                  <circle
                    cx={center}
                    cy={center}
                    r={rGreen}
                    fill={COLORS.green}
                  />

                  <circle
                    cx={center}
                    cy={center}
                    r={rRing4}
                    fill="none"
                    stroke="#0f212e"
                    strokeWidth="2"
                  />
                  <circle
                    cx={center}
                    cy={center}
                    r={rRing3}
                    fill="none"
                    stroke="#0f212e"
                    strokeWidth="2"
                  />
                  <circle
                    cx={center}
                    cy={center}
                    r={rRing2}
                    fill="none"
                    stroke="#0f212e"
                    strokeWidth="2"
                  />
                  <circle
                    cx={center}
                    cy={center}
                    r={rRing1}
                    fill="none"
                    stroke="#0f212e"
                    strokeWidth="2"
                  />
                  <circle
                    cx={center}
                    cy={center}
                    r={rGreen}
                    fill="none"
                    stroke="#0f212e"
                    strokeWidth="1"
                  />
                </svg>
                {lastMultiplier !== null && (
                  <div
                    aria-hidden
                    className="absolute text-center"
                    style={{
                      left: `${(center / (radius * 2)) * 100}%`,
                      top: `${((center + rGreen + 14) / (radius * 2)) * 100}%`,
                      transform: "translate(-50%, -50%)",
                      pointerEvents: "none",
                    }}
                  >
                    <div className="text-lg font-extrabold text-white">{String(lastMultiplier) + "x"}</div>
                  </div>
                )}
                {showArrow && arrowPos && (
                  <div
                    aria-hidden
                    className="absolute"
                    style={{
                      left: `${(arrowPos.x / (radius * 2)) * 100}%`,
                      top: `${(arrowPos.y / (radius * 2)) * 100}%`,
                      transform: `translate(-50%, -50%) rotate(${arrowPos.rot}deg) scale(${arrowPos.scale})`,
                      transition: "top 180ms ease, transform 180ms ease",
                      pointerEvents: "none",
                      width: 36,
                      height: 36,
                      zIndex: 60,
                    }}
                  >
                    <svg
                      viewBox="0 0 20 20"
                      width="36"
                      height="36"
                      className="block"
                    >
                      <g>
                        <rect
                          x="3"
                          y="3"
                          width="14"
                          height="14"
                          rx="4"
                          fill="#ffffff"
                        />
                        <circle
                          cx="10"
                          cy="10"
                          r="3"
                          fill={COLORS.background}
                        />
                      </g>
                    </svg>
                  </div>
                )}
              </div>
            </div>

            <div className="mt-4 flex  gap-1 items-center justify-center px-2">
              {distribution.map((d) => (
                <div
                  key={String(d.multiplier) + d.color}
                  className="bg-[#0f212e] border border-[#2f4553] rounded-md px-2 py-1 flex items-center gap-1 whitespace-nowrap"
                >
                  <span
                    className="w-2.5 h-2.5 rounded-full border border-[#2f4553]"
                    style={{ backgroundColor: d.color }}
                    aria-hidden
                  />
                  <span className="text-[12px] text-white font-bold">
                    {d.multiplier}x
                  </span>
                  <span className="text-[10px] text-[#b1bad3] font-mono">
                    {formatChance(d.chancePct)}%
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
