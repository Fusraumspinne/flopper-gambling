"use client";

import React, { useMemo, useState } from "react";
import { useWallet } from "@/components/WalletProvider";
import { useSoundVolume } from "@/components/SoundVolumeProvider";
import GameRecordsPanel from "@/components/GameRecordsPanel";
import PlayArrow from "@mui/icons-material/PlayArrow";

type GamePhase = "idle" | "spinning" | "free";
type CandySymbol = "🍬" | "🍭" | "🍰" | "🧁" | "🍫";
type SymbolId = CandySymbol | "🌈";
type GridCell = SymbolId | null;
type Position = [number, number];

const ROWS = 7;
const COLS = 7;
const MIN_CLUSTER = 5;
const FREE_SPINS_AWARD = 15;

const SYMBOL_WEIGHTS: Record<SymbolId, number> = {
  "🍬": 21,
  "🍭": 20,
  "🍰": 20,
  "🧁": 19,
  "🍫": 19,
  "🌈": 0.55,
};

const SYMBOL_BASE_MULTIS: Record<CandySymbol, number> = {
  "🍬": 0.0025,
  "🍭": 0.004,
  "🍰": 0.0075,
  "🧁": 0.01,
  "🍫": 0.02,
};

const SYMBOL_FREESPIN_MULTIS: Record<CandySymbol, number> = {
  "🍬": 0.025,
  "🍭": 0.04,
  "🍰": 0.075,
  "🧁": 0.1,
  "🍫": 0.2,
};

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

function pickWeighted<T extends string | number>(entries: [T, number][]) {
  const total = entries.reduce((acc, [, weight]) => acc + Math.max(0, weight), 0);
  let roll = Math.random() * total;
  for (const [item, weight] of entries) {
    roll -= Math.max(0, weight);
    if (roll <= 0) return item;
  }
  return entries[entries.length - 1][0];
}

function randomSymbol(anteBet: boolean): SymbolId {
  const scatterWeight = anteBet ? SYMBOL_WEIGHTS["🌈"] * 1.3 : SYMBOL_WEIGHTS["🌈"];
  const table: [SymbolId, number][] = [
    ["🍬", SYMBOL_WEIGHTS["🍬"]],
    ["🍭", SYMBOL_WEIGHTS["🍭"]],
    ["🍰", SYMBOL_WEIGHTS["🍰"]],
    ["🧁", SYMBOL_WEIGHTS["🧁"]],
    ["🍫", SYMBOL_WEIGHTS["🍫"]],
    ["🌈", scatterWeight],
  ];
  return pickWeighted(table);
}

function buildGrid(anteBet: boolean): GridCell[][] {
  return Array.from({ length: ROWS }, () =>
    Array.from({ length: COLS }, () => randomSymbol(anteBet))
  );
}

function gridToReelFrames(sourceGrid: GridCell[][]) {
  return Array.from({ length: COLS }, (_, col) =>
    Array.from({ length: ROWS }, (_, row) => sourceGrid[row][col])
  );
}

function emptyMultiplierGrid() {
  return Array.from({ length: ROWS }, () => Array.from({ length: COLS }, () => 0));
}

function countScatters(grid: GridCell[][]) {
  let count = 0;
  for (let row = 0; row < ROWS; row++) {
    for (let col = 0; col < COLS; col++) {
      if (grid[row][col] === "🌈") count += 1;
    }
  }
  return count;
}

function toPosKey(row: number, col: number) {
  return `${row}-${col}`;
}

function stageToMultiplier(stage: number) {
  if (stage < 2) return 1;
  return 2 ** (stage - 1);
}

function findClusters(grid: GridCell[][]): Position[][] {
  const visited = Array.from({ length: ROWS }, () => Array.from({ length: COLS }, () => false));
  const clusters: Position[][] = [];

  const neighbors: Position[] = [
    [1, 0],
    [-1, 0],
    [0, 1],
    [0, -1],
  ];

  for (let startRow = 0; startRow < ROWS; startRow++) {
    for (let startCol = 0; startCol < COLS; startCol++) {
      if (visited[startRow][startCol]) continue;
      const symbol = grid[startRow][startCol];
      if (!symbol || symbol === "🌈") continue;

      const queue: Position[] = [[startRow, startCol]];
      visited[startRow][startCol] = true;
      const cluster: Position[] = [];

      while (queue.length > 0) {
        const [row, col] = queue.shift()!;
        cluster.push([row, col]);

        for (const [dr, dc] of neighbors) {
          const nr = row + dr;
          const nc = col + dc;
          if (nr < 0 || nr >= ROWS || nc < 0 || nc >= COLS) continue;
          if (visited[nr][nc]) continue;
          if (grid[nr][nc] !== symbol) continue;
          visited[nr][nc] = true;
          queue.push([nr, nc]);
        }
      }

      if (cluster.length >= MIN_CLUSTER) {
        clusters.push(cluster);
      }
    }
  }

  return clusters;
}

function tumble(grid: GridCell[][], remove: Set<string>, anteBet: boolean) {
  const nextGrid: GridCell[][] = Array.from({ length: ROWS }, () => Array(COLS).fill(null));
  const droppedIndices = new Set<string>();

  for (let col = 0; col < COLS; col++) {
    const survivors: { symbol: GridCell; oldRow: number }[] = [];
    for (let row = 0; row < ROWS; row++) {
      if (!remove.has(toPosKey(row, col))) {
        survivors.push({ symbol: grid[row][col], oldRow: row });
      }
    }
    
    const numberOfNew = ROWS - survivors.length;
    
    for (let i = 0; i < numberOfNew; i++) {
        nextGrid[i][col] = randomSymbol(anteBet);
        droppedIndices.add(toPosKey(i, col));
    }
    
    for (let i = 0; i < survivors.length; i++) {
        const newRow = i + numberOfNew;
        nextGrid[newRow][col] = survivors[i].symbol;
        if (newRow !== survivors[i].oldRow) {
           droppedIndices.add(toPosKey(newRow, col));
        }
    }
  }

  return { nextGrid, droppedIndices };
}

function stageClass(stage: number) {
  if (stage <= 0) return "";
  if (stage === 1) return "bg-[#FFF9C4]";
  if (stage === 2) return "bg-[#FFE082]";
  if (stage === 3) return "bg-[#F48FB1]";
  if (stage === 4) return "bg-[#CE93D8]";
  if (stage === 5) return "bg-[#BA68C8]";
  if (stage === 6) return "bg-[#9575CD]";
  if (stage === 7) return "bg-[#7986CB]";
  if (stage === 8) return "bg-[#64B5F6]";
  return "bg-[#4FC3F7]";
}

function stageBadge(stage: number) {
  if (stage < 2) return null;
  return stageToMultiplier(stage);
}


function CandyCloud({ className, style, type = 1 }: { className?: string; style?: React.CSSProperties; type?: 1 | 2 | 3 }) {
  const paths = {
    1: "M25,50 C10,50 0,40 0,25 C0,10 15,0 25,5 C30,0 50,0 55,5 C60,0 75,0 80,10 C95,10 100,25 100,35 C100,50 90,60 75,60 Z",
    2: "M20,40 C5,40 0,30 0,20 C0,5 15,0 30,5 C40,0 60,0 70,5 C80,0 95,5 100,15 C105,30 95,40 80,40 Z",
    3: "M10,30 C0,30 -5,20 5,10 C15,0 30,0 40,5 C50,0 70,0 80,5 C95,5 105,15 100,25 C95,35 80,35 70,30 C60,35 40,35 30,30 Z"
  };

  return (
    <div className={`absolute select-none pointer-events-none drop-shadow-sm animate-cloud-drift ${className}`} style={style}>
      <svg viewBox="0 0 100 60" className="w-full h-full fill-white/80">
        <path d={paths[type]} />
      </svg>
    </div>
  );
}

function GummyHills() {
  return (
    <div className="absolute bottom-0 left-0 w-full h-48 sm:h-64 z-0 pointer-events-none overflow-hidden opacity-40">
      <svg viewBox="0 0 1200 300" preserveAspectRatio="none" className="w-full h-full">
        <path d="M-100,300 L200,50 C350,150 500,20 700,100 C850,250 1000,50 1300,300 Z" fill="#F48FB1" />
        <path d="M200,300 L500,80 C650,180 800,50 1000,120 C1150,280 1300,150 1500,300 Z" fill="#F06292" />
      </svg>
    </div>
  );
}

function PuddingMountains() {
  return (
    <div className="absolute bottom-32 left-0 w-full h-80 z-0 pointer-events-none overflow-hidden opacity-30">
      <svg viewBox="0 0 1200 400" preserveAspectRatio="none" className="w-full h-full">
        <path d="M0,400 L250,50 L500,400 Z" fill="#B39DDB" />
        <path d="M300,400 L600,0 L900,400 Z" fill="#9575CD" />
        <path d="M700,400 L1000,100 L1300,400 Z" fill="#B39DDB" />
      </svg>
    </div>
  );
}

function ChocolateRiver() {
  return (
    <div className="absolute bottom-0 left-0 w-full h-32 sm:h-48 z-[1] pointer-events-none overflow-hidden">
       <div className="absolute top-0 left-0 w-[200%] h-full flex animate-river-flow">
          <svg viewBox="0 0 1200 100" preserveAspectRatio="none" className="w-[50%] h-full fill-[#5D4037]">
             <path d="M0,40 Q300,10 600,40 Q900,70 1200,40 L1200,100 L0,100 Z" />
          </svg>
          <svg viewBox="0 0 1200 100" preserveAspectRatio="none" className="w-[50%] h-full fill-[#5D4037]">
             <path d="M0,40 Q300,10 600,40 Q900,70 1200,40 L1200,100 L0,100 Z" />
          </svg>
       </div>

       <div className="absolute top-2 left-0 w-[200%] h-full flex animate-river-flow-slow opacity-30">
          <svg viewBox="0 0 1200 100" preserveAspectRatio="none" className="w-[50%] h-full fill-none stroke-[#8D6E63] stroke-[2px]">
             <path d="M0,50 Q300,30 600,50 Q900,70 1200,50" />
             <path d="M0,70 Q300,50 600,70 Q900,90 1200,70" />
          </svg>
          <svg viewBox="0 0 1200 100" preserveAspectRatio="none" className="w-[50%] h-full fill-none stroke-[#8D6E63] stroke-[2px]">
             <path d="M0,50 Q300,30 600,50 Q900,70 1200,50" />
             <path d="M0,70 Q300,50 600,70 Q900,90 1200,70" />
          </svg>
       </div>
    </div>
  );
}

function CandyLand() {
  return (
    <div className="absolute bottom-0 left-0 w-full h-24 sm:h-32 z-[2] pointer-events-none">
       <svg viewBox="0 0 1200 100" preserveAspectRatio="none" className="w-full h-full fill-[#F8BBD0] drop-shadow-[0_-8px_15px_rgba(183,28,28,0.2)]">
          <path d="M0,40 C200,20 400,60 600,30 C800,10 1000,50 1200,20 L1200,100 L0,100 Z" />
          <path d="M0,70 C300,60 600,85 900,65 C1100,75 1200,60 L1200,100 L0,100 Z" fill="#F48FB1" opacity="0.5" />
       </svg>
    </div>
  );
}

function FloatingClouds() {
  const clouds = useMemo(() => {
    return Array.from({ length: 8 }).map((_, i) => ({
      type: (i % 3 + 1) as 1 | 2 | 3,
      top: 5 + (i * 12) % 45,
      duration: 35 + Math.random() * 45,
      delay: -(Math.random() * 80), 
      opacity: 0.3 + (i % 4) * 0.15,
      scale: 0.5 + (i % 3) * 0.25
    }));
  }, []);

  return (
    <>
      {clouds.map((cloud, idx) => (
        <CandyCloud 
          key={idx}
          type={cloud.type}
          style={{
            top: `${cloud.top}%`,
            width: `${180 * cloud.scale}px`,
            animationDuration: `${cloud.duration}s`,
            animationDelay: `${cloud.delay}s`,
            opacity: cloud.opacity
          }}
        />
      ))}
    </>
  );
}

function CandyCane({ className }: { className?: string }) {
  return (
    <div className={`absolute pointer-events-none ${className}`}>
      <svg viewBox="0 0 30 100" className="w-full h-full drop-shadow-lg">
         <path d="M22,100 L22,30 C22,10 2,10 2,30" fill="none" stroke="rgba(0,0,0,0.1)" strokeWidth="10" transform="translate(2,2)" />
         <path d="M20,100 L20,30 C20,10 0,10 0,30" fill="none" stroke="#FF5252" strokeWidth="10" />
         <path d="M20,100 L20,30 C20,10 0,10 0,30" fill="none" stroke="#FFF" strokeWidth="10" strokeDasharray="8 8" />
         <path d="M18,95 L18,30 C18,15 5,15 5,30" fill="none" stroke="#FFF" strokeWidth="2" opacity="0.5" />
      </svg>
    </div>
  );
}

function CandyStar({ className, delay = 0 }: { className?: string; delay?: number }) {
  return (
    <div 
      className={`absolute w-1 h-1 sm:w-1.5 sm:h-1.5 bg-white rounded-full animate-pulse pointer-events-none ${className}`}
      style={{ animationDelay: `${delay}s`, opacity: 0.4 }}
    />
  );
}

function LollipopTree({ className }: { className?: string }) {
   return (
     <div className={`absolute bottom-20 z-0 pointer-events-none ${className}`}>
        <svg  viewBox="0 0 100 200" className="h-32 sm:h-48 drop-shadow-lg">
           <rect x="45" y="80" width="10" height="120" fill="#FFF" />
           <circle cx="50" cy="50" r="40" fill="#FF4081" />
           <path d="M50,10 A40,40 0 0,1 90,50" fill="none" stroke="#FFF" strokeWidth="8" strokeLinecap="round" opacity="0.4" />
           <path d="M50,90 A40,40 0 0,1 10,50" fill="none" stroke="#FFF" strokeWidth="8" strokeLinecap="round" opacity="0.4" />
        </svg>
     </div>
   );
}

function CandyGrass({ className }: { className?: string }) {
  return (
    <div className={`absolute pointer-events-none ${className}`}>
      <svg viewBox="0 0 50 30" className="w-10 h-6 fill-[#81C784]">
        <path d="M5,30 Q10,5 15,30 M15,30 Q25,-5 35,30 M35,30 Q40,10 45,30" stroke="#66BB6A" strokeWidth="2" strokeLinecap="round" />
        <circle cx="10" cy="15" r="1.5" fill="#C5E1A5" />
        <circle cx="30" cy="10" r="2" fill="#C5E1A5" />
      </svg>
    </div>
  );
}

function FloatingCandyBg() {
  const items = useMemo(() => {
    return Array.from({ length: 15 }).map((_, i) => ({
      left: Math.random() * 100,
      delay: Math.random() * 5,
      duration: 10 + Math.random() * 10,
      scale: 0.5 + Math.random() * 0.5,
      symbol: ["🍬", "🍭", "🍩"][Math.floor(Math.random() * 3)]
    }));
  }, []);

  return (
    <div className="absolute inset-0 overflow-hidden pointer-events-none z-0">
      {items.map((item, idx) => (
        <div 
          key={idx}
          className="absolute text-2xl animate-float-up opacity-60 filter blur-[1px]"
          style={{
             left: `${item.left}%`,
             bottom: '-50px',
             animationDelay: `-${item.delay}s`,
             animationDuration: `${item.duration}s`,
             transform: `scale(${item.scale})`
          }}
        >
          {item.symbol}
        </div>
      ))}
    </div>
  );
}

export default function SugarRushPage() {
  const { balance, subtractFromBalance, addToBalance, finalizePendingLoss } = useWallet();
  const { volume } = useSoundVolume();

  const [phase, setPhase] = useState<GamePhase>("idle");
  const [betInput, setBetInput] = useState("100");
  const [betAmount, setBetAmount] = useState(100);
  const [anteBet, setAnteBet] = useState(false);
  const [grid, setGrid] = useState<GridCell[][]>(() => buildGrid(false));
  const [reelFrames, setReelFrames] = useState<GridCell[][]>(() => gridToReelFrames(buildGrid(false)));
  const [reelsSpinning, setReelsSpinning] = useState<boolean[]>(() => Array(COLS).fill(false));
  const [spinKey, setSpinKey] = useState(0);

  const [multiplierGrid, setMultiplierGrid] = useState<number[][]>(() => emptyMultiplierGrid());
  const [highlighted, setHighlighted] = useState<Set<string>>(new Set());
  const [freeSpinsLeft, setFreeSpinsLeft] = useState(0);
  const [isAutospinning, setIsAutospinning] = useState(false);
  const [isExecutingSpin, setIsExecutingSpin] = useState(false);
  const [isTumbling, setIsTumbling] = useState(false);
  const [pendingRoundPayout, setPendingRoundPayout] = useState(0);
  const [lastWin, setLastWin] = useState(0);
  const [lastCascadeWin, setLastCascadeWin] = useState(0);
  const [lastDropIndices, setLastDropIndices] = useState<Set<string>>(new Set());

  const pendingRoundStakeRef = React.useRef(0);
  const pendingMultiDenominatorRef = React.useRef(0);
  const pendingRoundPayoutRef = React.useRef(0);
  const isExecutingSpinRef = React.useRef(false);
  const intervalRefs = React.useRef<Array<ReturnType<typeof setInterval> | null>>(Array(COLS).fill(null));

  React.useEffect(() => {
    return () => {
      intervalRefs.current.forEach((timer) => {
        if (timer) clearInterval(timer);
      });
    };
  }, []);

  const audioRef = React.useRef<{
    bet: HTMLAudioElement | null;
    spin: HTMLAudioElement | null;
    win: HTMLAudioElement | null;
    lose: HTMLAudioElement | null;
  }>({ bet: null, spin: null, win: null, lose: null });

  const spinCost = useMemo(() => normalizeMoney(betAmount * (anteBet ? 1.5 : 1)), [betAmount, anteBet]);
  const buyBonusCost = useMemo(() => normalizeMoney(betAmount * 100), [betAmount]);
  const isTenDollarFreeSpin = !anteBet && normalizeMoney(betAmount) === 10;

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

  const settleRound = React.useCallback((stake: number, payout: number, multiDenominator: number) => {
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
  }, [addToBalance, finalizePendingLoss]);

  const executeSpin = React.useCallback(async () => {
    if (isExecutingSpinRef.current) return;
    isExecutingSpinRef.current = true;
    setIsExecutingSpin(true);
    setIsTumbling(false);
    setLastCascadeWin(0);
    setLastDropIndices(new Set());
    
    const isFreeSpin = phase === "free";
    if (isFreeSpin) {
      setFreeSpinsLeft((s) => Math.max(0, s - 1));
    }
    if (!isFreeSpin) {
      setPhase("spinning");
      setMultiplierGrid(emptyMultiplierGrid());
    }

    setSpinKey((v) => v + 1);
    playAudio(audioRef.current.spin);
    
    let workingGrid = buildGrid(anteBet);
    
    const startFrames = gridToReelFrames(grid).map((col) => {
      const fresh = randomSymbol(anteBet);
      return [fresh, ...col];
    });
    setReelFrames(startFrames);
    setReelsSpinning(Array(COLS).fill(true));
    
    const animateReels = new Promise<void>((resolve) => {
      const spinningFrames = Array.from({ length: COLS }, () => 
        Array.from({ length: ROWS * 2 }, () => randomSymbol(anteBet))
      );
      setReelFrames(spinningFrames);
      setReelsSpinning(Array(COLS).fill(true));

      let stoppedCount = 0;
      const baseDelay = 400;     
      const reelDelay = 250;    

      for (let col = 0; col < COLS; col++) {
        setTimeout(() => {
            setGrid((prevGrid) => {
                const nextG = prevGrid.map(r => [...r]);
                for(let r=0; r<ROWS; r++) {
                    nextG[r][col] = workingGrid[r][col];
                }
                return nextG;
            });

            setReelsSpinning((prev) => {
                const nextS = [...prev];
                nextS[col] = false;
                return nextS;
            });

            stoppedCount++;
            if (stoppedCount === COLS) {
                setTimeout(resolve, 200);
            }
        }, baseDelay + (col * reelDelay));
      }
    });

    await animateReels;

    let workingMultipliers = isFreeSpin
      ? multiplierGrid.map((row) => [...row])
      : emptyMultiplierGrid();

    setGrid(workingGrid);
    setHighlighted(new Set());

    let triggeredScatter = false;
    let spinWin = 0;

    while (true) {
      if (countScatters(workingGrid) >= 3) triggeredScatter = true;

      const clusters = findClusters(workingGrid);
      if (clusters.length === 0) break;

      setIsTumbling(true);
      const remove = new Set<string>();
      let cascadeWin = 0;

      for (const cluster of clusters) {
        const [firstRow, firstCol] = cluster[0];
        const symbol = workingGrid[firstRow][firstCol] as CandySymbol;
        
        const baseMultiTable = isFreeSpin ? SYMBOL_FREESPIN_MULTIS : SYMBOL_BASE_MULTIS;
        const totalSymbolBaseWin = baseMultiTable[symbol] * spinCost * cluster.length;

        let totalCellMultipliers = 0;
        for (const [row, col] of cluster) {
          const stage = workingMultipliers[row][col];
          const val = stageToMultiplier(stage);
          if (val >= 2) totalCellMultipliers += val;
          remove.add(toPosKey(row, col));
        }

        const effectiveMultiplier = totalCellMultipliers > 0 ? totalCellMultipliers : 1;
        const comboFinalValue = normalizeMoney(totalSymbolBaseWin * effectiveMultiplier);
        cascadeWin += comboFinalValue;
      }

      for (const pos of remove) {
        const [rowStr, colStr] = pos.split("-");
        const row = Number(rowStr);
        const col = Number(colStr);
        workingMultipliers[row][col] += 1;
      }

      spinWin = normalizeMoney(spinWin + cascadeWin);
      setLastCascadeWin(cascadeWin);
      
      setHighlighted(new Set(remove));
      setMultiplierGrid(workingMultipliers.map((row) => [...row]));

      await sleep(360);

      const tumbleResult = tumble(workingGrid, remove, anteBet);
      workingGrid = tumbleResult.nextGrid;
      
      setLastDropIndices(tumbleResult.droppedIndices);
      setGrid(workingGrid.map((row) => [...row]));
      setHighlighted(new Set());
      
      await sleep(700);
      setLastDropIndices(new Set());
    }

    const updatedRoundPayout = normalizeMoney(pendingRoundPayoutRef.current + spinWin);
    pendingRoundPayoutRef.current = updatedRoundPayout;
    setPendingRoundPayout(updatedRoundPayout);

    if (isFreeSpin) {
      const scatters = countScatters(workingGrid);
      const retriggerCount = scatters >= 3 ? 5 + (scatters - 3) : 0;

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
        setPhase("free");
        setFreeSpinsLeft(FREE_SPINS_AWARD);
      } else {
        setPhase("idle");
        settleRound(pendingRoundStakeRef.current, updatedRoundPayout, pendingMultiDenominatorRef.current);
      }
    }

    isExecutingSpinRef.current = false;
    setIsExecutingSpin(false);
    setIsTumbling(false);
  }, [phase, multiplierGrid, anteBet, spinCost, freeSpinsLeft, settleRound, grid]);

  React.useEffect(() => {
    if (!isAutospinning || isExecutingSpin) return;

    if (phase === "idle") {
      if (!isTenDollarFreeSpin && balance < spinCost) {
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
  }, [isAutospinning, phase, isExecutingSpin, freeSpinsLeft, balance, spinCost, isTenDollarFreeSpin]);

  const canPaidSpin = phase === "idle";

  const startPaidSpin = () => {
    if (!canPaidSpin) return;
    if (isExecutingSpinRef.current) return;
    if (betAmount <= 0) return;
    if (!isTenDollarFreeSpin && balance < spinCost) return;

    if (!isTenDollarFreeSpin) {
      subtractFromBalance(spinCost);
      pendingRoundStakeRef.current = spinCost;
      pendingMultiDenominatorRef.current = betAmount;
    } else {
      pendingRoundStakeRef.current = 10;
      pendingMultiDenominatorRef.current = 10;
    }

    playAudio(audioRef.current.bet);
    pendingRoundPayoutRef.current = 0;
    setPendingRoundPayout(0);
    setLastWin(0);
    void executeSpin();
  };

  const spinFree = () => {
    if (phase !== "free" || freeSpinsLeft <= 0) return;
    if (isExecutingSpinRef.current) return;
    void executeSpin();
  };

  const buyBonus = () => {
    if (anteBet || phase !== "idle" || betAmount <= 0 || balance < buyBonusCost) return;
    if (isExecutingSpinRef.current) return;

    setLastWin(0);
    subtractFromBalance(buyBonusCost);
    playAudio(audioRef.current.bet);

    pendingRoundStakeRef.current = buyBonusCost;
    pendingMultiDenominatorRef.current = buyBonusCost;
    pendingRoundPayoutRef.current = 0;
    setPendingRoundPayout(0);
    setMultiplierGrid(emptyMultiplierGrid());
    setHighlighted(new Set());
    setPhase("free");
    setFreeSpinsLeft(FREE_SPINS_AWARD);
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
      : phase !== "idle" || (!isTenDollarFreeSpin && balance < spinCost) || betAmount <= 0);

  return (
    <>
      <div className="p-2 sm:p-4 lg:p-6 max-w-350 mx-auto flex flex-col lg:flex-row gap-4 lg:gap-8">
        <div className="w-full lg:w-60 flex flex-col gap-3 bg-[#0f212e] p-2 sm:p-3 rounded-xl h-fit text-xs self-start">
          <div className="space-y-2">
            <label className="text-xs font-bold text-[#b1bad3] uppercase tracking-wider">Bet Amount</label>
            <div className="text-[9px] text-[#93c8a8] font-semibold">Free spin with a $10 bet (no Ante)</div>
            <div className="relative">
              <div className="absolute left-3 top-1/2 -translate-y-1/2 text-[#b1bad3] font-mono">$</div>
              <input
                type="number"
                value={betInput}
                onChange={(e) => setBetInput(e.target.value)}
                onBlur={() => {
                  const val = Number(betInput.replace(",", "."));
                  const safe = Number.isFinite(val) ? Math.max(10, val) : 10;
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
                  const n = normalizeMoney(Math.max(10, betAmount / 2));
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
                  const n = normalizeMoney(Math.max(10, balance));
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
                disabled={anteBet || phase !== "idle" || isAutospinning || betAmount <= 0 || balance < buyBonusCost}
                className="w-full py-1 text-[9px] font-bold uppercase bg-[#f59e0b]/10 text-[#f59e0b] border border-[#f59e0b]/20 rounded hover:bg-[#f59e0b]/20"
              >
                {`Bonus Buy $${formatMoney(buyBonusCost)}`}
              </button>
            )}
          </div>

          {!isAutospinning && (
            <button
              onClick={() => setIsAutospinning(true)}
              disabled={(phase !== "idle" && phase !== "free") || (phase === "idle" && !isTenDollarFreeSpin && balance < spinCost)}
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

          {(phase === "free") && (
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
            <div className="rounded-3xl overflow-hidden relative bg-[#a5f3fc] h-145 sm:h-170 p-2 sm:p-4">
              <div className="absolute inset-0 pointer-events-none z-0">
                  <div className="absolute inset-0 bg-linear-to-b from-[#a5f3fc] to-[#fbcfe8]" />
                  
                  <PuddingMountains />
                  <GummyHills />

                  <FloatingClouds />
                  
                  <FloatingCandyBg />

                  <CandyStar className="left-[10%] top-[10%]" delay={0} />
                  <CandyStar className="left-[25%] top-[15%]" delay={1.2} />
                  <CandyStar className="left-[40%] top-[8%]" delay={0.5} />
                  <CandyStar className="left-[60%] top-[12%]" delay={2.1} />
                  <CandyStar className="left-[85%] top-[18%]" delay={1.5} />
                  <CandyStar className="left-[75%] top-[5%]" delay={0.8} />

                  <ChocolateRiver />
                  
                  <CandyLand />

                  <LollipopTree className="-left-5 sm:left-4 z-[3] bottom-0 sm:bottom-4" />
                  <LollipopTree className="-right-5 sm:right-4 transform scale-x-[-1] z-[3] bottom-0 sm:bottom-4" />
                  <LollipopTree className="left-[5%] bottom-2 sm:bottom-4 transform scale-[0.7] opacity-80 z-[3]" />
                  <LollipopTree className="right-[8%] bottom-1 sm:bottom-2 transform scale-[0.85] scale-x-[-1] opacity-90 z-[3]" />

                  <CandyCane className="w-8 h-24 left-[2%] bottom-6 z-[3] rotate-[-15deg]" />
                  <CandyCane className="w-6 h-20 right-[4%] bottom-8 z-[3] rotate-[10deg] scale-x-[-1]" />
                  <CandyCane className="w-5 h-16 left-[12%] bottom-4 z-[3] rotate-[5deg] opacity-70" />

                  <CandyGrass className="left-[15%] bottom-2 opacity-60 z-[3]" />
                  <CandyGrass className="right-[15%] bottom-3 opacity-50 scale-110 z-[3]" />
                  <CandyGrass className="left-[4%] bottom-1 opacity-40 scale-75 z-[3]" />
              </div>

              <div className="relative z-10 flex flex-col items-center justify-center h-full">
                {phase === "free" && (
                  <div className="absolute top-4 sm:top-6 left-1/2 -translate-x-1/2 z-30 flex justify-center w-full px-4 pointer-events-none">
                    <div className="bg-[#2d1b4e]/80 backdrop-blur-md border border-[#f9a8d4]/50 px-5 py-2 rounded-full flex items-center gap-5 shadow-[0_0_20px_rgba(236,72,153,0.3)]">
                      <div className="flex items-center gap-2.5">
                        <span className="text-[10px] text-[#fbcfe8] font-black uppercase tracking-widest">Spins</span>
                        <span className="text-xl font-black text-[#f472b6] leading-none">{freeSpinsLeft}</span>
                      </div>
                    </div>
                  </div>
                )}

                <div className="p-1.5 sm:p-2 rounded-2xl w-full max-w-125">
                  <div className="grid grid-cols-7 gap-1 sm:gap-1.5 mx-auto w-full">

                    {Array.from({ length: COLS }, (_, col) => (
                      <div key={`col-${col}`} className="flex flex-col gap-1 sm:gap-1.5 relative overflow-hidden">
                          {Array.from({ length: ROWS }, (_, rowIdx) => {
                              const symbol = grid[rowIdx][col];
                              const key = toPosKey(rowIdx, col);
                              const isHit = highlighted.has(key);
                              const stage = multiplierGrid[rowIdx]?.[col] ?? 0;
                              const badge = stageBadge(stage);
                              const isDropping = lastDropIndices.has(key);
                              const isSpinning = reelsSpinning[col];
                              
                              return (
                                <div
                                  key={key}
                                  className={`aspect-square w-full rounded-lg transition-all duration-200 flex items-center justify-center relative z-0
                                    ${stageClass(stage)} 
                                    ${isHit ? "brightness-110 rounded-lg" : "rounded-lg"}
                                  `}
                                >
                                  {badge && (
                                    <div className="absolute inset-0 flex items-center justify-center pointer-events-none select-none z-0">
                                      <span className="text-[10px] sm:text-xs lg:text-sm font-black text-[#be185d]/80">
                                        x{badge}
                                      </span>
                                    </div>
                                  )}
                                  
                                  {!isSpinning && (
                                    <span className={`relative z-10 text-xl sm:text-3xl lg:text-4xl select-none leading-none transform-gpu filter
                                      ${isHit ? "animate-pop" : isDropping ? "animate-drop-in" : (!isTumbling && isExecutingSpin ? "animate-stop-bounce" : "")}
                                    `}>
                                      {symbol ?? ""}
                                    </span>
                                  )}
                                </div>
                              );
                          })}

                          {reelsSpinning[col] && (
                            <div className={`flex flex-col gap-1 sm:gap-1.5 absolute top-0 left-0 w-full animate-spin-infinite-down pointer-events-none z-20`} >
                              {reelFrames[col].map((symbol, idx) => (
                                  <div key={`spin-${col}-${idx}-${spinKey}`} 
                                      className="aspect-square w-full flex items-center justify-center rounded-lg">
                                    <span className="text-xl sm:text-3xl lg:text-4xl select-none leading-none filter blur-[1px]">{symbol}</span>
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

          <GameRecordsPanel gameId="sugarrush" />
        </div>


      </div>

      <style jsx global>{`
        @keyframes reelSpin {
          0% { transform: translateY(-6.25%); }
          100% { transform: translateY(6.25%); }
        }
        .animate-reel-spin {
          animation: reelSpin var(--dur, 90ms) linear infinite;
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

        @keyframes riverFlow {
          0% { transform: translateX(0); }
          100% { transform: translateX(-50%); }
        }
        .animate-river-flow {
          animation: riverFlow 15s linear infinite;
        }
        .animate-river-flow-slow {
          animation: riverFlow 25s linear infinite;
        }

        @keyframes cloudDrift {
          0% { transform: translateX(-20vw); }
          100% { transform: translateX(110vw); }
        }
        .animate-cloud-drift {
          animation: cloudDrift 50s linear infinite;
        }

        @keyframes floatUp {
           0% { transform: translateY(0) rotate(0deg) scale(0.5); opacity: 0; }
           10% { opacity: 0.6; }
           90% { opacity: 0.6; }
           100% { transform: translateY(-600px) rotate(360deg) scale(1); opacity: 0; }
        }
        .animate-float-up {
           animation: floatUp 15s linear infinite;
        }
      `}</style>
    </>
  );
}
