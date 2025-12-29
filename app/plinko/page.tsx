"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import { useWallet } from "@/components/WalletProvider";
import { PlayArrow, Bolt } from "@mui/icons-material";

type RiskLevel = "low" | "medium" | "high";

interface Ball {
  id: number;
  bet: number;
  currentRow: number;
  currentCol: number;
  targetCol: number;
  progress: number;
  path: number[];
  x: number;
  y: number;
  trail?: { x: number; y: number; a: number }[];
}

interface Particle {
  id: number;
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number; // ms
  size: number;
  color: string;
}

const drawRoundedRect = (
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number
) => {
  const radius = Math.max(0, Math.min(r, w / 2, h / 2));
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.arcTo(x + w, y, x + w, y + h, radius);
  ctx.arcTo(x + w, y + h, x, y + h, radius);
  ctx.arcTo(x, y + h, x, y, radius);
  ctx.arcTo(x, y, x + w, y, radius);
  ctx.closePath();
};

const getColorForMultiplier = (val: number): string => {
  if (val >= 100) return "#ef4444";
  if (val >= 10) return "#f97316";
  if (val >= 2) return "#eab308";
  if (val >= 1) return "#84cc16";
  return "#2f4553";
};

const hexToRgb = (hex: string): { r: number; g: number; b: number } | null => {
  const h = hex.trim();
  if (!h.startsWith("#")) return null;
  const raw = h.slice(1);
  if (raw.length === 3) {
    const r = parseInt(raw[0] + raw[0], 16);
    const g = parseInt(raw[1] + raw[1], 16);
    const b = parseInt(raw[2] + raw[2], 16);
    return { r, g, b };
  }
  if (raw.length === 6) {
    const r = parseInt(raw.slice(0, 2), 16);
    const g = parseInt(raw.slice(2, 4), 16);
    const b = parseInt(raw.slice(4, 6), 16);
    return { r, g, b };
  }
  return null;
};

const rgbaFromHex = (hex: string, a: number) => {
  const rgb = hexToRgb(hex);
  if (!rgb) return `rgba(255,255,255,${Math.max(0, Math.min(1, a))})`;
  const aa = Math.max(0, Math.min(1, a));
  return `rgba(${rgb.r},${rgb.g},${rgb.b},${aa})`;
};

const FIXED_MULTIPLIERS: Record<RiskLevel, Record<number, number[]>> = {
  low: {
    8: [5.6, 2.1, 1.1, 1, 0.5, 1, 1.1, 2.1, 5.6],
    9: [5.6, 2, 1.6, 1, 0.7, 0.7, 1, 1.6, 2, 5.6],
    10: [8.9, 3, 1.4, 1.1, 1, 0.5, 1, 1.1, 1.4, 3, 8.9],
    11: [8.4, 3, 1.9, 1.3, 1, 0.7, 0.7, 1, 1.3, 1.9, 3, 8.4],
    12: [10, 3, 1.6, 1.4, 1.1, 0.5, 1, 1.1, 1.4, 1.6, 3, 10],
    13: [8.1, 4, 3, 1.9, 1.2, 0.9, 0.7, 0.7, 0.9, 1.2, 1.9, 3, 4, 8.1],
    14: [7.1, 4, 1.9, 1.4, 1.3, 1.1, 1, 0.5, 1, 1.1, 1.3, 1.4, 1.9, 4, 7.1],
    15: [15, 8, 3, 2, 1.5, 1.1, 1, 0.7, 0.7, 1, 1.1, 1.5, 2, 3, 8, 15],
    16: [16, 9, 2, 1.4, 1.4, 1.2, 1.1, 1, 0.5, 1, 1.1, 1.2, 1.4, 1.4, 2, 9, 16],
  },
  medium: {
    8: [13, 3, 1.3, 0.7, 0.4, 0.7, 1.3, 3, 13],
    9: [18, 4, 1.7, 0.9, 0.5, 0.5, 0.9, 1.7, 4, 18],
    10: [22, 5, 2, 1.4, 0.6, 0.4, 0.6, 1.4, 2, 5, 22],
    11: [24, 6, 3, 1.8, 0.7, 0.5, 0.5, 0.7, 1.8, 3, 6, 24],
    12: [33, 11, 4, 2, 1.1, 0.6, 0.3, 0.6, 1.1, 2, 4, 11, 33],
    13: [43, 13, 6, 3, 1.3, 0.7, 0.4, 0.4, 0.7, 1.3, 3, 6, 13, 43],
    14: [58, 15, 7, 4, 1.9, 1, 0.5, 0.2, 0.5, 1, 1.9, 4, 7, 15, 58],
    15: [88, 18, 11, 5, 3, 1.3, 0.5, 0.3, 0.3, 0.5, 1.3, 3, 5, 11, 18, 88],
    16: [110, 41, 10, 5, 3, 1.5, 1, 0.5, 0.3, 0.5, 1, 1.5, 3, 5, 10, 41, 110],
  },
  high: {
    8: [29, 4, 1.5, 0.3, 0.2, 0.3, 1.5, 4, 29],
    9: [43, 7, 2, 0.6, 0.2, 0.2, 0.6, 2, 7, 43],
    10: [76, 10, 3, 0.9, 0.3, 0.2, 0.3, 0.9, 3, 10, 76],
    11: [120, 14, 5.2, 1.4, 0.4, 0.2, 0.2, 0.4, 1.4, 5.2, 14, 120],
    12: [170, 24, 8.1, 2, 0.7, 0.2, 0.2, 0.2, 0.7, 2, 8.1, 24, 170],
    13: [260, 37, 11, 4, 1, 0.2, 0.2, 0.2, 0.2, 1, 4, 11, 37, 260],
    14: [420, 56, 18, 5, 1.9, 0.3, 0.2, 0.2, 0.2, 0.3, 1.9, 5, 18, 56, 420],
    15: [620, 83, 27, 8, 3, 0.5, 0.2, 0.2, 0.2, 0.2, 0.5, 3, 8, 83, 620],
    16: [
      1000, 130, 26, 9, 4, 2, 0.2, 0.2, 0.2, 0.2, 0.2, 2, 4, 9, 26, 130, 1000,
    ],
  },
};

const getMultipliers = (rows: number, risk: RiskLevel): number[] => {
  const table = FIXED_MULTIPLIERS[risk];
  if (table && table[rows]) return table[rows];

  const count = rows + 1;
  const center = Math.floor(count / 2);
  let minMulti = 0.2;
  let maxMulti = 100;
  let exponent = 1.6;
  if (risk === "low") {
    minMulti = 0.5;
    maxMulti = 12;
    exponent = 1.1;
  } else if (risk === "medium") {
    minMulti = 0.35;
    maxMulti = 110;
    exponent = 1.7;
  } else {
    minMulti = 0.2;
    maxMulti = 1000;
    exponent = 2.2;
  }
  const result: number[] = [];
  for (let i = 0; i < count; i++) {
    const dist = Math.abs(i - center);
    const t = center === 0 ? 0 : dist / center;
    const valRaw =
      minMulti + (maxMulti - minMulti) * Math.pow(t, exponent * (rows / 10));
    let val = valRaw;
    if (val >= 10) val = Math.round(val);
    else if (val >= 1) val = Math.round(val * 10) / 10;
    else val = Math.round(val * 100) / 100;
    result.push(val);
  }
  return result;
};

const comb = (n: number, r: number) => {
  if (r < 0 || r > n) return 0;
  r = Math.min(r, n - r);
  let num = 1;
  let den = 1;
  for (let i = 1; i <= r; i++) {
    num *= n - r + i;
    den *= i;
  }
  return num / den;
};

const formatPercentTwoNonZero = (p: number) => {
  if (!p || p <= 0) return "0%";
  const pct = p * 100;
  if (pct >= 0.01) return `${pct.toFixed(2)}%`;
  const fixed = pct.toFixed(30);
  const parts = fixed.split('.');
  const intPart = parts[0];
  let dec = parts[1] || '';
  let nonZeroCount = 0;
  let cut = dec.length;
  for (let i = 0; i < dec.length; i++) {
    if (dec[i] !== '0') nonZeroCount++;
    if (nonZeroCount === 2) {
      cut = i + 1;
      break;
    }
  }
  if (nonZeroCount < 2) {
    dec = dec.replace(/0+$/g, '');
    return dec ? `${intPart}.${dec}%` : `${intPart}%`;
  }
  const nextDigit = dec[cut] ? parseInt(dec[cut], 10) : 0;
  let sliceArr = dec.slice(0, cut).split('').map((c) => parseInt(c, 10));
  if (nextDigit >= 5) {
    let carry = 1;
    for (let i = sliceArr.length - 1; i >= 0; i--) {
      const v = sliceArr[i] + carry;
      if (v === 10) {
        sliceArr[i] = 0;
        carry = 1;
      } else {
        sliceArr[i] = v;
        carry = 0;
        break;
      }
    }
    if (carry === 1) {
      const newInt = String(Number(intPart) + 1);
      while (sliceArr.length && sliceArr[sliceArr.length - 1] === 0) sliceArr.pop();
      return sliceArr.length ? `${newInt}.${sliceArr.join('')}%` : `${newInt}%`;
    }
  }
  let lastNonZero = sliceArr.length - 1;
  while (lastNonZero >= 0 && sliceArr[lastNonZero] === 0) lastNonZero--;
  if (lastNonZero < 0) return `${intPart}%`;
  sliceArr = sliceArr.slice(0, lastNonZero + 1);
  return `${intPart}.${sliceArr.join('')}%`;
};

export default function PlinkoPage() {
  const { balance, subtractFromBalance, addToBalance, finalizePendingLoss } =
    useWallet();

  const [betAmount, setBetAmount] = useState<number>(100);
  const [betInput, setBetInput] = useState<string>("100");
  const [risk, setRisk] = useState<RiskLevel>("low");
  const [rows, setRows] = useState<number>(16);
  const [lastWin, setLastWin] = useState<number>(0);
  const [history, setHistory] = useState<number[]>([]);

  const autoTimerRef = useRef<number | null>(null);

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const rafRef = useRef<number | null>(null);
  const ballsRef = useRef<Ball[]>([]);
  const particlesRef = useRef<Particle[]>([]);
  const lastWinSlotRef = useRef<{ idx: number | null; timer: number; force?: number }>({ idx: null, timer: 0, force: 0 });
  const lastTimeRef = useRef<number>(0);

  const canvasDpiRef = useRef({ cssW: 0, cssH: 0, dpr: 1 });
  const resultTimeoutRef = useRef<number | null>(null);
  const [resultFx, setResultFx] = useState<"rolling" | "win" | "lose" | null>(null);
  const [resultKey, setResultKey] = useState(0);

  const syncCanvasDpi = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const rect = canvas.getBoundingClientRect();
    const cssW = Math.max(0, rect.width);
    const cssH = Math.max(0, rect.height);
    if (cssW === 0 || cssH === 0) return;

    const dpr = typeof window !== "undefined" ? window.devicePixelRatio || 1 : 1;
    const nextW = Math.round(cssW * dpr);
    const nextH = Math.round(cssH * dpr);

    const sizeChanged = canvas.width !== nextW || canvas.height !== nextH;
    const metaChanged =
      canvasDpiRef.current.cssW !== cssW ||
      canvasDpiRef.current.cssH !== cssH ||
      canvasDpiRef.current.dpr !== dpr;

    if (!sizeChanged && !metaChanged) return;

    canvasDpiRef.current = { cssW, cssH, dpr };
    canvas.width = nextW;
    canvas.height = nextH;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }, []);

  const dropBall = () => {
    if (betAmount <= 0) return;
    if (betAmount > balance) return;

    subtractFromBalance(betAmount);
    setLastWin(0);
    setResultFx("rolling");
    setResultKey((k) => k + 1);

    const path: number[] = [];
    for (let i = 0; i < rows; i++) {
      path.push(Math.random() < 0.5 ? 0 : 1);
    }

    const startCol = 1;
    const firstDir = path[0];
    const targetCol = startCol + firstDir;

    ballsRef.current = [
      ...ballsRef.current,
      {
        id: Date.now() + Math.random(),
        bet: betAmount,
        currentRow: 0,
        currentCol: startCol,
        targetCol: targetCol,
        progress: 0,
        path,
        x: 0,
        y: 0,
        trail: [],
      },
    ];
  };

  const draw = useCallback(
    (time: number) => {
      syncCanvasDpi();

      const canvas = canvasRef.current;
      if (!canvas) return;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;

      const deltaTime = time - lastTimeRef.current;
      lastTimeRef.current = time;

      const width = canvasDpiRef.current.cssW || canvas.clientWidth;
      const height = canvasDpiRef.current.cssH || canvas.clientHeight;
      const centerX = width / 2;

      const multipliers = getMultipliers(rows, risk);
      const slotsCount = multipliers.length;

      const paddingTop = Math.max(24, Math.min(64, height * 0.08));
      const paddingBottom = Math.max(30, Math.min(72, height * 0.09));
      const usableHeight = height - paddingTop - paddingBottom;

      const rowSpacing = usableHeight / (rows + 1);
      const approxSpacingFromRows = rowSpacing * 1.18;
      const maxPegSpacingByWidth = (width * 0.92) / Math.max(1, slotsCount - 1);
      const pegSpacing = Math.min(approxSpacingFromRows, maxPegSpacingByWidth);

      const pegRadius = Math.max(2, Math.round(pegSpacing * 0.12));
      const ballRadius = Math.max(3, Math.round(pegSpacing * 0.22));

      const slotBoxW = Math.min(pegSpacing * 0.9, 120);
      const slotBoxH = Math.max(24, Math.min(40, pegSpacing * 0.85));

      ctx.clearRect(0, 0, width, height);

      ctx.save();

      ctx.fillStyle = "#ffffff";
      for (let r = 0; r < rows; r++) {
        const pegsInRow = r + 3;
        const rowWidth = (pegsInRow - 1) * pegSpacing;
        const startX = centerX - rowWidth / 2;
        const y = paddingTop + r * rowSpacing;
        for (let c = 0; c < pegsInRow; c++) {
          const x = startX + c * pegSpacing;
          const pulse = 1 + 0.06 * Math.sin(time * 0.006 + r * 0.9 + c * 0.7);
          const pr = Math.max(1, Math.round(pegRadius * pulse));
          const alpha = 0.9 - (r / rows) * 0.35;
          ctx.beginPath();
          ctx.fillStyle = `rgba(255,255,255,${alpha.toFixed(3)})`;
          ctx.arc(x, y, pr, 0, Math.PI * 2);
          ctx.fill();
        }
      }
      const bottomWidth = (slotsCount - 1) * pegSpacing;
      const startXSlots = centerX - bottomWidth / 2;
      const slotY = paddingTop + rows * rowSpacing;

      for (let i = 0; i < slotsCount; i++) {
        const x = startXSlots + i * pegSpacing;
        const val = multipliers[i];
        const slotColor = getColorForMultiplier(val);

        let drawW = slotBoxW;
        let drawH = slotBoxH;
        let drawY = slotY;

        if (lastWinSlotRef.current.idx === i && lastWinSlotRef.current.timer > 0) {
            const t = Math.max(0, Math.min(1, lastWinSlotRef.current.timer / 2500));
          const pulse = 0.6 + 0.4 * Math.sin((1 - t) * Math.PI * 3);
          const p = 1 - t;
          const drop = Math.sin(Math.min(1, p * 1.15) * Math.PI);

          const force = Math.max(0, Math.min(3, lastWinSlotRef.current.force ?? 1));
          const baseDrop = 8;
          drawY = slotY + baseDrop * drop * (0.6 + 0.8 * force);
          ctx.save();
          ctx.shadowBlur = (22 + 26 * pulse) * (0.6 + 0.6 * force);
          ctx.shadowColor = rgbaFromHex(slotColor, Math.min(0.85, 0.45 + 0.18 * force));
          ctx.fillStyle = slotColor;
          drawRoundedRect(ctx, x - slotBoxW / 2, drawY, slotBoxW, slotBoxH, 5);
          ctx.fill();
          ctx.restore();
        } else {
          ctx.fillStyle = slotColor;
          drawRoundedRect(ctx, x - slotBoxW / 2, slotY, slotBoxW, slotBoxH, 5);
          ctx.fill();
        }

        ctx.fillStyle = "#000";
        ctx.font =
          "bold 11px ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText(`${val}x`, x, drawY + drawH * 0.36);

        const favourable = comb(rows, i);
        const totalPaths = Math.pow(2, rows);
        const prob = totalPaths > 0 ? favourable / totalPaths : 0;
        const probText = formatPercentTwoNonZero(prob);

        ctx.fillStyle = "#071826";
        ctx.font =
          "9px ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace";
        ctx.fillText(probText, x, drawY + drawH * 0.74);
      }

      const getPegPos = (r: number, c: number) => {
        const pegsInRow = r + 3;
        const rowWidth = (pegsInRow - 1) * pegSpacing;
        const sX = centerX - rowWidth / 2;
        return {
          x: sX + c * pegSpacing,
          y: paddingTop + r * rowSpacing,
        };
      };

      const getSlotPos = (idx: number) => {
        return {
          x: startXSlots + idx * pegSpacing,
          y: slotY,
        };
      };

      const spawnParticles = (
        x: number,
        y: number,
        baseColor: string,
        count = 26,
        strength = 1
      ) => {
        const maxParticles = 120;
        if (particlesRef.current.length > maxParticles) {
          particlesRef.current.splice(0, particlesRef.current.length - maxParticles);
        }

        for (let i = 0; i < count; i++) {
          const angle = Math.random() * Math.PI * 2;
          const speed = (0.35 + Math.random() * 0.75) * (0.6 + strength * 0.35);
          particlesRef.current.push({
            id: Date.now() + Math.random() + i,
            x: x + (Math.random() - 0.5) * 8,
            y: y + (Math.random() - 0.6) * 6,
            vx: Math.cos(angle) * speed,
            vy: Math.sin(angle) * speed - 0.55 * strength,
            life: 380 + Math.random() * 420,
            size: 0.6 + Math.random() * 1.6 * (0.6 + strength * 0.25),
            color: baseColor,
          });
        }
      };

      const balls = ballsRef.current;
      const nextBalls: Ball[] = [];
      const speed = 0.005;

      const easeInOutQuad = (t: number) => (t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t);

      for (const ball of balls) {
        ball.progress += speed * deltaTime;

        if (ball.progress >= 1) {
          ball.progress = 0;
          ball.currentRow++;
          ball.currentCol = ball.targetCol;

          if (ball.currentRow >= rows) {
            const slotIndex = ball.currentCol - 1;
            const mult = multipliers[slotIndex] ?? 0;

            setHistory((prev) => [mult, ...prev].slice(0, 7));

            const win = ball.bet * mult;
            if (win > 0) {
              addToBalance(win);
              setLastWin(win);

              const slotPos = getSlotPos(slotIndex);
              const strength = Math.min(2.0, Math.max(0.85, Math.log10(win + 1)));
              spawnParticles(
                slotPos.x,
                slotPos.y + slotBoxH * 0.35,
                getColorForMultiplier(mult),
                10 + Math.round(6 * strength),
                strength
              );
              lastWinSlotRef.current.idx = slotIndex;
              lastWinSlotRef.current.force = strength;
              lastWinSlotRef.current.timer = 700;

              if (resultTimeoutRef.current) clearTimeout(resultTimeoutRef.current);
              if (mult < 1) {
                setResultFx("lose");
              } else {
                setResultFx("win");
              }
              setResultKey((k) => k + 1);
              resultTimeoutRef.current = window.setTimeout(() => setResultFx(null), 900);

              if (typeof navigator !== "undefined" && "vibrate" in navigator) {
                try {
                  (navigator as Navigator & { vibrate?: (pattern: number | number[]) => boolean }).vibrate?.(12);
                } catch {
                }
              }
            } else {
              finalizePendingLoss();
              if (resultTimeoutRef.current) clearTimeout(resultTimeoutRef.current);
              setResultFx("lose");
              setResultKey((k) => k + 1);
              resultTimeoutRef.current = window.setTimeout(() => setResultFx(null), 900);
            }
            continue;
          } else {
            const dir = ball.path[ball.currentRow];
            ball.targetCol = ball.currentCol + dir;
          }
        }

        const p0 = getPegPos(ball.currentRow, ball.currentCol);
        const p2 =
          ball.currentRow === rows - 1
            ? getSlotPos(ball.targetCol - 1)
            : getPegPos(ball.currentRow + 1, ball.targetCol);

        const p1x = (p0.x + p2.x) / 2;
        const p1y = p0.y - rowSpacing * 0.5;

        const tRaw = Math.max(0, Math.min(1, ball.progress));
        const t = easeInOutQuad(tRaw);
        const oneMinusT = 1 - t;

        ball.x =
          oneMinusT * oneMinusT * p0.x + 2 * oneMinusT * t * p1x + t * t * p2.x;
        ball.y =
          oneMinusT * oneMinusT * p0.y + 2 * oneMinusT * t * p1y + t * t * p2.y;

        if (!ball.trail) ball.trail = [];
        ball.trail.push({ x: ball.x, y: ball.y, a: 1 });
        if (ball.trail.length > 10) ball.trail.shift();
        for (let i = 0; i < ball.trail.length; i++) ball.trail[i].a *= 0.92;

        for (let i = 0; i < ball.trail.length; i++) {
          const p = ball.trail[i];
          const rr = ballRadius * (0.6 * (i / ball.trail.length) + 0.25);
          ctx.beginPath();
          ctx.fillStyle = `rgba(0,231,1,${(p.a * 0.22).toFixed(3)})`;
          ctx.arc(p.x, p.y + 1, rr, 0, Math.PI * 2);
          ctx.fill();
        }

        ctx.save();
        ctx.shadowBlur = 18;
        ctx.shadowColor = "rgba(0,231,1,0.6)";
        const grad = ctx.createRadialGradient(ball.x, ball.y, 0, ball.x, ball.y, ballRadius * 2.6);
        grad.addColorStop(0, "#e8ffea");
        grad.addColorStop(0.2, "#00e701");
        grad.addColorStop(1, "rgba(0,231,1,0.03)");
        ctx.fillStyle = grad;
        ctx.beginPath();
        ctx.arc(ball.x, ball.y, ballRadius, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();

        nextBalls.push(ball);
      }

      const particles = particlesRef.current;
      for (let i = particles.length - 1; i >= 0; i--) {
        const p = particles[i];
        const dt = deltaTime / 16.666;

        p.vy += 0.05 * dt;
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        p.life -= deltaTime;

        const a = Math.max(0, Math.min(1, p.life / 520));
        ctx.save();
        ctx.globalAlpha = a * 0.24;
        ctx.globalCompositeOperation = "lighter";
        ctx.shadowBlur = 5;
        ctx.shadowColor = rgbaFromHex(p.color, 0.25);
        const g = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, p.size * 5);
        g.addColorStop(0, rgbaFromHex(p.color, 0.9));
        g.addColorStop(0.55, rgbaFromHex(p.color, 0.25));
        g.addColorStop(1, "rgba(0,0,0,0)");
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size * 1.15, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();

        if (p.life <= 0) particles.splice(i, 1);
      }

      ballsRef.current = nextBalls;

      ctx.restore();

      if (lastWinSlotRef.current.timer > 0) {
        lastWinSlotRef.current.timer = Math.max(0, lastWinSlotRef.current.timer - deltaTime);
        if (lastWinSlotRef.current.timer === 0) {
          lastWinSlotRef.current.idx = null;
          lastWinSlotRef.current.force = 0;
        }
      }
    },
    [rows, risk, addToBalance, finalizePendingLoss, syncCanvasDpi, setResultKey]
  );

  useEffect(() => {
    syncCanvasDpi();

    const canvas = canvasRef.current;
    if (!canvas) return;

    const onResize = () => syncCanvasDpi();
    window.addEventListener("resize", onResize);

    let ro: ResizeObserver | null = null;
    if (typeof ResizeObserver !== "undefined") {
      ro = new ResizeObserver(() => syncCanvasDpi());
      ro.observe(canvas);
    }

    return () => {
      window.removeEventListener("resize", onResize);
      if (ro) ro.disconnect();
    };
  }, [syncCanvasDpi]);

  useEffect(() => {
    if (autoTimerRef.current) {
      window.clearInterval(autoTimerRef.current);
      autoTimerRef.current = null;
    }
    return () => {
      if (autoTimerRef.current) {
        window.clearInterval(autoTimerRef.current);
        autoTimerRef.current = null;
      }
    };
  }, [betAmount, balance, rows]);

  const loop = useCallback(
    (time: number) => {
      draw(time);
      rafRef.current = requestAnimationFrame(loop);
    },
    [draw]
  );

  useEffect(() => {
    rafRef.current = requestAnimationFrame(loop);
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [loop]);

  useEffect(() => {
    return () => {
      if (resultTimeoutRef.current) {
        clearTimeout(resultTimeoutRef.current);
        resultTimeoutRef.current = null;
      }
    };
  }, []);

  const isDropping =
    (ballsRef.current && ballsRef.current.length > 0);

  const resultFxClassName: Record<NonNullable<typeof resultFx>, string> = {
    rolling: "limbo-roll-glow",
    win: "limbo-win-flash",
    lose: "limbo-lose-flash",
  };

  return (
    <div className="p-2 sm:p-4 lg:p-6 max-w-[1400px] mx-auto flex flex-col lg:flex-row gap-4 lg:gap-8">
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
              value={betInput}
              onChange={(e) => setBetInput(e.target.value)}
              onBlur={() => {
                const raw = betInput.trim();
                const sanitized = raw.replace(/^0+(?=\d)/, "") || "0";
                const num = Number(sanitized);
                setBetAmount(num);
                setBetInput(sanitized);
              }}
              className="w-full bg-[#0f212e] border border-[#2f4553] rounded-md py-2 pl-7 pr-4 text-white font-mono focus:outline-none focus:border-[#00e701] transition-colors"
            />
          </div>
          <div className="grid grid-cols-3 gap-2">
            <button
              onClick={() => {
                const newBet = Number((betAmount / 2).toFixed(2));
                setBetAmount(newBet);
                setBetInput(String(newBet));
              }}
              className="bg-[#2f4553] hover:bg-[#3e5666] text-xs py-1 rounded text-[#b1bad3]"
            >
              ½
            </button>
            <button
              onClick={() => {
                const newBet = Number((betAmount * 2).toFixed(2));
                setBetAmount(newBet);
                setBetInput(String(newBet));
              }}
              className="bg-[#2f4553] hover:bg-[#3e5666] text-xs py-1 rounded text-[#b1bad3]"
            >
              2×
            </button>
            <button
              onClick={() => {
                const newBet = Number(balance.toFixed(2));
                setBetAmount(newBet);
                setBetInput(String(newBet));
              }}
              className="bg-[#2f4553] hover:bg-[#3e5666] text-xs py-1 rounded text-[#b1bad3]"
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
            {(["low", "medium", "high"] as RiskLevel[]).map((level) => (
              <button
                key={level}
                onClick={() => !isDropping && setRisk(level)}
                disabled={isDropping}
                className={`flex-1 py-2 text-[10px] font-bold uppercase rounded transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${
                  risk === level
                    ? "bg-[#213743] text-white shadow-sm"
                    : "text-[#b1bad3] hover:text-white"
                }`}
              >
                {level}
              </button>
            ))}
          </div>
        </div>

        <div className="space-y-2">
          <label className="text-xs font-bold text-[#b1bad3] uppercase tracking-wider">
            Rows: {rows}
          </label>
          <div className="bg-[#0f212e] rounded-md border border-[#2f4553] p-3">
            <input
              type="range"
              min={8}
              max={16}
              step={1}
              value={rows}
              onChange={(e) => setRows(Number(e.target.value))}
              disabled={isDropping}
              className="w-full accent-[#00e701] cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
            />
            <div className="flex justify-between text-xs text-[#b1bad3] mt-2">
              <span>8</span>
              <span>12</span>
              <span>16</span>
            </div>
          </div>
        </div>

        <button
          onClick={dropBall}
          className="w-full bg-[#00e701] hover:bg-[#00c201] text-black py-3 rounded-md font-bold text-lg shadow-[0_0_20px_rgba(0,231,1,0.2)] transition-all active:scale-95 flex items-center justify-center gap-2"
        >
          <PlayArrow /> Bet
        </button>

        {lastWin > 0 && (
          <div className="mt-2 p-4 bg-[#213743] border border-[#00e701] rounded-md text-center animate-pulse">
            <div className="text-xs text-[#b1bad3] uppercase">You Won</div>
            <div className="text-2xl font-bold text-[#00e701]">
              ${lastWin.toFixed(2)}
            </div>
          </div>
        )}
      </div>

      <div className="flex-1 bg-[#0f212e] p-4 sm:p-6 rounded-xl min-h-[400px] sm:min-h-[600px] flex flex-col items-stretch justify-center relative overflow-hidden">
        {resultFx && (
          <div
            key={`${resultFx}-${resultKey}`}
            className={resultFxClassName[resultFx]}
          />
        )}
        {resultFx === "rolling" && (
          <div
            className="absolute inset-0 pointer-events-none"
            style={{
              background:
                "radial-gradient(circle at 50% 55%, rgba(47,69,83,0.22) 0%, rgba(15,33,46,0.0) 68%)",
              opacity: 0.85,
            }}
          />
        )}
        <div
          className="mx-auto w-full"
          style={{ maxWidth: 1200, aspectRatio: "4/3", display: "block" }}
        >
          <div className="relative" style={{ height: "100%" }}>
            <div className="flex sm:flex-col gap-2 absolute top-4 right-4 sm:top-1/2 sm:-translate-y-1/2 z-10 max-w-[200px] flex-wrap justify-end sm:justify-center">
              {history.map((mult, i) => (
                <div
                  key={i}
                  className="w-8 h-8 sm:w-10 sm:h-10 rounded-full flex items-center justify-center text-[10px] font-bold text-black shadow-md animate-scale-in"
                  style={{ backgroundColor: getColorForMultiplier(mult) }}
                >
                  {mult}x
                </div>
              ))}
            </div>

            <canvas
              ref={canvasRef}
              width={800}
              height={600}
              style={{ width: "100%", height: "100%", display: "block" }}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
