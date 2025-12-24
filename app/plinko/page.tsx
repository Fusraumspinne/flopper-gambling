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

export default function PlinkoPage() {
  const { balance, subtractFromBalance, addToBalance, finalizePendingLoss } =
    useWallet();

  const [betAmount, setBetAmount] = useState<number>(10);
  const [betInput, setBetInput] = useState<string>("10");
  const [risk, setRisk] = useState<RiskLevel>("medium");
  const [rows, setRows] = useState<number>(16);
  const [lastWin, setLastWin] = useState<number>(0);
  const [history, setHistory] = useState<number[]>([]);

  const autoTimerRef = useRef<number | null>(null);

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const rafRef = useRef<number | null>(null);
  const ballsRef = useRef<Ball[]>([]);
  const lastTimeRef = useRef<number>(0);

  const dropBall = () => {
    if (betAmount <= 0) return;
    if (betAmount > balance) return;

    subtractFromBalance(betAmount);
    setLastWin(0);

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
      },
    ];
  };

  const draw = useCallback(
    (time: number) => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;

      const deltaTime = time - lastTimeRef.current;
      lastTimeRef.current = time;

      const width = canvas.width;
      const height = canvas.height;
      const centerX = width / 2;

      const paddingTop = 48;
      const paddingBottom = 58;
      const usableHeight = height - paddingTop - paddingBottom;

      const rowSpacing = usableHeight / (rows + 1);
      const pegSpacing = rowSpacing * 1.18;
      const pegRadius = 4;
      const ballRadius = 6;

      ctx.clearRect(0, 0, width, height);

      ctx.fillStyle = "#ffffff";
      for (let r = 0; r < rows; r++) {
        const pegsInRow = r + 3;
        const rowWidth = (pegsInRow - 1) * pegSpacing;
        const startX = centerX - rowWidth / 2;
        const y = paddingTop + r * rowSpacing;
        for (let c = 0; c < pegsInRow; c++) {
          const x = startX + c * pegSpacing;
          ctx.beginPath();
          ctx.arc(x, y, pegRadius, 0, Math.PI * 2);
          ctx.fill();
        }
      }

      const multipliers = getMultipliers(rows, risk);
      const slotsCount = multipliers.length;
      const bottomWidth = (slotsCount - 1) * pegSpacing;
      const startXSlots = centerX - bottomWidth / 2;
      const slotY = paddingTop + rows * rowSpacing;

      for (let i = 0; i < slotsCount; i++) {
        const x = startXSlots + i * pegSpacing;
        const val = multipliers[i];
        const boxW = pegSpacing * 0.92;
        const boxH = 24;

        ctx.fillStyle = getColorForMultiplier(val);
        drawRoundedRect(ctx, x - boxW / 2, slotY, boxW, boxH, 5);
        ctx.fill();

        ctx.fillStyle = "#000";
        ctx.font =
          "bold 10px ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText(`${val}x`, x, slotY + boxH / 2);
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

      const balls = ballsRef.current;
      const nextBalls: Ball[] = [];
      const speed = 0.005;

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
            } else {
              finalizePendingLoss();
            }
            continue;
          } else {
            const dir = ball.path[ball.currentRow];
            ball.targetCol = ball.currentCol + dir;
          }
        }

        let p0, p2;

        p0 = getPegPos(ball.currentRow, ball.currentCol);

        if (ball.currentRow === rows - 1) {
          const slotIndex = ball.targetCol - 1;
          p2 = getSlotPos(slotIndex);
        } else {
          p2 = getPegPos(ball.currentRow + 1, ball.targetCol);
        }

        const p1x = (p0.x + p2.x) / 2;
        const p1y = p0.y - rowSpacing * 0.5;

        const t = ball.progress;
        const oneMinusT = 1 - t;

        ball.x =
          oneMinusT * oneMinusT * p0.x + 2 * oneMinusT * t * p1x + t * t * p2.x;
        ball.y =
          oneMinusT * oneMinusT * p0.y + 2 * oneMinusT * t * p1y + t * t * p2.y;

        ctx.fillStyle = "#00e701";
        ctx.beginPath();
        ctx.arc(ball.x, ball.y, ballRadius, 0, Math.PI * 2);
        ctx.fill();

        nextBalls.push(ball);
      }

      ballsRef.current = nextBalls;
    },
    [rows, risk, addToBalance]
  );

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

  const isDropping =
    (ballsRef.current && ballsRef.current.length > 0);

  return (
    <div className="p-6 max-w-[1400px] mx-auto flex flex-col lg:flex-row gap-8">
      <div className="w-full lg:w-[350px] flex flex-col gap-6 bg-[#0f212e] p-6 rounded-xl h-fit">
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
          <div className="grid grid-cols-2 gap-2">
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
                className={`flex-1 py-2 text-xs font-bold uppercase rounded transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${
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

      <div className="flex-1 bg-[#0f212e] p-6 rounded-xl min-h-[600px] flex items-center justify-center relative overflow-hidden">
        <div className="absolute top-4 left-1/2 -translate-x-1/2 text-center">
          <div className="text-sm font-bold text-white">Plinko</div>
          <div className="text-xs text-[#b1bad3] uppercase">
            {risk.charAt(0).toUpperCase() + risk.slice(1)}
          </div>
        </div>

        <div className="absolute right-4 top-1/2 -translate-y-1/2 flex flex-col gap-2">
          {history.map((mult, i) => (
            <div
              key={i}
              className="w-10 h-10 rounded-full flex items-center justify-center text-[10px] font-bold text-black shadow-md animate-in fade-in slide-in-from-top-4 duration-300"
              style={{ backgroundColor: getColorForMultiplier(mult) }}
            >
              {mult}x
            </div>
          ))}
        </div>

        <canvas
          ref={canvasRef}
          width={900}
          height={650}
          className="w-full h-full object-contain"
        />
      </div>
    </div>
  );
}
