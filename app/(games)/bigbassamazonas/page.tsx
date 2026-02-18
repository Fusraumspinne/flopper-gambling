"use client";

import React, { useMemo, useState } from "react";
import { useWallet } from "@/components/WalletProvider";
import { useSoundVolume } from "@/components/SoundVolumeProvider";
import GameRecordsPanel from "@/components/GameRecordsPanel";
import { PlayArrow } from "@mui/icons-material";

type GamePhase = "idle" | "spinning" | "pick" | "prefree" | "free";
type SymbolId =
  | "10"
  | "J"
  | "Q"
  | "K"
  | "A"
  | "rod"
  | "bag"
  | "toucan"
  | "lure"
  | "fish"
  | "scatter"
  | "fisher";

type Cell = {
  symbol: SymbolId;
  fishValue?: number;
  highlight?: boolean;
};

type PickModifiers = {
  extraFreeSpins: number;
  guaranteedFish: number;
  collectedFishermen: number;
  removeLowestFish: boolean;
};

type PickState = {
  revealed: boolean[];
  tokens: ("boat" | "extra" | "fish" | "fisher" | "clean")[];
  boatsFound: number;
  boatsTarget: number;
  modifiers: PickModifiers;
};

type PreFreeToken = "fs1" | "fs2" | "fs3" | "fs4" | "fisher" | "shoe";

type PreFreeState = {
  revealed: boolean[];
  tokens: PreFreeToken[];
  extraSpins: number;
  extraFishers: number;
  done: boolean;
};

const ROWS = 3;
const REELS = 5;
const PAYLINES: number[][] = [
  [0, 0, 0, 0, 0],
  [1, 1, 1, 1, 1],
  [2, 2, 2, 2, 2],
  [0, 1, 2, 1, 0],
  [2, 1, 0, 1, 2],
  [0, 0, 1, 0, 0],
  [2, 2, 1, 2, 2],
  [1, 0, 0, 0, 1],
  [1, 2, 2, 2, 1],
  [0, 1, 1, 1, 0],
];

const HIGH_SYMBOLS: SymbolId[] = ["rod", "bag", "toucan", "lure"];
const BASE_SYMBOL_WEIGHTS: Record<SymbolId, number> = {
  "10": 13,
  J: 13,
  Q: 12,
  K: 11,
  A: 10,
  rod: 4,
  bag: 3.8,
  toucan: 3.5,
  lure: 3,
  fish: 3,      
  scatter: 3,   
  fisher: 0,
};
const FREE_SYMBOL_WEIGHTS: Record<SymbolId, number> = {
  "10": 12,
  J: 12,
  Q: 11,
  K: 10,
  A: 9,
  rod: 4,
  bag: 3.8,
  toucan: 3.5,
  lure: 3,
  fish: 5,     
  scatter: 0,
  fisher: 1.25,   
};
const FISH_VALUES = [0.2, 0.5, 1, 2, 5, 10, 20, 50, 100, 250, 500, 1000];
const FISH_WEIGHTS = [26,  21, 17, 14, 10, 7, 3.5, 0.35, 0.09, 0.03, 0.008, 0.002];
const BASE_COLLECT_MULTIS = [1, 2, 3, 5, 8, 10, 15, 20, 30, 40, 50];
const FS_MULTIPLIERS = [1, 2, 3, 10, 20, 30, 40, 50];
const BOAT_WAKE_CHANCE_BASE = 0.15;
const BOAT_COLLECT_MULTI_WEIGHTS = [60, 25, 7, 3, 2, 1.5, 1, 0.7, 0.4, 0.2, 0.1];
const PREFREE_START_SPINS = 10;
const PREFREE_TOKEN_POOL: PreFreeToken[] = [
  "fs1",
  "fs2",
  "fs3",
  "fisher",
  "fisher",
  "fisher",
  "shoe",
  "shoe",
];
const PAYTABLE: Partial<Record<SymbolId, [number, number, number]>> = {
  "10": [0.2, 0.4, 1],
  J: [0.2, 0.4, 1],
  Q: [0.3, 0.6, 1.5],
  K: [0.4, 0.8, 2],
  A: [0.5, 1, 2.5],
  lure: [0.5, 1.5, 5],
  toucan: [0.8, 2.5, 7.5],
  bag: [1, 3, 10],
  rod: [1.5, 5, 15],
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

function pickWeighted<T extends string | number>(entries: [T, number][]) {
  const total = entries.reduce((acc, [, w]) => acc + Math.max(0, w), 0);
  let roll = Math.random() * total;
  for (const [item, weight] of entries) {
    roll -= Math.max(0, weight);
    if (roll <= 0) return item;
  }
  return entries[entries.length - 1][0];
}

function randomSymbol(isFreeSpin: boolean, anteBet: boolean): SymbolId {
  const table = isFreeSpin
    ? FREE_SYMBOL_WEIGHTS
    : {
        ...BASE_SYMBOL_WEIGHTS,
        scatter: anteBet ? BASE_SYMBOL_WEIGHTS.scatter * 1.45 : BASE_SYMBOL_WEIGHTS.scatter,
      };

  return pickWeighted<SymbolId>(Object.entries(table) as [SymbolId, number][]);
}

function randomNonScatterBaseSymbol(removeLowestFish: boolean): Cell {
  const symbol = pickWeighted<SymbolId>([
    ["10", BASE_SYMBOL_WEIGHTS["10"]],
    ["J", BASE_SYMBOL_WEIGHTS.J],
    ["Q", BASE_SYMBOL_WEIGHTS.Q],
    ["K", BASE_SYMBOL_WEIGHTS.K],
    ["A", BASE_SYMBOL_WEIGHTS.A],
    ["rod", BASE_SYMBOL_WEIGHTS.rod],
    ["bag", BASE_SYMBOL_WEIGHTS.bag],
    ["toucan", BASE_SYMBOL_WEIGHTS.toucan],
    ["lure", BASE_SYMBOL_WEIGHTS.lure],
    ["fish", BASE_SYMBOL_WEIGHTS.fish],
  ]);
  if (symbol === "fish") {
    return { symbol, fishValue: fishValue(removeLowestFish) };
  }
  return { symbol };
}

function fishValue(removeLowest: boolean) {
  const values = removeLowest ? FISH_VALUES.slice(2) : FISH_VALUES;
  const weights = removeLowest ? FISH_WEIGHTS.slice(2) : FISH_WEIGHTS;
  const picked = pickWeighted<number>(values.map((v, idx) => [v, weights[idx]]));
  return picked;
}

function buildRandomGrid(isFreeSpin: boolean, anteBet: boolean, removeLowestFish: boolean): Cell[][] {
  const grid: Cell[][] = Array.from({ length: ROWS }, () =>
    Array.from({ length: REELS }, () => ({ symbol: "10" as SymbolId }))
  );

  for (let row = 0; row < ROWS; row++) {
    for (let reel = 0; reel < REELS; reel++) {
      const symbol = randomSymbol(isFreeSpin, anteBet);
      grid[row][reel] =
        symbol === "fish"
          ? { symbol, fishValue: fishValue(removeLowestFish) }
          : { symbol };
    }
  }

  return grid;
}

function cellForSpin(isFreeSpin: boolean, anteBet: boolean, removeLowestFish: boolean): Cell {
  const symbol = randomSymbol(isFreeSpin, anteBet);
  return symbol === "fish"
    ? { symbol, fishValue: fishValue(removeLowestFish) }
    : { symbol };
}

function gridToReelFrames(sourceGrid: Cell[][]) {
  return Array.from({ length: REELS }, (_, reel) =>
    Array.from({ length: ROWS }, (_, row) => ({ ...sourceGrid[row][reel], highlight: false }))
  );
}

function guaranteeFish(grid: Cell[][], guaranteedFish: number, removeLowestFish: boolean) {
  const allPos: [number, number][] = [];
  for (let row = 0; row < ROWS; row++) {
    for (let reel = 0; reel < REELS; reel++) {
      if (grid[row][reel].symbol !== "scatter" && grid[row][reel].symbol !== "fisher") {
        allPos.push([row, reel]);
      }
    }
  }

  for (let i = allPos.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [allPos[i], allPos[j]] = [allPos[j], allPos[i]];
  }

  for (let i = 0; i < Math.min(guaranteedFish, allPos.length); i++) {
    const [row, reel] = allPos[i];
    grid[row][reel] = { symbol: "fish", fishValue: fishValue(removeLowestFish) };
  }
}

function countSymbol(grid: Cell[][], symbol: SymbolId) {
  let count = 0;
  for (const row of grid) {
    for (const cell of row) {
      if (cell.symbol === symbol) count++;
    }
  }
  return count;
}

function collectFishValues(grid: Cell[][]) {
  let total = 0;
  const positions: [number, number][] = [];
  for (let row = 0; row < ROWS; row++) {
    for (let reel = 0; reel < REELS; reel++) {
      const cell = grid[row][reel];
      if (cell.symbol === "fish" && typeof cell.fishValue === "number") {
        total += cell.fishValue;
        positions.push([row, reel]);
      }
    }
  }
  return { total, positions };
}

function evaluateLines(grid: Cell[][], totalBet: number, fisherWild: boolean) {
  const lineBet = totalBet / PAYLINES.length;
  let totalWin = 0;
  const highlight = new Set<string>();

  PAYLINES.forEach((line, lineIndex) => {
    const symbols: SymbolId[] = line.map((row, reel) => grid[row][reel].symbol);
    let baseSymbol: SymbolId | null = null;

    for (let reel = 0; reel < REELS; reel++) {
      const current = symbols[reel];
      if (current === "scatter" || current === "fish") {
        if (reel === 0) {
          baseSymbol = null;
        }
        break;
      }
      if (current === "fisher" && fisherWild) {
        continue;
      }
      baseSymbol = current;
      break;
    }

    if (!baseSymbol) {
      if (!fisherWild || symbols[0] !== "fisher") return;
      baseSymbol = HIGH_SYMBOLS[0];
    }

    let streak = 0;
    for (let reel = 0; reel < REELS; reel++) {
      const current = symbols[reel];
      const isWild = fisherWild && current === "fisher";
      if (current === "scatter" || current === "fish") break;
      if (current === baseSymbol || isWild) {
        streak += 1;
        continue;
      }
      break;
    }

    if (streak < 3) return;
    const payoutRow = PAYTABLE[baseSymbol];
    if (!payoutRow) return;
    const multi = payoutRow[streak - 3] ?? 0;
    if (multi <= 0) return;

    totalWin += lineBet * multi;
    for (let reel = 0; reel < streak; reel++) {
      highlight.add(`${line[reel]}-${reel}`);
    }
    highlight.add(`line-${lineIndex}`);
  });

  return { totalWin: normalizeMoney(totalWin), highlight };
}

function buildPickTokens(startBoats: number, boatsTarget: number) {
  const missingBoats = Math.max(0, boatsTarget - startBoats);
  const tokens: ("boat" | "extra" | "fish" | "fisher" | "clean")[] = [
    ...new Array(missingBoats).fill("boat"),
    "extra",
    "extra",
    "extra",
    "fish",
    "fish",
    "fisher",
    "fisher",
    "clean",
    "clean",
  ];
  for (let i = tokens.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [tokens[i], tokens[j]] = [tokens[j], tokens[i]];
  }
  return tokens;
}

function applyBaseScatterAssist(gridBefore: Cell[][], removeLowestFish: boolean) {
  const g = gridBefore.map((row) => row.map((cell) => ({ ...cell, highlight: false })));
  const fired: string[] = [];
  return { grid: g, fired };
}

function shouldTriggerBaseCollect(fishCount: number, anteBet: boolean) {
  return false;
}

function applyTwoScatterDownNudge(previousGrid: Cell[][], nextGrid: Cell[][], removeLowestFish: boolean) {
  const scatterPositions: [number, number][] = [];
  for (let row = 0; row < ROWS; row++) {
    for (let reel = 0; reel < REELS; reel++) {
      if (previousGrid[row][reel].symbol === "scatter") {
        scatterPositions.push([row, reel]);
      }
    }
  }

  if (scatterPositions.length !== 2) {
    return { grid: nextGrid, triggered: false };
  }

  const canMoveAll = scatterPositions.every(([row, reel]) => {
    if (row >= ROWS - 1) return false;
    return previousGrid[row + 1][reel].symbol !== "scatter";
  });

  if (!canMoveAll) {
    return { grid: nextGrid, triggered: false };
  }

  const nudgedGrid = nextGrid.map((row) => row.map((cell) => ({ ...cell, highlight: false })));

  for (const [row, reel] of scatterPositions) {
    nudgedGrid[row + 1][reel] = { symbol: "scatter", highlight: false };
    nudgedGrid[row][reel] = { ...randomNonScatterBaseSymbol(removeLowestFish), highlight: false };
  }

  return { grid: nudgedGrid, triggered: true };
}

function renderSymbol(cell: Cell, spinCost?: number) {
  if (cell.symbol === "fish") {
    const raw = (typeof cell.fishValue === "number" ? cell.fishValue : 0) * (spinCost ?? 0);
    const money = normalizeMoney(raw);
    const display = raw > 0 && money === 0 ? "<$0.01" : `$${formatMoney(money)}`;
    return (
      <div className="flex flex-col items-center">
        <span className="text-3xl cursor-default">🐟</span>
        <span className="text-[11px] text-[#ffd166] font-black tracking-tighter px-1.5 rounded-full -mt-1">
          {display}
        </span>
      </div>
    );
  }

  const map: Record<SymbolId, { char: string; color: string; bg?: string }> = {
    "10": { char: "10", color: "text-[#b1bad3]" },
    J: { char: "J", color: "text-[#55b0ff]" },
    Q: { char: "Q", color: "text-[#ff5588]" },
    K: { char: "K", color: "text-[#ffb055]" },
    A: { char: "A", color: "text-[#ff5555]" },
    rod: { char: "🎣", color: "text-white" },
    bag: { char: "🎒", color: "text-white" },
    toucan: { char: "🦜", color: "text-white" },
    lure: { char: "🪝", color: "text-white" },
    scatter: { char: "🐠", color: "text-white" },
    fisher: { char: "🤠", color: "text-white" },
    fish: { char: "🐟", color: "text-white" },
  };

  const data = map[cell.symbol];
  const isEmoji = ["🎣", "🎒", "🦜", "🪝", "🐠", "🤠", "🐟"].includes(data.char);

  return (
    <div className={`flex items-center justify-center select-none ${isEmoji ? "text-4xl" : "text-3xl"} font-black ${data.color} ${data.bg ? "rounded-full p-2" : ""}`}>
      {data.char}
    </div>
  );
}

export default function BigBassAmazonasPage() {
  const { balance, subtractFromBalance, addToBalance, finalizePendingLoss } = useWallet();
  const { volume } = useSoundVolume();

  const [phase, setPhase] = useState<GamePhase>("idle");
  const [betInput, setBetInput] = useState("100");
  const [betAmount, setBetAmount] = useState(100);
  const [anteBet, setAnteBet] = useState(false);
  const [grid, setGrid] = useState<Cell[][]>(() => buildRandomGrid(false, false, false));
  const [reelFrames, setReelFrames] = useState<Cell[][]>(() => gridToReelFrames(buildRandomGrid(false, false, false)).map(f => [{ symbol: '10' as SymbolId }, ...f]));
  const [spinKey, setSpinKey] = useState(0);
  const [reelsSpinning, setReelsSpinning] = useState([false, false, false, false, false]);
  const [reelDurations, setReelDurations] = useState<number[]>(() => Array(REELS).fill(90));
  const [freeSpinsLeft, setFreeSpinsLeft] = useState(0);
  const [fisherCollected, setFisherCollected] = useState(0);
  const [retriggers, setRetriggers] = useState(0);
  const [currentFsMultiplier, setCurrentFsMultiplier] = useState(1);
  const [spinDisplayMultiplier, setSpinDisplayMultiplier] = useState(1);
  const [isWaterfallActive, setIsWaterfallActive] = useState(false);
  const [pickState, setPickState] = useState<PickState | null>(null);
  const [preFreeState, setPreFreeState] = useState<PreFreeState | null>(null);
  const [mods, setMods] = useState<PickModifiers>({
    extraFreeSpins: 0,
    guaranteedFish: 0,
    collectedFishermen: 0,
    removeLowestFish: false,
  });
  const [isAutospinning, setIsAutospinning] = useState(false);
  const [pendingRoundPayout, setPendingRoundPayout] = useState(0);
  const [lastWin, setLastWin] = useState(0);
  const pendingRoundStakeRef = React.useRef(0);
  const pendingMultiDenominatorRef = React.useRef(0);
  const pendingRoundPayoutRef = React.useRef(0);
  const [boatAwake, setBoatAwake] = useState(false);
  const [boatNetCast, setBoatNetCast] = useState(false);
  const [boatChestOpen, setBoatChestOpen] = useState(false);
  const [boatChestMulti, setBoatChestMulti] = useState<number | null>(null);

  
  const phaseRef = React.useRef<GamePhase>(phase);
  const isExecutingSpinRef = React.useRef(false);
  const [isExecutingSpin, setIsExecutingSpin] = useState(false);
  const intervalRefs = React.useRef<Array<ReturnType<typeof setInterval> | null>>(Array(REELS).fill(null));
  const timeoutRefs = React.useRef<Array<ReturnType<typeof setTimeout> | null>>(Array(REELS).fill(null));
  const boatSleepTimeoutRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  

  React.useEffect(() => {
    phaseRef.current = phase;
  }, [phase]);

  React.useEffect(() => {
    return () => {
      intervalRefs.current.forEach((timer) => {
        if (timer) clearInterval(timer);
      });
      timeoutRefs.current.forEach((timer) => {
        if (timer) clearTimeout(timer);
      });
      if (boatSleepTimeoutRef.current) clearTimeout(boatSleepTimeoutRef.current);
    };
  }, []);

  const spinCost = useMemo(() => normalizeMoney(betAmount * (anteBet ? 1.5 : 1)), [betAmount, anteBet]);
  const buyBonusCost = useMemo(() => normalizeMoney(betAmount * 100), [betAmount]);
  const isHundredDollarFreeSpin = !anteBet && normalizeMoney(betAmount) === 100;

  React.useEffect(() => {
    if (isAutospinning && !isExecutingSpin) {
      if (phase === "idle") {
        if (!isHundredDollarFreeSpin && balance < spinCost) {
          setIsAutospinning(false);
          return;
        }
        const timer = setTimeout(() => {
          if (isAutospinning && phase === "idle" && !isExecutingSpin) {
            startPaidSpin();
          }
        }, 350);
        return () => clearTimeout(timer);
      } else if (phase === "free") {
        if (freeSpinsLeft > 0) {
          const timer = setTimeout(() => {
            if (isAutospinning && phase === "free" && !isExecutingSpin) {
              spinFree();
            }
          }, 350);
          return () => clearTimeout(timer);
        } else {
          setIsAutospinning(false);
        }
      }
    }
    if (isAutospinning && (phase === "prefree" || phase === "pick")) {
      setIsAutospinning(false);
    }
  }, [isAutospinning, phase, isExecutingSpin, balance, spinCost, isHundredDollarFreeSpin, freeSpinsLeft]);

  const audioRef = React.useRef<{
    bet: HTMLAudioElement | null;
    spin: HTMLAudioElement | null;
    win: HTMLAudioElement | null;
    lose: HTMLAudioElement | null;
  }>({ bet: null, spin: null, win: null, lose: null });

  const canPaidSpin = phase === "idle";

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
    } catch {
    }
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

  const settleRound = (stake: number, payout: number, multiDenominator: number) => {
    const p = normalizeMoney(payout);
    const s = normalizeMoney(stake);
    const isWinRound = p >= s;

    if (p > 0) {
      addToBalance(p, multiDenominator);
      setLastWin(p);
    } else {
      setLastWin(0);
    }

    if (s <= 0) {
      if (p > 0) {
        playAudio(audioRef.current.win);
      }
    } else if (isWinRound) {
      playAudio(audioRef.current.win);
    } else {
      finalizePendingLoss();
      playAudio(audioRef.current.lose);
    }

    pendingRoundStakeRef.current = 0;
    pendingRoundPayoutRef.current = 0;
    setPendingRoundPayout(0);
  };

  const applyFreeSpinEvents = (gridBefore: Cell[][], currentMods: PickModifiers) => {
    const finalGrid = gridBefore.map((row) => row.map((cell) => ({ ...cell, highlight: false })));
    const fisherCount = countSymbol(finalGrid, "fisher");
    const fishCount = countSymbol(finalGrid, "fish");
    let waterfallTriggered = false;

    if (fisherCount > 0 && fishCount === 0) {
      waterfallTriggered = true;
      const spots: [number, number][] = [];
      for (let row = 0; row < ROWS; row++) {
        for (let reel = 0; reel < REELS; reel++) {
          if (finalGrid[row][reel].symbol === "fisher") {
            finalGrid[row][reel] = { ...finalGrid[row][reel], highlight: true };
          } else {
            spots.push([row, reel]);
          }
        }
      }

      const fishToAdd = Math.floor(Math.random() * 5) + 2;
      for (let i = 0; i < Math.min(fishToAdd, spots.length); i++) {
        const idx = Math.floor(Math.random() * spots.length);
        const [row, reel] = spots.splice(idx, 1)[0];
        finalGrid[row][reel] = { 
          symbol: "fish", 
          fishValue: fishValue(currentMods.removeLowestFish), 
          highlight: true 
        };
      }

      for (let row = 0; row < ROWS; row++) {
        for (let reel = 0; reel < REELS; reel++) {
          if (finalGrid[row][reel].symbol === "fisher") {
            finalGrid[row][reel] = { ...finalGrid[row][reel], highlight: true };
          }
        }
      }
    }

    return { finalGrid, waterfallTriggered };
  };

  const executeSpin = (onFinish?: (payout: number) => void) => {
    if (isExecutingSpinRef.current) return;
    isExecutingSpinRef.current = true;
    setIsExecutingSpin(true);
    setBoatAwake(false);
    setBoatNetCast(false);
    setBoatChestOpen(false);
    setBoatChestMulti(null);
    let lineEval: { totalWin: number; highlight: Set<string> } = { totalWin: 0, highlight: new Set() };
    let updatedRoundPayout = 0;

    const isFreeSpin = phase === "free" && freeSpinsLeft > 0;
    if (isFreeSpin) {
      setFreeSpinsLeft((s) => Math.max(0, s - 1));
    }
    setSpinDisplayMultiplier(isFreeSpin ? currentFsMultiplier : 1);
    let gainedExtraSpinsThisCall = 0;
    setPhase(isFreeSpin ? "free" : "spinning");
    setSpinKey((v) => v + 1);
    playAudio(audioRef.current.spin);

    let nextGrid = buildRandomGrid(isFreeSpin, anteBet, mods.removeLowestFish);
    if (isFreeSpin && mods.guaranteedFish > 0) {
      guaranteeFish(nextGrid, mods.guaranteedFish, mods.removeLowestFish);
    }

    if (!isFreeSpin) {
      const hadExactlyTwoScatters = countSymbol(grid, "scatter") === 2;
      if (hadExactlyTwoScatters) {
        const nudgeResult = applyTwoScatterDownNudge(grid, nextGrid, mods.removeLowestFish);
        nextGrid = nudgeResult.grid;
      } else {
        const scatterAssist = applyBaseScatterAssist(nextGrid, mods.removeLowestFish);
        nextGrid = scatterAssist.grid;
      }
    }

    let waterfallInfo = { triggered: false, finalGrid: [] as Cell[][] };
    if (isFreeSpin) {
      const randomEvents = applyFreeSpinEvents(nextGrid, mods);
      if (randomEvents.waterfallTriggered) {
        waterfallInfo = { triggered: true, finalGrid: randomEvents.finalGrid };
      } else {
        nextGrid = randomEvents.finalGrid;
      }
    }

    const startFrames = gridToReelFrames(grid).map((reelCol) => {
      const fresh = cellForSpin(isFreeSpin, anteBet, mods.removeLowestFish);
      return [fresh, ...reelCol.map((cell) => ({ ...cell, highlight: false }))];
    });
    setReelFrames(startFrames);
    setReelDurations(Array(REELS).fill(90));
    setReelsSpinning([true, true, true, true, true]);

    const animateReels = (onReelsDone: () => void) => {      
      const spinningFrames = Array.from({ length: REELS }, () => 
         Array.from({ length: ROWS * 2 }, () => cellForSpin(phase === "free", anteBet, mods.removeLowestFish))
      );
      
      setReelFrames(spinningFrames);
      setReelsSpinning(Array(REELS).fill(true));
      
      let stoppedCount = 0;
      const stopTimes = [400, 650, 900, 1150, 1400];

      for (let reel = 0; reel < REELS; reel++) {
        timeoutRefs.current[reel] = setTimeout(() => {
             setGrid((prev) => {
                const next = prev.map(r => [...r]);
                for(let r=0; r<ROWS; r++) {
                   next[r][reel] = { ...nextGrid[r][reel], highlight: false };
                }
                return next;
             });

             setReelsSpinning((prev) => {
                const next = [...prev];
                next[reel] = false;
                return next;
             });

             stoppedCount++;
             if (stoppedCount === REELS) {
                setTimeout(onReelsDone, 200);
             }
        }, stopTimes[reel]);
      }
    };

    animateReels(() => {
      const handleAfterReels = () => {
        const scatter = countSymbol(nextGrid, "scatter");
        const fishers = countSymbol(nextGrid, "fisher");
        const fishPack = collectFishValues(nextGrid);
        lineEval = evaluateLines(nextGrid, spinCost, isFreeSpin);

        const hasFishSymbol = nextGrid.some((r) => r.some((c) => c.symbol === "fish"));
        const isFisherCollect = fishers > 0 && (fishPack.total > 0 || hasFishSymbol);
        const isBoatCollect = !isFreeSpin && !isFisherCollect && fishPack.total > 0 && (
          shouldTriggerBaseCollect(fishPack.positions.length, anteBet) || Math.random() < BOAT_WAKE_CHANCE_BASE
        );
        
        const isAnyFishCollect = isFisherCollect || isBoatCollect;

        const highlighted = nextGrid.map((row, rowIdx) =>
          row.map((cell, reelIdx) => {
            let isH = cell.highlight || lineEval.highlight.has(`${rowIdx}-${reelIdx}`);
            if (scatter >= 3 && cell.symbol === "scatter") isH = true;
            if (isAnyFishCollect && (cell.symbol === "fisher" || cell.symbol === "fish")) isH = true;
            return { ...cell, highlight: isH };
          })
        );

        setGrid(highlighted);

        let fishWin = 0;
        let payoutForThisSpin = lineEval.totalWin;

        const finalizeStep = () => {
          if (isFreeSpin) {
            const newCollected = fisherCollected + fishers;
            setFisherCollected(newCollected);
            const prevRetriggers = retriggers;
            const nowRetriggers = Math.floor(newCollected / 4);

            if (nowRetriggers > prevRetriggers) {
              const maxIndex = FS_MULTIPLIERS.length - 1;
              const effectiveNow = Math.min(nowRetriggers, maxIndex);
              const effectivePrev = Math.min(prevRetriggers, maxIndex);
              const gained = Math.max(0, effectiveNow - effectivePrev);
              if (gained > 0) {
                const extraSpins = gained * 10;
                gainedExtraSpinsThisCall = extraSpins;
              }
              const cappedRetriggers = Math.min(nowRetriggers, maxIndex);
              setRetriggers(cappedRetriggers);
              const fsMulti = FS_MULTIPLIERS[cappedRetriggers];
              setCurrentFsMultiplier(fsMulti);
            }
          }

          updatedRoundPayout = normalizeMoney(pendingRoundPayoutRef.current + payoutForThisSpin);
          pendingRoundPayoutRef.current = updatedRoundPayout;
          setPendingRoundPayout(updatedRoundPayout);

          const finishExecution = () => {
            isExecutingSpinRef.current = false;
            setIsExecutingSpin(false);
            if (onFinish) onFinish(updatedRoundPayout);
          };

          if (!isFreeSpin && scatter >= 3) {
            let startBoats = 0;
            if (scatter === 4) startBoats = 1;
            if (scatter >= 5) startBoats = 2;

            if (startBoats > 0) {
              setPhase("pick");
              setPickState({
                revealed: new Array(12).fill(false),
                tokens: buildPickTokens(startBoats, 3),
                boatsFound: startBoats,
                boatsTarget: 3,
                modifiers: {
                  extraFreeSpins: 0,
                  guaranteedFish: 0,
                  collectedFishermen: 0,
                  removeLowestFish: false,
                },
              });
              finishExecution();
              return;
            }

            setPhase("prefree");
            setPreFreeState({
              revealed: new Array(PREFREE_TOKEN_POOL.length).fill(false),
              tokens: buildPreFreeTokens(),
              extraSpins: 0,
              extraFishers: 0,
              done: false,
            });
            setMods({ extraFreeSpins: 0, guaranteedFish: 0, collectedFishermen: 0, removeLowestFish: false });
            window.setTimeout(() => {
              finishExecution();
            }, 350);
            return;
          }

          if (isFreeSpin) {
            const leftAfter = Math.max(0, freeSpinsLeft - 1 + gainedExtraSpinsThisCall);
            setFreeSpinsLeft(leftAfter);

            if (leftAfter <= 0) {
              setPhase("idle");
              settleRound(pendingRoundStakeRef.current, updatedRoundPayout, pendingMultiDenominatorRef.current);
              setIsAutospinning(false);
            }
            window.setTimeout(() => {
              finishExecution();
            }, 250);
            return;
          }

          setPhase("idle");
          settleRound(pendingRoundStakeRef.current, updatedRoundPayout, pendingMultiDenominatorRef.current);
          finishExecution();
        };

        if (isFisherCollect) {
          const collectMultiplier = isFreeSpin ? currentFsMultiplier : 1;
          const perFisherWin = normalizeMoney(fishPack.total * spinCost * collectMultiplier);
          fishWin = normalizeMoney(perFisherWin * fishers);
          payoutForThisSpin += fishWin;
          finalizeStep();
        } else if (isBoatCollect) {
          const multi = isFreeSpin ? currentFsMultiplier : pickWeighted<number>(
            BASE_COLLECT_MULTIS.map((m, idx) => [m, BOAT_COLLECT_MULTI_WEIGHTS[idx]])
          );
          
          const boatWin = normalizeMoney(fishPack.total * spinCost * multi);
          payoutForThisSpin += boatWin;
          
          if (!isFreeSpin) setBoatAwake(true);
          setBoatNetCast(true);
          window.setTimeout(() => {
            setBoatNetCast(false);
            window.setTimeout(() => {
              setBoatChestOpen(true);
              setBoatChestMulti(multi);
              
              if (boatSleepTimeoutRef.current) clearTimeout(boatSleepTimeoutRef.current);
              boatSleepTimeoutRef.current = setTimeout(() => {
                setBoatAwake(false);
              }, 2200);
                      
              window.setTimeout(() => {
                setBoatChestOpen(false);
                setBoatChestMulti(null);
                finalizeStep();
              }, 900);
            }, 220);
          }, 600);
        } else {
          finalizeStep();
        }
      };

      if (waterfallInfo.triggered) {
        setIsWaterfallActive(true);
        window.setTimeout(() => {
          nextGrid = waterfallInfo.finalGrid;
          setGrid(nextGrid.map(row => row.map(cell => ({ ...cell, highlight: false }))));
          window.setTimeout(() => {
            setIsWaterfallActive(false);
            handleAfterReels();
          }, 600);
        }, 1800);
      } else {
        handleAfterReels();
      }
    });
  };

  const startPaidSpin = () => {
    if (!canPaidSpin) return;
    if (isExecutingSpinRef.current) return;
    if (betAmount <= 0) return;
    if (!isHundredDollarFreeSpin && balance < spinCost) {
      return;
    }
    if (!isHundredDollarFreeSpin) {
      subtractFromBalance(spinCost);
      playAudio(audioRef.current.bet);
      pendingRoundStakeRef.current = spinCost;
      pendingMultiDenominatorRef.current = betAmount;
    } else {
      playAudio(audioRef.current.bet);
      pendingRoundStakeRef.current = 100;
      pendingMultiDenominatorRef.current = 100;
    }
    pendingRoundPayoutRef.current = 0;
    setPendingRoundPayout(0);
    executeSpin();
  };

  const handleMainSpin = () => {
    if (isExecutingSpinRef.current) return;
    setLastWin(0);
    if (phase === "free") {
      spinFree();
    } else {
      startPaidSpin();
    }
  };

  const mainDisabled = isExecutingSpin || (phase === "free" ? freeSpinsLeft <= 0 : phase !== "idle" || (!isHundredDollarFreeSpin && balance < spinCost) || betAmount <= 0);

  const spinFree = () => {
    if (phase !== "free" || freeSpinsLeft <= 0) return;
    if (isExecutingSpinRef.current) return;
    executeSpin();
  };

  const beginFreeSpinsFromPreFree = (extraSpins: number, extraFishers: number) => {
    const totalStartSpins = PREFREE_START_SPINS + extraSpins;
    const initialFishers = extraFishers;
    const initialRetriggers = Math.floor(initialFishers / 4);
    const maxIndex = FS_MULTIPLIERS.length - 1;
    const cappedInitialRetriggers = Math.min(initialRetriggers, maxIndex);
    const fsMulti = FS_MULTIPLIERS[cappedInitialRetriggers];

    setFreeSpinsLeft(totalStartSpins);
    setFisherCollected(initialFishers);
    setRetriggers(cappedInitialRetriggers);
    setCurrentFsMultiplier(fsMulti);
    setPreFreeState(null);
    setPhase("free");
  };

  const handlePreFreePick = (index: number) => {
    if (!preFreeState || preFreeState.done || preFreeState.revealed[index]) return;

    const token = preFreeState.tokens[index];
    const revealed = [...preFreeState.revealed];
    revealed[index] = true;

    let nextExtraSpins = preFreeState.extraSpins;
    let nextExtraFishers = preFreeState.extraFishers;

    if (token === "fs1") nextExtraSpins += 1;
    if (token === "fs2") nextExtraSpins += 2;
    if (token === "fs3") nextExtraSpins += 3;
    if (token === "fs4") nextExtraSpins += 4;
    if (token === "fisher") nextExtraFishers += 1;

    const isShoe = token === "shoe";
    const allOpened = revealed.every(Boolean);

    const nextState: PreFreeState = {
      ...preFreeState,
      revealed,
      extraSpins: nextExtraSpins,
      extraFishers: nextExtraFishers,
      done: isShoe || allOpened,
    };

    setPreFreeState(nextState);

    if (isShoe || allOpened) {
      window.setTimeout(() => {
        beginFreeSpinsFromPreFree(nextExtraSpins, nextExtraFishers);
      }, 280);
    }
  };

  const buyBonus = async () => {
    if (anteBet || phase !== "idle" || betAmount <= 0 || balance < buyBonusCost) return;
    setLastWin(0);
    subtractFromBalance(buyBonusCost);
    playAudio(audioRef.current.bet);

    pendingRoundStakeRef.current = buyBonusCost;
    pendingMultiDenominatorRef.current = buyBonusCost;
    pendingRoundPayoutRef.current = 0;
    setPendingRoundPayout(0);
    setMods({ extraFreeSpins: 0, guaranteedFish: 0, collectedFishermen: 0, removeLowestFish: false });
    setFisherCollected(0);
    setRetriggers(0);
    setCurrentFsMultiplier(1);
    setFreeSpinsLeft(0);
    setPreFreeState({
      revealed: new Array(PREFREE_TOKEN_POOL.length).fill(false),
      tokens: buildPreFreeTokens(),
      extraSpins: 0,
      extraFishers: 0,
      done: false,
    });
    setPhase("prefree");
  };

  const displaySpinCost = spinCost * spinDisplayMultiplier;

  const handlePick = (index: number) => {
    if (!pickState || pickState.revealed[index]) return;
    const token = pickState.tokens[index];
    const revealed = [...pickState.revealed];
    revealed[index] = true;

    const nextMods = { ...pickState.modifiers };
    let boats = pickState.boatsFound;
    if (token === "boat") boats += 1;
    if (token === "extra") nextMods.extraFreeSpins = clamp(nextMods.extraFreeSpins + 2, 0, 6);
    if (token === "fish") nextMods.guaranteedFish = clamp(nextMods.guaranteedFish + 1, 0, 3);
    if (token === "fisher") nextMods.collectedFishermen = clamp(nextMods.collectedFishermen + 1, 0, 3);
    if (token === "clean") nextMods.removeLowestFish = true;

    const nextState: PickState = {
      ...pickState,
      revealed,
      boatsFound: boats,
      modifiers: nextMods,
    };

    setPickState(nextState);

    if (boats >= pickState.boatsTarget) {
      setMods(nextMods);
      setPickState(null);
      setPreFreeState({
        revealed: new Array(PREFREE_TOKEN_POOL.length).fill(false),
        tokens: buildPreFreeTokens(),
        extraSpins: nextMods.extraFreeSpins,
        extraFishers: nextMods.collectedFishermen,
        done: false,
      });
      setPhase("prefree");
    }
  };

  return (
    <>
      <div className="p-2 sm:p-4 lg:p-6 max-w-350 mx-auto flex flex-col lg:flex-row gap-4 lg:gap-8">
        <div className="w-full lg:w-60 flex flex-col gap-3 bg-[#0f212e] p-2 sm:p-3 rounded-xl h-fit text-xs self-start">
          <div className="space-y-2">
            <label className="text-xs font-bold text-[#b1bad3] uppercase tracking-wider">Bet Amount</label>
                <div className="text-[9px] text-[#93c8a8] font-semibold">
                Free spin with a $100 bet (no Ante)
                </div>
            <div className="relative">
              <div className="absolute left-3 top-1/2 -translate-y-1/2 text-[#b1bad3] font-mono">$</div>
              <input
                type="number"
                value={betInput}
                onChange={(e) => setBetInput(e.target.value)}
                onBlur={() => {
                  const val = Number(betInput.replace(",", "."));
                  const safe = Number.isFinite(val) ? Math.max(100, val) : 100;
                  setBetAmount(normalizeMoney(safe));
                  setBetInput(String(normalizeMoney(safe)));
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
              <div className="text-2xl font-bold text-[#00e701]">
                ${pendingRoundPayout.toFixed(2)}
              </div>
            </div>
          )}

          {lastWin > 0 && phase === "idle" && (
            <div className="p-4 bg-[#213743] border border-[#00e701] rounded-md text-center">
              <div className="text-xs text-[#b1bad3] uppercase">You Won</div>
              <div className="text-xl font-bold text-[#00e701]">
                ${lastWin.toFixed(2)}
              </div>
            </div>
          )}
        </div>

        <div className="flex-1 flex flex-col gap-6">
          <div className="rounded-3xl overflow-hidden p-4 sm:p-8 relative bg-[#0f212e] transform-gpu">
            <div className="relative mx-auto pt-32 sm:pt-40 pb-3 sm:pb-4 px-3 sm:px-4 rounded-2xl overflow-hidden transform-gpu">
              {phase === "free" && (
                <div className="absolute top-4 sm:top-6 left-1/2 -translate-x-1/2 z-30 flex justify-center w-full px-4 pointer-events-none">
                  <div className="bg-[#07151a] border border-[#17313a] px-4 py-2 rounded-full flex items-center gap-5">
                    <div className="flex items-center gap-2.5">
                      <span className="text-[10px] text-[#93c8a8] font-black uppercase tracking-widest">Spins</span>
                      <span className="text-xl font-black text-[#00e701] leading-none">{freeSpinsLeft}</span>
                    </div>
                    <div className="w-px h-4 bg-[#17313a]" />
                    <div className="flex items-center gap-2.5">
                      <span className="text-[10px] text-[#93c8a8] font-black uppercase tracking-widest">Fisher</span>
                      <div className="flex items-center gap-1.5">
                        <span className="text-xl font-black text-[#7dd3fc] leading-none">{fisherCollected}</span>
                        <span className="px-1.5 py-0.5 bg-[#1a3a46] border border-[#234b5a] rounded text-[10px] text-white font-black">
                          x{FS_MULTIPLIERS[Math.min(retriggers, FS_MULTIPLIERS.length - 1)]}
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
              )}
              <div className="absolute inset-0 pointer-events-none z-0 rounded-2xl overflow-hidden">
                <div className="absolute inset-0 jungle-underwater-bg rounded-2xl" />

                <svg className="absolute inset-0 w-full h-full opacity-70" viewBox="0 0 1200 700" preserveAspectRatio="none" aria-hidden>
                  <defs>
                    <linearGradient id="jungleMist" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#5ccf8d" stopOpacity="0.22" />
                      <stop offset="100%" stopColor="#0a2f3d" stopOpacity="0" />
                    </linearGradient>
                  </defs>
                  <path d="M0,170 C140,120 220,120 340,160 C470,205 560,120 700,150 C860,185 930,125 1200,165 L1200,0 L0,0 Z" fill="url(#jungleMist)" />
                  
                  <g className="mangrove-background" fillOpacity="0.9">
                    <g transform="translate(80, 165) scale(0.9)">
                      <path d="M-8 0 Q-10 -30, 0 -60 Q10 -90, 0 -120" stroke="#2d1d14" strokeWidth="12" fill="none" />
                      <circle cx="0" cy="-120" r="45" fill="#0b452e" />
                      <circle cx="-30" cy="-110" r="35" fill="#145c3d" />
                      <circle cx="30" cy="-110" r="35" fill="#145c3d" />
                    </g>

                    <g transform="translate(240, 155) scale(1.1)">
                      <path d="M-6 0 Q-12 -40, 2 -80 Q15 -110, -5 -140" stroke="#241810" strokeWidth="14" fill="none" />
                      <path d="M0 -70 Q-40 -80, -55 -110" stroke="#241810" strokeWidth="8" fill="none" />
                      <path d="M0 -70 Q40 -80, 55 -110" stroke="#241810" strokeWidth="8" fill="none" />
                      <circle cx="-5" cy="-140" r="55" fill="#083a26" />
                      <circle cx="-50" cy="-115" r="40" fill="#0b452e" />
                      <circle cx="45" cy="-115" r="40" fill="#0b452e" />
                    </g>

                    <g transform="translate(420, 160) scale(0.8)">
                      <path d="M-4 0 L0 -100" stroke="#2d1d14" strokeWidth="10" fill="none" />
                      <circle cx="0" cy="-100" r="60" fill="#145c3d" />
                      <circle cx="-40" cy="-90" r="35" fill="#1b5e20" />
                    </g>

                    <g transform="translate(680, 160) scale(1.2)">
                      <path d="M-5 0 Q0 -50, -10 -100 Q-20 -150, 0 -180" stroke="#241810" strokeWidth="12" fill="none" />
                      <circle cx="0" cy="-180" r="50" fill="#0b452e" />
                      <circle cx="-35" cy="-160" r="40" fill="#083a26" />
                      <circle cx="35" cy="-160" r="40" fill="#083a26" />
                    </g>

                    <g transform="translate(950, 165) scale(1.3)">
                      <path d="M-10 0 Q-15 -40, 0 -80 Q15 -120, -5 -160" stroke="#2d1d14" strokeWidth="16" fill="none" />
                      <path d="M0 -60 Q-50 -75, -70 -110" stroke="#2d1d14" strokeWidth="10" fill="none" />
                      <path d="M0 -60 Q50 -75, 70 -110" stroke="#2d1d14" strokeWidth="10" fill="none" />
                      <circle cx="-5" cy="-160" r="65" fill="#083a26" />
                      <circle cx="-65" cy="-120" r="45" fill="#0b452e" />
                      <circle cx="60" cy="-120" r="45" fill="#0b452e" />
                    </g>

                    <g transform="translate(1120, 160) scale(0.85)">
                      <path d="M-5 0 Q0 -40, 5 -80" stroke="#241810" strokeWidth="12" fill="none" />
                      <circle cx="5" cy="-80" r="50" fill="#145c3d" />
                    </g>

                    <path d="M0 160 Q100 145, 200 160 T400 160 T600 160 T800 160 T1000 160 T1200 160" fill="#0b452e" fillOpacity="0.6" />
                  </g>

                  <path d="M0,210 C180,165 280,195 420,225 C600,265 760,180 920,210 C1010,228 1110,220 1200,190 L1200,0 L0,0 Z" fill="#1f6a52" fillOpacity="0.16" />

                    <g fill="#6de3a0" fillOpacity="0.22">
                    <path d="M70 650 C75 590, 90 550, 98 490 C112 550, 120 600, 118 650 Z" />
                    <path d="M120 650 C128 590, 145 540, 160 480 C170 550, 172 590, 166 650 Z" />
                    <path d="M1030 650 C1038 595, 1060 550, 1080 485 C1090 550, 1092 595, 1088 650 Z" />
                    <path d="M1085 650 C1093 605, 1110 565, 1130 500 C1138 560, 1140 600, 1135 650 Z" />
                    </g>

                  <g fill="#8ae6ff" fillOpacity="0.23">
                    <g>
                      <path d="M220 260 C250 230, 300 230, 330 260 C300 295, 255 294, 220 260 Z" />
                      <circle cx="235" cy="258" r="4" fill="#052436" fillOpacity="0.75" />
                      <path d="M330 260 L345 250 L342 260 L345 270 Z" />
                    </g>
                    <g>
                      <path d="M810 315 C840 287, 888 286, 915 315 C888 349, 842 348, 810 315 Z" />
                      <circle cx="826" cy="313" r="4" fill="#052436" fillOpacity="0.75" />
                      <path d="M915 315 L930 305 L927 315 L930 325 Z" />
                    </g>
                    <g>
                      <path d="M530 230 C552 208, 586 208, 610 230 C586 255, 554 255, 530 230 Z" />
                      <circle cx="547" cy="229" r="4" fill="#052436" fillOpacity="0.75" />
                      <path d="M610 230 L625 220 L622 230 L625 240 Z" />
                    </g>
                  </g>
                </svg>

                <div className="absolute left-0 right-0 top-20 sm:top-32 h-2 sm:h-3 water-surface" />

                <div className="absolute top-2 sm:top-4 left-[16%] sm:left-[20%] -translate-x-1/2 z-20 pointer-events-none boat-fisher-wrap">
                  {boatChestMulti !== null && boatChestOpen && (
                    <div className="absolute top-[18%] left-[72.5%] -translate-x-1/2 boat-chest-multi flex flex-col items-center">
                      <div className="bg-linear-to-t from-[#ea580c] to-[#f97316] text-white px-2.5 py-1 rounded-lg text-[13px] sm:text-base font-black border-2 border-[#fff2cc] shadow-[0_0_20px_rgba(234,88,12,0.5)] animate-bounce-short">
                        x{boatChestMulti}
                      </div>
                      <div className="w-0 h-0 border-l-[6px] border-l-transparent border-r-[6px] border-r-transparent border-t-8 border-t-[#ea580c] -mt-1" />
                    </div>
                  )}
                  {!boatAwake && (
                    <div className="absolute pointer-events-none" style={{ left: '45%', top: '20px' }}>
                      <div className="relative w-8 h-6">
                        <span className="absolute text-[#d2ecff] font-bold text-xs animate-[floatZ_2s_infinite]" style={{ left: '-0.5rem', top: '2px', animationDelay: '0s' }}>Z</span>
                        <span className="absolute text-[#d2ecff]/80 font-bold text-[10px] animate-[floatZ_3s_infinite]" style={{ left: '-0.2rem', top: '6px', animationDelay: '0.4s' }}>z</span>
                        <span className="absolute text-[#d2ecff]/60 font-bold text-[8px] animate-[floatZ_4s_infinite]" style={{ left: '0.3rem', top: '4px', animationDelay: '0.8s' }}>z</span>
                      </div>
                    </div>
                  )}

                  <svg className="w-56 sm:w-72 h-auto" viewBox="0 0 280 140" aria-hidden>
                    <path d="M45 80 L235 80 L228 72 L52 72 Z" fill="#432b1a" />

                    <g transform="translate(158, 85) rotate(-35)">
                      <line x1="0" y1="0" x2="110" y2="0" stroke="#455a64" strokeWidth="3" strokeLinecap="round" />
                    </g>
                    <line x1="248" y1="22" x2="248" y2="400" stroke="white" strokeOpacity="0.6" strokeWidth="0.5" />

                    <g transform="translate(188, 56)">
                      <rect x="0" y="8" width="30" height="20" rx="2" fill="#5c4033" stroke="#3d2b22" strokeWidth="1.5" />
                      <rect x="5" y="8" width="3" height="20" fill="#d7b36a" fillOpacity="0.4" />
                      <rect x="22" y="8" width="3" height="20" fill="#d7b36a" fillOpacity="0.4" />
                      
                      <g transform={boatChestOpen ? "translate(0, -10) scale(1, 0)" : ""} className={`transition-all duration-500 ease-out will-change-transform ${boatChestOpen ? "opacity-0 invisible" : "opacity-100"}`}>
                        <rect x="0" y="2" width="30" height="10" rx="3" fill="#7a5230" stroke="#3d2b22" strokeWidth="1.5" />
                        <rect x="5" y="2" width="3" height="10" fill="#d7b36a" />
                        <rect x="22" y="2" width="3" height="10" fill="#d7b36a" />
                        <rect x="12" y="7" width="6" height="6" rx="1" fill="#d7b36a" stroke="#b8860b" strokeWidth="0.5" />
                        <circle cx="15" cy="10" r="1.2" fill="#3d2b22" />
                      </g>
                    </g>

                    <g transform={`translate(140, ${boatAwake && phase !== "free" ? 44 : 54})`} className="transition-transform duration-700 ease-in-out">
                      <g transform={boatAwake && phase !== "free" ? "scale(1.02)" : "rotate(8, 0, 40)"} className="transition-transform duration-700 origin-bottom">
                        <path d="M-18 25 C-18 25, -22 62, 0 62 C22 62, 18 25, 18 25 Z" fill="#365167" />
                        <path d="M-9 25 L9 25 L11 52 L-11 52 Z" fill="#fbc3a1" /> {/* Hemd */}

                        <rect x="-4" y="18" width="8" height="12" fill="#fbc3a1" />

                        <g transform="translate(0, 10)">
                          <circle cx="0" cy="0" r="14" fill="#fbc3a1" stroke="#e0a080" strokeWidth="0.5" />
                          
                          {boatAwake && phase !== "free" ? (
                            <>
                              <circle cx="-5" cy="-1" r="3.5" fill="white" />
                              <circle cx="5" cy="-1" r="3.5" fill="white" />
                              <circle cx="-5" cy="-1" r="1.8" fill="#1a2a38" />
                              <circle cx="5" cy="-1" r="1.8" fill="#1a2a38" />
                              <path d="M-3 6 Q0 9 3 6" stroke="#1a2a38" strokeWidth="1.5" fill="none" strokeLinecap="round" />
                            </>
                          ) : (
                            <>
                              <path d="M-7 -1 Q-5 1 -3 -1" stroke="#4a3a2a" strokeWidth="2" fill="none" strokeLinecap="round" />
                              <path d="M3 -1 Q5 1 7 -1" stroke="#4a3a2a" strokeWidth="2" fill="none" strokeLinecap="round" />
                              <line x1="-2" y1="6" x2="2" y2="6" stroke="#4a3a2a" strokeWidth="1" />
                            </>
                          )}

                          <g transform="translate(0, -10)">
                            <path d="M-18 0 L18 0 L14 -15 L-14 -15 Z" fill="#cfd8dc" />
                            <path d="M-24 0 L24 0 Q24 3 0 3 Q-24 3 -24 0 Z" fill="#90a4ae" />
                          </g>
                        </g>
                      </g>
                    </g>
                    
                    <path d="M30 80 C30 80, 45 125, 140 125 C235 125, 250 80, 250 80 Z" fill="#5d4037" stroke="#432b1a" strokeWidth="1" />
                    
                    <rect x="100" y="80" width="80" height="5" fill="#432b1a" rx="2" /> 

                    <g transform="rotate(-15, 100, 85)">
                      <line x1="100" y1="85" x2="25" y2="110" stroke="#795548" strokeWidth="4" strokeLinecap="round" />
                      <rect x="5" y="105" width="22" height="14" rx="3" fill="#795548" transform="rotate(-20, 15, 110)" />
                    </g>
                    <g transform="rotate(15, 180, 85)">
                      <line x1="180" y1="85" x2="255" y2="110" stroke="#795548" strokeWidth="4" strokeLinecap="round" />
                      <rect x="250" y="105" width="22" height="14" rx="3" fill="#795548" transform="rotate(20, 260, 110)" />
                    </g>
                  </svg>
                </div>

                <div className="absolute bottom-0 left-0 right-0 h-20 sm:h-24 seabed-layer rounded-b-2xl overflow-hidden">
                  <svg className="absolute inset-0 w-full h-full rounded-b-2xl" viewBox="0 0 1200 140" preserveAspectRatio="none" aria-hidden>
                    <path d="M0 80 C120 60, 210 100, 320 84 C450 66, 520 112, 640 90 C780 65, 860 108, 980 86 C1075 70, 1145 92, 1200 84 L1200 140 L0 140 Z" fill="#6e5a35" fillOpacity="0.45" />
                    <path d="M0 94 C150 76, 250 110, 360 98 C490 84, 570 120, 680 100 C790 82, 900 116, 1020 98 C1080 90, 1145 100, 1200 96 L1200 140 L0 140 Z" fill="#8d7040" fillOpacity="0.5" />
                  </svg>
                </div>
              </div>

              {phase === "prefree" && (
                <div className="absolute inset-0 z-30 flex items-center justify-center p-3 sm:p-6">
                  <div className="w-full max-w-md aspect-square rounded-3xl border border-[#3b5b6d]/30 bg-[#0a1e2b] p-4 sm:p-6  flex flex-col relative overflow-hidden group">
                    <div className="absolute top-0 left-0 w-full h-full pointer-events-none opacity-20">
                      <svg className="w-full h-full" viewBox="0 0 100 100" preserveAspectRatio="none">
                        <path d="M0 20 Q25 15 50 20 T100 20 V0 H0 Z" fill="#4ade80" />
                      </svg>
                    </div>

                    <div className="relative z-10 flex items-center justify-between gap-3 mb-5 px-1">
                      <div>
                        <div className="text-[#9effc1] font-black text-lg sm:text-xl uppercase tracking-wider">Amphoren Choice</div>
                        <div className="text-[10px] sm:text-[11px] text-[#8ab8d4] font-medium opacity-80">Choose wisely for your free spins</div>
                      </div>
                      <div className="p-2 rounded-xl bg-[#143142]/60 border border-[#3b5b6d]/30 text-[11px] text-right">
                        <div className="flex justify-between gap-4">
                          <span className="text-[#d2ecff]">Spins:</span>
                          <span className="text-[#9effc1] font-black">+{preFreeState?.extraSpins ?? 0}</span>
                        </div>
                        <div className="flex justify-between gap-4">
                          <span className="text-[#d2ecff]">Fisher:</span>
                          <span className="text-[#7dd3fc] font-black">+{preFreeState?.extraFishers ?? 0}</span>
                        </div>
                      </div>
                    </div>
                    
                    <div className="flex-1 grid grid-cols-4 gap-4 sm:gap-6 relative z-10">
                      {(preFreeState?.tokens ?? []).map((token, index) => {
                        const opened = !!preFreeState?.revealed[index];
                        return (
                          <button
                            key={`pot-${index}`}
                            type="button"
                            onClick={() => handlePreFreePick(index)}
                            disabled={opened || preFreeState?.done}
                            className={`group/pot transition-all duration-300 relative ${
                              opened 
                                ? "cursor-default" 
                                : "hover:scale-110 active:scale-95"
                            }`}
                          >
                            {!opened ? (
                              <div className="w-full h-full flex items-center justify-center filter">
                                <svg className="w-full max-w-[80%] aspect-4/3" viewBox="0 0 100 120" aria-hidden>
                                  <ellipse cx="50" cy="105" rx="30" ry="10" fill="black" fillOpacity="0.2" />
                                  <path d="M50 20 C25 20 20 50 20 75 C20 100 35 110 50 110 C65 110 80 100 80 75 C80 50 75 20 50 20" fill="#a67c52" />
                                  <path d="M50 20 C35 20 30 40 30 60 C30 80 40 95 50 95" fill="#8d6542" fillOpacity="0.4" />
                                  <ellipse cx="50" cy="20" rx="18" ry="6" fill="#c39a6b" />
                                  <ellipse cx="50" cy="20" rx="12" ry="4" fill="#6d4c31" />
                                  <path d="M30 35 Q15 40 25 60" fill="none" stroke="#8d6542" strokeWidth="4" strokeLinecap="round" />
                                  <path d="M70 35 Q85 40 75 60" fill="none" stroke="#8d6542" strokeWidth="4" strokeLinecap="round" />
                                  <circle cx="45" cy="50" r="2" fill="#8d6542" fillOpacity="0.3" />
                                  <circle cx="60" cy="80" r="3" fill="#8d6542" fillOpacity="0.2" />
                                </svg>
                              </div>
                            ) : (
                              <div className="w-full h-full flex flex-col items-center justify-center animate-in fade-in zoom-in duration-500">
                                <div className="absolute inset-0" />
                                <div className="relative z-10 flex items-center justify-center w-full h-full overflow-hidden">
                                  {token === "shoe" ? (
                                    <div className="flex flex-col items-center gap-1 scale-110">
                                      <svg className="w-12 h-12" viewBox="0 0 64 64" aria-hidden>
                                        <path d="M12 42 C20 34, 24 34, 30 38 C37 43, 45 41, 52 40 L52 50 L12 50 Z" fill="#533b2e" />
                                        <path d="M9 50 L55 50 C56 54, 54 57, 49 57 L15 57 C10 57, 8 54, 9 50 Z" fill="#2c2c2c" />
                                        <path d="M15 45 L20 45" stroke="#3e2a1e" strokeWidth="2" strokeLinecap="round" />
                                      </svg>
                                    </div>
                                  ) : token === "fisher" ? (
                                    <div className="flex flex-col items-center gap-0">
                                      <div className="text-4xl">🤠</div>
                                    </div>
                                  ) : (
                                    <div className="flex flex-col items-center gap-0">
                                      <div className="text-[#9effc1] font-black text-2xl">
                                        +{token === "fs1" ? 1 : token === "fs2" ? 2 : token === "fs3" ? 3 : 4}
                                      </div>
                                    </div>
                                  )}
                                </div>
                              </div>
                            )}
                          </button>
                        );
                      })}
                    </div>

                    <div className="mt-4 flex justify-center gap-1 opacity-40">
                    </div>
                  </div>
                </div>
              )}

              <div className="grid grid-cols-5 gap-1.5 sm:gap-4 relative z-10">
                {boatNetCast && (
                  <div className="boat-net-cast" aria-hidden>
                    <svg viewBox="0 0 1000 520" preserveAspectRatio="none" className="w-full h-full">
                      <path d="M170 80 L10 140" fill="none" stroke="#d2b48c" strokeWidth="3" strokeLinecap="round" />
                      <path d="M170 80 L990 140" fill="none" stroke="#d2b48c" strokeWidth="2" strokeLinecap="round" strokeDasharray="5 5" />

                      <path d="M10 140 Q 500 120 990 140" fill="none" stroke="#d2b48c" strokeWidth="4" />
                      <path d="M10 140 V 460" fill="none" stroke="#d2b48c" strokeWidth="4" />
                      <path d="M990 140 V 460" fill="none" stroke="#d2b48c" strokeWidth="4" />
                      <path d="M10 460 Q 500 520 990 460" fill="none" stroke="#d2b48c" strokeWidth="4" />

                      <g stroke="rgba(210,180,140,0.55)" strokeWidth="1.8" fill="none">
                        <path d="M10 180 Q 500 165 990 180" />
                        <path d="M10 220 Q 500 210 990 220" />
                        <path d="M10 260 Q 500 255 990 260" />
                        <path d="M10 300 Q 500 300 990 300" />
                        <path d="M10 340 Q 500 350 990 340" />
                        <path d="M10 380 Q 500 400 990 380" />
                        <path d="M10 420 Q 500 440 990 420" />

                        <path d="M120 140 Q 125 300 120 460" />
                        <path d="M220 140 Q 225 300 220 470" />
                        <path d="M320 140 Q 325 300 320 480" />
                        <path d="M420 140 Q 425 300 420 490" />
                        <path d="M520 140 Q 525 300 520 490" />
                        <path d="M620 140 Q 625 300 620 480" />
                        <path d="M720 140 Q 725 300 720 470" />
                        <path d="M820 140 Q 825 300 820 460" />
                        <path d="M920 140 Q 925 300 920 460" />
                      </g>

                      <g fill="#ea580c" stroke="#991b1b" strokeWidth="1.5">
                        <circle cx="10" cy="140" r="12" />
                        <circle cx="990" cy="140" r="12" />
                        <circle cx="10" cy="460" r="12" />
                        <circle cx="990" cy="460" r="12" />
                        <circle cx="500" cy="118" r="10" />
                        <circle cx="500" cy="510" r="10" />
                        <circle cx="10" cy="300" r="9" />
                        <circle cx="990" cy="300" r="9" />
                        <circle cx="250" cy="130" r="8" />
                        <circle cx="750" cy="130" r="8" />
                      </g>
                    </svg>
                  </div>
                )}
                {isWaterfallActive && (
                  <div className="waterfall-overlay" aria-hidden>
                    <div className="waterfall-envelope">
                      <div className="waterfall-interior" />
                    </div>
                  </div>
                )}
                {Array.from({ length: REELS }, (_, reel) => (
                  <div key={reel} className="relative h-72 sm:h-96">
                    {reel < REELS - 1 && (
                      <div className={`absolute -right-2 sm:-right-3 top-8 sm:top-12 bottom-0 w-4 sm:w-6 pointer-events-none z-20 bubble-separator sep-${reel}`}>
                        <span className="bubble b1" />
                        <span className="bubble b2" />
                        <span className="bubble b3" />
                        <span className="bubble b4" />
                        <span className="bubble b5" />
                        <span className="bubble b6" />
                        <span className="bubble b7" />
                        <span className="bubble b8" />
                        <span className="bubble b9" />
                        <span className="bubble b10" />
                        <span className="bubble b11" />
                        <span className="bubble b12" />
                        <span className="bubble b13" />
                        <span className="bubble b14" />
                        <span className="bubble b15" />
                        <span className="bubble b16" />
                        <span className="bubble b17" />
                        <span className="bubble b18" />
                        <span className="bubble b19" />
                        <span className="bubble b20" />
                        <span className="bubble b21" />
                        <span className="bubble b22" />
                        <span className="bubble b23" />
                        <span className="bubble b24" />
                        <span className="bubble b25" />
                      </div>
                    )}
                    <div className="absolute inset-x-0 top-4 sm:top-6 bottom-2 sm:bottom-4 overflow-hidden">
                      <div
                        key={`reel-container-${reel}-${spinKey}`}
                        className={`flex flex-col relative w-full ${reelsSpinning[reel] ? "animate-spin-infinite-down will-change-transform" : ""}`}
                      >
                      {reelsSpinning[reel] ? (
                        reelFrames[reel].map((cell, rowIdx) => (
                          <div
                            key={`spin-${reel}-${rowIdx}-${spinKey}`}
                            className="h-24 sm:h-32 flex items-center justify-center shrink-0 w-full"
                          >
                            <div className="transform-gpu filter blur-[1px]">{renderSymbol(cell, displaySpinCost)}</div>
                          </div>
                        ))
                      ) : (
                        grid.map((row, rowIdx) => {
                          const cell = row[reel];
                          return (
                            <div
                              key={`static-${reel}-${rowIdx}-${spinKey}`}
                              className={`h-24 sm:h-32 flex items-center justify-center shrink-0 w-full relative z-0 ${
                                cell.highlight
                                  ? "z-30 scale-115 transition-transform duration-300"
                                  : "animate-stop-bounce" 
                              }`}
                            >
                                <div className={`${cell.highlight ? "slot-cell-pop" : ""}`}>{renderSymbol(cell, displaySpinCost)}</div>
                            </div>
                          );
                        })
                      )}
                    </div>
                  </div>
                </div>
                ))}
              </div>
            </div>
          </div>

          <GameRecordsPanel gameId="bigbassamazonas"/>
        </div>
      </div>

      <style jsx global>{`
        @keyframes slotReelRollTick {
          0% { transform: translateY(-25%); }
          100% { transform: translateY(0%); }
        }
        @keyframes slotCellPop {
          0% { transform: scale(1); }
          50% { transform: scale(1.3); }
          100% { transform: scale(1); }
        }
        @keyframes floatZ {
          0% { transform: translate(0, 0) scale(0.5); opacity: 0; }
          20% { opacity: 1; }
          80% { opacity: 1; }
          100% { transform: translate(15px, -40px) scale(1.5); opacity: 0; }
        }
        @keyframes oarSway {
          from { transform: rotate(-5deg); }
          to { transform: rotate(5deg); }
        }
        @keyframes netCastIn {
          0% { opacity: 0; transform: translateY(-50px) scale(0.85); filter: blur(1px); }
          60% { opacity: 1; transform: translateY(15px) scale(1.03); filter: blur(0); }
          80% { transform: translateY(-5px) scale(0.98); }
          100% { opacity: 1; transform: translateY(0) scale(1); }
        }
        @keyframes chestMultiPop {
          0% { opacity: 0; transform: translateY(15px) scale(0.5); filter: blur(2px); }
          45% { opacity: 1; transform: translateY(-15px) scale(1.1); filter: blur(0); }
          75% { transform: translateY(-3px) scale(0.95); }
          100% { opacity: 1; transform: translateY(-5px) scale(1); }
        }
        .boat-net-cast {
          position: absolute;
          inset: 0;
          z-index: 55;
          pointer-events: none;
          animation: netCastIn .55s cubic-bezier(0.2, 0.7, 0.2, 1) forwards;
        }
        .boat-chest-multi {
          text-shadow: 0 1px 0 rgba(0,0,0,0.25);
          animation: chestMultiPop .28s ease-out forwards;
        }
        .slot-reel-rolling {
          filter: blur(0.4px);
          will-change: transform;
          backface-visibility: hidden;
        }
        .slot-rolling {
          animation-name: slotReelRollTick;
          animation-timing-function: linear;
          animation-iteration-count: infinite;
          animation-duration: var(--dur, 90ms);
          transform: translateZ(0);
        }
        .slot-cell-pop {
          animation: slotCellPop .5s cubic-bezier(0.175, 0.885, 0.32, 1.275);
        }
        .jungle-underwater-bg {
          background:
            radial-gradient(120% 90% at 50% -10%, rgba(72, 164, 118, 0.25), transparent 55%),
            radial-gradient(90% 80% at 12% 20%, rgba(33, 120, 82, 0.22), transparent 60%),
            radial-gradient(90% 70% at 88% 24%, rgba(41, 138, 88, 0.2), transparent 62%),
            linear-gradient(180deg, rgba(12, 58, 52, 0.75) 0%, rgba(8, 49, 66, 0.82) 45%, rgba(7, 41, 56, 0.95) 100%);
        }
        .water-surface {
          background:
            linear-gradient(180deg, rgba(177, 239, 255, 0.45), rgba(177, 239, 255, 0.08));
          border-radius: 9999px;
        }
        .seabed-layer {
          filter: drop-shadow(0 -8px 20px rgba(20, 26, 24, 0.35));
        }
        .bubble-separator .bubble {
          position: absolute;
          left: 50%;
          border-radius: 9999px;
          border: 0.5px solid rgba(173, 234, 255, 0.4);
          background: radial-gradient(circle at 30% 30%, rgba(210, 249, 255, 0.5), rgba(140, 218, 242, 0.05));
          animation: bubbleRise 4s linear infinite, bubbleSway 2s ease-in-out infinite alternate;
          opacity: 0;
          bottom: -15px;
        }
        .bubble-separator .b1 { width: 4px; height: 4px; animation-duration: 3.2s; animation-delay: -0.2s; left: 10%; }
        .bubble-separator .b2 { width: 7px; height: 7px; animation-duration: 4.5s; animation-delay: -1.5s; left: 30%; }
        .bubble-separator .b3 { width: 5px; height: 5px; animation-duration: 3.8s; animation-delay: -2.8s; left: 70%; }
        .bubble-separator .b4 { width: 10px; height: 10px; animation-duration: 5.2s; animation-delay: -0.7s; left: 40%; }
        .bubble-separator .b5 { width: 6px; height: 6px; animation-duration: 4.1s; animation-delay: -3.4s; left: 60%; }
        .bubble-separator .b6 { width: 4px; height: 4px; animation-duration: 3.5s; animation-delay: -1.9s; left: 20%; }
        .bubble-separator .b7 { width: 8px; height: 8px; animation-duration: 4.8s; animation-delay: -4.2s; left: 80%; }
        .bubble-separator .b8 { width: 5px; height: 5px; animation-duration: 3.9s; animation-delay: -0.5s; left: 50%; }
        .bubble-separator .b9 { width: 6px; height: 6px; animation-duration: 4.3s; animation-delay: -2.3s; left: 10%; }
        .bubble-separator .b10 { width: 4px; height: 4px; animation-duration: 3.1s; animation-delay: -3.7s; left: 90%; }
        .bubble-separator .b11 { width: 9px; height: 9px; animation-duration: 5.5s; animation-delay: -1.1s; left: 25%; }
        .bubble-separator .b12 { width: 5px; height: 5px; animation-duration: 3.7s; animation-delay: -2.9s; left: 75%; }
        .bubble-separator .b13 { width: 7px; height: 7px; animation-duration: 4.6s; animation-delay: -4.8s; left: 45%; }
        .bubble-separator .b14 { width: 4px; height: 4px; animation-duration: 3.3s; animation-delay: -0.3s; left: 55%; }
        .bubble-separator .b15 { width: 8px; height: 8px; animation-duration: 4.9s; animation-delay: -1.7s; left: 35%; }
        .bubble-separator .b16 { width: 5px; height: 5px; animation-duration: 3.4s; animation-delay: -3.2s; left: 15%; }
        .bubble-separator .b17 { width: 4px; height: 4px; animation-duration: 4.0s; animation-delay: -4.5s; left: 85%; }
        .bubble-separator .b18 { width: 9px; height: 9px; animation-duration: 5.1s; animation-delay: -0.8s; left: 65%; }
        .bubble-separator .b19 { width: 6px; height: 6px; animation-duration: 4.2s; animation-delay: -2.1s; left: 25%; }
        .bubble-separator .b20 { width: 4px; height: 4px; animation-duration: 3.6s; animation-delay: -5.0s; left: 75%; }
        .bubble-separator .b21 { width: 5px; height: 5px; animation-duration: 3.2s; animation-delay: -1.3s; left: 20%; }
        .bubble-separator .b22 { width: 8px; height: 8px; animation-duration: 4.4s; animation-delay: -3.6s; left: 40%; }
        .bubble-separator .b23 { width: 4px; height: 4px; animation-duration: 3.7s; animation-delay: -0.1s; left: 60%; }
        .bubble-separator .b24 { width: 9px; height: 9px; animation-duration: 5.0s; animation-delay: -2.5s; left: 80%; }
        .bubble-separator .b25 { width: 6px; height: 6px; animation-duration: 4.1s; animation-delay: -4.9s; left: 30%; }

        .sep-0 .bubble { animation-name: bubbleRise, bubbleSway; }
        .sep-1 .bubble { animation-name: bubbleRise1, bubbleSway1; animation-duration: 4.8s, 2.5s; }
        .sep-2 .bubble { animation-name: bubbleRise2, bubbleSway2; animation-duration: 3.2s, 1.8s; }
        .sep-3 .bubble { animation-name: bubbleRise3, bubbleSway3; animation-duration: 5.5s, 3s; }

        @keyframes bubbleRise {
          0% { transform: translateY(0) scale(0.8); opacity: 0; }
          10% { opacity: 0.7; }
          80% { opacity: 0.7; transform: translateY(-300px) scale(1); }
          100% { transform: translateY(-345px) scale(2.2); opacity: 0; }
        }
        @keyframes bubbleRise1 {
          0% { transform: translateY(0) scale(0.7); opacity: 0; }
          20% { opacity: 0.6; }
          70% { opacity: 0.6; transform: translateY(-280px) scale(1.2); }
          100% { transform: translateY(-360px) scale(1.8); opacity: 0; }
        }
        @keyframes bubbleRise2 {
          0% { transform: translateY(0) scale(1); opacity: 0; }
          15% { opacity: 0.8; }
          85% { opacity: 0.8; transform: translateY(-320px) scale(0.9); }
          100% { transform: translateY(-340px) scale(2.0); opacity: 0; }
        }
        @keyframes bubbleRise3 {
          0% { transform: translateY(0) scale(0.6); opacity: 0; }
          5% { opacity: 0.5; }
          75% { opacity: 0.5; transform: translateY(-250px) scale(1.5); }
          100% { transform: translateY(-370px) scale(2.5); opacity: 0; }
        }
        @keyframes bubbleSway {
          0%, 100% { margin-left: -2px; }
          50% { margin-left: 2px; }
        }
        @keyframes bubbleSway1 {
          0%, 100% { margin-left: 4px; }
          50% { margin-left: -4px; }
        }
        @keyframes bubbleSway2 {
          0%, 100% { margin-left: -3px; }
          50% { margin-left: 3px; }
        }
        @keyframes bubbleSway3 {
          0%, 100% { margin-left: 2px; }
          50% { margin-left: -2px; }
        }
        /* symbol flicker removed to avoid visual noise during reel animations */
        @keyframes bounceShort {
          0%, 100% { transform: translateY(0); }
          50% { transform: translateY(-4px); }
        }
        @keyframes fadeInZoom {
          0% { opacity: 0; transform: scale(0.8) translateY(10px); }
          100% { opacity: 1; transform: scale(1) translateY(0); }
        }
        .animate-bounce-short {
          animation: bounceShort 1s ease-in-out infinite;
        }
        .animate-in.fade-in.zoom-in {
          animation: fadeInZoom 0.4s cubic-bezier(0.175, 0.885, 0.32, 1.275) forwards;
        }
        .bg-gradient-radial {
          background-image: radial-gradient(var(--tw-gradient-stops));
        }
        @keyframes waterfallEnvelope {
          0% {
            clip-path: inset(0 0 100% 0 round 0 0 40% 40%);
            opacity: 0;
          }
          15% {
            clip-path: inset(0 0 40% 0 round 0 0 20% 20%);
            opacity: 1;
          }
          40% {
            clip-path: inset(0 0 0 0 round 0 0 0 0);
            opacity: 1;
          }
          75% {
            clip-path: inset(0 0 0 0 round 0 0 0 0);
            opacity: 1;
          }
          100% {
            clip-path: inset(100% 0 0 0 round 40% 40% 0 0);
            opacity: 0;
          }
        }

        .waterfall-overlay {
          position: absolute;
          inset: -4px;
          z-index: 60;
          pointer-events: none;
          overflow: hidden;
          border-radius: 1.25rem;
          transform: translateZ(0);
        }

        .waterfall-envelope {
          position: absolute;
          inset: 0;
          will-change: clip-path, opacity;
          animation: waterfallEnvelope 2.4s cubic-bezier(0.4, 0, 0.2, 1) forwards;
          background: #072938; /* Die dunkelste Farbe ganz unten */
        }

        .waterfall-interior {
          position: absolute;
          inset: 0;
          /* Dezentere Blau/Grüntöne direkt aus dem Slot-Wasser mit EXTREM flachen Wellen */
          background-color: #072938; /* Bottom: Deep Cyan */
          background-image: 
            /* Obere Schicht: Teal/Greenish Schicht (noch flachere Wellen) */
            url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='100' height='10' viewBox='0 0 100 10' preserveAspectRatio='none'%3E%3Cpath d='M0 5 Q 5 4, 10 5 T 20 5 T 30 5 T 40 5 T 50 5 T 60 5 T 70 5 T 80 5 T 90 5 T 100 5 V 0 H 0 Z' fill='%230c3a34'/%3E%3C/svg%3E"),
            /* Mittlere Schicht: Dark Cyan Schicht (noch flachere Wellen) */
            url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='100' height='10' viewBox='0 0 100 10' preserveAspectRatio='none'%3E%3Cpath d='M0 8 Q 5 7.2, 10 8 T 20 8 T 30 8 T 40 8 T 50 8 T 60 8 T 70 8 T 80 8 T 90 8 T 100 8 V 0 H 0 Z' fill='%23083142'/%3E%3C/svg%3E");
          background-size: 100% 33.3%, 100% 66.6%;
          background-repeat: no-repeat;
          opacity: 1;
        }
      `}</style>
    </>
  );
}

function buildPreFreeTokens() {
  const tokens = [...PREFREE_TOKEN_POOL];
  for (let i = tokens.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [tokens[i], tokens[j]] = [tokens[j], tokens[i]];
  }
  return tokens;
}
