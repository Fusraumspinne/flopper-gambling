"use client";

import React, { useMemo, useState } from "react";
import { useWallet } from "@/components/WalletProvider";
import { useSoundVolume } from "@/components/SoundVolumeProvider";
import GameRecordsPanel from "@/components/GameRecordsPanel";

type GamePhase = "idle" | "spinning" | "free";
type CandySymbol = "🍬" | "🍭" | "🍰" | "🧁" | "🍥" | "🍡" | "🍫";
type SymbolId = CandySymbol | "🌈";
type GridCell = SymbolId | null;
type Position = [number, number];

const ROWS = 7;
const COLS = 7;
const MIN_CLUSTER = 5;
const FREE_SPINS_AWARD = 15;

const CANDY_SYMBOLS: CandySymbol[] = ["🍬", "🍭", "🍰", "🧁", "🍥", "🍡", "🍫"];

const SYMBOL_WEIGHTS: Record<SymbolId, number> = {
  "🍬": 24,
  "🍭": 21,
  "🍰": 17,
  "🧁": 14,
  "🍥": 11,
  "🍡": 8,
  "🍫": 5,
  "🌈": 1.8,
};

const SYMBOL_BASE_MULTIS: Record<CandySymbol, number> = {
  "🍬": 0.03,
  "🍭": 0.04,
  "🍰": 0.055,
  "🧁": 0.075,
  "🍥": 0.105,
  "🍡": 0.15,
  "🍫": 0.22,
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

const clamp = (v: number, min: number, max: number) => Math.max(min, Math.min(max, v));

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
    ["🍥", SYMBOL_WEIGHTS["🍥"]],
    ["🍡", SYMBOL_WEIGHTS["🍡"]],
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
  // Convert rows->cols for animation
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

function clusterBaseMultiplier(symbol: CandySymbol, size: number) {
  const base = SYMBOL_BASE_MULTIS[symbol];
  const growth = Math.pow(1.75, Math.max(0, size - MIN_CLUSTER));
  return base * growth;
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
    // Collect survivors along with their original row mapping
    const survivors: { symbol: GridCell; oldRow: number }[] = [];
    for (let row = 0; row < ROWS; row++) {
      if (!remove.has(toPosKey(row, col))) {
        survivors.push({ symbol: grid[row][col], oldRow: row });
      }
    }
    
    // new symbols at top
    const numberOfNew = ROWS - survivors.length;
    
    // Fill new (at top)
    for (let i = 0; i < numberOfNew; i++) {
        nextGrid[i][col] = randomSymbol(anteBet);
        // New symbols always drop in
        droppedIndices.add(toPosKey(i, col));
    }
    
    // Fill survivors (below new)
    for (let i = 0; i < survivors.length; i++) {
        const newRow = i + numberOfNew;
        nextGrid[newRow][col] = survivors[i].symbol;
        // Only drop-animate if the symbol's row actually shifted
        if (newRow !== survivors[i].oldRow) {
           droppedIndices.add(toPosKey(newRow, col));
        }
    }
  }

  return { nextGrid, droppedIndices };
}

function stageClass(stage: number) {
  if (stage <= 0) return "";
  if (stage === 1) return "bg-[#facc15]/25";
  if (stage === 2) return "bg-[#f59e0b]/30";
  if (stage === 3) return "bg-[#fb7185]/35";
  return "bg-[#ec4899]/35";
}

function stageBadge(stage: number) {
  if (stage < 2) return null;
  return stageToMultiplier(stage);
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
  const [reelDurations, setReelDurations] = useState<number[]>(() => Array(COLS).fill(90));
  const [spinKey, setSpinKey] = useState(0);

  const [multiplierGrid, setMultiplierGrid] = useState<number[][]>(() => emptyMultiplierGrid());
  const [highlighted, setHighlighted] = useState<Set<string>>(new Set());
  const [freeSpinsLeft, setFreeSpinsLeft] = useState(0);
  const [isAutospinning, setIsAutospinning] = useState(false);
  const [isExecutingSpin, setIsExecutingSpin] = useState(false);
  const [pendingRoundPayout, setPendingRoundPayout] = useState(0);
  const [lastWin, setLastWin] = useState(0);
  const [lastCascadeWin, setLastCascadeWin] = useState(0);
  const [lastDropIndices, setLastDropIndices] = useState<Set<string>>(new Set());

  const pendingRoundStakeRef = React.useRef(0);
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

  const settleRound = React.useCallback((stake: number, payout: number) => {
    const p = normalizeMoney(payout);
    const s = normalizeMoney(stake);
    const isWinRound = p >= s;

    if (p > 0) {
      addToBalance(p);
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
    setLastCascadeWin(0);
    setLastDropIndices(new Set());
    
    const isFreeSpin = phase === "free";
    if (!isFreeSpin) {
      setPhase("spinning");
      setMultiplierGrid(emptyMultiplierGrid());
    }

    setSpinKey((v) => v + 1);
    playAudio(audioRef.current.spin);
    
    // Prepare next grid content
    let workingGrid = buildGrid(anteBet);
    
    // Start reel animations
    const startFrames = gridToReelFrames(grid).map((col) => {
      // Prepend a random symbol for the "roll in" visual
      const fresh = randomSymbol(anteBet);
      return [fresh, ...col];
    });
    setReelFrames(startFrames);
    setReelDurations(Array(COLS).fill(90));
    setReelsSpinning(Array(COLS).fill(true));
    
    let stoppedCount = 0;
    const baseFrameRate = 90;
    const stopTimes = [300, 450, 600, 750, 900, 1050, 1200];

    const animateReels = new Promise<void>((resolve) => {
      for (let col = 0; col < COLS; col++) {
        if (intervalRefs.current[col]) clearInterval(intervalRefs.current[col]!);
        
        let frameCount = 0;
        let isStopping = false;
        let stopProgress = 0;
        
        intervalRefs.current[col] = setInterval(() => {
          frameCount += baseFrameRate;
          
          if (isStopping) {
             // Stop phase: lock in symbols one by one from top
             if (stopProgress < ROWS) {
                const targetSymbol = workingGrid[ROWS - 1 - stopProgress][col];
                setReelFrames((prev) => {
                  const next = [...prev];
                  const currentReel = [...next[col]];
                  // Shift down and insert target
                  // We use an 8th symbol for smooth overflow if needed, but here 7 is fine for the stop snap
                  next[col] = [
                    targetSymbol,
                    ...currentReel.slice(0, 7)
                  ];
                  return next;
                });
                stopProgress++;
             } else {
                if (intervalRefs.current[col]) {
                  clearInterval(intervalRefs.current[col]!);
                  intervalRefs.current[col] = null;
                }

                // Snap this column to the final grid state in the main view
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
                  // Small delay after all reels stop before evaluating
                  setTimeout(resolve, 100);
                }
             }
          } else {
             // Spinning phase: churning symbols
             setReelFrames((prev) => {
                const next = [...prev];
                const currentReel = [...next[col]];
                const fresh = randomSymbol(anteBet);
                // Keep 8 symbols for smooth animation during translation
                next[col] = [
                   fresh,
                   ...currentReel.slice(0, 7)
                ];
                return next;
             });
          }

          if (frameCount >= stopTimes[col] && !isStopping) {
             isStopping = true;
          }
        }, baseFrameRate);
      }
    });

    // Wait for reels to spin and stop
    await animateReels;

    let workingMultipliers = isFreeSpin
      ? multiplierGrid.map((row) => [...row])
      : emptyMultiplierGrid();

    setGrid(workingGrid);
    setHighlighted(new Set());

    let triggeredScatter = false;
    let spinWin = 0;

    // Tumble Loop
    while (true) {
      if (countScatters(workingGrid) >= 3) triggeredScatter = true;

      const clusters = findClusters(workingGrid);
      if (clusters.length === 0) break;

      const remove = new Set<string>();
      let cascadeWin = 0;

      for (const cluster of clusters) {
        const [firstRow, firstCol] = cluster[0];
        const symbol = workingGrid[firstRow][firstCol] as CandySymbol;
        const baseMulti = clusterBaseMultiplier(symbol, cluster.length);
        const clusterBaseWin = normalizeMoney(spinCost * baseMulti);

        let totalMultiplier = 0;
        for (const [row, col] of cluster) {
          const val = stageToMultiplier(workingMultipliers[row][col]);
          if (val > 1) totalMultiplier += val;
          remove.add(toPosKey(row, col));
        }

        const effectiveMultiplier = totalMultiplier > 0 ? totalMultiplier : 1;
        cascadeWin += normalizeMoney(clusterBaseWin * effectiveMultiplier);
      }

      for (const pos of remove) {
        const [rowStr, colStr] = pos.split("-");
        const row = Number(rowStr);
        const col = Number(colStr);
        workingMultipliers[row][col] += 1;
      }

      spinWin = normalizeMoney(spinWin + cascadeWin);
      setLastCascadeWin(cascadeWin);
      
      // Highlight/Pop animation step
      setHighlighted(new Set(remove));
      setMultiplierGrid(workingMultipliers.map((row) => [...row]));

      await sleep(360);

      const tumbleResult = tumble(workingGrid, remove, anteBet);
      workingGrid = tumbleResult.nextGrid;
      
      // Mark dropping indices for animation
      setLastDropIndices(tumbleResult.droppedIndices);
      setGrid(workingGrid.map((row) => [...row]));
      setHighlighted(new Set());
      
      await sleep(700); // Wait for slower drop animation
      setLastDropIndices(new Set()); // Clear drop markers
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
        settleRound(pendingRoundStakeRef.current, updatedRoundPayout);
      } else {
        setPhase("free");
      }
    } else {
      if (triggeredScatter) {
        const scatters = countScatters(workingGrid);
        const initialFS = 5 + (scatters - 3); // Base 3=5 logic, but actually user said 15 for start?
        // Wait, user previously agreed 15 for the START of free spins (3 scatters).
        // Let's re-read the request: "3 oder mehr an regenbögen ... für 3 bekommt man +5 und für jeden weiteren +1"
        // This is specifically for RETRIGGER.
        
        setPhase("free");
        setFreeSpinsLeft(FREE_SPINS_AWARD); // We keep the 15 award for initial trigger as per earlier instructions
      } else {
        setPhase("idle");
        settleRound(pendingRoundStakeRef.current, updatedRoundPayout);
      }
    }

    isExecutingSpinRef.current = false;
    setIsExecutingSpin(false);
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
    } else {
      pendingRoundStakeRef.current = 10;
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

  const displayTotalMultiplier = useMemo(() => {
    return multiplierGrid.reduce((acc, row) => {
      return acc + row.reduce((rowAcc, stage) => rowAcc + Math.max(1, stageToMultiplier(stage)) - 1, 0);
    }, 0);
  }, [multiplierGrid]);

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
            {isAutospinning ? "STOP" : isExecutingSpin ? "Playing" : "Bet"}
          </button>

          {(phase === "free" || phase === "spinning") && (
            <div className="bg-[#0f212e] p-4 rounded border border-[#2f4553] text-center">
              <div className="text-[#b1bad3] text-sm">Current Round Win</div>
              <div className="text-2xl font-bold text-[#00e701]">${pendingRoundPayout.toFixed(2)}</div>
            </div>
          )}

          {phase === "free" && (
            <div className="p-3 bg-[#213743] border border-[#7c3aed]/60 rounded-md text-center">
              <div className="text-xs text-[#b1bad3] uppercase">Free Spins Left</div>
              <div className="text-xl font-black text-[#f472b6]">{freeSpinsLeft}</div>
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
          <div className="rounded-2xl overflow-hidden p-3 sm:p-4 relative bg-[#1b1033]">
            <div className="absolute inset-0 pointer-events-none">
              <div className="absolute inset-0 sugar-bg" />
            </div>

            <div className="relative z-10 p-2 sm:p-3 rounded-xl bg-[#130b25]/70">
              <div className="grid grid-cols-7 gap-1 sm:gap-1.5 p-1 sm:p-2 bg-[#130b25]/70 rounded-xl mx-auto w-full max-w-[500px]">
                {/* We render columns primarily now, or we can just iterate grid row-major but use CSS for spin */}
                {Array.from({ length: COLS }, (_, col) => (
                   <div key={`col-${col}`} className="flex flex-col gap-1 sm:gap-1.5 relative overflow-hidden">
                      {/* Fields (Multipliers and Backgrounds) - Always visible */}
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
                                ${isHit ? "scale-110 z-10" : ""}
                              `}
                            >
                              {badge && (
                                <div className="absolute inset-0 flex items-center justify-center pointer-events-none select-none z-0">
                                  <span className="text-md sm:text-lg lg:text-xl font-black text-white/75">
                                    x{badge}
                                  </span>
                                </div>
                              )}
                              
                              {/* Show static symbol only if not spinning */}
                              {!isSpinning && (
                                <span className={`relative z-10 text-3xl sm:text-4xl lg:text-5xl select-none leading-none transform-gpu 
                                  ${isHit ? "animate-pop" : ""}
                                  ${isDropping ? "animate-drop-in" : ""}
                                `}>
                                  {symbol ?? ""}
                                </span>
                              )}
                            </div>
                          );
                      })}

                      {/* Spinning symbols overlay */}
                      {reelsSpinning[col] && (
                        <div className={`flex flex-col gap-1 sm:gap-1.5 absolute top-0 left-0 w-full animate-reel-spin pointer-events-none z-20`} 
                             style={{ ['--dur' as any]: `${reelDurations[col]}ms` }}>
                           {reelFrames[col].map((symbol, idx) => (
                              <div key={`spin-${col}-${idx}-${spinKey}`} 
                                   className="aspect-square w-full flex items-center justify-center">
                                 <span className="text-3xl sm:text-4xl lg:text-5xl select-none leading-none">{symbol}</span>
                              </div>
                           ))}
                        </div>
                      )}
                   </div>
                ))}
              </div>
            </div>
          </div>

          <GameRecordsPanel gameId="sugarrush" />
        </div>
      </div>

      <style jsx global>{`
        .sugar-bg {
          background:
            radial-gradient(120% 80% at 10% 10%, rgba(236, 72, 153, 0.22), transparent 45%),
            radial-gradient(120% 80% at 90% 15%, rgba(34, 211, 238, 0.2), transparent 42%),
            radial-gradient(120% 80% at 50% 100%, rgba(192, 132, 252, 0.2), transparent 50%),
            linear-gradient(180deg, #2a1450 0%, #1c0e34 55%, #140a26 100%);
        }
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
      `}</style>
    </>
  );
}
