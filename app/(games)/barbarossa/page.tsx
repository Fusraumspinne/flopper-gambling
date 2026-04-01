"use client";

import React, { useMemo, useState } from "react";
import PlayArrow from "@mui/icons-material/PlayArrow";
import GameRecordsPanel from "@/components/GameRecordsPanel";
import { useWallet } from "@/components/WalletProvider";
import { useSoundVolume } from "@/components/SoundVolumeProvider";

type GamePhase = "idle" | "spinning" | "free";
type PaySymbolId = "⚓" | "🍺" | "🦜" | "🗺️" | "💰" | "🏴‍☠️";
type SymbolId = PaySymbolId | "💣" | "WILD";
type Position = [number, number];

type BaseConnection = {
  symbol: PaySymbolId;
  reelsHit: number;
  ways: number;
  basePayout: number;
  positions: Position[];
};

const ROWS = 3;
const COLS = 5;
const MIN_REELS_FOR_WIN = 3;
const REEL_DEPTH_EXP_BASE = 2;
const FREE_SPINS_AWARD = 10;
const FREE_SPIN_MAX_WIN_MULTIPLIER = 100000;
const WILD_SYMBOL = "WILD" as const;

const SYMBOL_ORDER: PaySymbolId[] = ["🏴‍☠️", "💰", "🗺️", "🦜", "🍺", "⚓"];

const SYMBOL_WEIGHTS: Record<PaySymbolId, number> = {
  "⚓": 22,
  "🍺": 20,
  "🦜": 16,
  "🗺️": 16,
  "💰": 14,
  "🏴‍☠️": 12,
};

const SCATTER_WEIGHT = 3;

const SYMBOL_BASE_MULTIS: Record<PaySymbolId, number> = {
  "⚓": 0.001,
  "🍺": 0.003,
  "🦜": 0.0075,
  "🗺️": 0.01,
  "💰": 0.02,
  "🏴‍☠️": 0.05,
};

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

function pickRandom<T>(items: T[]) {
  if (items.length === 0) return null;
  return items[Math.floor(Math.random() * items.length)];
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

function randomSymbol(anteBet: boolean): SymbolId {
  const table: [SymbolId, number][] = SYMBOL_ORDER.map((symbol) => [symbol, SYMBOL_WEIGHTS[symbol]] as [SymbolId, number]);
  table.push(["💣", anteBet ? SCATTER_WEIGHT * 1.5 : SCATTER_WEIGHT]);
  return pickWeighted(table);
}

function buildGrid(anteBet: boolean, forceScatters: boolean = false) {
  const grid = Array.from({ length: ROWS }, () => Array.from({ length: COLS }, () => randomSymbol(anteBet)));
  
  if (forceScatters) {
    const scatterPositions: [number, number][] = [];
    while (scatterPositions.length < 3) {
      const row = Math.floor(Math.random() * ROWS);
      const col = Math.floor(Math.random() * COLS);
      if (!scatterPositions.some(([r, c]) => r === row && c === col)) {
        scatterPositions.push([row, col]);
        grid[row][col] = "💣";
      }
    }
  }
  return grid;
}

function gridToReelFrames(sourceGrid: SymbolId[][], anteBet: boolean) {
  return Array.from({ length: COLS }, (_, col) => {
    const reel = Array.from({ length: ROWS }, (_, row) => sourceGrid[row][col]);
    return [randomSymbol(anteBet), ...reel];
  });
}

function countScatters(grid: SymbolId[][]) {
  let count = 0;
  for (let row = 0; row < ROWS; row++) {
    for (let col = 0; col < COLS; col++) {
      if (grid[row][col] === "💣") count += 1;
    }
  }
  return count;
}

function matchesPaySymbol(symbol: SymbolId, paySymbol: PaySymbolId) {
  return symbol === paySymbol || symbol === WILD_SYMBOL;
}

function injectDropWild(grid: SymbolId[][], droppedPositions: Position[]) {
  const eligiblePositions = droppedPositions.filter(([row, col]) => grid[row][col] !== "💣");
  const wildPosition = pickRandom(eligiblePositions.length > 0 ? eligiblePositions : droppedPositions);
  if (!wildPosition) return;

  const [row, col] = wildPosition;
  grid[row][col] = WILD_SYMBOL;
}

function evaluateBaseConnections(grid: SymbolId[][], spinCost: number): BaseConnection[] {
  const out: BaseConnection[] = [];

  for (const symbol of SYMBOL_ORDER) {
    const reelHits: Position[][] = Array.from({ length: COLS }, () => []);

    for (let col = 0; col < COLS; col++) {
      for (let row = 0; row < ROWS; row++) {
        if (matchesPaySymbol(grid[row][col], symbol)) {
          reelHits[col].push([row, col]);
        }
      }
    }

    if (reelHits[0].length === 0) continue;

    let reelsHit = 0;
    let hasRealSymbolInConnection = false;
    for (let col = 0; col < COLS; col++) {
      if (reelHits[col].length === 0) break;
      if (!hasRealSymbolInConnection) {
        hasRealSymbolInConnection = reelHits[col].some(([row, hitCol]) => grid[row][hitCol] === symbol);
      }
      reelsHit += 1;
    }

    if (reelsHit < MIN_REELS_FOR_WIN || !hasRealSymbolInConnection) continue;

    const ways = reelHits.slice(0, reelsHit).reduce((acc, positions) => acc * positions.length, 1);
    const depthBoost = REEL_DEPTH_EXP_BASE ** Math.max(0, reelsHit - MIN_REELS_FOR_WIN);
    const basePayout = normalizeMoney(spinCost * SYMBOL_BASE_MULTIS[symbol] * ways * depthBoost);

    const positions: Position[] = [];
    for (let col = 0; col < reelsHit; col++) {
      positions.push(...reelHits[col]);
    }

    out.push({
      symbol,
      reelsHit,
      ways,
      basePayout,
      positions,
    });
  }

  out.sort((a, b) => {
    if (b.reelsHit !== a.reelsHit) return b.reelsHit - a.reelsHit;
    if (b.basePayout !== a.basePayout) return b.basePayout - a.basePayout;
    return b.ways - a.ways;
  });

  return out;
}

function WildSymbolSvg() {
  return (
    <svg viewBox="0 0 100 100" className="w-full h-full drop-shadow-[0_8px_16px_rgba(0,0,0,0.45)]" aria-hidden="true">
      <circle cx="50" cy="50" r="46" fill="#4a2a0f" />
      <circle cx="50" cy="50" r="42" fill="#f3b322" />
      <circle cx="50" cy="50" r="36" fill="#f7df92" opacity="0.65" />
      <circle cx="50" cy="50" r="31" fill="#241327" stroke="#fde68a" strokeWidth="3" />

      <g stroke="#fff7ed" strokeWidth="5" strokeLinecap="round">
        <path d="M 28 66 L 41 54" />
        <path d="M 28 54 L 41 66" />
        <path d="M 59 54 L 72 66" />
        <path d="M 59 66 L 72 54" />
      </g>

      <path d="M 50 28 C 40 28 34 35 34 44 C 34 53 39 60 45 63 L 45 68 L 55 68 L 55 63 C 61 60 66 53 66 44 C 66 35 60 28 50 28 Z" fill="#fff7ed" />
      <circle cx="43" cy="45" r="4.2" fill="#111827" />
      <circle cx="57" cy="45" r="4.2" fill="#111827" />
      <path d="M 50 50 L 46 57 H 54 Z" fill="#d97706" />
      <path d="M 42 61 Q 50 66 58 61" fill="none" stroke="#7c2d12" strokeWidth="3.5" strokeLinecap="round" />

      <path d="M 18 72 Q 50 78 82 72 L 76 88 Q 50 94 24 88 Z" fill="#991b1b" stroke="#fee2e2" strokeWidth="2" />
      <text x="50" y="84" textAnchor="middle" fontSize="16" fontWeight="900" fill="#fff8e1" letterSpacing="2">
        WILD
      </text>
    </svg>
  );
}

function SlotSymbol({ symbol, blurred = false }: { symbol: SymbolId; blurred?: boolean }) {
  if (symbol === WILD_SYMBOL) {
    return (
      <div className={`w-[80%] h-[80%] ${blurred ? "blur-[1.2px]" : ""}`}>
        <WildSymbolSvg />
      </div>
    );
  }

  return <span className={`text-xl sm:text-3xl lg:text-4xl select-none leading-none ${blurred ? "blur-[1.2px]" : ""}`}>{symbol}</span>;
}

function PirateSeaBackground() {
  return (
    <div className="absolute inset-0 pointer-events-none overflow-hidden z-0 rounded-3xl">
      <div className="absolute inset-0 bg-linear-to-b from-[#64B5F6] via-[#B3E5FC] to-[#E1F5FE]" />

      <svg viewBox="0 0 1200 800" className="absolute inset-0 w-full h-full" preserveAspectRatio="xMidYMid slice">
        <circle cx="950" cy="220" r="80" fill="#FFF59D" filter="drop-shadow(0 0 40px #FFF176)" />
        <circle cx="950" cy="220" r="120" fill="#FFF9C4" opacity="0.5" filter="blur(20px)" />
        <circle cx="950" cy="220" r="200" fill="#FFFDE7" opacity="0.3" filter="blur(40px)" />

        <g fill="#FFFFFF" opacity="0.9">
          <path d="M 200 200 Q 230 170 270 180 Q 310 140 370 180 Q 400 170 430 200 Q 450 220 420 240 Q 440 260 390 270 Q 320 280 250 260 Q 180 240 200 200 Z" filter="blur(1px)" />
          <path d="M 700 150 Q 730 120 770 130 Q 800 100 850 130 Q 880 120 910 150 Q 930 170 900 190 Q 920 210 870 220 Q 800 230 730 210 Q 670 190 700 150 Z" filter="blur(2px)" />
          <path d="M -50 280 Q -20 250 20 260 Q 60 220 120 260 Q 150 250 180 280 Q 200 300 170 320 Q 190 340 140 350 Q 70 360 0 340 Q -70 320 -50 280 Z" opacity="0.7" filter="blur(3px)" />
        </g>

        <path d="M 0 500 L 1200 500 L 1200 800 L 0 800 Z" fill="#0277BD" />

        <g>
          <path d="M 700 500 Q 850 420 950 450 Q 1050 380 1250 500 Z" fill="#2E7D32" />
          <path d="M 750 500 Q 850 440 950 480 Q 1050 430 1200 500 Z" fill="#1B5E20" opacity="0.6" />
          <path d="M 700 500 Q 800 510 950 500 Q 1100 490 1250 500 L 1250 510 L 700 510 Z" fill="#FFE082" />
          <g transform="translate(1000, 470) scale(0.8)">
            <path d="M 0 0 Q 5 -20 15 -40" fill="none" stroke="#4E342E" strokeWidth="4" />
            <path d="M 15 -40 Q -5 -35 -15 -25 M 15 -40 Q -10 -50 -20 -40 M 15 -40 Q 10 -60 5 -75 M 15 -40 Q 30 -55 40 -50 M 15 -40 Q 35 -30 45 -20" fill="none" stroke="#2E7D32" strokeWidth="3" strokeLinecap="round" />
          </g>
          <g transform="translate(1100, 480) scale(0.6) rotate(-10)">
            <path d="M 0 0 Q -5 -20 -10 -40" fill="none" stroke="#4E342E" strokeWidth="4" />
            <path d="M -10 -40 Q -25 -35 -35 -25 M -10 -40 Q -25 -50 -35 -40 M -10 -40 Q -5 -60 0 -70 M -10 -40 Q 15 -50 25 -45 M -10 -40 Q 15 -35 25 -25" fill="none" stroke="#1B5E20" strokeWidth="3" strokeLinecap="round" />
          </g>

          <path d="M -100 500 Q 50 350 200 450 Q 300 400 450 500 Z" fill="#388E3C" />
          <path d="M -50 500 Q 50 390 180 470 Q 280 430 400 500 Z" fill="#2E7D32" opacity="0.7" />
          <path d="M -100 500 Q 50 510 200 500 Q 320 490 450 500 L 450 510 L -100 510 Z" fill="#FFD54F" />
          <g transform="translate(120, 450) scale(1)">
            <path d="M 0 0 Q 5 -20 15 -40" fill="none" stroke="#5D4037" strokeWidth="4" />
            <path d="M 15 -40 Q -5 -35 -15 -25 M 15 -40 Q -10 -50 -20 -40 M 15 -40 Q 10 -60 5 -75 M 15 -40 Q 30 -55 40 -50 M 15 -40 Q 35 -30 45 -20" fill="none" stroke="#2E7D32" strokeWidth="3" strokeLinecap="round" />
          </g>
          <g transform="translate(180, 465) scale(0.8) rotate(15)">
            <path d="M 0 0 Q -5 -20 -10 -40" fill="none" stroke="#4E342E" strokeWidth="4" />
            <path d="M -10 -40 Q -25 -35 -35 -25 M -10 -40 Q -25 -50 -35 -40 M -10 -40 Q -5 -60 0 -70 M -10 -40 Q 15 -50 25 -45 M -10 -40 Q 15 -35 25 -25" fill="none" stroke="#1B5E20" strokeWidth="3" strokeLinecap="round" />
          </g>
        </g>

        <path d="M 0 520 Q 300 490 600 530 T 1200 520 L 1200 800 L 0 800 Z" fill="#0288D1" />

        <g transform="translate(850, 480) scale(0.4)">
          <path d="M 0 60 L 150 60 L 170 30 Q 80 15 0 30 Z" fill="#4E342E" />
          <path d="M 170 30 Q 185 15 200 30 L 150 60 Z" fill="#3E2723" />
          <rect x="40" y="-80" width="8" height="110" fill="#3E2723" />
          <rect x="100" y="-100" width="8" height="130" fill="#3E2723" />
          <path d="M 44 -70 Q 110 -50 44 0 Q 0 -30 44 -70 Z" fill="#FAFAFA" />
          <path d="M 104 -90 Q 170 -60 104 20 Q 60 -30 104 -90 Z" fill="#F5F5F5" />
          <path d="M 44 -70 L 15 -60 L 44 -50 Z" fill="#D32F2F" />
          <path d="M 104 -90 L 70 -80 L 104 -70 Z" fill="#212121" />
        </g>

        <path d="M 0 540 Q 400 520 800 550 T 1200 540 L 1200 800 L 0 800 Z" fill="#039BE5" />
        <path d="M 100 545 Q 400 525 800 555" fill="none" stroke="#81D4FA" strokeWidth="2" opacity="0.6" strokeLinecap="round" />

        <g transform="translate(200, 500) scale(0.6)">
          <path d="M 0 60 L 150 60 L 170 30 Q 80 15 0 30 Z" fill="#5D4037" />
          <path d="M 170 30 Q 185 15 200 30 L 150 60 Z" fill="#4E342E" />
          <rect x="30" y="45" width="8" height="8" fill="#212121" />
          <rect x="70" y="45" width="8" height="8" fill="#212121" />
          <rect x="110" y="45" width="8" height="8" fill="#212121" />
          <rect x="40" y="-80" width="6" height="110" fill="#3E2723" />
          <rect x="100" y="-100" width="6" height="130" fill="#3E2723" />
          <path d="M 43 -70 Q 110 -50 43 0 Q 0 -30 43 -70 Z" fill="#FAFAFA" />
          <path d="M 103 -90 Q 170 -60 103 20 Q 60 -30 103 -90 Z" fill="#F5F5F5" />
          <path d="M 43 -70 L 15 -60 L 43 -50 Z" fill="#D32F2F" />
          <path d="M 103 -90 L 70 -80 L 103 -70 Z" fill="#212121" />
        </g>

        <g opacity="0.95">
          <path d="M 0 570 Q 300 540 600 590 T 1200 570 L 1200 800 L 0 800 Z" fill="#03A9F4" />
          <path d="M 200 580 Q 500 550 800 600" fill="none" stroke="#B3E5FC" strokeWidth="3" opacity="0.5" strokeLinecap="round" />
        </g>

         <g className="animate-kraken-float" transform="translate(0, 30)">
          <path d="M 380 620 C 350 450, 200 480, 250 350 C 280 280, 400 350, 390 450" fill="none" stroke="#6A1B9A" strokeWidth="26" strokeLinecap="round" />
          <path d="M 380 620 C 350 450, 200 480, 250 350 C 280 280, 400 350, 390 450" fill="none" stroke="#8E24AA" strokeWidth="18" strokeLinecap="round" />
          <path d="M 380 620 C 350 450, 200 480, 250 350 C 280 280, 400 350, 390 450" fill="none" stroke="#E1BEE7" strokeWidth="4" strokeLinecap="round" strokeDasharray="10 15" opacity="0.6" />

          <path d="M 820 620 C 880 450, 950 480, 900 350 C 850 250, 750 350, 800 450" fill="none" stroke="#6A1B9A" strokeWidth="26" strokeLinecap="round" />
          <path d="M 820 620 C 880 450, 950 480, 900 350 C 850 250, 750 350, 800 450" fill="none" stroke="#8E24AA" strokeWidth="18" strokeLinecap="round" />
          <path d="M 820 620 C 880 450, 950 480, 900 350 C 850 250, 750 350, 800 450"fill="none" stroke="#E1BEE7" strokeWidth="4" strokeLinecap="round" strokeDasharray="10 15" opacity="0.6"  />
          
          <path d="M 480 630 C 450 500, 350 450, 450 400" fill="none" stroke="#4A148C" strokeWidth="30" strokeLinecap="round" />
          <path d="M 480 630 C 450 500, 350 450, 450 400" fill="none" stroke="#7B1FA2" strokeWidth="22" strokeLinecap="round" />
          <path d="M 480 630 C 450 500, 350 450, 450 400" fill="none" stroke="#E1BEE7" strokeWidth="4" strokeLinecap="round" strokeDasharray="10 15" opacity="0.6"/>

          <path d="M 720 630 C 780 500, 800 420, 700 380" fill="none" stroke="#4A148C" strokeWidth="30" strokeLinecap="round" />
          <path d="M 720 630 C 780 500, 800 420, 700 380" fill="none" stroke="#7B1FA2" strokeWidth="22" strokeLinecap="round" />
          <path d="M 720 630 C 780 500, 800 420, 700 380" fill="none" stroke="#E1BEE7" strokeWidth="4" strokeLinecap="round" strokeDasharray="10 15" opacity="0.6"/>

          <path d="M 480 580 C 450 430, 750 430, 720 580 Z" fill="#6A1B9A" />
          <path d="M 500 580 C 480 450, 720 450, 700 580 Z" fill="#8E24AA" />
          
          <path d="M 540 520 Q 560 500 580 530 Q 560 540 540 520 Z" fill="#FFEE58" />
          <circle cx="563" cy="522" r="4" fill="#000" />
          <path d="M 535 510 L 575 515" stroke="#4A148C" strokeWidth="5" strokeLinecap="round" />
          
          <path d="M 660 520 Q 640 500 620 530 Q 640 540 660 520 Z" fill="#FFEE58" />
          <circle cx="637" cy="522" r="4" fill="#000" />
          <path d="M 665 510 L 625 515" stroke="#4A148C" strokeWidth="5" strokeLinecap="round" />
        </g>

        <g opacity="0.95">
          <path d="M 0 620 Q 400 590 800 650 T 1200 610 L 1200 800 L 0 800 Z" fill="#29B6F6" />
          <path d="M 50 630 Q 450 600 850 660" fill="none" stroke="#E1F5FE" strokeWidth="4" opacity="0.6" strokeLinecap="round" />
          <path d="M 0 700 Q 300 670 600 720 T 1200 670 L 1200 800 L 0 800 Z" fill="#4FC3F7" />
        </g>
      </svg>
      
      <div className="absolute inset-x-0 bottom-0 pointer-events-none z-10 hidden sm:block">
        <div className="w-full h-16 sm:h-24 bg-linear-to-r from-[#2c1f16] via-[#3a2a1d] to-[#2c1f16] relative overflow-hidden shadow-[0_-5px_15px_rgba(0,0,0,0.5)]">
           <div className="absolute inset-0 bg-[url('https://www.transparenttextures.com/patterns/wood-pattern.png')] opacity-40 mix-blend-overlay"></div>
           <div className="absolute top-0 w-full h-1 bg-[#1a110a] opacity-80 shadow-[0_2px_4px_rgba(0,0,0,0.8)]"></div>
           <div className="absolute top-1/4 w-full h-[1px] bg-[#1a110a] opacity-60"></div>
           <div className="absolute top-2/4 w-full h-[1px] bg-[#1a110a] opacity-60"></div>
           <div className="absolute top-3/4 w-full h-[1px] bg-[#1a110a] opacity-60"></div>
           {Array.from({ length: 15 }).map((_, i) => (
             <div key={i} className="absolute w-1.5 h-1.5 rounded-full bg-[#111] shadow-[inset_0_1px_1px_rgba(255,255,255,0.2)]" style={{ left: `${(i+1) * 6.5}%`, top: (i % 4) * 25 + 10 + '%' }}></div>
           ))}
        </div>
      </div>
    </div>
  );
}

function CannonChain({ currentMultiplier, flash, pulseKey, sticky = false }: { currentMultiplier: number; flash: boolean; pulseKey: number; sticky?: boolean }) {
  const chainBalls = useMemo(() => {
    return Array.from({ length: 6 }, (_, idx) => currentMultiplier * 2 ** (idx + 1));
  }, [currentMultiplier]);

  return (
    <div className={`relative w-full h-44 sm:h-52 px-2 sm:px-4 z-20 ${sticky ? "drop-shadow-[0_0_20px_rgba(255,215,110,0.5)]" : ""}`}>
      
      <div className="relative w-full h-full flex items-center justify-start z-10">
        
        <div className={`relative w-48 h-44 sm:w-64 sm:h-52 shrink-0 z-30 ${flash ? 'animate-cannon-recoil' : ''}`}>
          <div className="absolute bottom-6 left-2 w-44 sm:w-56 h-10 sm:h-12 bg-linear-to-b from-[#4e342e] via-[#3e2723] to-[#2d1b18] rounded-sm border-b-4 border-r-4 border-[#1a0f0a] shadow-[0_15px_25px_rgba(0,0,0,0.8)] z-20 skew-x-[-5deg]">
            <div className="absolute inset-0 bg-[url('https://www.transparenttextures.com/patterns/wood-pattern.png')] opacity-30 mix-blend-overlay"></div>
            <div className="absolute left-6 top-0 bottom-0 w-3 bg-[#1a1a1a] shadow-inner" />
            <div className="absolute right-10 top-0 bottom-0 w-3 bg-[#1a1a1a] shadow-inner" />
          </div>

          <div className="absolute bottom-0 left-4 w-20 h-20 sm:w-24 sm:h-24 rounded-full bg-[#3e2723] border-[6px] border-[#1a0f0a] shadow-[0_8px_15px_rgba(0,0,0,0.9),inset_0_0_15px_rgba(0,0,0,0.8)] z-30">
            <div className="absolute inset-0 flex items-center justify-center">
              {[0, 45, 90, 135].map(deg => (
                <div key={deg} className="absolute w-1 sm:w-1.5 h-full bg-[#1a0f0a]" style={{ transform: `rotate(${deg}deg)` }} />
              ))}
              <div className="w-6 h-6 sm:w-8 sm:h-8 rounded-full bg-[#111] border-4 border-[#333] z-10 flex items-center justify-center shadow-2xl">
                <div className="w-2 h-2 bg-[#666] rounded-full" />
              </div>
            </div>
          </div>

          <div className="absolute bottom-[42px] sm:bottom-[54px] left-6 sm:left-8 w-44 sm:w-56 h-12 sm:h-14 origin-left rotate-[-8deg] z-20">
            <div className="absolute -left-3 top-[-2px] w-8 sm:w-10 h-14 sm:h-16 bg-linear-to-b from-[#64748b] via-[#334155] to-[#0f172a] rounded-l-full shadow-2xl border-l-2 border-[#94a3b8]">
                <div className="absolute -left-4 top-1/2 -translate-y-1/2 w-5 h-5 bg-[#334155] rounded-full shadow-md border border-[#475569]" />
            </div>

            <div className="absolute inset-0 bg-linear-to-b from-[#94a3b8] via-[#475569] to-[#0f172a] rounded-r-lg border-y border-[#334155] shadow-[inset_0_5px_10px_rgba(255,255,255,0.1)]" style={{clipPath: 'polygon(0 0, 100% 12%, 100% 88%, 0 100%)'}}></div>
            
            <div className="absolute left-8 top-[-2px] bottom-[-2px] w-3 bg-linear-to-b from-[#cbd5e1] to-[#1e293b] border-x border-[#1a1a1a]" />
            <div className="absolute left-24 top-[2px] bottom-[2px] w-3 bg-linear-to-b from-[#cbd5e1] to-[#1e293b] border-x border-[#1a1a1a]" />

            <div className="absolute right-[-6px] top-[4px] w-7 sm:w-8 h-[calc(100%-8px)] bg-linear-to-b from-[#e2e8f0] to-[#0f172a] rounded-sm border-r-4 border-[#1e293b] shadow-2xl scale-y-110 flex items-center justify-end pr-1"></div>

            {flash && (
              <div className="absolute -right-32 top-1/2 -translate-y-1/2 flex items-center justify-start pointer-events-none z-50">
                <div className="w-24 h-24 rounded-full bg-white blur-[4px] opacity-90 animate-flash-core mix-blend-screen -left-8" />
                <div className="w-56 h-40 rounded-full bg-[radial-gradient(circle,rgba(255,160,0,0.9)_0%,rgba(255,50,0,0.6)_40%,transparent_70%)] blur-[10px] animate-flash-cloud mix-blend-screen -left-12" />
              </div>
            )}
          </div>
        </div>

        <div className="absolute left-[80px] sm:left-[100px] -right-[1000px] bottom-6 sm:bottom-8 h-10 flex items-center">
          <div className="absolute inset-y-0 left-0 right-0 flex items-center justify-start z-0 overflow-hidden">  
            {Array.from({ length: 120 }).map((_, i) => (
              <div 
                key={`link-${i}`} 
                className={`flex-shrink-0 relative flex items-center justify-center
                  ${i % 2 === 0 ? 'w-12 h-6 -mr-4' : 'w-4 h-10 -mr-4'} 
                `}
                style={{ 
                  zIndex: i % 2 === 0 ? 10 : 5,
                  transform: i % 2 !== 0 ? 'rotateX(60deg)' : 'none'
                }}
              >
                <div className={`
                  w-full h-full rounded-full border-[4px] shadow-[0_4px_6px_rgba(0,0,0,0.8)]
                  ${sticky ? 'border-[#ca8a04]' : 'border-[#4b5563]'}
                  flex items-center justify-center bg-black/40
                `}></div>
              </div>
            ))}
          </div>

          <div key={pulseKey} className="absolute left-[120px] sm:left-[160px] -right-[1000px] h-full flex justify-start items-center gap-12 sm:gap-16 z-20 animate-chain-step">
            {chainBalls.map((multi, idx) => (
              <div
                key={`${multi}-${idx}`}
                className="relative shrink-0 flex items-center justify-center w-12 h-12 rounded-full shadow-[0_10px_20px_rgba(0,0,0,1),inset_0_-4px_8px_rgba(0,0,0,0.6)] border-[3px] bg-[radial-gradient(circle_at_35%_35%,#cbd5e1_0%,#475569_45%,#0f172a_100%)] border-[#94a3b8] z-30 transition-all hover:scale-110"
              >
                 <span className="text-[9px] sm:text-[11px] font-black text-white drop-shadow-[0_2px_2px_rgba(0,0,0,1)]">
                   x{multi}
                 </span>
                 <div className="absolute top-1 left-1 w-4 h-4 bg-white/30 rounded-full blur-[1.5px]" />
              </div>
            ))}
          </div>
        </div>

      </div>
    </div>
  );
}

export default function BarbarossaPage() {
  const { balance, subtractFromBalance, addToBalance, finalizePendingLoss } = useWallet();
  const { volume } = useSoundVolume();

  const [phase, setPhase] = useState<GamePhase>("idle");
  const [betInput, setBetInput] = useState("100");
  const [betAmount, setBetAmount] = useState(100);
  const [anteBet, setAnteBet] = useState(false);

  const [grid, setGrid] = useState<SymbolId[][]>(() => buildGrid(false));
  const [reelFrames, setReelFrames] = useState<SymbolId[][]>(() => gridToReelFrames(buildGrid(false), false));
  const [reelsSpinning, setReelsSpinning] = useState<boolean[]>(() => Array(COLS).fill(false));
  const [spinKey, setSpinKey] = useState(0);

  const [highlighted, setHighlighted] = useState<Set<string>>(new Set());
  const [lastDropIndices, setLastDropIndices] = useState<Set<string>>(new Set());
  const [isTumbling, setIsTumbling] = useState(false);
  const [isAutospinning, setIsAutospinning] = useState(false);
  const [isExecutingSpin, setIsExecutingSpin] = useState(false);
  const [freeSpinsLeft, setFreeSpinsLeft] = useState(0);
  const [pendingRoundPayout, setPendingRoundPayout] = useState(0);
  const [lastWin, setLastWin] = useState(0);

  const [cannonMultiplier, setCannonMultiplier] = useState(1);
  const [freeSpinMultiplier, setFreeSpinMultiplier] = useState(1);
  const [cannonFlash, setCannonFlash] = useState(false);
  const [chainPulseKey, setChainPulseKey] = useState(0);

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

  const playAudio = (a: HTMLAudioElement | null) => {
    if (!a) return;
    const v =
      typeof window !== "undefined" && typeof (window as unknown as { __flopper_sound_volume__?: number }).__flopper_sound_volume__ === "number"
        ? (window as unknown as { __flopper_sound_volume__: number }).__flopper_sound_volume__
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

  const executeSpin = React.useCallback(async (isBonusBuy: boolean = false) => {
    if (isExecutingSpinRef.current) return;
    isExecutingSpinRef.current = true;
    setIsExecutingSpin(true);
    setIsTumbling(false);
    setLastDropIndices(new Set());
    setHighlighted(new Set());
    
    const isFreeSpin = phase === "free";
    if (isFreeSpin) {
      setFreeSpinsLeft((v) => Math.max(0, v - 1));
    } else {
      setPhase("spinning");
      setPendingRoundPayout(0);
      setFreeSpinMultiplier(1);
      freeSpinCapRef.current = 0;
      freeSpinWinRef.current = 0;
    }

    setSpinKey((v) => v + 1);
    playAudio(audioRef.current.spin);

    const workingGrid = buildGrid(anteBet, isBonusBuy);

    const startFrames = gridToReelFrames(grid, anteBet);
    setReelFrames(startFrames);
    setReelsSpinning(Array(COLS).fill(true));

    await new Promise<void>((resolve) => {
      let stopped = 0;
      const baseDelay = 420;
      const reelDelay = 200;

      for (let col = 0; col < COLS; col++) {
        setTimeout(() => {
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
            setTimeout(resolve, 180);
          }
        }, baseDelay + col * reelDelay);
      }
    });

    const currentGrid = workingGrid.map((row) => [...row]);
    setGrid(currentGrid);

    let runningMultiplier = isFreeSpin ? freeSpinMultiplier : 1;
    setCannonMultiplier(runningMultiplier);
    let totalSpinWin = 0;

    const cascadeActive = true;
    while (cascadeActive) {
      const baseConnections = evaluateBaseConnections(currentGrid, spinCost);
      if (baseConnections.length === 0) break;

      setIsTumbling(true);
      const cascadePositionsToRemove = new Set<string>();

      for (const connection of baseConnections) {
        const shotMultiplier = runningMultiplier;
        const payout = normalizeMoney(connection.basePayout * shotMultiplier);

        totalSpinWin = normalizeMoney(totalSpinWin + payout);
        runningMultiplier *= 2;
        
        setHighlighted(new Set(connection.positions.map(([row, col]) => toPosKey(row, col))));
        
        setCannonFlash(true);
        setChainPulseKey((v) => v + 1);
        await sleep(250);
        setCannonMultiplier(runningMultiplier);
        await sleep(400);
        setCannonFlash(false);
        setHighlighted(new Set());
        await sleep(200);

        connection.positions.forEach(([r, c]) => cascadePositionsToRemove.add(toPosKey(r, c)));
      }

      if (cascadePositionsToRemove.size > 0) {
        const droppedIndices = new Set<string>();
        const droppedPositions: Position[] = [];
        for (let col = 0; col < COLS; col++) {
          let writeRow = ROWS - 1;
          for (let readRow = ROWS - 1; readRow >= 0; readRow--) {
            if (!cascadePositionsToRemove.has(toPosKey(readRow, col))) {
              currentGrid[writeRow][col] = currentGrid[readRow][col];
              if (writeRow !== readRow) {
                droppedIndices.add(toPosKey(writeRow, col));
                droppedPositions.push([writeRow, col]);
              }
              writeRow--;
            }
          }
          while (writeRow >= 0) {
            currentGrid[writeRow][col] = randomSymbol(anteBet);
            droppedIndices.add(toPosKey(writeRow, col));
            droppedPositions.push([writeRow, col]);
            writeRow--;
          }
        }

        injectDropWild(currentGrid, droppedPositions);
        
        setLastDropIndices(droppedIndices);
        setGrid(currentGrid.map(row => [...row]));
        await sleep(650);
        setLastDropIndices(new Set());
      }
    }

    let actualWin = totalSpinWin;
    if (isFreeSpin) {
      setFreeSpinMultiplier(runningMultiplier);
      const prevFreeSpinWin = freeSpinWinRef.current;
      const remaining = Math.max(0, normalizeMoney(freeSpinCapRef.current - prevFreeSpinWin));
      const allowedSpinWin = remaining > 0 ? Math.min(actualWin, remaining) : 0;
      freeSpinWinRef.current = Math.min(freeSpinCapRef.current, normalizeMoney(prevFreeSpinWin + allowedSpinWin));
      actualWin = normalizeMoney(freeSpinWinRef.current - prevFreeSpinWin);
    }

    const updatedRoundPayout = normalizeMoney(pendingRoundPayoutRef.current + actualWin);
    pendingRoundPayoutRef.current = updatedRoundPayout;
    setPendingRoundPayout(updatedRoundPayout);
    
    const scatterCount = countScatters(currentGrid);
    if (scatterCount >= 3) {
       const scatterPositions = [];
       for (let r=0; r<ROWS; r++) {
         for (let c=0; c<COLS; c++) {
           if (currentGrid[r][c] === "💣") scatterPositions.push(toPosKey(r,c));
         }
       }
       setHighlighted(new Set(scatterPositions));
       await sleep(1000);
       setHighlighted(new Set());
    }

    if (isFreeSpin) {
      const retriggerCount = scatterCount >= 3 ? 5 + 2 * Math.max(0, scatterCount - 3) : 0;
      const leftAfter = Math.max(0, freeSpinsLeft - 1 + retriggerCount);
      setFreeSpinsLeft(leftAfter);

      if (leftAfter <= 0) {
        setPhase("idle");
        setIsAutospinning(false);
        settleRound(pendingRoundStakeRef.current, updatedRoundPayout, pendingMultiDenominatorRef.current);
        setCannonMultiplier(1);
      } else {
        await sleep(400);
      }
    } else {
      if (scatterCount >= 3) {
        setPhase("free");
        setIsAutospinning(false);
        setAnteBet(false);
        const extraSpins = 2 * Math.max(0, scatterCount - 3);
        setFreeSpinsLeft(FREE_SPINS_AWARD + extraSpins);
        setFreeSpinMultiplier(runningMultiplier);
        
        const maxWin = normalizeMoney(pendingMultiDenominatorRef.current * FREE_SPIN_MAX_WIN_MULTIPLIER);
        freeSpinCapRef.current = maxWin;
        freeSpinWinRef.current = actualWin;
      } else {
        setPhase("idle");
        settleRound(pendingRoundStakeRef.current, updatedRoundPayout, pendingMultiDenominatorRef.current);
        setCannonMultiplier(1);
      }
    }

    isExecutingSpinRef.current = false;
    setIsExecutingSpin(false);
    setIsTumbling(false);
  }, [anteBet, freeSpinMultiplier, freeSpinsLeft, grid, phase, settleRound, spinCost]);

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
        handleMainSpin();
      }, 350);

      return () => window.clearTimeout(timer);
    }

    if (phase === "free") {
      if (freeSpinsLeft <= 0) {
        setIsAutospinning(false);
        return;
      }

      const timer = window.setTimeout(() => {
        handleMainSpin();
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
                className="w-full bg-[#0f212e] border border-[#2f4553] rounded-md py-2 pl-7 pr-4 text-white font-mono focus:outline-none focus:border-[#ffd369] transition-colors"
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
            <div className="rounded-3xl overflow-hidden relative bg-[#162836] h-140 sm:h-160 p-2 sm:p-4">
              <PirateSeaBackground />

              <div className="relative z-10 flex flex-col items-center justify-center h-full">
                {phase === "free" && (
									<div className="absolute top-3 sm:top-5 left-1/2 -translate-x-1/2 z-30 flex justify-center w-full px-4 pointer-events-none">
										<div className="bg-[#0f212e]/90 backdrop-blur-md border border-[#ffd369]/30 px-5 py-2 rounded-full flex items-center gap-5 shadow-[0_0_20px_rgba(0,0,0,0.4)]">
											<div className="flex items-center gap-2.5">
												<span className="text-[10px] text-[#fef3c7] font-black uppercase tracking-widest">Spins</span>
												<span className="text-xl font-black text-[#ffd369] leading-none">{freeSpinsLeft}</span>
											</div>
										</div>
									</div>
								)}

                <div className="p-1.5 sm:p-2 rounded-2xl w-full max-w-[500px] mx-auto">
                  <div className="grid grid-cols-5 gap-1.5 sm:gap-2 mx-auto w-full">
                    {Array.from({ length: COLS }, (_, col) => (
                      <div key={`col-${col}`} className="flex flex-col gap-1.5 sm:gap-2 relative overflow-visible">
                        {Array.from({ length: ROWS }, (_, row) => {
                          const symbol = grid[row][col];
                          const key = toPosKey(row, col);
                          const isHit = highlighted.has(key);
                          const isDropping = lastDropIndices.has(key);
                          const isSpinning = reelsSpinning[col];

                          return (
                            <div
                              key={key}
                              className={`aspect-square w-full rounded-xl transition-all duration-200 flex items-center justify-center relative z-0`}
                            >
                              {!isSpinning && (
                                <div className={`relative z-10 w-full h-full flex items-center justify-center select-none leading-none transform-gpu filter
                                    ${isHit ? "animate-pop" : isDropping ? "animate-drop-in" : !isTumbling && isExecutingSpin ? "animate-stop-bounce" : ""}
                                `}>
                                  <SlotSymbol symbol={symbol} />
                                </div>
                              )}
                            </div>
                          );
                        })}

                        {reelsSpinning[col] && (
                          <div className="absolute inset-0 overflow-hidden rounded-xl z-20 pointer-events-none">
                            <div className="flex flex-col gap-1.5 sm:gap-2 absolute top-0 left-0 w-full h-[470%] animate-spin-infinite-down opacity-80">
                              {Array.from({ length: 4 }).flatMap((_, loopIdx) =>
                                reelFrames[col].map((symbol, idx) => (
                                  <div key={`spin-${col}-${idx}-${loopIdx}-${spinKey}`} className="aspect-square w-full flex items-center justify-center rounded-xl">
                                    <SlotSymbol symbol={symbol} blurred />
                                  </div>
                                ))
                              )}
                            </div>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>

                <CannonChain currentMultiplier={cannonMultiplier} flash={cannonFlash} pulseKey={chainPulseKey} sticky={phase === "free"} />
                </div>
            </div>
          </div>

          <GameRecordsPanel gameId="barbarossa" />
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
          animation: dropIn 0.62s cubic-bezier(0.34, 1.56, 0.64, 1) forwards;
        }
        @keyframes pop {
          0% { transform: scale(1); }
          50% { transform: scale(1.35); }
          100% { transform: scale(1); }
        }
        .animate-pop {
          animation: pop 0.2s ease-in-out;
        }
        @keyframes stop-bounce {
          0% { transform: translateY(-18px); }
          60% { transform: translateY(4px); }
          100% { transform: translateY(0); }
        }
        .animate-stop-bounce {
          animation: stop-bounce 0.3s cubic-bezier(0.25, 1, 0.5, 1) forwards;
        }
        @keyframes spinInfiniteDown {
          0% { transform: translateY(-8%); }
          100% { transform: translateY(8%); }
        }
        .animate-spin-infinite-down {
          animation: spinInfiniteDown 90ms linear infinite;
        }
        @keyframes cannonRecoil {
          0% { transform: translateX(0) rotate(0); }
          10% { transform: translateX(-15px) rotate(-2deg); }
          40% { transform: translateX(2px) rotate(0.5deg); }
          100% { transform: translateX(0) rotate(0); }
        }
        .animate-cannon-recoil {
          animation: cannonRecoil 0.4s cubic-bezier(0.25, 1, 0.5, 1);
        }
        @keyframes flashCore {
          0% { transform: scale(0.2) scaleY(0.5); opacity: 1; }
          20% { transform: scale(1.5) scaleY(0.8); opacity: 1; }
          100% { transform: scale(2) scaleY(1); opacity: 0; }
        }
        .animate-flash-core {
          animation: flashCore 0.3s ease-out forwards;
        }
        @keyframes flashCloud {
          0% { transform: scale(0.3) translateX(-10px); opacity: 1; }
          40% { transform: scale(1.2) translateX(40px); opacity: 0.8; }
          100% { transform: scale(2) translateX(100px); opacity: 0; }
        }
        .animate-flash-cloud {
          animation: flashCloud 0.5s ease-out forwards;
        }
        @keyframes flashStreak {
          0% { transform: scaleX(0) translateX(0); opacity: 1; }
          30% { transform: scaleX(1) translateX(100px); opacity: 0.8; }
          100% { transform: scaleX(0.2) translateX(250px); opacity: 0; }
        }
        .animate-flash-streak {
          animation: flashStreak 0.4s cubic-bezier(0.25, 1, 0.5, 1) forwards;
          transform-origin: left;
        }
        @keyframes ballShoot {
          0% { transform: translateY(-50%) translateX(0) scale(1) rotate(0deg); opacity: 1; }
          20% { transform: translateY(-50%) translateX(100px) scale(0.8) rotate(180deg); opacity: 1; filter: drop-shadow(0 0 15px #ef4444); }
          100% { transform: translateY(-50%) translateX(150px) scale(0) rotate(360deg); opacity: 0; }
        }
        .animate-ball-shoot {
          animation: ballShoot 0.4s ease-in forwards;
        }
        @keyframes chainStep {
          0% { transform: translateX(40px); opacity: 0.3; }
          100% { transform: translateX(0px); opacity: 1; }
        }
        .animate-chain-step {
          animation: chainStep 0.4s ease-out;
        }
        @keyframes krakenFloat {
          0%, 100% { transform: translateY(0) rotate(0); }
          50% { transform: translateY(-20px) rotate(2deg); }
        }
        .animate-kraken-float {
          animation: krakenFloat 8s ease-in-out infinite;
        }
      `}</style>
    </>
  );
}
