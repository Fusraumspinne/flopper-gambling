"use client";

import React, { useMemo, useState } from "react";
import { useWallet } from "@/components/WalletProvider";
import { useSoundVolume } from "@/components/SoundVolumeProvider";
import GameRecordsPanel from "@/components/GameRecordsPanel";
import PlayArrow from "@mui/icons-material/PlayArrow";

type GamePhase = "idle" | "spinning" | "free";
type BaseSymbol = "🌿" | "🍇" | "⚔️" | "🏛️" | "🪙" | "🔱" | "👑";
type WeightedSymbol = BaseSymbol | "⚡";
type Cell =
  | { kind: "symbol"; symbol: BaseSymbol }
  | { kind: "scatter" }
  | { kind: "multiplier"; value: number };
type Position = [number, number];

const ROWS = 5;
const COLS = 6;
const MIN_CONNECT = 8;
const FREE_SPINS_AWARD = 15;

const SYMBOL_WEIGHTS: Record<WeightedSymbol, number> = {
  "🌿": 18,
  "🍇": 18,
  "⚔️": 15,
  "🏛️": 14,
  "🪙": 15,
  "🔱": 10,
  "👑": 10,
  "⚡": 1.25,
};

const MULTIPLIER_WEIGHT_NORMAL = 0.5;
const MULTIPLIER_WEIGHT_FREE = 3;

const SYMBOL_BASE_MULTIS: Record<BaseSymbol, number> = {
  "🌿": 0.003,
  "🍇": 0.004,
  "⚔️": 0.005,
  "🏛️": 0.006,
  "🪙": 0.008,
  "🔱": 0.01,
  "👑": 0.015,
};

const SYMBOL_FREESPIN_MULTIS: Record<BaseSymbol, number> = {
  "🌿": 0.01,
  "🍇": 0.015,
  "⚔️": 0.025,
  "🏛️": 0.04,
  "🪙": 0.05,
  "🔱": 0.07,
  "👑": 0.1,
};

const MULTIPLIER_POOL = [2, 3, 4, 5, 6, 8, 10, 12, 15, 20, 25, 50, 100, 250, 500];
const MULTIPLIER_POOL_WEIGHTS = [24, 20, 16, 14, 10, 8, 6, 5, 3, 2, 1.2, 0.6, 0.15, 0.04, 0.01];

const normalizeMoney = (value: number) => {
  if (!Number.isFinite(value)) return 0;
  const rounded = Math.round((value + Number.EPSILON) * 100) / 100;
  return Object.is(rounded, -0) ? 0 : rounded;
};

const formatMoney = (v: number) =>
  normalizeMoney(v).toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });

const sleep = (ms: number) => new Promise((resolve) => window.setTimeout(resolve, ms));

function toPosKey(row: number, col: number) {
  return `${row}-${col}`;
}

function pickWeighted<T extends string | number>(entries: [T, number][]) {
  const total = entries.reduce((acc, [, weight]) => acc + Math.max(0, weight), 0);
  let roll = Math.random() * total;
  for (const [item, weight] of entries) {
    roll -= Math.max(0, weight);
    if (roll <= 0) return item;
  }
  return entries[entries.length - 1][0];
}

function randomMultiplierValue() {
  const table = MULTIPLIER_POOL.map((value, idx) => [value, MULTIPLIER_POOL_WEIGHTS[idx]] as [number, number]);
  return pickWeighted(table);
}

function randomCell(anteBet: boolean, isFreeSpin?: boolean): Cell {
  const scatterWeight = anteBet ? SYMBOL_WEIGHTS["⚡"] * 1.25 : SYMBOL_WEIGHTS["⚡"];
  const mWeight = isFreeSpin ? MULTIPLIER_WEIGHT_FREE : MULTIPLIER_WEIGHT_NORMAL;
  const multiWeight = anteBet ? mWeight * 1.5 : mWeight;

  const symbolTable: [WeightedSymbol, number][] = [
    ["🌿", SYMBOL_WEIGHTS["🌿"]],
    ["🍇", SYMBOL_WEIGHTS["🍇"]],
    ["⚔️", SYMBOL_WEIGHTS["⚔️"]],
    ["🏛️", SYMBOL_WEIGHTS["🏛️"]],
    ["🪙", SYMBOL_WEIGHTS["🪙"]],
    ["🔱", SYMBOL_WEIGHTS["🔱"]],
    ["👑", SYMBOL_WEIGHTS["👑"]],
    ["⚡", scatterWeight],
  ];

  const table: [string, number][] = [
    ...symbolTable,
    ["MULTI", multiWeight],
  ];

  const picked = pickWeighted(table);
  if (picked === "⚡") return { kind: "scatter" };
  if (picked === "MULTI") return { kind: "multiplier", value: randomMultiplierValue() };
  return { kind: "symbol", symbol: picked as BaseSymbol };
}

function buildGrid(anteBet: boolean, isFreeSpin?: boolean, forceScatters: boolean = false): Cell[][] {
  const grid = Array.from({ length: ROWS }, () => Array.from({ length: COLS }, () => randomCell(anteBet, isFreeSpin)));
  
  if (forceScatters) {
    const scatterPositions: [number, number][] = [];
    while (scatterPositions.length < 3) {
      const row = Math.floor(Math.random() * ROWS);
      const col = Math.floor(Math.random() * COLS);
      if (!scatterPositions.some(([r, c]) => r === row && c === col)) {
        scatterPositions.push([row, col]);
        grid[row][col] = { kind: "scatter" };
      }
    }
  }
  
  return grid;
}

function gridToReelFrames(sourceGrid: Cell[][], anteBet: boolean, isFreeSpin?: boolean) {
  return Array.from({ length: COLS }, (_, col) => {
    const colFrame = Array.from({ length: ROWS }, (_, row) => sourceGrid[row][col]);
    const fresh = randomCell(anteBet, isFreeSpin);
    return [fresh, ...colFrame];
  });
}

function countScatters(grid: Cell[][]) {
  let count = 0;
  for (let row = 0; row < ROWS; row++) {
    for (let col = 0; col < COLS; col++) {
      if (grid[row][col].kind === "scatter") count += 1;
    }
  }
  return count;
}

function findSymbolConnects(grid: Cell[][]) {
  const buckets: Record<BaseSymbol, Position[]> = {
    "🌿": [],
    "🍇": [],
    "⚔️": [],
    "🏛️": [],
    "🪙": [],
    "🔱": [],
    "👑": [],
  };

  for (let row = 0; row < ROWS; row++) {
    for (let col = 0; col < COLS; col++) {
      const cell = grid[row][col];
      if (cell.kind !== "symbol") continue;
      buckets[cell.symbol].push([row, col]);
    }
  }

  return (Object.keys(buckets) as BaseSymbol[])
    .map((symbol) => ({ symbol, positions: buckets[symbol] }))
    .filter((entry) => entry.positions.length >= MIN_CONNECT);
}

function collectUncountedMultiplierSum(grid: Cell[][], alreadyCounted: Set<string>) {
  let sum = 0;
  let foundAny = false;
  const positions: string[] = [];

  for (let row = 0; row < ROWS; row++) {
    for (let col = 0; col < COLS; col++) {
      const key = toPosKey(row, col);
      if (alreadyCounted.has(key)) continue;
      const cell = grid[row][col];
      if (cell.kind !== "multiplier") continue;

      alreadyCounted.add(key);
      sum += cell.value;
      foundAny = true;
      positions.push(key);
    }
  }

  return { sum, foundAny, positions };
}

function tumble(grid: Cell[][], remove: Set<string>, anteBet: boolean, isFreeSpin?: boolean) {
  const nextGrid: Cell[][] = Array.from({ length: ROWS }, () => Array(COLS).fill(null as unknown as Cell));
  const droppedIndices = new Set<string>();

  for (let col = 0; col < COLS; col++) {
    const survivors: { cell: Cell; oldRow: number }[] = [];
    for (let row = 0; row < ROWS; row++) {
      if (!remove.has(toPosKey(row, col))) {
        survivors.push({ cell: grid[row][col], oldRow: row });
      }
    }

    const numberOfNew = ROWS - survivors.length;

    for (let i = 0; i < numberOfNew; i++) {
      const freshCell = randomCell(anteBet, isFreeSpin);
      nextGrid[i][col] = freshCell;
      const key = toPosKey(i, col);
      droppedIndices.add(key);
    }

    for (let i = 0; i < survivors.length; i++) {
      const newRow = i + numberOfNew;
      nextGrid[newRow][col] = survivors[i].cell;
      if (newRow !== survivors[i].oldRow) {
        droppedIndices.add(toPosKey(newRow, col));
      }
    }
  }

  return { nextGrid, droppedIndices };
}

function MultiplierIcon({ value }: { value: number }) {
  return (
    <div className="relative w-full h-full flex items-center justify-center p-0.5 pointer-events-none">
      <svg viewBox="0 0 100 100" className="w-[105%] h-[105%] drop-shadow-[0_4px_4px_rgba(0,0,0,0.4)]">
        <circle cx="50" cy="50" r="45" fill="url(#multiRadiance)" opacity="0.2" />
        <defs>
          <radialGradient id="multiRadiance">
            <stop offset="0%" stopColor="#facc15" />
            <stop offset="70%" stopColor="#854d0e" />
            <stop offset="100%" stopColor="transparent" />
          </radialGradient>
        </defs>

        <g transform="translate(0, 5)">
          <rect x="25" y="65" width="50" height="16" rx="1.5" fill="#f9fafb" />
          <rect x="20" y="78" width="60" height="8" rx="1" fill="#e5e7eb" />  
          <rect x="15" y="84" width="70" height="10" rx="1" fill="#d1d5db" /> 
          
          <path d="M32 68 H68 V92 L50 100 L32 92 Z" fill="#991b1b" />
          <path d="M32 68 H68 V72 H32 Z" fill="#7f1d1d" /> 
          
          <text x="50" y="85" fontSize="7" fill="#fbbf24" textAnchor="middle" fontWeight="black" opacity="0.8" letterSpacing="0.05em">SPQR</text>
          <path d="M42 88 H58" stroke="#fbbf24" strokeWidth="0.5" opacity="0.4" />
        </g>

        <g id="laurel-wreath" fill="#fbbf24">
          <path d="M42 65 Q 15 55 12 25 Q 22 45 42 55 Z" opacity="0.9" />
          {[20, 30, 42, 55].map((y, i) => (
            <ellipse key={`l-${i}`} cx={15 + i * 5} cy={y} rx="3" ry="5" transform={`rotate(${-30 + i * 15} ${15 + i * 5} ${y})`} />
          ))}
          <path d="M58 65 Q 85 55 88 25 Q 78 45 58 55 Z" opacity="0.9" />
          {[20, 30, 42, 55].map((y, i) => (
            <ellipse key={`r-${i}`} cx={85 - i * 5} cy={y} rx="3" ry="5" transform={`rotate(${30 - i * 15} ${85 - i * 5} ${y})`} />
          ))}
        </g>

        <text 
          x="50" 
          y="48" 
          fontSize={value >= 100 ? "20" : "26"} 
          fill="#facc15" 
          textAnchor="middle" 
          fontWeight="900" 
          fontFamily="serif"
          className="tracking-tighter"
          style={{ 
            filter: 'drop-shadow(0px 3px 2px rgba(0,0,0,1))',
            paintOrder: 'stroke',
            stroke: '#78350f',
            strokeWidth: '1.2px'
          }}
        >
          x{value}
        </text>

        {[...Array(5)].map((_, i) => (
          <circle key={i} cx={20 + Math.random() * 60} cy={15 + Math.random() * 40} r="0.8" fill="white">
            <animate attributeName="opacity" values="0;1;0" dur={`${1 + Math.random()}s`} repeatCount="indefinite" />
          </circle>
        ))}
      </svg>
    </div>
  );
}

function renderCellContent(cell: Cell) {
  if (cell.kind === "symbol") return <span>{cell.symbol}</span>;
  if (cell.kind === "scatter") return <span>⚡</span>;
  return <MultiplierIcon value={cell.value} />;
}

function ColosseumBackground() {
  return (
    <div className="absolute inset-0 z-0 pointer-events-none overflow-hidden">
      <div className="absolute inset-0 bg-[#87CEEB]" />
      <div className="absolute bottom-0 left-0 right-0 h-6/7 bg-[#e5e7eb] clip-tribunes" />
      
      <svg viewBox="0 0 1200 800" preserveAspectRatio="none" className="absolute inset-0 w-full h-full">
        <path d="M0 400 L1200 400 L1200 800 L0 800 Z" fill="#d1d5db" />
        {Array.from({ length: 12 }).map((_, i) => (
          <path
            key={`arch-${i}`}
            d={`M${50 + i * 100} 400 A 40 40 0 0 1 ${130 + i * 100} 400 L ${130 + i * 100} 600 L ${50 + i * 100} 600 Z`}
            fill="#9ca3af"
            opacity="0.5"
          />
        ))}
        <path d="M0 600 L1200 600 L1200 800 L0 800 Z" fill="#e5e5e5" />
        <line x1="0" y1="650" x2="1200" y2="650" stroke="#d4d4d4" strokeWidth="2" />
        <line x1="0" y1="700" x2="1200" y2="700" stroke="#d4d4d4" strokeWidth="2" />
        <line x1="0" y1="750" x2="1200" y2="750" stroke="#d4d4d4" strokeWidth="2" />
        
        <path d="M0 760 L1200 760 L1200 800 L0 800 Z" fill="#d4b483" />
        <path d="M0 760 Q 600 750 1200 760 L1200 770 L0 770 Z" fill="#c4a473" opacity="0.3" />
      </svg>

      <div className="absolute inset-0 flex justify-between px-4 sm:px-10">
        <div className="relative w-24 sm:w-40 h-full flex flex-col justify-end">
          <svg viewBox="0 0 100 400" preserveAspectRatio="none" className="w-full h-full absolute bottom-0">
            <rect x="20" y="50" width="60" height="350" fill="#f3f4f6" />
            <rect x="15" y="50" width="70" height="20" fill="#e5e7eb" /> {/* Capital */}
            <rect x="15" y="380" width="70" height="20" fill="#e5e7eb" /> {/* Base */}
            <line x1="30" y1="70" x2="30" y2="380" stroke="#d1d5db" strokeWidth="2" />
            <line x1="50" y1="70" x2="50" y2="380" stroke="#d1d5db" strokeWidth="2" />
            <line x1="70" y1="70" x2="70" y2="380" stroke="#d1d5db" strokeWidth="2" />
             <ellipse cx="50" cy="395" rx="40" ry="5" fill="black" opacity="0.1" />
          </svg>
          
          <div className="absolute top-[12%] left-1/2 -translate-x-1/2 w-16 sm:w-28 h-56 sm:h-72 animate-banner-sway origin-top z-10">
            <svg viewBox="0 0 100 160" className="w-full h-full drop-shadow-2xl">
              <path d="M10 0 H90 V140 L50 150 L10 140 Z" fill="#991b1b" /> {/* Main body */}
              <path d="M10 0 H90 V10 H10 Z" fill="#7f1d1d" /> {/* Top fold */}
              <path d="M15 15 H85 V135 L50 143 L15 135 Z" fill="none" stroke="#fbbf24" strokeWidth="2" opacity="0.6" /> {/* Inner border */}
              <circle cx="50" cy="65" r="20" fill="none" stroke="#fbbf24" strokeWidth="1.5" opacity="0.8" />
              <path d="M40 65 L50 55 L60 65 L50 75 Z" fill="#fbbf24" opacity="0.8" />
              <text x="50" y="110" fontFamily="serif" fontSize="12" fill="#fbbf24" textAnchor="middle" fontWeight="bold" opacity="0.8">SPQR</text>
              {Array.from({ length: 21 }).map((_, i) => {
                const x = 10 + i * 4; // 10 to 90
                const edgeY = x <= 50 ? 140 + (x - 10) * 0.25 : 150 - (x - 50) * 0.25;
                return (
                  <line 
                    key={i} 
                    x1={x} 
                    y1={edgeY} 
                    x2={x} 
                    y2={edgeY + 7} 
                    stroke="#fbbf24" 
                    strokeWidth="1.2" 
                  />
                );
              })}
            </svg>
          </div>

          <div className="absolute bottom-0 left-[-30%] w-[160%] flex items-end justify-center pointer-events-none">
            <div className="relative w-full h-full flex items-end justify-center">
              <div className="absolute bottom-1 w-32 h-6 bg-black/30 blur-md rounded-full" />
              
              <svg viewBox="0 0 60 180" className="w-14 sm:w-24 h-full overflow-visible drop-shadow-xl z-20 translate-y-1 sm:translate-y-2">
                <path d="M30 180 V165" stroke="#331800" strokeWidth="10" /> {/* Thicker trunk */}
                <path d="M30 5 C5 60 0 120 0 170 H60 C60 120 55 60 30 5" fill="#042f2e" /> {/* Darker base */}
                <path d="M30 10 C10 60 8 110 8 165 H52 C52 110 50 60 30 10" fill="#064e3b" /> {/* Main leaves */}
                <path d="M30 20 C18 70 15 110 15 160 H45 C45 110 42 70 30 20" fill="#065f46" opacity="0.4" /> {/* Highlight */}
              </svg>
              
              <svg viewBox="0 0 60 180" className="w-10 sm:w-16 h-[85%] overflow-visible drop-shadow-xl z-10 -ml-6 mb-1 opacity-90">
                <path d="M30 180 V170" stroke="#331800" strokeWidth="6" />
                <path d="M30 5 C10 60 5 120 5 170 H55 C55 120 50 60 30 5" fill="#042f2e" />
                <path d="M30 10 C15 60 12 110 12 165 H48 C48 110 45 60 30 10" fill="#064e3b" />
              </svg>
            </div>
          </div>
        </div>

        <div className="relative w-24 sm:w-40 h-full flex flex-col justify-end">
           <svg viewBox="0 0 100 400" preserveAspectRatio="none" className="w-full h-full absolute bottom-0">
            <rect x="20" y="50" width="60" height="350" fill="#f3f4f6" />
            <rect x="15" y="50" width="70" height="20" fill="#e5e7eb" /> {/* Capital */}
            <rect x="15" y="380" width="70" height="20" fill="#e5e7eb" /> {/* Base */}
            <line x1="30" y1="70" x2="30" y2="380" stroke="#d1d5db" strokeWidth="2" />
            <line x1="50" y1="70" x2="50" y2="380" stroke="#d1d5db" strokeWidth="2" />
            <line x1="70" y1="70" x2="70" y2="380" stroke="#d1d5db" strokeWidth="2" />
             <ellipse cx="50" cy="395" rx="40" ry="5" fill="black" opacity="0.1" />
          </svg>

           <div className="absolute top-[12%] left-1/2 -translate-x-1/2 w-16 sm:w-28 h-56 sm:h-72 animate-banner-sway-delayed origin-top z-10">
            <svg viewBox="0 0 100 160" className="w-full h-full drop-shadow-2xl">
              <path d="M10 0 H90 V140 L50 150 L10 140 Z" fill="#991b1b" />
              <path d="M10 0 H90 V10 H10 Z" fill="#7f1d1d" />
              <path d="M15 15 H85 V135 L50 143 L15 135 Z" fill="none" stroke="#fbbf24" strokeWidth="2" opacity="0.6" />
              <circle cx="50" cy="65" r="20" fill="none" stroke="#fbbf24" strokeWidth="1.5" opacity="0.8" />
              <path d="M40 65 L50 55 L60 65 L50 75 Z" fill="#fbbf24" opacity="0.8" />
              <text x="50" y="110" fontFamily="serif" fontSize="12" fill="#fbbf24" textAnchor="middle" fontWeight="bold" opacity="0.8">SPQR</text>
              {Array.from({ length: 21 }).map((_, i) => {
                const x = 10 + i * 4; // 10 to 90
                const edgeY = x <= 50 ? 140 + (x - 10) * 0.25 : 150 - (x - 50) * 0.25;
                return (
                  <line 
                    key={i} 
                    x1={x} 
                    y1={edgeY} 
                    x2={x} 
                    y2={edgeY + 7} 
                    stroke="#fbbf24" 
                    strokeWidth="1.2" 
                  />
                );
              })}
            </svg>
          </div>

           <div className="absolute bottom-0 right-[-30%] w-[160%] flex items-end justify-center pointer-events-none">
            <div className="relative w-full h-full flex items-end justify-center">
              <div className="absolute bottom-1 w-32 h-6 bg-black/30 blur-md rounded-full" />

              <svg viewBox="0 0 60 180" className="w-12 sm:w-22 h-full overflow-visible drop-shadow-xl z-20 translate-y-1 sm:translate-y-2">
                <path d="M30 180 V165" stroke="#331800" strokeWidth="10" />
                <path d="M30 5 C5 60 0 120 0 170 H60 C60 120 55 60 30 5" fill="#042f2e" />
                <path d="M30 10 C10 60 8 110 8 165 H52 C52 110 50 60 30 10" fill="#064e3b" />
              </svg>
              <svg viewBox="0 0 60 180" className="w-9 sm:w-16 h-[88%] overflow-visible drop-shadow-xl z-10 -mr-6 mb-1 opacity-90">
                <path d="M30 180 V170" stroke="#331800" strokeWidth="6" />
                <path d="M30 5 C10 60 5 120 5 170 H55 C55 120 50 60 30 5" fill="#042f2e" />
                <path d="M30 10 C15 60 12 110 12 165 H48 C48 110 45 60 30 10" fill="#064e3b" />
              </svg>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function GatesOfOlympusPage() {
  const { balance, subtractFromBalance, addToBalance, finalizePendingLoss } = useWallet();
  const { volume } = useSoundVolume();

  const [phase, setPhase] = useState<GamePhase>("idle");
  const [betInput, setBetInput] = useState("100");
  const [betAmount, setBetAmount] = useState(100);
  const [anteBet, setAnteBet] = useState(false);
  const [grid, setGrid] = useState<Cell[][]>(() => buildGrid(false));
  const [reelFrames, setReelFrames] = useState<Cell[][]>(() => gridToReelFrames(buildGrid(false, false), false, false));
  const [reelsSpinning, setReelsSpinning] = useState<boolean[]>(() => Array(COLS).fill(false));
  const [spinKey, setSpinKey] = useState(0);

  const [highlighted, setHighlighted] = useState<Set<string>>(new Set());
  const [freeSpinsLeft, setFreeSpinsLeft] = useState(0);
  const [isAutospinning, setIsAutospinning] = useState(false);
  const [isExecutingSpin, setIsExecutingSpin] = useState(false);
  const [isTumbling, setIsTumbling] = useState(false);
  const [pendingRoundPayout, setPendingRoundPayout] = useState(0);
  const [lastWin, setLastWin] = useState(0);
  const [lastCascadeWin, setLastCascadeWin] = useState(0);
  const [storedMultiplier, setStoredMultiplier] = useState(0);
  const [lastDropIndices, setLastDropIndices] = useState<Set<string>>(new Set());

  const pendingRoundStakeRef = React.useRef(0);
  const pendingMultiDenominatorRef = React.useRef(0);
  const pendingRoundPayoutRef = React.useRef(0);
  const storedMultiplierRef = React.useRef(0);
  const isExecutingSpinRef = React.useRef(false);

  const audioRef = React.useRef<{
    bet: HTMLAudioElement | null;
    spin: HTMLAudioElement | null;
    win: HTMLAudioElement | null;
    lose: HTMLAudioElement | null;
  }>({ bet: null, spin: null, win: null, lose: null });

  const spinCost = useMemo(() => normalizeMoney(betAmount * (anteBet ? 1.5 : 1)), [betAmount, anteBet]);
  const buyBonusCost = useMemo(() => normalizeMoney(betAmount * 100), [betAmount]);
  const isHundredDollarFreeSpin = !anteBet && normalizeMoney(betAmount) === 100;

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
    } catch {}
  };

  React.useEffect(() => {
    if (volume <= 0) return;
    if (!audioRef.current.bet) {
      audioRef.current = {
        bet: new Audio("/sounds/Bet.mp3"),
        spin: new Audio("/sounds/Tick.mp3"),
        win: new Audio("/sounds/Win.mp3"),
        lose: new Audio("/sounds/LimboLose.mp3"),
      };
    }

    const prime = async () => {
      const arr = Object.values(audioRef.current);
      for (const a of arr) {
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
    };

    document.addEventListener("pointerdown", prime, { once: true });
    return () => document.removeEventListener("pointerdown", prime);
  }, [volume]);

  const resetStoredMultiplier = React.useCallback(() => {
    storedMultiplierRef.current = 0;
    setStoredMultiplier(0);
  }, []);

  const settleRound = React.useCallback(
    (stake: number, payout: number, multiDenominator: number) => {
      const p = normalizeMoney(payout);
      const s = normalizeMoney(stake);
      const isWinRound = p >= s;

      if (p > 0) {
        addToBalance(p, multiDenominator);
        setLastWin(p);
        playAudio(audioRef.current.win);
      } else {
        setLastWin(0);
        if (s > 0) {
          finalizePendingLoss();
          playAudio(audioRef.current.lose);
        }
      }

      if (s > 0 && !isWinRound && p > 0) {
        finalizePendingLoss();
      }

      pendingRoundStakeRef.current = 0;
      pendingRoundPayoutRef.current = 0;
      setPendingRoundPayout(0);
      resetStoredMultiplier();
    },
    [addToBalance, finalizePendingLoss, resetStoredMultiplier]
  );

  const executeSpin = React.useCallback(async (isBonusBuy: boolean = false) => {
    if (isExecutingSpinRef.current) return;
    isExecutingSpinRef.current = true;
    setIsExecutingSpin(true);
    setIsTumbling(false);
    setLastCascadeWin(0);
    setLastDropIndices(new Set());

    const isFreeSpin = phase === "free";
    if (isFreeSpin) {
      setFreeSpinsLeft((prev) => Math.max(0, prev - 1));
    } else {
      setPhase("spinning");
      resetStoredMultiplier();
    }

    setSpinKey((v) => v + 1);
    playAudio(audioRef.current.spin);

    let workingGrid = buildGrid(anteBet, isFreeSpin, isBonusBuy);
    const countedMultiplierKeys = new Set<string>();

    const startFrames = gridToReelFrames(grid, anteBet, isFreeSpin);
    setReelFrames(startFrames);
    setReelsSpinning(Array(COLS).fill(true));

    await new Promise<void>((resolve) => {
      let stoppedCount = 0;
      const baseDelay = 400;
      const reelDelay = 220;

      for (let col = 0; col < COLS; col++) {
        setTimeout(() => {
          setGrid((prevGrid) => {
            const next = prevGrid.map((row) => [...row]);
            for (let row = 0; row < ROWS; row++) {
              next[row][col] = workingGrid[row][col];
            }
            return next;
          });

          setReelsSpinning((prev) => {
            const next = [...prev];
            next[col] = false;
            return next;
          });

          stoppedCount += 1;
          if (stoppedCount === COLS) {
            setTimeout(resolve, 160);
          }
        }, baseDelay + col * reelDelay);
      }
    });

    setGrid(workingGrid);
    setHighlighted(new Set());

    let triggeredScatter = false;
    let spinWin = 0;
    let normalSpinSymbolWin = 0;

    while (true) {
      if (countScatters(workingGrid) >= 3) triggeredScatter = true;

      const connects = findSymbolConnects(workingGrid);
      if (connects.length === 0) break;

      setIsTumbling(true);
      const remove = new Set<string>();

      let symbolValueSum = 0;
      for (const connect of connects) {
        const table = isFreeSpin ? SYMBOL_FREESPIN_MULTIS : SYMBOL_BASE_MULTIS;
        symbolValueSum += table[connect.symbol] * spinCost * connect.positions.length;
        for (const [row, col] of connect.positions) {
          remove.add(toPosKey(row, col));
        }
      }

      const newMultiplierCollection = collectUncountedMultiplierSum(workingGrid, countedMultiplierKeys);

      const storedMulti = storedMultiplierRef.current;
      let cascadeWin = normalizeMoney(symbolValueSum);

      if (isFreeSpin) {
        const totalMulti = storedMulti + newMultiplierCollection.sum;
        if (totalMulti > 0) cascadeWin = normalizeMoney(cascadeWin * totalMulti);
      } else {
        if (storedMulti > 0) cascadeWin = normalizeMoney(cascadeWin * storedMulti);
      }

      if (newMultiplierCollection.foundAny) {
        storedMultiplierRef.current += newMultiplierCollection.sum;
        setStoredMultiplier(storedMultiplierRef.current);
        for (const pos of newMultiplierCollection.positions) {
          remove.add(pos);
        }
      }

      if (isFreeSpin) {
        spinWin = normalizeMoney(spinWin + cascadeWin);
      } else {
        normalSpinSymbolWin = normalizeMoney(normalSpinSymbolWin + cascadeWin);
      }
      setLastCascadeWin(cascadeWin);
      setHighlighted(new Set(remove));

      await sleep(340);

      const tumbleResult = tumble(workingGrid, remove, anteBet, isFreeSpin);
      workingGrid = tumbleResult.nextGrid;

      setLastDropIndices(tumbleResult.droppedIndices);
      setGrid(workingGrid.map((row) => [...row]));
      setHighlighted(new Set());

      await sleep(680);
      setLastDropIndices(new Set());
    }

    if (!isFreeSpin) {
      spinWin = normalizeMoney(normalSpinSymbolWin);
      setLastCascadeWin(spinWin);
    }

    const updatedRoundPayout = normalizeMoney(pendingRoundPayoutRef.current + spinWin);
    pendingRoundPayoutRef.current = updatedRoundPayout;
    setPendingRoundPayout(updatedRoundPayout);

    if (isFreeSpin) {
      const scatters = countScatters(workingGrid);
      const retriggerCount = scatters >= 3 ? 5 + 2 * Math.max(0, scatters - 3) : 0;
      const leftAfter = Math.max(0, freeSpinsLeft - 1 + retriggerCount);
      setFreeSpinsLeft(leftAfter);

      if (leftAfter <= 0) {
        setPhase("idle");
        setIsAutospinning(false);
        settleRound(pendingRoundStakeRef.current, updatedRoundPayout, pendingMultiDenominatorRef.current);
      } else {
        setPhase("free");
      }
    } else {
      if (triggeredScatter) {
        const scatters = countScatters(workingGrid);
        const extra = Math.max(0, scatters - 3) * 2;
        setAnteBet(false);
        resetStoredMultiplier();
        setPhase("free");
        setFreeSpinsLeft(FREE_SPINS_AWARD + extra);
        setIsAutospinning(false);
      } else {
        setPhase("idle");
        settleRound(pendingRoundStakeRef.current, updatedRoundPayout, pendingMultiDenominatorRef.current);
      }
    }

    isExecutingSpinRef.current = false;
    setIsExecutingSpin(false);
    setIsTumbling(false);
  }, [anteBet, freeSpinsLeft, grid, phase, resetStoredMultiplier, settleRound, spinCost]);

  React.useEffect(() => {
    if (!isAutospinning || isExecutingSpin) return;

    if (phase === "idle") {
      if (!isHundredDollarFreeSpin && balance < spinCost) {
        setIsAutospinning(false);
        return;
      }
      const timer = window.setTimeout(() => {
        if (isAutospinning && phase === "idle" && !isExecutingSpinRef.current) {
          handleMainSpin();
        }
      }, 350);
      return () => window.clearTimeout(timer);
    }

    if (phase === "free") {
      if (freeSpinsLeft <= 0) {
        setIsAutospinning(false);
        return;
      }
      const timer = window.setTimeout(() => {
        if (isAutospinning && phase === "free" && !isExecutingSpinRef.current) {
          handleMainSpin();
        }
      }, 350);
      return () => window.clearTimeout(timer);
    }

    if (phase === "spinning") {
      return;
    }
  }, [isAutospinning, isExecutingSpin, phase, isHundredDollarFreeSpin, balance, spinCost, freeSpinsLeft]);

  const canPaidSpin = phase === "idle";

  const startPaidSpin = () => {
    if (!canPaidSpin) return;
    if (isExecutingSpinRef.current) return;
    if (betAmount < 100) return;
    if (!isHundredDollarFreeSpin && balance < spinCost) return;

    if (!isHundredDollarFreeSpin) {
      subtractFromBalance(spinCost);
      pendingRoundStakeRef.current = spinCost;
      pendingMultiDenominatorRef.current = betAmount;
    } else {
      pendingRoundStakeRef.current = 100;
      pendingMultiDenominatorRef.current = 100;
    }

    playAudio(audioRef.current.bet);
    pendingRoundPayoutRef.current = 0;
    setPendingRoundPayout(0);
    setLastWin(0);
    resetStoredMultiplier();
    void executeSpin();
  };

  const spinFree = () => {
    if (phase !== "free" || freeSpinsLeft <= 0) return;
    if (isExecutingSpinRef.current) return;
    void executeSpin();
  };

  const buyBonus = () => {
    if (phase !== "idle" || betAmount < 100 || balance < buyBonusCost) return;
    if (isExecutingSpinRef.current) return;

    setLastWin(0);
    setAnteBet(false);
    subtractFromBalance(buyBonusCost);
    playAudio(audioRef.current.bet);

    pendingRoundStakeRef.current = buyBonusCost;
    pendingMultiDenominatorRef.current = buyBonusCost;
    pendingRoundPayoutRef.current = 0;
    setPendingRoundPayout(0);
    setHighlighted(new Set());
    resetStoredMultiplier();
    void executeSpin(true);
  };

  const handleMainSpin = () => {
    if (isExecutingSpinRef.current) return;
    if (phase === "free") {
      spinFree();
      return;
    }
    startPaidSpin();
  };

  const mainDisabled =
    isExecutingSpin ||
    (phase === "free"
      ? freeSpinsLeft <= 0
      : phase !== "idle" || (!isHundredDollarFreeSpin && balance < spinCost) || betAmount < 100);

  return (
    <>
      <div className="p-2 sm:p-4 lg:p-6 max-w-350 mx-auto flex flex-col lg:flex-row gap-4 lg:gap-8">
        <div className="w-full lg:w-60 flex flex-col gap-3 bg-[#0f212e] p-2 sm:p-3 rounded-xl h-fit text-xs self-start">
          <div className="space-y-2">
            <label className="text-xs font-bold text-[#b1bad3] uppercase tracking-wider">Bet Amount</label>
            <div className="text-[9px] text-[#93c8a8] font-semibold">Free spin with a $100 bet (no Ante)</div>
            <div className="relative">
              <div className="absolute left-3 top-1/2 -translate-y-1/2 text-[#b1bad3] font-mono">$</div>
              <input
                type="number"
                value={betInput}
                onChange={(e) => setBetInput(e.target.value)}
                onBlur={() => {
                  const val = Number(betInput.replace(",", "."));
                  const safe = Number.isFinite(val) ? Math.max(100, val) : 100;
                  const normalized = normalizeMoney(safe);
                  setBetAmount(normalized);
                  setBetInput(String(normalized));
                }}
                disabled={phase !== "idle" || isAutospinning}
                className="w-full bg-[#0f212e] border border-[#2f4553] rounded-md py-2 pl-7 pr-4 text-white font-mono focus:outline-none focus:border-[#00e701] transition-colors"
              />
            </div>
            <div className="grid grid-cols-3 gap-2">
              <button
                onClick={() => {
                  const n = normalizeMoney(Math.max(100, betAmount / 2));
                  setBetAmount(n);
                  setBetInput(String(n));
                }}
                disabled={phase !== "idle" || isAutospinning}
                className="bg-[#2f4553] hover:bg-[#3e5666] text-xs py-1 rounded text-[#b1bad3] disabled:opacity-50 cf-press"
              >
                ½
              </button>
              <button
                onClick={() => {
                  const n = normalizeMoney(betAmount * 2);
                  setBetAmount(n);
                  setBetInput(String(n));
                }}
                disabled={phase !== "idle" || isAutospinning}
                className="bg-[#2f4553] hover:bg-[#3e5666] text-xs py-1 rounded text-[#b1bad3] disabled:opacity-50 cf-press"
              >
                2×
              </button>
              <button
                onClick={() => {
                  const n = normalizeMoney(Math.max(100, balance));
                  setBetAmount(n);
                  setBetInput(String(n));
                }}
                disabled={phase !== "idle" || isAutospinning}
                className="bg-[#2f4553] hover:bg-[#3e5666] text-xs py-1 rounded text-[#b1bad3] disabled:opacity-50 cf-press"
              >
                All In
              </button>
            </div>
          </div>

          <div className="p-3 bg-[#132330] rounded-lg border border-[#2f4553] space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-[10px] text-[#b1bad3] font-bold uppercase">Ante Bet - Spin Cost +50%</span>
              <button
                onClick={() => setAnteBet(!anteBet)}
                disabled={phase !== "idle" || isAutospinning}
                className={`w-10 h-5 rounded-full relative transition-colors ${anteBet ? "bg-[#00e701]" : "bg-[#2f4553]"}`}
              >
                <div className={`absolute top-0.5 w-4 h-4 bg-white rounded-full transition-all ${anteBet ? "left-5.5" : "left-0.5"}`} />
              </button>
            </div>
            {!anteBet && (
              <button
                onClick={buyBonus}
                disabled={phase !== "idle" || isAutospinning || betAmount <= 0 || balance < buyBonusCost}
                className="w-full py-1 text-[9px] font-bold uppercase bg-[#f59e0b]/10 text-[#f59e0b] border border-[#f59e0b]/20 rounded hover:bg-[#f59e0b]/20"
              >
                {`Bonus Buy $${formatMoney(buyBonusCost)}`}
              </button>
            )}
          </div>

          {!isAutospinning && (
            <button
              onClick={() => setIsAutospinning(true)}
              disabled={(phase !== "idle" && phase !== "free") || (phase === "idle" && !isHundredDollarFreeSpin && balance < spinCost)}
              className="w-full py-2 rounded-md font-bold text-xs transition-all flex items-center justify-center gap-2 bg-[#2f4553] hover:bg-[#3e5666] text-[#b1bad3] disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {phase === "free" ? "Auto (Free Spins)" : "Auto (Normal Spins)"}
            </button>
          )}

          <button
            onClick={isAutospinning ? () => setIsAutospinning(false) : handleMainSpin}
            disabled={!isAutospinning && mainDisabled}
            className={`w-full ${
              isAutospinning
                ? "bg-[#ff4d4d] hover:bg-[#ff3333] text-white shadow-[0_0_20px_rgba(255,77,77,0.2)]"
                : "bg-[#00e701] hover:bg-[#00c201] text-black shadow-[0_0_20px_rgba(0,231,1,0.2)]"
            } disabled:opacity-50 disabled:cursor-not-allowed py-3 rounded-md font-bold text-lg transition-all active:scale-95 flex items-center justify-center gap-2`}
          >
            {isAutospinning ? (
              "Stop"
            ) : isExecutingSpin ? (
              "Playing"
            ) : (
              <>
                <PlayArrow /> Bet
              </>
            )}
          </button>

          {phase === "free" && (
            <div className="bg-[#0f212e] p-4 rounded border border-[#2f4553] text-center">
              <div className="text-[#b1bad3] text-sm">Current Win</div>
              <div className="text-2xl font-bold text-[#00e701]">${pendingRoundPayout.toFixed(2)}</div>
            </div>
          )}

          {lastWin > 0 && phase === "idle" && (
            <div className="p-4 bg-[#213743] border border-[#00e701] rounded-md text-center">
              <div className="text-xs text-[#b1bad3] uppercase">You Won</div>
              <div className="text-xl font-bold text-[#00e701]">${lastWin.toFixed(2)}</div>
            </div>
          )}
        </div>

        <div className="flex-1 flex flex-col gap-6">
          <div className="bg-[#0f212e] p-4 sm:p-8 rounded-3xl self-center w-full">
            <div className="rounded-3xl overflow-hidden relative bg-[#ded0c1] h-140 sm:h-160">
              <ColosseumBackground />

              <div className="relative z-10 flex flex-col items-center justify-center h-full p-2 sm:p-4">
                {phase === "free" && (
                  <div className="absolute top-4 sm:top-6 left-1/2 -translate-x-1/2 z-30 flex justify-center w-full px-4 pointer-events-none">
                    <div className="bg-[#0f212e]/90 backdrop-blur-md border border-[#facc15]/20 px-5 py-2 rounded-full flex items-center gap-5 shadow-[0_0_20px_rgba(0,0,0,0.4)]">
                      <div className="flex items-center gap-2.5">
                        <span className="text-[10px] text-[#b1bad3] font-black uppercase tracking-widest">Spins</span>
                        <span className="text-xl font-black text-[#facc15] leading-none">{freeSpinsLeft}</span>
                      </div>
                      <div className="w-px h-7 bg-[#facc15]/10" />
                      <div className="flex items-center gap-2.5">
                        <span className="text-[10px] text-[#b1bad3] font-black uppercase tracking-widest">Multi</span>
                        <span className="text-xl font-black text-[#facc15] leading-none">x{storedMultiplier.toLocaleString()}</span>
                      </div>
                    </div>
                  </div>
                )}

                <div className="p-1.5 sm:p-2 rounded-2xl w-full max-w-135">
                  <div className="grid grid-cols-6 gap-1 sm:gap-1.5 mx-auto w-full">
                    {Array.from({ length: COLS }, (_, col) => (
                      <div key={`col-${col}`} className="flex flex-col gap-1 sm:gap-1.5 relative overflow-hidden">
                        {Array.from({ length: ROWS }, (_, rowIdx) => {
                          const cell = grid[rowIdx][col];
                          const key = toPosKey(rowIdx, col);
                          const isHit = highlighted.has(key);
                          const isDropping = lastDropIndices.has(key);
                          const isSpinning = reelsSpinning[col];

                          return (
                            <div
                              key={key}
                              className={`aspect-square w-full rounded-lg transition-all duration-200 flex items-center justify-center relative z-0`}
                            >
                              {!isSpinning && (
                                <span
                                  className={`relative z-10 text-xl sm:text-3xl lg:text-4xl select-none leading-none transform-gpu filter ${
                                    isHit ? "animate-pop" : isDropping ? "animate-drop-in" : !isTumbling && isExecutingSpin ? "animate-stop-bounce" : ""
                                  }`}
                                >
                                  {renderCellContent(cell)}
                                </span>
                              )}
                            </div>
                          );
                        })}

                        {reelsSpinning[col] && (
                          <div className="flex flex-col gap-1 sm:gap-1.5 absolute top-0 left-0 w-full animate-spin-infinite-down pointer-events-none z-20">
                            {reelFrames[col].map((cell, idx) => (
                              <div key={`spin-${col}-${idx}-${spinKey}`} className="aspect-square w-full flex items-center justify-center rounded-lg">
                                <span className="text-xl sm:text-3xl lg:text-4xl select-none leading-none filter blur-[1px]">{renderCellContent(cell)}</span>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </div>

          <GameRecordsPanel gameId="gatesofolympus" />
        </div>
      </div>

      <style jsx global>{`
        @keyframes sway {
          0%, 100% { transform: rotate(-2deg); }
          50% { transform: rotate(2deg); }
        }
        .animate-banner-sway {
          animation: sway 6s ease-in-out infinite;
        }
        .animate-banner-sway-delayed {
          animation: sway 7s ease-in-out infinite reverse;
        }
        @keyframes dropIn {
          0% { transform: translateY(-120%); opacity: 0; }
          60% { transform: translateY(10%); opacity: 1; }
          80% { transform: translateY(-5%); }
          100% { transform: translateY(0); opacity: 1; }
        }
        .animate-drop-in {
          animation: dropIn 0.65s cubic-bezier(0.34, 1.56, 0.64, 1) forwards;
        }
        @keyframes pop {
          0% { transform: scale(1); }
          50% { transform: scale(1.4); }
          100% { transform: scale(1); }
        }
        .animate-pop {
          animation: pop 0.2s ease-in-out;
        }
        @keyframes stop-bounce {
          0% { transform: translateY(-20px); }
          60% { transform: translateY(5px); }
          100% { transform: translateY(0); }
        }
        .animate-stop-bounce {
          animation: stop-bounce 0.3s cubic-bezier(0.25, 1, 0.5, 1) forwards;
        }
        @keyframes spinInfiniteDown {
          0% { transform: translateY(-50%); }
          100% { transform: translateY(0%); }
        }
        .animate-spin-infinite-down {
          animation: spinInfiniteDown 0.12s linear infinite;
        }
      `}</style>
    </>
  );
}
