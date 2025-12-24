"use client";

import React, { useState, useEffect, useCallback } from "react";
import { useWallet } from "@/components/WalletProvider";
import { PlayArrow, Refresh, Delete, Bolt, Diamond } from "@mui/icons-material";

type RiskLevel = "low" | "medium" | "high";

const MULTIPLIERS: Record<RiskLevel, Record<number, number[]>> = {
  low: {
    1: [0.7, 1.85],
    2: [0, 2, 3.8],
    3: [0, 1.1, 1.38, 26],
    4: [0, 0, 2.2, 7.9, 90],
    5: [0, 0, 1.5, 4.2, 13, 300],
    6: [0, 0, 1.1, 2, 6.2, 100, 700],
    7: [0, 0, 1.1, 1.6, 3.5, 15, 225, 700],
    8: [0, 0, 1.1, 1.5, 2, 5.5, 39, 100, 800],
    9: [0, 0, 1.1, 1.3, 1.7, 2.5, 7.5, 50, 250, 1000],
    10: [0, 0, 1.1, 1.2, 1.3, 1.8, 3.5, 13, 50, 250, 1000],
  },

  medium: {
    1: [0.4, 2.75],
    2: [0, 1.8, 5.1],
    3: [0, 0, 2.8, 50],
    4: [0, 0, 1.7, 10, 100],
    5: [0, 0, 1.4, 4, 14, 390],
    6: [0, 0, 0, 3, 9, 180, 710],
    7: [0, 0, 0, 2, 7, 30, 400, 800],
    8: [0, 0, 0, 2, 4, 11, 67, 400, 900],
    9: [0, 0, 0, 2, 2.5, 5, 15, 100, 500, 1000],
    10: [0, 0, 0, 1.6, 2, 4, 7, 26, 100, 500, 1000],
  },

  high: {
    1: [0, 3.96],
    2: [0, 0, 17.1],
    3: [0, 0, 0, 81.5],
    4: [0, 0, 0, 10, 259],
    5: [0, 0, 0, 4.5, 48, 450],
    6: [0, 0, 0, 0, 11, 350, 710],
    7: [0, 0, 0, 0, 7, 90, 400, 800],
    8: [0, 0, 0, 0, 5, 20, 270, 600, 900],
    9: [0, 0, 0, 0, 4, 11, 56, 500, 800, 1000],
    10: [0, 0, 0, 0, 3.5, 8, 13, 63, 500, 800, 1000],
  },
};

const GRID_SIZE = 40;
const DRAW_COUNT = 10;

export default function KenoPage() {
  const { balance, subtractFromBalance, addToBalance, finalizePendingLoss } = useWallet();

  const [selectedNumbers, setSelectedNumbers] = useState<number[]>([]);
  const [drawnNumbers, setDrawnNumbers] = useState<number[]>([]);
  const [isAnimating, setIsAnimating] = useState(false);
  const [betAmount, setBetAmount] = useState<number>(10.0);
  const [betInput, setBetInput] = useState<string>(betAmount.toString());
  const [riskLevel, setRiskLevel] = useState<RiskLevel>("medium");
  const [lastWin, setLastWin] = useState<number>(0);

  const isRoundComplete = !isAnimating && drawnNumbers.length === DRAW_COUNT;

  const toggleNumber = (num: number) => {
    if (isAnimating) return;
    if (drawnNumbers.length > 0) {
      setDrawnNumbers([]);
    }
    if (selectedNumbers.includes(num)) {
      setSelectedNumbers((prev) => prev.filter((n) => n !== num));
    } else {
      if (selectedNumbers.length < 10) {
        setSelectedNumbers((prev) => [...prev, num]);
      }
    }
  };

  const clearSelection = () => {
    if (!isAnimating) {
      setSelectedNumbers([]);
      setDrawnNumbers([]);
      setLastWin(0);
    }
  };

  const pickRandom = () => {
    if (isAnimating) return;
    const count = 10;
    const newSelection: number[] = [];
    while (newSelection.length < count) {
      const r = Math.floor(Math.random() * GRID_SIZE) + 1;
      if (!newSelection.includes(r)) newSelection.push(r);
    }
    setDrawnNumbers([]);
    setLastWin(0);
    setSelectedNumbers(newSelection);
  };

  const getMultiplier = (matches: number) => {
    const count = selectedNumbers.length;
    if (count === 0) return 0;
    const table = MULTIPLIERS[riskLevel][count];
    return table && table[matches] ? table[matches] : 0;
  };

  const playGame = useCallback(async () => {
    if (
      selectedNumbers.length === 0 ||
      betAmount <= 0 ||
      betAmount > balance ||
      isAnimating
    ) {
      return;
    }

    subtractFromBalance(betAmount);
    setLastWin(0);
    setDrawnNumbers([]);
    setIsAnimating(true);

    const newDrawn: number[] = [];
    while (newDrawn.length < DRAW_COUNT) {
      const r = Math.floor(Math.random() * GRID_SIZE) + 1;
      if (!newDrawn.includes(r)) newDrawn.push(r);
    }

    for (let i = 0; i < newDrawn.length; i++) {
      await new Promise((resolve) => setTimeout(resolve, 150));
      setDrawnNumbers((prev) => [...prev, newDrawn[i]]);
    }

    const matches = selectedNumbers.filter((n) => newDrawn.includes(n)).length;
    const multiplier = getMultiplier(matches);
    const winAmount = betAmount * multiplier;

    if (winAmount > 0) {
      await new Promise((resolve) => setTimeout(resolve, 300));
      addToBalance(winAmount);
      setLastWin(winAmount);
    } else {
      finalizePendingLoss();
    }

    setIsAnimating(false);
  }, [
    selectedNumbers,
    betAmount,
    balance,
    isAnimating,
    riskLevel,
    subtractFromBalance,
    addToBalance,
  ]);

  const getTileStatus = (num: number) => {
    const isSelected = selectedNumbers.includes(num);
    const isDrawn = drawnNumbers.includes(num);
    if (isRoundComplete && !isDrawn) return "unrevealed";
    if (isSelected && isDrawn) return "hit";
    if (isDrawn && !isSelected) return "miss";
    if (isSelected) return "selected";
    return "default";
  };

  const getTileStyles = (status: string) => {
    switch (status) {
      case "hit":
        return "bg-[#00e701] text-black shadow-[0_0_20px_rgba(0,231,1,0.5)] scale-110 z-10 border border-[#ccffcc]";
      case "selected":
        return "bg-[#6b21a8] text-white shadow-[0_4px_0_#4c1d95] -translate-y-1 hover:bg-[#7e22ce] active:translate-y-0 active:shadow-none";
      case "miss":
        return "bg-[#0b1720] text-[#ef4444] scale-95 shadow-inner border border-[#ef4444]/20";
      case "unrevealed":
        return "bg-[#2f4553] text-[#b1bad3] opacity-50 scale-95";
      default:
        return "bg-[#213743] text-[#b1bad3] shadow-[0_4px_0_#1a2c38] hover:-translate-y-1 hover:bg-[#2f4553] active:translate-y-0 active:shadow-none transition-all duration-100";
    }
  };

  return (
    <div className="p-2 sm:p-4 lg:p-6 max-w-[1400px] mx-auto flex flex-col lg:flex-row gap-4 lg:gap-8">
      <div className="w-full lg:w-[350px] flex flex-col gap-6 bg-[#0f212e] p-4 sm:p-6 rounded-xl h-fit">
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
                onClick={() => !isAnimating && setRiskLevel(level)}
                disabled={isAnimating}
                className={`flex-1 py-2 text-xs font-bold uppercase rounded transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${
                  riskLevel === level
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
            Pick Numbers
          </label>
          <div className="flex gap-2">
            <button
              onClick={pickRandom}
              disabled={isAnimating}
              className="flex-1 bg-[#2f4553] hover:bg-[#3e5666] disabled:opacity-50 text-white py-2 rounded-md text-sm font-semibold flex items-center justify-center gap-2"
            >
              <Bolt sx={{ fontSize: 16 }} /> Random
            </button>
            <button
              onClick={clearSelection}
              disabled={isAnimating}
              className="flex-1 bg-[#2f4553] hover:bg-[#3e5666] disabled:opacity-50 text-white py-2 rounded-md text-sm font-semibold flex items-center justify-center gap-2"
            >
              <Delete sx={{ fontSize: 16 }} /> Clear
            </button>
          </div>
        </div>

        <button
          onClick={playGame}
          disabled={isAnimating || selectedNumbers.length === 0}
          className="w-full bg-[#00e701] hover:bg-[#00c201] disabled:opacity-50 disabled:cursor-not-allowed text-black py-4 rounded-md font-bold text-lg shadow-[0_0_20px_rgba(0,231,1,0.2)] transition-all active:scale-95 flex items-center justify-center gap-2"
        >
          {isAnimating ? (
            <Refresh className="animate-spin" />
          ) : (
            <PlayArrow sx={{ fill: "currentColor" }} />
          )}
          {isAnimating ? "Playing..." : "Bet"}
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

      <div className="flex-1 flex flex-col gap-6">
        <div className="bg-[#0f212e] p-6 rounded-xl relative overflow-hidden">
          <div className="grid grid-cols-5 sm:grid-cols-8 gap-2 sm:gap-3 max-w-[600px] mx-auto">
            {Array.from({ length: GRID_SIZE }, (_, i) => i + 1).map((num) => {
              const status = getTileStatus(num);
              const drawIndex = drawnNumbers.indexOf(num);
              const isDrawn = drawIndex >= 0;
              const isHit = status === "hit";
              const isMiss = status === "miss";
              const isUnrevealed = status === "unrevealed";

              const innerStyle: React.CSSProperties = isDrawn
                ? { transitionDelay: `${drawIndex * 140}ms` }
                : {};

              const innerStyles: React.CSSProperties = {
                width: "100%",
                height: "100%",
                position: "relative",
                transformStyle: "preserve-3d",
                transition: "transform 420ms cubic-bezier(.2,.9,.2,1)",
                transitionDelay: isDrawn ? `${drawIndex * 140}ms` : "0ms",
                transform: isDrawn || isRoundComplete ? "rotateX(180deg)" : "rotateX(0deg)",
              };

              const frontBackFaceStyle: React.CSSProperties = {
                position: "absolute",
                inset: 0,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                backfaceVisibility: "hidden",
              };

              const gemClasses = `transform transition-all duration-500 ${
                isDrawn || isRoundComplete ? "opacity-100 scale-100" : "opacity-0 scale-75"
              }`;

              return (
                <button
                  key={num}
                  onClick={() => toggleNumber(num)}
                  disabled={isAnimating}
                  style={{ perspective: 900 }}
                  className={`aspect-square rounded-lg font-bold text-sm sm:text-base p-0 border-0 relative transition-all duration-200 ${getTileStyles(
                    status
                  )}`}
                >
                  <div style={innerStyles}>
                    <div style={frontBackFaceStyle}>
                      <span className="select-none">{num}</span>
                    </div>
                    <div
                      style={{
                        ...frontBackFaceStyle,
                        transform: "rotateX(180deg)",
                      }}
                    >
                      {isHit ? (
                        <div className="animate-pulse drop-shadow-md">
                          <Diamond
                            sx={{ color: "#000", fontSize: 24 }}
                            className={gemClasses}
                            style={{
                              transitionDelay: isDrawn
                                ? `${drawIndex * 140 + 200}ms`
                                : "0ms",
                            }}
                          />
                        </div>
                      ) : isMiss ? (
                        <span className="text-[#ef4444] font-bold">{num}</span>
                      ) : isUnrevealed ? (
                        <Diamond
                          sx={{ color: "#557086", fontSize: 24 }}
                          className={`${gemClasses} opacity-70`}
                        />
                      ) : (
                        <div />
                      )}
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        <div className="bg-[#213743] p-4 rounded-xl overflow-x-auto">
          <div className="flex justify-between items-center min-w-max gap-2">
            {selectedNumbers.length > 0 ? (
              MULTIPLIERS[riskLevel][selectedNumbers.length]?.map(
                (mult, hits) => {
                  const currentMatches = selectedNumbers.filter((n) =>
                    drawnNumbers.includes(n)
                  ).length;
                  const isCurrent = isAnimating
                    ? false
                    : drawnNumbers.length > 0 && hits === currentMatches;

                  return (
                    <div
                      key={hits}
                      className={`flex flex-col items-center p-2 rounded min-w-[60px] ${
                        isCurrent
                          ? "bg-[#2f4553] text-white scale-105"
                          : "bg-[#0f212e] text-[#b1bad3]"
                      }`}
                    >
                      <span className="text-xs opacity-70">{hits}x</span>
                      <span className="font-bold">
                        {mult && mult > 0 ? `${mult}x` : "-"}
                      </span>
                    </div>
                  );
                }
              )
            ) : (
              <div className="text-[#b1bad3] text-sm w-full text-center">
                Select numbers to see payouts
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
