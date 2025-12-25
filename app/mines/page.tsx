"use client";

import React, { useState, useEffect, useMemo } from "react";
import { useWallet } from "@/components/WalletProvider";
import { Diamond, LocalFireDepartment, PlayArrow } from "@mui/icons-material";

const MULTIPLIERS: Record<number, number[]> = {
  1: [1.03, 1.08, 1.12, 1.18, 1.24, 1.3, 1.37, 1.46, 1.55, 1.65, 1.77, 1.9, 2.06, 2.25, 2.47, 2.75, 3.09, 3.54, 4.12, 4.95, 6.19, 8.25, 12.37, 24.75],
  2: [1.08, 1.17, 1.29, 1.41, 1.56, 1.74, 1.94, 2.18, 2.47, 2.83, 3.26, 3.81, 4.5, 5.4, 6.6, 8.25, 10.61, 14.14, 19.8, 29.7, 49.5, 99, 297],
  3: [1.12, 1.29, 1.48, 1.71, 2, 2.35, 2.79, 3.35, 4.07, 5, 6.26, 7.96, 10.35, 13.8, 18.97, 27.11, 40.66, 65.06, 113.85, 227.7, 569.25, 2277],
  4: [1.18, 1.41, 1.71, 2.09, 2.58, 3.23, 4.09, 5.26, 6.88, 9.17, 12.51, 17.52, 25.3, 37.95, 59.64, 99.39, 178.91, 357.81, 834.9, 2504.7, 12523.5],
  5: [1.24, 1.56, 2, 2.58, 3.39, 4.52, 6.14, 8.5, 12.04, 17.52, 26.27, 40.87, 66.41, 113.85, 208.72, 417.45, 939.26, 2504.7, 8766.45, 52598.7],
  6: [1.3, 1.74, 2.35, 3.23, 4.52, 6.46, 9.44, 14.17, 21.89, 35.03, 58.38, 102.17, 189.75, 379.5, 834.9, 2087.25, 6261.75, 25047, 175329],
  7: [1.37, 1.94, 2.79, 4.09, 6.14, 9.44, 14.95, 24.47, 41.6, 73.95, 138.66, 277.33, 600.87, 1442.1, 3965.25, 13219.25, 59486.62, 475893],
  8: [1.46, 2.18, 3.35, 5.26, 8.5, 14.17, 24.47, 44.05, 83.2, 166.4, 356.56, 831.98, 2163.45, 6489.45, 23794.65, 118973.25, 1070759.25],
  9: [1.55, 2.47, 4.07, 6.88, 12.04, 21.89, 41.6, 83.2, 176.8, 404.1, 1010.26, 2828.73, 9193.39, 36773.55, 202254.52, 2022545.25],
  10: [1.65, 2.83, 5, 9.17, 17.52, 35.03, 73.95, 166.4, 404.1, 1077.61, 3232.84, 11314.94, 49031.4, 294188.4, 3236072.4],
  11: [1.77, 3.26, 6.26, 12.51, 26.27, 58.38, 138.66, 356.56, 1010.26, 3232.84, 12123.15, 56574.69, 367735.5, 4412826],
  12: [1.9, 3.81, 7.96, 17.52, 40.87, 102.17, 277.33, 831.98, 2828.73, 11314.69, 56574.69, 396022.85, 5148297],
  13: [2.06, 4.5, 10.35, 25.3, 66.41, 189.75, 600.87, 2163.15, 9193.39, 49031.4, 367735.5, 5148297],
  14: [2.25, 5.4, 13.8, 37.95, 113.85, 379.5, 1442.1, 6489.45, 36773.55, 294188.4, 4412826],
  15: [2.47, 6.6, 18.97, 59.64, 208.72, 834.9, 3965.77, 23794.52, 202254.52, 3236072.4],
  16: [2.75, 8.25, 27.11, 99.39, 418.45, 2087.25, 13219.25, 118973.25, 2022545.25],
  17: [3.09, 10.61, 40.66, 178.91, 939.26, 6261.75, 59486.62, 1070759.25],
  18: [3.54, 14.14, 65.06, 357.81, 2504.7, 25047, 475893],
  19: [4.12, 19.8, 113.85, 834.9, 8766.45, 175329],
  20: [4.95, 29.7, 227.7, 2504.7, 52598.7],
  21: [6.19, 45.5, 569.25, 12523.5],
  22: [8.25, 99, 2277],
  23: [12.38, 297],
  24: [24.75]
};

type GameState = "idle" | "playing" | "cashed_out" | "game_over";

interface Tile {
  id: number;
  isMine: boolean;
  isRevealed: boolean;
  revealedByPlayer: boolean;
}

export default function MinesPage() {
  const blendHexColors = (hex1: string, hex2: string, weight = 0.5) => {
    const h1 = hex1.replace('#', '');
    const h2 = hex2.replace('#', '');
    const r1 = parseInt(h1.substring(0, 2), 16);
    const g1 = parseInt(h1.substring(2, 4), 16);
    const b1 = parseInt(h1.substring(4, 6), 16);
    const r2 = parseInt(h2.substring(0, 2), 16);
    const g2 = parseInt(h2.substring(2, 4), 16);
    const b2 = parseInt(h2.substring(4, 6), 16);
    const r = Math.round(r1 * (1 - weight) + r2 * weight);
    const g = Math.round(g1 * (1 - weight) + g2 * weight);
    const b = Math.round(b1 * (1 - weight) + b2 * weight);
    const hex = (n: number) => n.toString(16).padStart(2, '0');
    return `#${hex(r)}${hex(g)}${hex(b)}`;
  };
  const { balance, addToBalance, subtractFromBalance, finalizePendingLoss } = useWallet();
  
  const [betAmount, setBetAmount] = useState<number>(10);
  const [betInput, setBetInput] = useState<string>("10");
  const [mineCount, setMineCount] = useState<number>(3);
  const [gameState, setGameState] = useState<GameState>("idle");
  const [grid, setGrid] = useState<Tile[]>([]);
  const [revealedCount, setRevealedCount] = useState<number>(0);
  const [lastWin, setLastWin] = useState<number>(0);

  useEffect(() => {
    resetGrid();
  }, []);

  const resetGrid = () => {
    const newGrid = Array.from({ length: 25 }, (_, i) => ({
      id: i,
      isMine: false,
      isRevealed: false,
      revealedByPlayer: false,
    }));
    setGrid(newGrid);
  };

  const currentMultiplier = useMemo(() => {
    if (revealedCount === 0) return 1.0;
    const multipliers = MULTIPLIERS[mineCount];
    if (!multipliers) return 1.0;
    return multipliers[revealedCount - 1] || multipliers[multipliers.length - 1];
  }, [mineCount, revealedCount]);

  const nextMultiplier = useMemo(() => {
    const multipliers = MULTIPLIERS[mineCount];
    if (!multipliers) return 0;
    if (revealedCount >= multipliers.length) return 0;
    return multipliers[revealedCount];
  }, [mineCount, revealedCount]);

  const potentialWin = useMemo(() => {
    return betAmount * currentMultiplier;
  }, [betAmount, currentMultiplier]);

  const startGame = () => {
    if (balance < betAmount) {
      alert("Insufficient balance!");
      return;
    }
    if (gameState === "playing") return;

    subtractFromBalance(betAmount);
    setGameState("playing");
    setRevealedCount(0);
    setLastWin(0);

    const newGrid = Array.from({ length: 25 }, (_, i) => ({
      id: i,
      isMine: false,
      isRevealed: false,
      revealedByPlayer: false,
    }));

    let minesPlaced = 0;
    while (minesPlaced < mineCount) {
      const idx = Math.floor(Math.random() * 25);
      if (!newGrid[idx].isMine) {
        newGrid[idx].isMine = true;
        minesPlaced++;
      }
    }
    setGrid(newGrid);
  };

  const revealTile = (id: number) => {
    if (gameState !== "playing") return;
    
    const tile = grid[id];
    if (tile.isRevealed) return;

    const newGrid = [...grid];
    newGrid[id] = { ...tile, isRevealed: true, revealedByPlayer: true };
    setGrid(newGrid);

    if (tile.isMine) {
      setGameState("game_over");
      setGrid(newGrid.map((t) => ({ ...t, isRevealed: true })));
      finalizePendingLoss();
    } else {
      const newRevealedCount = revealedCount + 1;
      setRevealedCount(newRevealedCount);
      
      const totalSafeTiles = 25 - mineCount;
      if (newRevealedCount >= totalSafeTiles) {
        const winAmount = betAmount * (MULTIPLIERS[mineCount][newRevealedCount - 1]);
        addToBalance(winAmount);
        setLastWin(winAmount);
        setGameState("cashed_out");

        setGrid(newGrid.map((t) => ({ ...t, isRevealed: true })));
      }
    }
  };

  const cashOut = () => {
    if (gameState !== "playing") return;
    if (revealedCount === 0) return;

    const winAmount = potentialWin;
    addToBalance(winAmount);
    setLastWin(winAmount);
    setGameState("cashed_out");

    setGrid((prev) => prev.map((t) => ({ ...t, isRevealed: true })));
  };

  return (
    <div className="p-2 sm:p-4 lg:p-6 max-w-[1400px] mx-auto flex flex-col lg:flex-row gap-4 lg:gap-8">
      <div className="w-full lg:w-[350px] flex flex-col gap-6 bg-[#0f212e] p-4 sm:p-6 rounded-xl h-fit">
        <div className="space-y-2">
          <label className="text-xs font-bold text-[#b1bad3] uppercase tracking-wider">Bet Amount</label>
          <div className="relative">
            <div className="absolute left-3 top-1/2 -translate-y-1/2 text-[#b1bad3]">$</div>
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
              disabled={gameState === "playing"}
              className="w-full bg-[#0f212e] border border-[#2f4553] rounded-md py-2 pl-7 pr-4 text-white font-mono focus:outline-none focus:border-[#00e701] transition-colors disabled:opacity-50"
            />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <button 
              onClick={() => {
                const newBet = Number((betAmount / 2).toFixed(2));
                setBetAmount(newBet);
                setBetInput(String(newBet));
              }}
              disabled={gameState === "playing"}
              className="bg-[#2f4553] hover:bg-[#3e5666] text-xs py-1 rounded text-[#b1bad3] disabled:opacity-50"
            >
              ½
            </button>
            <button 
              onClick={() => {
                const newBet = Number((betAmount * 2).toFixed(2));
                setBetAmount(newBet);
                setBetInput(String(newBet));
              }}
              disabled={gameState === "playing"}
              className="bg-[#2f4553] hover:bg-[#3e5666] text-xs py-1 rounded text-[#b1bad3] disabled:opacity-50"
            >
              2×
            </button>
          </div>
        </div>

        <div className="space-y-2">
          <label className="text-xs font-bold text-[#b1bad3] uppercase tracking-wider">Mines</label>
          <select
            value={mineCount}
            onChange={(e) => setMineCount(Number(e.target.value))}
            disabled={gameState === "playing"}
            className="w-full bg-[#0f212e] border border-[#2f4553] rounded-md py-2 px-4 text-white focus:outline-none focus:border-[#00e701] transition-colors disabled:opacity-50"
          >
            {Array.from({ length: 24 }, (_, i) => i + 1).map((num) => (
              <option key={num} value={num}>
                {num}
              </option>
            ))}
          </select>
        </div>

        {gameState === "playing" ? (
          <div className="flex flex-col gap-3">
            <div className="bg-[#0f212e] p-4 rounded border border-[#2f4553] text-center">
              <div className="text-[#b1bad3] text-sm">Current Win</div>
              <div className="text-2xl font-bold text-[#00e701]">{potentialWin.toFixed(2)}</div>
              <div className="text-sm text-[#b1bad3] mt-1">
                Next: {nextMultiplier ? `${nextMultiplier}x` : "Max"}
              </div>
            </div>
            <button
              onClick={cashOut}
              disabled={revealedCount === 0}
              className="w-full bg-[#00e701] hover:bg-[#00c201] text-black py-3 rounded-md font-bold text-lg shadow-[0_0_20px_rgba(0,231,1,0.2)] transition-all active:scale-95 flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Cashout
            </button>
          </div>
        ) : (
          <button
            onClick={startGame}
            className="w-full bg-[#00e701] hover:bg-[#00c201] text-black py-3 rounded-md font-bold text-lg shadow-[0_0_20px_rgba(0,231,1,0.2)] transition-all active:scale-95 flex items-center justify-center gap-2"
          >
            <PlayArrow /> Bet
          </button>
        )}

        {lastWin > 0 && gameState !== "playing" && (
          <div className="mt-4 p-4 bg-[#213743] border border-[#00e701] rounded-md text-center">
            <div className="text-xs text-[#b1bad3] uppercase">You Won</div>
            <div className="text-xl font-bold text-[#00e701]">{lastWin.toFixed(2)}</div>
          </div>
        )}

      </div>

      <div className="flex-1 flex flex-col items-center justify-center bg-[#0f212e] rounded-xl p-4 sm:p-8 relative min-h-[400px] sm:min-h-[500px]">
        <div className="grid grid-cols-5 gap-2 sm:gap-3 w-full max-w-[500px] aspect-square">
          {grid.map((tile) => {
            const isAutoRevealed = tile.isRevealed && !tile.revealedByPlayer;
            const baseSafe = '#213743';
            const baseMine = '#ef4444';
            const target = '#0f212e';
            const blendedBg = tile.isRevealed
              ? (isAutoRevealed ? blendHexColors(tile.isMine ? baseMine : baseSafe, target, 0.5) : (tile.isMine ? baseMine : baseSafe))
              : undefined;

            return (
              <button
                key={tile.id}
                onClick={() => revealTile(tile.id)}
                disabled={gameState !== 'playing' || tile.isRevealed}
                className={
                  `relative rounded-lg transition-all duration-200 flex items-center justify-center aspect-square
                  ${!tile.isRevealed ? "bg-[#2f4553] hover:bg-[#3c5566] hover:-translate-y-1 cursor-pointer shadow-[0_4px_0_0_#1a2c38]" : (tile.isMine && tile.revealedByPlayer ? "animate-shake" : "")}
                  ${gameState !== 'playing' && !tile.isRevealed ? 'cursor-default hover:transform-none opacity-50' : ''}`
                }
                style={blendedBg ? { backgroundColor: blendedBg } : undefined}
              >
                {tile.isRevealed && (
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: '35%', height: '35%' }}>
                    {tile.isMine ? (
                      <LocalFireDepartment
                        style={{
                          width: tile.revealedByPlayer ? '100%' : '75%',
                          height: tile.revealedByPlayer ? '100%' : '75%',
                          color: tile.revealedByPlayer ? '#4c0f0f' : '#4c0f0f',
                          filter: tile.revealedByPlayer ? 'drop-shadow(0 0 12px rgba(127,29,29,0.45))' : undefined,
                        }}
                      />
                    ) : (
                      <Diamond
                        style={{
                          width: tile.revealedByPlayer ? '100%' : '75%',
                          height: tile.revealedByPlayer ? '100%' : '75%',
                          color: tile.revealedByPlayer ? '#00ff17' : '#0b6623',
                          filter: tile.revealedByPlayer ? 'drop-shadow(0 0 16px rgba(0,231,1,0.85))' : 'brightness(1.25)',
                        }}
                      />
                    )}
                  </div>
                )}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
