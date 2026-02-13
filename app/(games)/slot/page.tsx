"use client";

import React, { useMemo, useState } from "react";
import { useWallet } from "@/components/WalletProvider";
import { useSoundVolume } from "@/components/SoundVolumeProvider";
import GameRecordsPanel from "@/components/GameRecordsPanel";

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

const CARD_SYMBOLS: SymbolId[] = ["10", "J", "Q", "K", "A"];
const HIGH_SYMBOLS: SymbolId[] = ["rod", "bag", "toucan", "lure"];
const BASE_SYMBOL_WEIGHTS: Record<SymbolId, number> = {
  "10": 11,
  J: 11,
  Q: 10,
  K: 9,
  A: 8,
  rod: 5,
  bag: 4.5,
  toucan: 4,
  lure: 3.5,
  fish: 2.5,
  scatter: 1.35,
  fisher: 0,
};
const FREE_SYMBOL_WEIGHTS: Record<SymbolId, number> = {
  "10": 10,
  J: 10,
  Q: 9,
  K: 9,
  A: 8,
  rod: 4.8,
  bag: 4.3,
  toucan: 3.8,
  lure: 3.2,
  fish: 4.4,
  scatter: 0,
  fisher: 1.65,
};

const FISH_VALUES = [0.2, 0.5, 1, 2, 5, 10, 20, 50, 100, 250, 500, 1000];
const FISH_WEIGHTS = [25, 20, 16, 14, 10, 7, 4, 2, 1.2, 0.7, 0.4, 0.15];
const BASE_COLLECT_MULTIS = [1, 2, 3, 5, 8, 10, 15, 20, 30, 40, 50];
const BASE_COLLECT_WEIGHTS = [24, 20, 16, 14, 10, 7, 4.5, 2.5, 1.5, 0.8, 0.5];
const BASE_COLLECT_CHANCE_BY_FISH_COUNT: Record<number, number> = {
  1: 0.1,
  2: 0.16,
  3: 0.24,
  4: 0.3,
  5: 0.36,
};
const BASE_SCATTER_ASSIST_WEIGHTS: Record<"none" | "hook" | "respin" | "croc", number> = {
  none: 62,
  hook: 18,
  respin: 14,
  croc: 6,
};
const FREE_EVENT_CHANCES = {
  fishDropWhenOnlyFisher: 0.2,
  fisherDropWhenOnlyFish: 0.2,
  hook: 0.2,
  waterfall: 0.2,
};
const FS_MULTIPLIERS = [1, 2, 3, 10, 20, 30, 40, 50];
const BOAT_WAKE_CHANCE_BASE = 0.2;
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

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

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
  let scatter = countSymbol(g, "scatter");
  const fired: string[] = [];
  if (scatter !== 2) return { grid: g, fired };

  const mode = pickWeighted<"none" | "hook" | "respin" | "croc">([
    ["none", BASE_SCATTER_ASSIST_WEIGHTS.none],
    ["hook", BASE_SCATTER_ASSIST_WEIGHTS.hook],
    ["respin", BASE_SCATTER_ASSIST_WEIGHTS.respin],
    ["croc", BASE_SCATTER_ASSIST_WEIGHTS.croc],
  ]);

  const nonScatterPositions: [number, number][] = [];
  const lowSymbolPositions: [number, number][] = [];
  for (let row = 0; row < ROWS; row++) {
    for (let reel = 0; reel < REELS; reel++) {
      if (g[row][reel].symbol !== "scatter") nonScatterPositions.push([row, reel]);
      if (CARD_SYMBOLS.includes(g[row][reel].symbol)) lowSymbolPositions.push([row, reel]);
    }
  }

  const forceScatterOnRandom = (reason: string) => {
    if (nonScatterPositions.length <= 0) return;
    const [row, reel] = nonScatterPositions[Math.floor(Math.random() * nonScatterPositions.length)];
    g[row][reel] = { symbol: "scatter", highlight: true };
    fired.push(reason);
  };

  if (mode === "hook") {
    forceScatterOnRandom("Base Hook: zusätzlicher Scatter wird gezogen");
  }

  if (mode === "croc") {
    const pool = lowSymbolPositions.length > 0 ? lowSymbolPositions : nonScatterPositions;
    if (pool.length > 0) {
      const [row, reel] = pool[Math.floor(Math.random() * pool.length)];
      g[row][reel] = { symbol: "scatter", highlight: true };
      fired.push("Croc Event: Symbol wird zu Scatter verwandelt");
    }
  }

  if (mode === "respin") {
    for (let reel = 0; reel < REELS; reel++) {
      for (let row = ROWS - 2; row >= 0; row--) {
        if (g[row][reel].symbol === "scatter" && g[row + 1][reel].symbol !== "scatter") {
          [g[row][reel], g[row + 1][reel]] = [g[row + 1][reel], g[row][reel]];
          g[row + 1][reel].highlight = true;
        }
      }
    }

    for (let row = 0; row < ROWS; row++) {
      for (let reel = 0; reel < REELS; reel++) {
        if (g[row][reel].symbol !== "scatter") {
          g[row][reel] = { ...randomNonScatterBaseSymbol(removeLowestFish), highlight: false };
        }
      }
    }

    scatter = countSymbol(g, "scatter");
    if (scatter < 3) {
      forceScatterOnRandom("Respin Event: 3. Scatter landet nach dem Nachdrehen");
    } else {
      fired.push("Respin Event: Scatter rutschen, Reels drehen nach");
    }
  }

  return { grid: g, fired };
}

function shouldTriggerBaseCollect(fishCount: number, anteBet: boolean) {
  if (fishCount <= 0) return false;
  const key = Math.min(5, Math.max(1, fishCount));
  const baseChance = BASE_COLLECT_CHANCE_BY_FISH_COUNT[key] ?? BASE_COLLECT_CHANCE_BY_FISH_COUNT[5];
  const chance = clamp(baseChance * (anteBet ? 1.08 : 1), 0, 0.5);
  return Math.random() < chance;
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

export default function SlotPage() {
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
  const [pickState, setPickState] = useState<PickState | null>(null);
  const [preFreeState, setPreFreeState] = useState<PreFreeState | null>(null);
  const [mods, setMods] = useState<PickModifiers>({
    extraFreeSpins: 0,
    guaranteedFish: 0,
    collectedFishermen: 0,
    removeLowestFish: false,
  });
  const [pendingRoundStake, setPendingRoundStake] = useState(0);
  const [pendingRoundPayout, setPendingRoundPayout] = useState(0);
  const [lastWin, setLastWin] = useState(0);
  const [boatAwake, setBoatAwake] = useState(false);

  
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

  const audioRef = React.useRef<{
    bet: HTMLAudioElement | null;
    spin: HTMLAudioElement | null;
    win: HTMLAudioElement | null;
    lose: HTMLAudioElement | null;
  }>({ bet: null, spin: null, win: null, lose: null });

  const canPaidSpin = phase === "idle";
  const spinCost = useMemo(() => normalizeMoney(betAmount * (anteBet ? 1.5 : 1)), [betAmount, anteBet]);
  const buyBonusCost = useMemo(() => normalizeMoney(betAmount * 100), [betAmount]);

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

  const settleRound = (stake: number, payout: number) => {
    if (stake <= 0) return;
    const p = normalizeMoney(payout);
    if (p > 0) {
      addToBalance(p);
      playAudio(audioRef.current.win);
      setLastWin(p);
    } else {
      finalizePendingLoss();
      playAudio(audioRef.current.lose);
      setLastWin(0);
    }
    setPendingRoundStake(0);
    setPendingRoundPayout(0);
  };

  const applyFreeSpinEvents = (gridBefore: Cell[][], currentMods: PickModifiers) => {
    const g = gridBefore.map((row) => row.map((cell) => ({ ...cell, highlight: false })));
    const fisherCount = countSymbol(g, "fisher");
    const fishCount = countSymbol(g, "fish");
    const fired: string[] = [];

    if (Math.random() < FREE_EVENT_CHANCES.fishDropWhenOnlyFisher && fisherCount > 0 && fishCount === 0) {
      const spots: [number, number][] = [];
      for (let row = 0; row < ROWS; row++) {
        for (let reel = 0; reel < REELS; reel++) {
          if (g[row][reel].symbol !== "scatter" && g[row][reel].symbol !== "fisher") spots.push([row, reel]);
        }
      }
      for (let i = 0; i < Math.min(2, spots.length); i++) {
        const idx = Math.floor(Math.random() * spots.length);
        const [row, reel] = spots.splice(idx, 1)[0];
        g[row][reel] = { symbol: "fish", fishValue: fishValue(currentMods.removeLowestFish), highlight: true };
      }
      fired.push("Random Event: Extra Geld-Fische erscheinen");
    }

    if (Math.random() < FREE_EVENT_CHANCES.fisherDropWhenOnlyFish && fisherCount === 0 && fishCount > 0) {
      const spots: [number, number][] = [];
      for (let row = 0; row < ROWS; row++) {
        for (let reel = 0; reel < REELS; reel++) {
          if (g[row][reel].symbol !== "scatter" && g[row][reel].symbol !== "fish") spots.push([row, reel]);
        }
      }
      if (spots.length > 0) {
        const [row, reel] = spots[Math.floor(Math.random() * spots.length)];
        g[row][reel] = { symbol: "fisher", highlight: true };
        fired.push("Random Event: Fisherman Wild springt hinein");
      }
    }

    if (Math.random() < FREE_EVENT_CHANCES.hook) {
      const row = Math.floor(Math.random() * ROWS);
      const reel = Math.floor(Math.random() * REELS);
      const current = g[row][reel];
      if (current.symbol !== "scatter") {
        g[row][reel] =
          Math.random() < 0.5
            ? { symbol: "fish", fishValue: fishValue(currentMods.removeLowestFish), highlight: true }
            : { symbol: "fisher", highlight: true };
        fired.push("Hook Event: Symbol wird aufgezogen");
      }
    }

    if (Math.random() < FREE_EVENT_CHANCES.waterfall) {
      for (let row = 0; row < ROWS; row++) {
        for (let reel = 0; reel < REELS; reel++) {
          if (g[row][reel].symbol === "scatter" || g[row][reel].symbol === "fish" || g[row][reel].symbol === "fisher") {
            continue;
          }
          if (Math.random() < 0.35) {
            const sym = randomSymbol(true, false);
            g[row][reel] = sym === "scatter" ? { symbol: "A", highlight: true } : { symbol: sym, highlight: true };
          }
        }
      }
      fired.push("Waterfall Event: Reels erneuern sich");
    }

    return { grid: g, fired };
  };

  const executeSpin = async ({ isPaidBaseSpin }: { isPaidBaseSpin: boolean }) => {
    if (isExecutingSpinRef.current) return;
    isExecutingSpinRef.current = true;
    setIsExecutingSpin(true);
    setBoatAwake(false);
    let messageLocal = "";
    let lineEval: { totalWin: number; highlight: Set<string> } = { totalWin: 0, highlight: new Set() };
    let updatedRoundPayout = 0;
    try {
      const isFreeSpin = phase === "free" && freeSpinsLeft > 0;
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
      const scatterAssist = applyBaseScatterAssist(nextGrid, mods.removeLowestFish);
      nextGrid = scatterAssist.grid;
    }

    if (isFreeSpin) {
      const randomEvents = applyFreeSpinEvents(nextGrid, mods);
      nextGrid = randomEvents.grid;
    }

    const startFrames = gridToReelFrames(grid).map((reelCol) => {
      const fresh = cellForSpin(isFreeSpin, anteBet, mods.removeLowestFish);
      return [fresh, ...reelCol.map((cell) => ({ ...cell, highlight: false }))];
    });
    setReelFrames(startFrames);
    setReelDurations(Array(REELS).fill(90));
    setReelsSpinning([true, true, true, true, true]);

    const animateReels = new Promise<void>((resolve) => {
      let stoppedCount = 0;
      const stopTimes = [600, 750, 900, 1050, 1200];
      const baseFrameRate = 90;

      for (let reel = 0; reel < REELS; reel++) {
        if (intervalRefs.current[reel]) clearInterval(intervalRefs.current[reel]!);
        if (timeoutRefs.current[reel]) clearTimeout(timeoutRefs.current[reel]!);

        let frameCount = 0;
        let isStopping = false;
        let stopProgress = 0;

        intervalRefs.current[reel] = setInterval(() => {
          frameCount += baseFrameRate;

          if (isStopping) {
            setReelDurations((prevD) => {
              const nextD = [...prevD];
              nextD[reel] = Math.round(baseFrameRate * (1 + stopProgress * 1.5));
              return nextD;
            });
          }

          setReelFrames((prev) => {
            const next = prev.map((f) => [...f]);
            const currentCol = next[reel];

            if (isStopping) {
              if (stopProgress < ROWS) {
                const targetCell = nextGrid[ROWS - 1 - stopProgress][reel];
                next[reel] = [
                  { ...targetCell, highlight: false },
                  currentCol[0],
                  currentCol[1],
                  currentCol[2],
                ];
                stopProgress++;
              } else {
                if (intervalRefs.current[reel]) {
                  clearInterval(intervalRefs.current[reel]!);
                  intervalRefs.current[reel] = null;
                }
                
                setGrid((prevGrid) => {
                  const nextG = prevGrid.map((r) => [...r]);
                  for (let rr = 0; rr < ROWS; rr++) {
                    nextG[rr][reel] = { ...nextGrid[rr][reel], highlight: false };
                  }
                  return nextG;
                });

                setReelsSpinning((prev) => {
                  const nextS = [...prev];
                  nextS[reel] = false;
                  return nextS;
                });
                stoppedCount++;
                if (stoppedCount === REELS) resolve();
              }
            } else {
              const fresh = cellForSpin(isFreeSpin, anteBet, mods.removeLowestFish);
              next[reel] = [
                { ...fresh, highlight: false },
                currentCol[0],
                currentCol[1],
                currentCol[2],
              ];
            }
            return next;
          });

          if (frameCount >= stopTimes[reel] && !isStopping) {
            isStopping = true;
          }
        }, baseFrameRate);
      }
    });

    await animateReels;

    const scatter = countSymbol(nextGrid, "scatter");
    const fishers = countSymbol(nextGrid, "fisher");
    const fishPack = collectFishValues(nextGrid);
    lineEval = evaluateLines(nextGrid, spinCost, isFreeSpin);

    const highlighted = nextGrid.map((row, rowIdx) =>
      row.map((cell, reelIdx) => ({ ...cell, highlight: lineEval.highlight.has(`${rowIdx}-${reelIdx}`) }))
    );

    setGrid(highlighted);

    let fishWin = 0;
    let payoutForThisSpin = lineEval.totalWin;

    if (isFreeSpin && fishers > 0 && fishPack.total > 0) {
      fishWin = normalizeMoney(fishPack.total * spinCost * currentFsMultiplier);
      payoutForThisSpin += fishWin;
      messageLocal = `Fisher sammelt ${normalizeMoney(fishPack.total).toFixed(2)}x Fischwerte × ${currentFsMultiplier} = $${formatMoney(fishWin)}`;
    } else if (!isFreeSpin && fishPack.total > 0 && shouldTriggerBaseCollect(fishPack.positions.length, anteBet)) {
      const collectMulti = pickWeighted<number>(BASE_COLLECT_MULTIS.map((m, idx) => [m, BASE_COLLECT_WEIGHTS[idx]]));
      fishWin = normalizeMoney(fishPack.total * spinCost * collectMulti);
      payoutForThisSpin += fishWin;
      messageLocal = `Basis-Collect! ${normalizeMoney(fishPack.total).toFixed(2)}x × ${collectMulti} = $${formatMoney(fishWin)}`;
    } else if (!isFreeSpin && fishPack.total > 0 && Math.random() < BOAT_WAKE_CHANCE_BASE) {
      const boatWin = normalizeMoney(fishPack.total * spinCost);
      payoutForThisSpin += boatWin;
      setBoatAwake(true);
      if (boatSleepTimeoutRef.current) clearTimeout(boatSleepTimeoutRef.current);
      boatSleepTimeoutRef.current = setTimeout(() => {
        setBoatAwake(false);
      }, 1600);
      messageLocal = `Boot-Fisher sammelt ${normalizeMoney(fishPack.total).toFixed(2)}x = $${formatMoney(boatWin)}`;
    }

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
            setFreeSpinsLeft((s) => s + extraSpins);
          }
          const cappedRetriggers = Math.min(nowRetriggers, maxIndex);
          setRetriggers(cappedRetriggers);
          const fsMulti = FS_MULTIPLIERS[cappedRetriggers];
          setCurrentFsMultiplier(fsMulti);
        }
      }

    updatedRoundPayout = normalizeMoney(pendingRoundPayout + payoutForThisSpin);
    setPendingRoundPayout(updatedRoundPayout);

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
      await sleep(350);
      return;
    }

      if (isFreeSpin) {
        const leftAfter = Math.max(0, freeSpinsLeft + gainedExtraSpinsThisCall - 1);
        setFreeSpinsLeft(leftAfter);

        if (leftAfter <= 0) {
          setPhase("idle");
          settleRound(pendingRoundStake, updatedRoundPayout);
        }
        await sleep(250);
        return;
      }
    } finally {
      isExecutingSpinRef.current = false;
      setIsExecutingSpin(false);
    }

    setPhase("idle");
    if (isPaidBaseSpin) {
      settleRound(pendingRoundStake, updatedRoundPayout);
    }
  };

  const startPaidSpin = async () => {
    if (!canPaidSpin) return;
    if (isExecutingSpinRef.current) return;
    if (betAmount <= 0) return;
    if (balance < spinCost) {
      return;
    }
    subtractFromBalance(spinCost);
    playAudio(audioRef.current.bet);
    setPendingRoundStake(spinCost);
    setPendingRoundPayout(0);
    const result = await executeSpin({ isPaidBaseSpin: true });
    return result;
  };

  const handleMainSpin = async () => {
    if (isExecutingSpinRef.current) return;
    setLastWin(0);
    if (phase === "free") {
      await spinFree();
    } else {
      await startPaidSpin();
    }
  };

  const mainDisabled =
    isExecutingSpin || (phase === "free" ? freeSpinsLeft <= 0 : phase !== "idle" || balance < spinCost || betAmount <= 0);

  

  const spinFree = async () => {
    if (phase !== "free" || freeSpinsLeft <= 0) return;
    if (isExecutingSpinRef.current) return;
    await executeSpin({ isPaidBaseSpin: false });
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

    setPendingRoundStake(buyBonusCost);
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
        <div className="w-full lg:w-60 flex flex-col gap-3 bg-[#0f212e] p-2 sm:p-3 rounded-xl h-fit text-xs">
          <div className="space-y-2">
            <label className="text-xs font-bold text-[#b1bad3] uppercase tracking-wider">Bet Amount</label>
            <div className="relative">
              <div className="absolute left-3 top-1/2 -translate-y-1/2 text-[#b1bad3] font-mono">$</div>
              <input
                type="number"
                value={betInput}
                onChange={(e) => setBetInput(e.target.value)}
                onBlur={() => {
                  const val = Number(betInput.replace(",", "."));
                  const safe = Number.isFinite(val) ? Math.max(0, val) : 0;
                  setBetAmount(normalizeMoney(safe));
                  setBetInput(String(normalizeMoney(safe)));
                }}
                disabled={phase !== "idle"}
                className="w-full bg-[#0f212e] border border-[#2f4553] rounded-md py-2 pl-7 pr-4 text-white font-mono focus:outline-none focus:border-[#00e701] transition-colors"
              />
            </div>
            <div className="grid grid-cols-3 gap-2">
              <button
                onClick={() => {
                  const n = normalizeMoney(betAmount / 2);
                  setBetAmount(n);
                  setBetInput(String(n));
                }}
                disabled={phase !== "idle"}
                className="bg-[#2f4553] hover:bg-[#3e5666] text-xs py-1 rounded text-[#b1bad3]"
              >
                1/2
              </button>
              <button
                onClick={() => {
                  const n = normalizeMoney(betAmount * 2);
                  setBetAmount(n);
                  setBetInput(String(n));
                }}
                disabled={phase !== "idle"}
                className="bg-[#2f4553] hover:bg-[#3e5666] text-xs py-1 rounded text-[#b1bad3]"
              >
                2x
              </button>
              <button
                onClick={() => {
                  const n = normalizeMoney(balance);
                  setBetAmount(n);
                  setBetInput(String(n));
                }}
                disabled={phase !== "idle"}
                className="bg-[#2f4553] hover:bg-[#3e5666] text-xs py-1 rounded text-[#b1bad3]"
              >
                Max
              </button>
            </div>
          </div>

          <div className="p-3 bg-[#132330] rounded-lg border border-[#2f4553] space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-[10px] text-[#b1bad3] font-bold uppercase">Ante Bet (+50%)</span>
              <button
                onClick={() => setAnteBet(!anteBet)}
                disabled={phase !== "idle"}
                className={`w-10 h-5 rounded-full relative transition-colors ${anteBet ? "bg-[#00e701]" : "bg-[#2f4553]"}`}
              >
                <div className={`absolute top-0.5 w-4 h-4 bg-white rounded-full transition-all ${anteBet ? "left-5.5" : "left-0.5"}`} />
              </button>
            </div>
            {!anteBet && (
                <button
                onClick={buyBonus}
                disabled={anteBet || phase !== "idle" || betAmount <= 0 || balance < buyBonusCost}
                className="w-full py-1 text-[9px] font-bold uppercase bg-[#f59e0b]/10 text-[#f59e0b] border border-[#f59e0b]/20 rounded hover:bg-[#f59e0b]/20"
                >
                {`Bonus Buy $${formatMoney(buyBonusCost)}`}
                </button>
            )}
          </div>

          <button
            onClick={handleMainSpin}
            disabled={mainDisabled}
            className="w-full bg-[#00e701] hover:bg-[#00c201] disabled:opacity-50 disabled:cursor-not-allowed text-black py-3 rounded-md font-bold text-lg shadow-[0_0_20px_rgba(0,231,1,0.2)] transition-all active:scale-95 flex items-center justify-center gap-2"
          >
            {isExecutingSpin ? "Playing" : "Bet"}
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
          <div className="rounded-2xl overflow-hidden p-4 sm:p-8 relative bg-[#0f212e]">
            {phase === "free" ? (
              <div className="mb-6 min-h-28 rounded-2xl p-3 sm:p-4">
                <div className="mb-3 flex items-center justify-center gap-2">
                  <div className="rounded-xl px-3 py-2 text-xs text-[#b9d0df]">
                    Free spins: <span className="text-[#00e701] font-black">{freeSpinsLeft}</span>
                  </div>
                  <div className="rounded-xl px-3 py-2 text-xs text-[#b9d0df] flex items-center gap-2">
                    <div>Fisher:</div>
                    <div className="text-[#7dd3fc] font-black">{fisherCollected}</div>
                    <div className="px-2 rounded-full font-black text-[#b5ffbf] inline-flex items-center gap-1">
                      x{FS_MULTIPLIERS[Math.min(retriggers, FS_MULTIPLIERS.length - 1)]}
                    </div>
                  </div>
                </div>
              </div>
            ) : null}

            <div className="relative mx-auto max-w-200 pt-32 sm:pt-40 pb-3 sm:pb-4 px-3 sm:px-4 rounded-2xl overflow-hidden">
              <div className="absolute inset-0 pointer-events-none z-0">
                <div className="absolute inset-0 jungle-underwater-bg" />

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
                    <path d="M220 260 C250 230, 300 230, 330 260 C300 295, 255 294, 220 260 Z" />
                    <circle cx="235" cy="258" r="4" fill="#052436" fillOpacity="0.75" />
                    <path d="M810 315 C840 287, 888 286, 915 315 C888 349, 842 348, 810 315 Z" />
                    <circle cx="826" cy="313" r="4" fill="#052436" fillOpacity="0.75" />
                    <path d="M530 230 C552 208, 586 208, 610 230 C586 255, 554 255, 530 230 Z" />
                    <circle cx="547" cy="229" r="4" fill="#052436" fillOpacity="0.75" />
                  </g>
                </svg>

                <div className="absolute left-0 right-0 top-20 sm:top-32 h-2 sm:h-3 water-surface" />

                <div className="absolute top-2 sm:top-4 left-[16%] sm:left-[20%] -translate-x-1/2 z-20 pointer-events-none boat-fisher-wrap">
                  {!boatAwake && phase !== "free" && (
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
                      <line x1="110" y1="0" x2="110" y2="80" stroke="white" strokeOpacity="0.4" strokeWidth="0.5" />
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

                <div className="absolute bottom-0 left-0 right-0 h-20 sm:h-24 seabed-layer">
                  <svg className="absolute inset-0 w-full h-full" viewBox="0 0 1200 140" preserveAspectRatio="none" aria-hidden>
                    <path d="M0 80 C120 60, 210 100, 320 84 C450 66, 520 112, 640 90 C780 65, 860 108, 980 86 C1075 70, 1145 92, 1200 84 L1200 140 L0 140 Z" fill="#6e5a35" fillOpacity="0.45" />
                    <path d="M0 94 C150 76, 250 110, 360 98 C490 84, 570 120, 680 100 C790 82, 900 116, 1020 98 C1080 90, 1145 100, 1200 96 L1200 140 L0 140 Z" fill="#8d7040" fillOpacity="0.5" />
                  </svg>
                </div>
              </div>

              {phase === "prefree" && (
                <div className="absolute inset-0 z-30 flex items-center justify-center p-3 sm:p-6">
                  <div className="w-full max-w-140 aspect-square rounded-2xl border border-[#2f4553] bg-[#112331]/95 p-3 sm:p-5 shadow-[0_0_40px_rgba(0,0,0,0.45)] flex flex-col">
                    <div className="flex items-center justify-between gap-2 mb-3">
                      <div className="text-[#d2ecff] font-bold text-sm uppercase tracking-wide">Tonkrüge öffnen</div>
                      <div className="text-[11px] text-[#8ab8d4] text-right">
                        Freispiele Bonus: <span className="text-[#9effc1] font-black">+{preFreeState?.extraSpins ?? 0}</span><br />
                        Fisher Start: <span className="text-[#7dd3fc] font-black">+{preFreeState?.extraFishers ?? 0}</span>
                      </div>
                    </div>
                    <div className="flex-1 grid grid-cols-4 gap-2">
                      {(preFreeState?.tokens ?? []).map((token, index) => {
                        const opened = !!preFreeState?.revealed[index];
                        return (
                          <button
                            key={`pot-${index}`}
                            type="button"
                            onClick={() => handlePreFreePick(index)}
                            disabled={opened || preFreeState?.done}
                            className={`h-full min-h-16 rounded-xl border transition-all relative overflow-hidden ${opened ? "border-[#5d7f91] bg-[#173341]" : "border-[#3b5b6d] bg-[#143142] hover:bg-[#1b4157]"}`}
                          >
                            {!opened ? (
                              <svg className="w-full h-full" viewBox="0 0 120 70" aria-hidden>
                                <ellipse cx="60" cy="54" rx="27" ry="10" fill="#6a492f" />
                                <path d="M33 22 C36 46, 84 46, 87 22 L80 54 L40 54 Z" fill="#9b6a3a" />
                                <ellipse cx="60" cy="22" rx="27" ry="8" fill="#ba8751" />
                                <ellipse cx="60" cy="20" rx="18" ry="5" fill="#7a5432" />
                              </svg>
                            ) : (
                              <div className="w-full h-full flex items-center justify-center">
                                {token === "shoe" ? (
                                  <svg className="w-10 h-10" viewBox="0 0 64 64" aria-hidden>
                                    <path d="M12 42 C20 34, 24 34, 30 38 C37 43, 45 41, 52 40 L52 50 L12 50 Z" fill="#533b2e" />
                                    <path d="M9 50 L55 50 C56 54, 54 57, 49 57 L15 57 C10 57, 8 54, 9 50 Z" fill="#2c2c2c" />
                                  </svg>
                                ) : token === "fisher" ? (
                                  <div className="text-3xl leading-none">🤠</div>
                                ) : (
                                  <div className="text-[#9effc1] font-black text-lg">
                                    +{token === "fs1" ? 1 : token === "fs2" ? 2 : token === "fs3" ? 3 : 4}
                                  </div>
                                )}
                              </div>
                            )}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                </div>
              )}

              <div className="grid grid-cols-5 gap-1.5 sm:gap-4 relative z-10">
                {Array.from({ length: REELS }, (_, reel) => (
                  <div key={reel} className="relative h-72 sm:h-96">
                    {reel < REELS - 1 && (
                      <div className="absolute -right-2 sm:-right-3 top-8 sm:top-12 bottom-0 w-4 sm:w-6 pointer-events-none z-20 bubble-separator">
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
                      </div>
                    )}
                    <div className="absolute inset-x-0 top-4 sm:top-6 bottom-2 sm:bottom-4 overflow-hidden">
                      <div
                        key={reelsSpinning[reel] ? `spinning-${reel}-${spinKey}` : `static-${reel}`}
                        className={`flex flex-col relative w-full ${reelsSpinning[reel] ? "slot-reel-rolling slot-rolling" : ""}`}
                        style={reelsSpinning[reel] ? { ['--dur' as any]: `${reelDurations[reel]}ms` } : undefined}
                      >
                      {reelsSpinning[reel] ? (
                        reelFrames[reel].map((cell, rowIdx) => (
                          <div
                            key={`spin-${reel}-${rowIdx}-${spinKey}`}
                            className="h-24 sm:h-32 flex items-center justify-center shrink-0 w-full"
                          >
                            <div className="transform-gpu">{renderSymbol(cell, displaySpinCost)}</div>
                          </div>
                        ))
                      ) : (
                        grid.map((row, rowIdx) => {
                          const cell = row[reel];
                          return (
                            <div
                              key={`static-${reel}-${rowIdx}`}
                              className={`h-24 sm:h-32 flex items-center justify-center shrink-0 w-full relative ${
                                cell.highlight
                                  ? "z-10 scale-105 transition-all duration-300"
                                  : "transition-all duration-300"
                              }`}
                            >
                                <div className={`${cell.highlight ? "slot-cell-pop" : "transition-transform"}`}>{renderSymbol(cell, displaySpinCost)}</div>
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

          <GameRecordsPanel gameId="slot"/>
        </div>
      </div>

      <style jsx global>{`
        @keyframes slotReelRollTick {
          0% { transform: translateY(-25%); }
          100% { transform: translateY(0%); }
        }
        @keyframes slotCellPop {
          0% { transform: scale(1); }
          50% { transform: scale(1.15); filter: brightness(1.2) contrast(1.1); }
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
          box-shadow: 0 2px 8px rgba(163, 239, 255, 0.22), 0 0 20px rgba(138, 222, 246, 0.18);
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
        .bubble-separator .b1 { width: 4px; height: 4px; animation-duration: 3.2s; animation-delay: 0s; }
        .bubble-separator .b2 { width: 7px; height: 7px; animation-duration: 4.5s; animation-delay: 0.8s; left: 30%; }
        .bubble-separator .b3 { width: 5px; height: 5px; animation-duration: 3.8s; animation-delay: 1.5s; left: 70%; }
        .bubble-separator .b4 { width: 10px; height: 10px; animation-duration: 5.2s; animation-delay: 2.2s; left: 40%; }
        .bubble-separator .b5 { width: 6px; height: 6px; animation-duration: 4.1s; animation-delay: 3.1s; left: 60%; }
        .bubble-separator .b6 { width: 4px; height: 4px; animation-duration: 3.5s; animation-delay: 0.4s; left: 20%; }
        .bubble-separator .b7 { width: 8px; height: 8px; animation-duration: 4.8s; animation-delay: 1.2s; left: 80%; }
        .bubble-separator .b8 { width: 5px; height: 5px; animation-duration: 3.9s; animation-delay: 2.5s; left: 50%; }
        .bubble-separator .b9 { width: 6px; height: 6px; animation-duration: 4.3s; animation-delay: 0.2s; left: 10%; }
        .bubble-separator .b10 { width: 4px; height: 4px; animation-duration: 3.1s; animation-delay: 1.8s; left: 90%; }
        .bubble-separator .b11 { width: 9px; height: 9px; animation-duration: 5.5s; animation-delay: 2.9s; left: 25%; }
        .bubble-separator .b12 { width: 5px; height: 5px; animation-duration: 3.7s; animation-delay: 3.4s; left: 75%; }
        .bubble-separator .b13 { width: 7px; height: 7px; animation-duration: 4.6s; animation-delay: 0.6s; left: 45%; }
        .bubble-separator .b14 { width: 4px; height: 4px; animation-duration: 3.3s; animation-delay: 1.3s; left: 55%; }
        .bubble-separator .b15 { width: 8px; height: 8px; animation-duration: 4.9s; animation-delay: 2.7s; left: 35%; }
        .bubble-separator .b16 { width: 5px; height: 5px; animation-duration: 3.4s; animation-delay: 1.0s; left: 15%; }
        .bubble-separator .b17 { width: 4px; height: 4px; animation-duration: 4.0s; animation-delay: 2.1s; left: 85%; }
        .bubble-separator .b18 { width: 9px; height: 9px; animation-duration: 5.1s; animation-delay: 0.5s; left: 65%; }
        .bubble-separator .b19 { width: 6px; height: 6px; animation-duration: 4.2s; animation-delay: 1.7s; left: 25%; }
        .bubble-separator .b20 { width: 4px; height: 4px; animation-duration: 3.6s; animation-delay: 3.3s; left: 75%; }

        @keyframes bubbleRise {
          0% { transform: translateY(0) scale(0.8); opacity: 0; }
          10% { opacity: 0.7; }
          80% { opacity: 0.7; transform: translateY(-300px) scale(1); }
          90% { opacity: 0.8; transform: translateY(-330px) scale(1.6); }
          100% { transform: translateY(-345px) scale(2.2); opacity: 0; }
        }
        @keyframes bubbleSway {
          from { margin-left: -5px; }
          to { margin-left: 5px; }
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