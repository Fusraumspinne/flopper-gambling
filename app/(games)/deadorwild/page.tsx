"use client";

import React, { useMemo, useState } from "react";
import { useWallet } from "@/components/WalletProvider";
import { useSoundVolume } from "@/components/SoundVolumeProvider";
import GameRecordsPanel from "@/components/GameRecordsPanel";
import PlayArrow from "@mui/icons-material/PlayArrow";

type GamePhase = "idle" | "spinning" | "free";
type PaySymbol = "🌵" | "🦅" | "🐎" | "💰" | "🤠" | "🏜️";
type Cell = { kind: "symbol"; symbol: PaySymbol } | { kind: "scatter" } | { kind: "vs" };
type Position = [number, number];
type DuelSide = "top" | "bottom";

type ReelBannerDuel = {
  reel: number;
  topMultiplier: number;
  bottomMultiplier: number;
  winner: DuelSide | null;
  appliedMultiplier: number;
  shootingPhase: DuelSide | false;
  resolving: boolean;
};

type LineConnection = {
  symbol: PaySymbol;
  reelsHit: number;
  ways: number;
  bannerMultiplier: number;
  payout: number;
  positions: Position[];
};

const ROWS = 5;
const COLS = 5;
const MIN_REELS_FOR_WIN = 3;
const FREE_SPINS_AWARD = 15;
const FREE_SPIN_MAX_WIN_MULTIPLIER = 100000;
const RIGHT_CONNECTION_EXP_BASE = 2;

const PAY_SYMBOLS: PaySymbol[] = ["🌵", "🦅", "🐎", "💰", "🤠", "🏜️"];

const SYMBOL_WEIGHTS: Record<PaySymbol, number> = {
  "🌵": 24,
  "🦅": 22,
  "🐎": 18,
  "💰": 14,
  "🤠": 12,
  "🏜️": 10,
};

const SCATTER_WEIGHT = 1.2;

const SYMBOL_BASE_MULTIS: Record<PaySymbol, number> = {
  "🌵": 0.0035,
  "🦅": 0.006,
  "🐎": 0.012,
  "💰": 0.0175,
  "🤠": 0.03,
  "🏜️": 0.06,
};

const VS_PERCENT_CHANCES = [
  0.2,  
  0.05,  
  0.005, 
  0.0005,
  0.00005 
];

const BANNER_MULTI_POOL = [2, 3, 4, 5, 6, 8, 10, 12, 15, 20, 25, 50];
const BANNER_MULTI_WEIGHTS = [28, 23, 17, 12, 8, 5, 3.2, 2.3, 1.1, 0.6, 0.22, 0.05];

const normalizeMoney = (value: number) => {
  if (!Number.isFinite(value)) return 0;
  const rounded = Math.round((value + Number.EPSILON) * 100) / 100;
  return Object.is(rounded, -0) ? 0 : rounded;
};

const formatMoney = (value: number) =>
  normalizeMoney(value).toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });

const sleep = (ms: number) => new Promise((resolve) => window.setTimeout(resolve, ms));

function toPosKey(row: number, col: number) {
  return `${row}-${col}`;
}

function pickWeighted<T extends string | number>(entries: [T, number][]) {
  const total = entries.reduce((acc, [, w]) => acc + Math.max(0, w), 0);
  let roll = Math.random() * total;
  for (const [item, weight] of entries) {
    roll -= Math.max(0, weight);
    if (roll <= 0) return item;
  }
  return entries[entries.length - 1][0];
}

function randomCell(anteBet: boolean): Cell {
  const table: [string, number][] = [
    ...PAY_SYMBOLS.map((symbol) => [symbol, SYMBOL_WEIGHTS[symbol]] as [string, number]),
    ["SCATTER", anteBet ? SCATTER_WEIGHT * 1.2 : SCATTER_WEIGHT],
  ];

  const picked = pickWeighted(table);
  if (picked === "SCATTER") return { kind: "scatter" };
  return { kind: "symbol", symbol: picked as PaySymbol };
}

function buildGrid(anteBet: boolean, forceScatters: boolean = false, bannerReels: number[] = []) {
  const grid: Cell[][] = Array.from({ length: ROWS }, () => 
    Array.from({ length: COLS }, () => randomCell(anteBet))
  );

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

  /* VS Symbole werden jetzt ausschließlich über bannerReels gesteuert */
  for (const reel of bannerReels) {
    const randomRow = Math.floor(Math.random() * ROWS);
    grid[randomRow][reel] = { kind: "vs" };
  }

  return grid;
}

function getVSReelsFromGrid(grid: Cell[][]) {
  const reels = new Set<number>();
  for (let col = 0; col < COLS; col++) {
    for (let row = 0; row < ROWS; row++) {
      if (grid[row][col].kind === "vs") {
        reels.add(col);
        break;
      }
    }
  }
  return [...reels].sort((a, b) => a - b);
}

function gridToReelFrames(sourceGrid: Cell[][], anteBet: boolean) {
  return Array.from({ length: COLS }, (_, col) => {
    const base = Array.from({ length: ROWS }, (_, row) => sourceGrid[row][col]);
    return [randomCell(anteBet), ...base];
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

function randomBannerMultiplier() {
  const table = BANNER_MULTI_POOL.map((value, idx) => [value, BANNER_MULTI_WEIGHTS[idx]] as [number, number]);
  return pickWeighted(table);
}

function rollWildBannerReels() {
  let count = 0;
  const roll = Math.random();
  let cumulative = 0;

  for (let i = 0; i < VS_PERCENT_CHANCES.length; i++) {
    const chance = VS_PERCENT_CHANCES[i];
    cumulative += chance;
    if (roll < cumulative) {
      count = i + 1;
      break;
    }
  }

  if (count === 0) return [];

  const availableReels = [0, 1, 2, 3, 4];
  const chosenReels: number[] = [];

  for (let i = 0; i < count && availableReels.length > 0; i++) {
    const idx = Math.floor(Math.random() * availableReels.length);
    chosenReels.push(availableReels.splice(idx, 1)[0]);
  }

  return chosenReels.sort((a, b) => a - b);
}

function buildDuelBannerMap(reels: number[], unresolved: boolean) {
  const out: Record<number, ReelBannerDuel> = {};
  for (const reel of reels) {
    const top = randomBannerMultiplier();
    const bottom = randomBannerMultiplier();
    const winner: DuelSide = Math.random() < 0.5 ? "top" : "bottom";
    out[reel] = {
      reel,
      topMultiplier: top,
      bottomMultiplier: bottom,
      winner: unresolved ? null : winner,
      appliedMultiplier: unresolved ? 1 : winner === "top" ? top : bottom,
      shootingPhase: false,
      resolving: unresolved,
    };
  }
  return out;
}

function makeUnresolvedFromResolved(resolvedMap: Record<number, ReelBannerDuel>) {
  const unresolvedMap: Record<number, ReelBannerDuel> = {};
  for (const key of Object.keys(resolvedMap)) {
    const reel = Number(key);
    const duel = resolvedMap[reel];
    unresolvedMap[reel] = {
      ...duel,
      winner: null,
      appliedMultiplier: 1,
      shootingPhase: false,
      resolving: true,
    };
  }
  return unresolvedMap;
}

function collectMatchesForReel(grid: Cell[][], reel: number, symbol: PaySymbol, bannerMap: Record<number, ReelBannerDuel>) {
  const banner = bannerMap[reel];
  if (banner && banner.winner !== null) {
    return Array.from({ length: ROWS }, (_, row) => [row, reel] as Position);
  }

  const matches: Position[] = [];
  for (let row = 0; row < ROWS; row++) {
    const cell = grid[row][reel];
    if (cell.kind === "symbol" && cell.symbol === symbol) {
      matches.push([row, reel]);
    }
  }
  return matches;
}

function evaluateConnections(grid: Cell[][], bannerMap: Record<number, ReelBannerDuel>, betAmount: number, isFreeSpin: boolean) {
  const connections: LineConnection[] = [];

  for (const symbol of PAY_SYMBOLS) {
    const reelMatches: Position[][] = [];

    for (let reel = 0; reel < COLS; reel++) {
      const matches = collectMatchesForReel(grid, reel, symbol, bannerMap);
      if (matches.length === 0) break;
      reelMatches.push(matches);
    }

    if (reelMatches.length < MIN_REELS_FOR_WIN) continue;

    const reelsHit = reelMatches.length;
    const ways = reelMatches.reduce((acc, positions) => acc * positions.length, 1);
    const rightExponential = RIGHT_CONNECTION_EXP_BASE ** (reelsHit - MIN_REELS_FOR_WIN);

    let bannerMultiplier = 1;
    for (let reel = 0; reel < reelsHit; reel++) {
      const duel = bannerMap[reel];
      if (duel && duel.winner !== null) {
        bannerMultiplier *= duel.appliedMultiplier;
      }
    }

    const baseRate = SYMBOL_BASE_MULTIS[symbol];
    const payout = normalizeMoney(betAmount * baseRate * ways * rightExponential * bannerMultiplier);

    const positions = reelMatches.flat();
    connections.push({ symbol, reelsHit, ways, bannerMultiplier, payout, positions });
  }

  const total = normalizeMoney(connections.reduce((acc, c) => acc + c.payout, 0));
  const highlighted = new Set<string>();
  for (const line of connections) {
    for (const [row, col] of line.positions) {
      highlighted.add(toPosKey(row, col));
    }
  }

  return { connections, total, highlighted };
}

function renderCell(cell: Cell, blurred: boolean = false) {
  if (cell.kind === "scatter") return <span className={blurred ? "blur-[1.2px]" : ""}>⭐</span>;
  if (cell.kind === "vs") {
    return (
      <div className={`w-full h-full flex items-center justify-center bg-linear-to-br from-red-600 to-red-900 rounded-sm border-2 border-red-300 shadow-inner overflow-hidden ${blurred ? "blur-[1.2px]" : ""}`}>
        <span className="text-white font-black italic transform -rotate-10">
          VS
        </span>
      </div>
    );
  }
  return <span className={`select-none leading-none ${blurred ? "blur-[1.2px]" : ""}`}>{cell.symbol}</span>;
}

function ReelWildBanner({ duel }: { duel: ReelBannerDuel }) {
  const isExpanded = duel.resolving || duel.winner !== null;

  return (
    <div className={`absolute inset-0 z-20 pointer-events-none transition-all duration-500 ease-out origin-center ${isExpanded ? "scale-y-100 opacity-100 shadow-[0_0_40px_rgba(0,0,0,0.4)]" : "scale-y-0 opacity-0"}`}>
      <div className={`absolute inset-0 transition-opacity duration-300 ${duel.winner !== null ? "opacity-0" : "opacity-100"}`}>
        <div className="absolute inset-0.5 rounded-sm border-[2.5px] border-[#2a1308] bg-[#d2b48c] overflow-hidden shadow-2xl flex flex-col justify-between items-center grainy-bg">
          <div className="absolute inset-0 opacity-[0.03] pointer-events-none bg-[url('https://www.transparenttextures.com/patterns/cardboard-flat.png')]" />
          
          <div className={`flex-[0.45] w-full relative flex flex-col items-center justify-start pt-1 transition-all duration-300 ${duel.shootingPhase === "bottom" ? "opacity-30 grayscale saturate-0" : "opacity-100"}`}>
            <div className="text-[28px] font-black text-white tracking-tighter drop-shadow-[0_2px_4px_rgba(0,0,0,0.8)] filter relative z-30" style={{ WebkitTextStroke: "1px #111", paintOrder: "stroke" }}>
              <span className="absolute inset-0 text-transparent" style={{ WebkitTextStroke: "4px #c53030", zIndex: -1 }}>{duel.topMultiplier}X</span>
              {duel.topMultiplier}X
            </div>
            
            <div className={`absolute top-6 flex flex-col items-center transition-all duration-60 origin-center ${duel.shootingPhase === 'top' ? 'translate-y-2 scale-110' : ''}`}>
              <svg viewBox="0 0 100 100" className="w-24 h-24 drop-shadow-2xl z-10" preserveAspectRatio="xMidYMid meet">
                <path d="M22 42 C12 55, 12 85, 8 95 L92 95 C88 85, 88 55, 78 42 Q50 35 22 42" fill="#241205" />
                <path d="M22 42 Q50 62, 78 42" fill="none" stroke="#1a0d04" strokeWidth="3" opacity="0.6" />
                
                <path d="M22 42 Q30 38 40 40 M78 42 Q70 38 60 40" stroke="#000" strokeWidth="1" opacity="0.4" />

                <path d="M40 45 Q50 55, 60 45 L50 60 Z" fill="#7f1d1d" />

                <ellipse cx="50" cy="30" rx="38" ry="14" fill="#180b03" transform="rotate(-2 50 30)" />
                <path d="M30 28 C30 -2, 70 -2, 70 28 Q50 32 30 28" fill="#2d1606" />
                <path d="M30 26 Q50 30, 70 26" fill="none" stroke="#000" strokeWidth="4" opacity="0.5" />
                
                <path d="M75 48 C85 55, 85 75, 65 82" fill="none" stroke="#241205" strokeWidth="15" strokeLinecap="round" />
              </svg>
              
              <div className={`absolute -bottom-6 -right-4 w-16 h-16 z-20 transition-all duration-60 origin-[20%_80%] ${duel.shootingPhase === 'top' ? 'rotate-[-25deg] scale-125' : 'rotate-10'}`}>
                <svg viewBox="0 0 60 60">
                  <path d="M10 45 L18 20 L40 25 L35 50 Z" fill="#321e14" /> 
                  <path d="M15 22 L55 22 L55 30 L15 32 Z" fill="#1a1a1a" /> 
                  <circle cx="28" cy="27" r="8" fill="#222" stroke="#111" strokeWidth="1" /> 
                  <path d="M20 27 L36 27" stroke="#333" strokeWidth="4" strokeDasharray="2 1" /> 
                  <path d="M52 20 L55 22 L52 24 Z" fill="#111" /> 
                  <path d="M20 40 Q25 45 30 40" fill="none" stroke="#222" strokeWidth="2" /> 
                  <path d="M12 20 Q10 15 15 12" fill="none" stroke="#222" strokeWidth="2" /> 
                </svg>
              </div>
            </div>
            
            {duel.shootingPhase === "top" && (
              <div className="absolute top-27.5 left-[60%] z-40 animate-muzzle-flash pointer-events-none">
                <div className="w-14 h-14 bg-yellow-300 rounded-full blur-[10px] absolute -translate-x-1/2 -translate-y-1/2" />
                <div className="w-8 h-8 bg-white rounded-full absolute -translate-x-1/2 -translate-y-1/2 shadow-[0_0_20px_white]" />
                <div className="w-1.5 h-50 bg-linear-to-b from-yellow-200 via-orange-500 to-transparent absolute top-4 -left-0.75 origin-top animate-bullet-drop opacity-100 shadow-[0_0_15px_rgba(255,165,0,0.8)]" />
              </div>
            )}
          </div>

          <div className="absolute top-[46%] left-0 w-full h-[8%] flex items-center justify-center z-10">
             <div className="w-full h-0.5 bg-linear-to-r from-transparent via-[#5d3a1a] to-transparent opacity-60 absolute" />
             <div className={`bg-red-800 text-white font-black px-4 py-0.5 rounded shadow-2xl border-2 border-red-500/50 transform -rotate-12 italic text-base tracking-[0.2em] transition-all duration-300 ${duel.shootingPhase ? 'scale-150 brightness-150 rotate-0' : 'scale-100 opacity-80'}`}>VS</div>
          </div>

          <div className={`flex-[0.45] w-full relative flex flex-col items-center justify-end pb-1 transition-all duration-300 ${duel.shootingPhase === "top" ? "opacity-30 grayscale saturate-0" : "opacity-100"}`}>
            {duel.shootingPhase === "bottom" && (
              <div className="absolute bottom-27.5 left-[40%] z-40 animate-muzzle-flash pointer-events-none">
                <div className="w-14 h-14 bg-yellow-300 rounded-full blur-[10px] absolute -translate-x-1/2 -translate-y-1/2" />
                <div className="w-8 h-8 bg-white rounded-full absolute -translate-x-1/2 -translate-y-1/2 shadow-[0_0_20px_white]" />
                <div className="w-1.5 h-50 bg-linear-to-t from-yellow-200 via-orange-500 to-transparent absolute bottom-4 -left-0.75 origin-bottom animate-bullet-rise opacity-100 shadow-[0_0_15px_rgba(255,165,0,0.8)]" />
              </div>
            )}

            <div className={`absolute bottom-6 flex flex-col items-center transition-all duration-60 origin-center ${duel.shootingPhase === 'bottom' ? '-translate-y-2 scale-110' : ''}`}>
              <div className={`absolute -top-10 -left-6 w-16 h-16 z-20 transition-all duration-60 origin-[80%_80%] ${duel.shootingPhase === 'bottom' ? 'rotate-155 scale-125' : 'rotate-180'}`}>
                <svg viewBox="0 0 60 60">
                  <path d="M10 45 L18 20 L40 25 L35 50 Z" fill="#2d2d2d" /> 
                  <path d="M15 22 L55 22 L55 30 L15 32 Z" fill="#111" /> 
                  <circle cx="28" cy="27" r="8" fill="#1a1a1a" stroke="#000" strokeWidth="1" />
                  <path d="M20 27 L36 27" stroke="#333" strokeWidth="4" strokeDasharray="2 1" />
                  <path d="M52 20 L55 22 L52 24 Z" fill="#000" />
                  <path d="M20 40 Q25 45 30 40" fill="none" stroke="#111" strokeWidth="2" />
                </svg>
              </div>

              <svg viewBox="0 0 100 100" className="w-24 h-24 drop-shadow-2xl z-10" preserveAspectRatio="xMidYMid meet">
                <path d="M22 58 C12 45, 8 15, 8 5 L92 5 C92 15, 88 45, 78 58 Q50 65 22 58" fill="#1c0f08" />
                <path d="M22 58 Q50 38, 78 58" fill="none" stroke="#0d0704" strokeWidth="3" opacity="0.6" />

                <path d="M30 72 C30 102, 70 102, 70 72 Q50 68 30 72" fill="#2d1606" />
                <ellipse cx="50" cy="70" rx="38" ry="14" fill="#180b03" transform="rotate(2 50 70)" />
                <path d="M32 76 Q50 72, 68 76" fill="none" stroke="#000" strokeWidth="4" opacity="0.5" />

                <path d="M25 52 C15 45, 15 25, 35 18" fill="none" stroke="#1c0f08" strokeWidth="15" strokeLinecap="round" />
              </svg>
            </div>

            <div className="text-[28px] font-black text-white tracking-tighter drop-shadow-[0_2px_4px_rgba(0,0,0,0.8)] filter z-30 relative" style={{ WebkitTextStroke: "1px #111", paintOrder: "stroke" }}>
              <span className="absolute inset-0 text-transparent" style={{ WebkitTextStroke: "4px #c53030", zIndex: -1 }}>{duel.bottomMultiplier}X</span>
              {duel.bottomMultiplier}X
            </div>
          </div>
        </div>
      </div>

      {duel.winner !== null && (
        <div className="absolute inset-0.5 rounded-sm border-[3px] border-[#991b1b] bg-[#450a0a] overflow-hidden shadow-[inset_0_0_40px_rgba(220,38,38,0.6),0_0_30px_rgba(220,38,38,0.5)] flex items-center justify-center animate-banner-arrive">
          <div className="absolute inset-0 bg-linear-to-b from-red-900/40 via-red-600/20 to-red-900/40" />
          
          <div className="absolute inset-0 flex items-center justify-center opacity-80 mix-blend-screen overflow-hidden scale-250">
            <svg viewBox="0 -10 100 135" preserveAspectRatio="xMidYMid meet">
              <defs>
                <linearGradient id="skull-grad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#ef4444" />
                  <stop offset="50%" stopColor="#dc2626" />
                  <stop offset="100%" stopColor="#991b1b" />
                </linearGradient>
              </defs>
              
              <g transform="translate(0, 5)">
                <path d="M50 0 C15 0 5 25 5 50 C5 70 20 80 35 80 C40 80 45 77 50 77 C55 77 60 80 65 80 C80 80 95 70 95 50 C95 25 85 0 50 0 Z" fill="url(#skull-grad)" />
                <path d="M45 15 L40 35 M55 12 L60 30" stroke="#450a0a" strokeWidth="2" opacity="0.5" />
                
                <path d="M25 40 C35 38 42 45 42 55 C42 65 30 70 20 55 C15 45 15 42 25 40 Z" fill="#1b1b1b" />
                <path d="M75 40 C65 38 58 45 58 55 C58 65 70 70 80 55 C85 45 85 42 75 40 Z" fill="#1b1b1b" />
                
                <path d="M50 62 L42 75 L58 75 Z" fill="#1b1b1b" />
                
                <path d="M30 80 L35 105 C40 115 60 115 65 105 L70 80 Z" fill="url(#skull-grad)" />
                
                <path d="M40 80 L40 103 M45 80 L45 106 M50 80 L50 107 M55 80 L55 106 M60 80 L60 103" stroke="#450a0a" strokeWidth="2" />
                <path d="M30 92 L70 92" stroke="#450a0a" strokeWidth="2" />
              </g>
            </svg>
          </div>
          
          <div className="relative z-20 flex flex-col items-center">
            <div className="transform scale-[1.3] font-black tracking-tighter text-white drop-shadow-[0_4px_8px_rgba(0,0,0,1)] text-[36px] leading-none mb-1">
              <span className="absolute inset-0 text-transparent" style={{ WebkitTextStroke: "10px #000", zIndex: -2 }}>{duel.appliedMultiplier}X</span>
              <span className="absolute inset-0 text-transparent" style={{ WebkitTextStroke: "4px #991b1b", zIndex: -1 }}>{duel.appliedMultiplier}X</span>
              <span style={{ WebkitTextStroke: "1px #000", paintOrder: "stroke" }}>{duel.appliedMultiplier}X</span>
            </div>
            <div className="bg-black/40 px-2 py-0.5 rounded text-[10px] uppercase font-bold text-red-100 tracking-[0.2em]">Wild</div>
          </div>
          
          <div className="absolute inset-0 bg-red-500/10 animate-pulse mix-blend-overlay" />
        </div>
      )}
    </div>
  );
}

function WesternBackground() {
  return (
    <div className="absolute inset-0 z-0 pointer-events-none overflow-hidden">
      <div className="absolute inset-0 bg-linear-to-b from-[#4d2c12] via-[#2d180a] to-[#0a0502]" />

      <svg viewBox="0 0 1200 900" preserveAspectRatio="none" className="absolute inset-0 w-full h-full opacity-90">
        <defs>
          <linearGradient id="dw-sunset" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#3d1d11" />
            <stop offset="40%" stopColor="#ff5f1f" stopOpacity="0.4" />
            <stop offset="70%" stopColor="#ff9f4f" stopOpacity="0.2" />
            <stop offset="100%" stopColor="#1a0a05" />
          </linearGradient>
          <radialGradient id="sun-glow" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="#ffcc33" stopOpacity="0.6" />
            <stop offset="100%" stopColor="#ff6600" stopOpacity="0" />
          </radialGradient>
        </defs>

        <rect width="1200" height="900" fill="url(#dw-sunset)" />
        <circle cx="600" cy="500" r="180" fill="url(#sun-glow)" className="animate-pulse" style={{ animationDuration: '8s' }} />

        <g opacity="0.15">
          <ellipse cx="200" cy="150" rx="300" ry="100" fill="#ff9966" className="animate-float-slow" />
          <ellipse cx="1000" cy="250" rx="400" ry="150" fill="#cc6633" className="animate-float-slow" style={{ animationDelay: '-3s' }} />
        </g>

        <path d="M0 600 L150 500 L300 580 L450 450 L600 550 L800 480 L1000 590 L1200 520 L1200 800 L0 800 Z" fill="#1a0c06" />
        <path d="M-50 650 L200 530 L400 620 L600 510 L850 640 L1100 550 L1300 670 L1300 850 L-50 850 Z" fill="#25140b" opacity="0.8" />

        <g transform="translate(100, 520)" fill="#1c0f08">
          <rect x="0" y="0" width="220" height="200" />
          <path d="M-20 0 L110 -60 L240 0 Z" fill="#140a05" />
          <rect x="235" y="-10" width="15" height="40" fill="#140a05" />
          <rect x="30" y="30" width="40" height="50" fill="#4d2c12" />
          <rect x="150" y="30" width="40" height="50" fill="#4d2c12" />
          <rect x="-10" y="100" width="240" height="10" fill="#2d1d11" />
          <rect x="40" y="-35" width="140" height="30" fill="#2d1d11" />
          <path d="M50 -25 L170 -25" stroke="#4d2c12" strokeWidth="2" strokeDasharray="4 2" />
        </g>

        <g transform="translate(850, 500)" fill="#1c0f08">
          <rect x="0" y="50" width="180" height="170" />
          <path d="M-10 50 L90 0 L190 50 Z" fill="#140a05" />
          <rect x="40" y="80" width="40" height="40" fill="#000" />
          <path d="M48 80 L48 120 M56 80 L56 120 M64 80 L64 120 M72 80 L72 120" stroke="#333" strokeWidth="1" />
          <rect x="-20" y="180" width="220" height="15" fill="#26150b" />
        </g>

        <path d="M0 720 Q300 680 600 710 Q900 740 1200 700 L1200 900 L0 900 Z" fill="#21120a" />
        
        <g transform="translate(50, 680)" fill="#1a2e1a" opacity="0.9">
          <path d="M20 100 Q20 20 40 20 Q60 20 60 100" />
          <path d="M25 60 Q0 60 0 40 Q0 30 15 30 L15 60" />
          <path d="M55 50 Q85 50 85 30 Q85 20 65 20 L65 50" />
        </g>
        
        <g transform="translate(1080, 720) scale(0.8)" fill="#1a2e1a" opacity="0.9">
          <path d="M20 100 Q20 30 40 30 Q60 30 60 100" />
          <path d="M55 60 Q80 60 80 40 L65 40 Z" />
        </g>

        <g className="animate-circling-birds origin-center">
          <path d="M500 100 Q510 95 520 100 Q510 105 500 100 Z" fill="#000" />
          <path d="M530 110 Q540 105 550 110 Q540 115 530 110 Z" fill="#000" />
        </g>
      </svg>

<div className="absolute bottom-10 -left-50 w-12 h-12 bg-transparent animate-tumbleweed border-2 border-amber-900/30 rounded-full">
        <div className="w-full h-full relative rotate-45">
          <div className="absolute top-1/2 left-0 w-full h-px bg-amber-900/40" />
          <div className="absolute top-0 left-1/2 h-full w-px bg-amber-900/40" />
         </div>
      </div>
      
      <div className="absolute inset-0 bg-linear-to-b from-black/60 via-transparent to-black/60 mix-blend-multiply" />
      <div className="absolute inset-x-0 bottom-0 h-36 bg-linear-to-t from-black/55 to-transparent pointer-events-none" />
    </div>
  );
}

export default function DeadOrWildPage() {
  const { balance, subtractFromBalance, addToBalance, finalizePendingLoss } = useWallet();
  const { volume } = useSoundVolume();

  const [phase, setPhase] = useState<GamePhase>("idle");
  const [betInput, setBetInput] = useState("100");
  const [betAmount, setBetAmount] = useState(100);
  const [anteBet, setAnteBet] = useState(false);

  const [grid, setGrid] = useState<Cell[][]>(() => buildGrid(false, false, []));
  const [reelFrames, setReelFrames] = useState<Cell[][]>(() => gridToReelFrames(buildGrid(false, false, []), false));
  const [reelsSpinning, setReelsSpinning] = useState<boolean[]>(() => Array(COLS).fill(false));
  const [spinKey, setSpinKey] = useState(0);

  const [bannerDuels, setBannerDuels] = useState<Record<number, ReelBannerDuel>>({});
  const [highlighted, setHighlighted] = useState<Set<string>>(new Set());
  const [freeSpinsLeft, setFreeSpinsLeft] = useState(0);
  const [isAutospinning, setIsAutospinning] = useState(false);
  const [isExecutingSpin, setIsExecutingSpin] = useState(false);
  const [pendingRoundPayout, setPendingRoundPayout] = useState(0);
  const [lastWin, setLastWin] = useState(0);
  const [lastSpinWin, setLastSpinWin] = useState(0);

  const pendingRoundStakeRef = React.useRef(0);
  const pendingMultiDenominatorRef = React.useRef(0);
  const pendingRoundPayoutRef = React.useRef(0);
  const isExecutingSpinRef = React.useRef(false);
  const freeSpinCapRef = React.useRef(0);
  const freeSpinWinRef = React.useRef(0);

  const audioRef = React.useRef<{
    bet: HTMLAudioElement | null;
    spin: HTMLAudioElement | null;
    win: HTMLAudioElement | null;
    lose: HTMLAudioElement | null;
  }>({ bet: null, spin: null, win: null, lose: null });

  const spinCost = useMemo(() => normalizeMoney(betAmount * (anteBet ? 1.5 : 1)), [betAmount, anteBet]);
  const buyBonusCost = useMemo(() => normalizeMoney(betAmount * 100), [betAmount]);
  const isHundredDollarFreeSpin = !anteBet && normalizeMoney(betAmount) === 100;

  const playAudio = (audio: HTMLAudioElement | null) => {
    if (!audio) return;
    const v =
      typeof window !== "undefined" && typeof (window as unknown as { __flopper_sound_volume__?: number }).__flopper_sound_volume__ === "number"
        ? (window as unknown as { __flopper_sound_volume__: number }).__flopper_sound_volume__
        : 1;
    if (!v) return;
    try {
      audio.volume = v;
      audio.currentTime = 0;
      void audio.play();
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
      const sounds = Object.values(audioRef.current);
      for (const s of sounds) {
        if (!s) continue;
        try {
          s.muted = true;
          await s.play();
          s.pause();
          s.currentTime = 0;
          s.muted = false;
        } catch {
          s.muted = false;
        }
      }
    };

    document.addEventListener("pointerdown", prime, { once: true });
    return () => document.removeEventListener("pointerdown", prime);
  }, [volume]);

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
    },
    [addToBalance, finalizePendingLoss]
  );

  const executeSpin = React.useCallback(
    async (isBonusBuy: boolean = false) => {
      if (isExecutingSpinRef.current) return;
      isExecutingSpinRef.current = true;
      setIsExecutingSpin(true);
      setLastSpinWin(0);
      setHighlighted(new Set());

      const isFreeSpin = phase === "free";
      if (isFreeSpin) {
        setFreeSpinsLeft((v) => Math.max(0, v - 1));
      } else {
        setPhase("spinning");
        freeSpinCapRef.current = 0;
        freeSpinWinRef.current = 0;
      }

      setSpinKey((k) => k + 1);
      playAudio(audioRef.current.spin);

      const forcedBannerReels = rollWildBannerReels();
      const workingGrid = buildGrid(anteBet, isBonusBuy, forcedBannerReels);
      const bannerReels = getVSReelsFromGrid(workingGrid);
      const resolvedBannerMap = buildDuelBannerMap(bannerReels, false);
      const unresolvedBannerMap = makeUnresolvedFromResolved(resolvedBannerMap);

      const startFrames = gridToReelFrames(grid, anteBet);
      setReelFrames(startFrames);
      setReelsSpinning(Array(COLS).fill(true));

      await new Promise<void>((resolve) => {
        let stopped = 0;
        const baseDelay = 420;
        const reelDelay = 210;

        for (let col = 0; col < COLS; col++) {
          setTimeout(() => {
            setBannerDuels((prev) => {
              if (prev[col]) {
                const next = { ...prev };
                delete next[col];
                return next;
              }
              return prev;
            });

            setGrid((prev) => {
              const next = prev.map((row) => [...row]);
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

            stopped += 1;
            if (stopped === COLS) {
              setTimeout(resolve, 220);
            }
          }, baseDelay + col * reelDelay);
        }
      });

      setGrid(workingGrid.map((row) => [...row]));

      if (bannerReels.length > 0) {
        setBannerDuels((prev) => ({ ...prev, ...unresolvedBannerMap }));
        await sleep(500);

        for (const reel of bannerReels) {
          setBannerDuels((prev) => ({
            ...prev,
            [reel]: { ...prev[reel], shootingPhase: resolvedBannerMap[reel].winner ?? false }
          }));
          await sleep(1000); 

          setBannerDuels((prev) => ({
            ...prev,
            [reel]: { 
              ...resolvedBannerMap[reel],
              shootingPhase: false,
              resolving: false 
            }
          }));
          await sleep(1000);
        }
        await sleep(200);
      } else {
        setBannerDuels({});
      }

      const result = evaluateConnections(workingGrid, resolvedBannerMap, spinCost, isFreeSpin);
      let spinWin = result.total;

      setHighlighted(result.highlighted);
      setLastSpinWin(spinWin);

      await sleep(420);
      setHighlighted(new Set());

      if (isFreeSpin) {
        const prevFreeSpinWin = freeSpinWinRef.current;
        const remaining = Math.max(0, normalizeMoney(freeSpinCapRef.current - prevFreeSpinWin));
        const allowedSpinWin = remaining > 0 ? Math.min(spinWin, remaining) : 0;
        freeSpinWinRef.current = Math.min(freeSpinCapRef.current, normalizeMoney(prevFreeSpinWin + allowedSpinWin));
        spinWin = normalizeMoney(freeSpinWinRef.current - prevFreeSpinWin);
      }

      const updatedRoundPayout = normalizeMoney(pendingRoundPayoutRef.current + spinWin);
      pendingRoundPayoutRef.current = updatedRoundPayout;
      setPendingRoundPayout(updatedRoundPayout);

      const scatterCount = countScatters(workingGrid);

      if (isFreeSpin) {
        const retriggerCount = scatterCount >= 3 ? 5 + 2 * Math.max(0, scatterCount - 3) : 0;
        const leftAfter = Math.max(0, freeSpinsLeft - 1 + retriggerCount);
        setFreeSpinsLeft(leftAfter);

        if (leftAfter <= 0) {
          setPhase("idle");
          setIsAutospinning(false);
          settleRound(pendingRoundStakeRef.current, updatedRoundPayout, pendingMultiDenominatorRef.current);
          freeSpinCapRef.current = 0;
          freeSpinWinRef.current = 0;
        } else {
          setPhase("free");
        }
      } else {
        if (scatterCount >= 3) {
          const extra = Math.max(0, scatterCount - 3) * 2;
          const freeSpinCap = normalizeMoney(betAmount * FREE_SPIN_MAX_WIN_MULTIPLIER);
          const seededWin = Math.min(freeSpinCap, pendingRoundPayoutRef.current);
          freeSpinCapRef.current = freeSpinCap;
          freeSpinWinRef.current = seededWin;
          if (seededWin !== pendingRoundPayoutRef.current) {
            pendingRoundPayoutRef.current = seededWin;
            setPendingRoundPayout(seededWin);
          }
          setAnteBet(false);
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
    },
    [anteBet, betAmount, freeSpinsLeft, grid, phase, settleRound, spinCost]
  );

  const canPaidSpin = phase === "idle";

  const startPaidSpin = React.useCallback(() => {
    if (!canPaidSpin) return;
    if (isExecutingSpinRef.current) return;
    if (betAmount < 100) return;
    if (!isHundredDollarFreeSpin && balance < spinCost) return;

    if (!isHundredDollarFreeSpin) {
      subtractFromBalance(spinCost);
      pendingRoundStakeRef.current = spinCost;
      pendingMultiDenominatorRef.current = betAmount;
    } else {
      pendingRoundStakeRef.current = 0;
      pendingMultiDenominatorRef.current = 100;
    }

    playAudio(audioRef.current.bet);
    pendingRoundPayoutRef.current = 0;
    setPendingRoundPayout(0);
    setLastWin(0);
    setBannerDuels({});
    void executeSpin();
  }, [balance, betAmount, canPaidSpin, executeSpin, isHundredDollarFreeSpin, spinCost, subtractFromBalance]);

  const spinFree = React.useCallback(() => {
    if (phase !== "free" || freeSpinsLeft <= 0) return;
    if (isExecutingSpinRef.current) return;
    void executeSpin();
  }, [executeSpin, freeSpinsLeft, phase]);

  const handleMainSpin = React.useCallback(() => {
    if (isExecutingSpinRef.current) return;
    if (phase === "free") {
      spinFree();
      return;
    }
    startPaidSpin();
  }, [phase, spinFree, startPaidSpin]);

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
  }, [isAutospinning, isExecutingSpin, phase, isHundredDollarFreeSpin, balance, spinCost, freeSpinsLeft, handleMainSpin]);

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
    setBannerDuels({});
    setHighlighted(new Set());
    void executeSpin(true);
  };

  const mainDisabled =
    isExecutingSpin ||
    (phase === "free" ? freeSpinsLeft <= 0 : phase !== "idle" || (!isHundredDollarFreeSpin && balance < spinCost) || betAmount < 100);

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
                2x
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
            <div className="rounded-3xl overflow-hidden relative bg-[#2a1a12] h-145 sm:h-170 p-2 sm:p-4">
              <WesternBackground />

              <div className="relative z-10 flex flex-col items-center justify-center h-full">
                {phase === "free" && (
                  <div className="absolute top-4 sm:top-6 left-1/2 -translate-x-1/2 z-30 flex justify-center w-full px-4 pointer-events-none">
                    <div className="bg-[#0f212e]/85 backdrop-blur-md border border-[#facc15]/30 px-5 py-2 rounded-full flex items-center gap-5 shadow-[0_0_20px_rgba(0,0,0,0.45)]">
                      <div className="flex items-center gap-2.5">
                        <span className="text-[10px] text-[#fef3c7] font-black uppercase tracking-widest">Spins</span>
                        <span className="text-xl font-black text-[#facc15] leading-none">{freeSpinsLeft}</span>
                      </div>
                    </div>
                  </div>
                )}

                <div className="p-1.5 sm:p-2 rounded-2xl w-full max-w-125">
                  <div className="grid grid-cols-5 gap-1 sm:gap-1.5 mx-auto w-full">
                    {Array.from({ length: COLS }, (_, col) => {
                      const duel = bannerDuels[col];
                      const hasResolvedBanner = Boolean(duel && duel.winner !== null);

                      return (
                        <div key={`col-${col}`} className="flex flex-col gap-1 sm:gap-1.5 relative overflow-visible">
                          {Array.from({ length: ROWS }, (_, row) => {
                            const cell = grid[row][col];
                            const key = toPosKey(row, col);
                            const isHit = highlighted.has(key);
                            const isSpinning = reelsSpinning[col];

                            return (
                              <div
                                key={key}
                                className="aspect-square w-full rounded-xl transition-all duration-200 flex items-center justify-center relative"
                              >
                                {!isSpinning && (
                                  <span
                                    className={`relative z-10 text-xl sm:text-3xl lg:text-4xl select-none leading-none transform-gpu ${
                                      isHit ? "animate-pop" : !isExecutingSpin ? "" : "animate-stop-bounce"
                                    } ${hasResolvedBanner ? "opacity-20" : "opacity-100"}`}
                                  >
                                    {renderCell(cell)}
                                  </span>
                                )}
                              </div>
                            );
                          })}

                          {reelsSpinning[col] && (
                            <div className="absolute inset-0 overflow-hidden rounded-xl z-20 pointer-events-none">
                              <div className="flex flex-col gap-1 sm:gap-1.5 absolute top-0 left-0 w-full h-[500%] animate-spin-infinite-down opacity-80">
                                {Array.from({ length: 5 }).flatMap((_, loopIdx) => reelFrames[col].map((cell, idx) => (
                                  <div key={`spin-${col}-${idx}-${loopIdx}-${spinKey}`} className="aspect-square w-full flex items-center justify-center rounded-xl bg-transparent">
                                    <span className="text-xl sm:text-3xl lg:text-4xl select-none leading-none blur-[2px]">{renderCell(cell)}</span>
                                  </div>
                                )))}
                              </div>
                            </div>
                          )}

                          {!reelsSpinning[col] && duel && <ReelWildBanner duel={duel} />}
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            </div>
          </div>

          <GameRecordsPanel gameId="deadorwild" />
        </div>
      </div>

      <style jsx global>{`
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
          50% { transform: scale(1.34); }
          100% { transform: scale(1); }
        }
        .animate-pop {
          animation: pop 0.2s ease-in-out;
        }
        @keyframes stop-bounce {
          0% { transform: translateY(-16px); }
          60% { transform: translateY(4px); }
          100% { transform: translateY(0); }
        }
        .animate-stop-bounce {
          animation: stop-bounce 0.28s cubic-bezier(0.25, 1, 0.5, 1) forwards;
        }
        @keyframes spinInfiniteDown {
          0% { transform: translateY(-75%); }
          100% { transform: translateY(0%); }
        }
        .animate-spin-infinite-down {
          animation: spinInfiniteDown 0.12s linear infinite;
        }
        @keyframes muzzle-flash {
          0% { transform: scale(0.5) rotate(0deg); opacity: 1; }
          20% { transform: scale(1.5) rotate(15deg); opacity: 1; filter: brightness(2); }
          100% { transform: scale(4) rotate(-10deg); opacity: 0; filter: contrast(1.5); }
        }
        .animate-muzzle-flash {
          animation: muzzle-flash 0.25s cubic-bezier(0.15, 0.85, 0.35, 1) forwards;
        }
        @keyframes bullet-drop {
          0% { transform: scaleY(0) translateY(-20px); opacity: 1; filter: brightness(3); }
          5% { transform: scaleY(2) translateY(0); opacity: 1; }
          100% { transform: scaleY(1) translateY(300px); opacity: 0; filter: blur(2px); }
        }
        .animate-bullet-drop {
          animation: bullet-drop 0.35s cubic-bezier(0.4, 0, 0.2, 1) forwards;
        }
        @keyframes bullet-rise {
          0% { transform: scaleY(0) translateY(20px); opacity: 1; filter: brightness(3); }
          5% { transform: scaleY(2) translateY(0); opacity: 1; }
          100% { transform: scaleY(1) translateY(-300px); opacity: 0; filter: blur(2px); }
        }
        .animate-bullet-rise {
          animation: bullet-rise 0.35s cubic-bezier(0.4, 0, 0.2, 1) forwards;
        }
        @keyframes banner-arrive {
          0% { transform: translateY(-14px) scaleY(0.92); opacity: 0; }
          70% { transform: translateY(2px) scaleY(1.03); opacity: 1; }
          100% { transform: translateY(0) scaleY(1); opacity: 1; }
        }
        .animate-banner-arrive {
          animation: banner-arrive 0.36s cubic-bezier(0.2, 0.9, 0.2, 1);
        }
        @keyframes banner-flicker {
          0%, 100% { filter: brightness(1); }
          50% { filter: brightness(1.2); }
        }
        .animate-banner-flicker {
          animation: banner-flicker 0.25s ease-in-out infinite;
        }
        @keyframes duel-pulse {
          0%, 100% { opacity: 0.65; transform: scale(1); }
          50% { opacity: 1; transform: scale(1.07); }
        }
        .animate-duel-pulse {
          animation: duel-pulse 0.45s ease-in-out infinite;
        }
        @keyframes dust-wind {
          0% { transform: translateX(-20px); }
          50% { transform: translateX(14px); }
          100% { transform: translateX(-20px); }
        }
        .animate-dust-wind {
          animation: dust-wind 9s ease-in-out infinite;
        }
        @keyframes circling-birds {
          0% { transform: rotate(0deg) translate(0, 0); }
          50% { transform: rotate(180deg) translate(40px, -20px); }
          100% { transform: rotate(360deg) translate(0, 0); }
        }
        .animate-birds {
          animation: circling-birds 40s linear infinite;
        }
        @keyframes tumbleweed {
          0% { transform: translate(-50px, 750px) rotate(0deg); opacity: 0; }
          10% { opacity: 1; transform: translate(80px, 750px) rotate(90deg); }
          50% { transform: translate(600px, 750px) rotate(450deg); }
          90% { opacity: 1; transform: translate(1120px, 750px) rotate(810deg); }
          100% { transform: translate(1300px, 750px) rotate(1080deg); opacity: 0; }
        }
        .animate-tumbleweed {
          animation: tumbleweed 14s linear infinite;
        }
      `}</style>
    </>
  );
}
