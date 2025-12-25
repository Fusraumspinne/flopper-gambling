"use client";

import React, { useState, useEffect, useRef } from "react";
import { useWallet } from "@/components/WalletProvider";
import { PlayArrow } from "@mui/icons-material";

type Difficulty = "Easy" | "Medium" | "Hard";

interface Step {
  multiplier: number;
  probability: number;
}

const GAME_DATA: Record<Difficulty, Step[]> = {
  Easy: [
    { multiplier: 1, probability: 100 },
    { multiplier: 1.02, probability: 96 },
    { multiplier: 1.07, probability: 92 },
    { multiplier: 1.11, probability: 88 },
    { multiplier: 1.17, probability: 84 },
    { multiplier: 1.23, probability: 80 },
    { multiplier: 1.29, probability: 76 },
    { multiplier: 1.36, probability: 72 },
    { multiplier: 1.44, probability: 68 },
    { multiplier: 1.53, probability: 64 },
    { multiplier: 1.63, probability: 60 },
    { multiplier: 1.75, probability: 56 },
    { multiplier: 1.88, probability: 52 },
    { multiplier: 2.04, probability: 48 },
    { multiplier: 2.23, probability: 44 },
    { multiplier: 2.45, probability: 40 },
    { multiplier: 2.72, probability: 36 },
    { multiplier: 3.06, probability: 32 },
    { multiplier: 3.5, probability: 28 },
    { multiplier: 4.08, probability: 24 },
    { multiplier: 4.9, probability: 20 },
    { multiplier: 6.13, probability: 16 },
    { multiplier: 8.17, probability: 12 },
    { multiplier: 12.25, probability: 8 },
    { multiplier: 24.5, probability: 4 },
  ],
  Medium: [
    { multiplier: 1, probability: 100 },
    { multiplier: 1.11, probability: 88 },
    { multiplier: 1.27, probability: 77 },
    { multiplier: 1.46, probability: 66.956522 },
    { multiplier: 1.69, probability: 57.826087 },
    { multiplier: 1.98, probability: 49.565217 },
    { multiplier: 2.33, probability: 42.130435 },
    { multiplier: 2.76, probability: 35.478261 },
    { multiplier: 3.31, probability: 29.565217 },
    { multiplier: 4.03, probability: 24.347826 },
    { multiplier: 4.95, probability: 19.782609 },
    { multiplier: 6.19, probability: 15.826087 },
    { multiplier: 7.88, probability: 12.434783 },
    { multiplier: 10.25, probability: 9.565217 },
    { multiplier: 13.66, probability: 7.173913 },
    { multiplier: 18.78, probability: 5.217391 },
    { multiplier: 26.83, probability: 3.652174 },
    { multiplier: 40.25, probability: 2.434783 },
    { multiplier: 64.4, probability: 1.521739 },
    { multiplier: 112.7, probability: 0.869565 },
    { multiplier: 225.4, probability: 0.434783 },
    { multiplier: 563.5, probability: 0.173913 },
    { multiplier: 2254, probability: 0.043478 },
  ],
  Hard: [
    { multiplier: 1, probability: 100 },
    { multiplier: 1.23, probability: 80 },
    { multiplier: 1.55, probability: 63.333333 },
    { multiplier: 1.98, probability: 49.565217 },
    { multiplier: 2.56, probability: 38.300395 },
    { multiplier: 3.36, probability: 29.181254 },
    { multiplier: 4.48, probability: 21.88594 },
    { multiplier: 6.08, probability: 16.126482 },
    { multiplier: 8.41, probability: 11.649604 },
    { multiplier: 11.92, probability: 8.221344 },
    { multiplier: 17.34, probability: 5.652174 },
    { multiplier: 26.01, probability: 3.768116 },
    { multiplier: 40.46, probability: 2.42236 },
    { multiplier: 65.74, probability: 1.490683 },
    { multiplier: 112.7, probability: 0.869565 },
    { multiplier: 206.62, probability: 0.474308 },
    { multiplier: 413.23, probability: 0.237154 },
    { multiplier: 929.77, probability: 0.105402 },
    { multiplier: 2479.4, probability: 0.039526 },
    { multiplier: 8677.9, probability: 0.011293 },
    { multiplier: 52076.4, probability: 0.001882 },
  ],
};

type GameState = "idle" | "playing" | "cashed_out" | "popped";

export default function PumpPage() {
  const { balance, addToBalance, subtractFromBalance, finalizePendingLoss } =
    useWallet();

  const [betAmount, setBetAmount] = useState<number>(10);
  const [betInput, setBetInput] = useState<string>("10");
  const [difficulty, setDifficulty] = useState<Difficulty>("Medium");
  const [gameState, setGameState] = useState<GameState>("idle");
  const [currentStepIndex, setCurrentStepIndex] = useState<number>(0);
  const [lastWin, setLastWin] = useState<number>(0);

  const [scale, setScale] = useState(1);
  const [isPumping, setIsPumping] = useState(false);
  const [hasPumped, setHasPumped] = useState(false);

  const currentData = GAME_DATA[difficulty];
  const currentStep = currentData[currentStepIndex];
  const nextStep = currentData[currentStepIndex + 1];

  const potentialWin = betAmount * currentStep.multiplier;

  const stepsScrollRef = useRef<HTMLDivElement | null>(null);
  const stepRefs = useRef<Array<HTMLDivElement | null>>([]);

  const formatProb = (p: number) => {
    if (p >= 1) {
      return `${Number(p.toFixed(p % 1 ? 2 : 0))}%`;
    }
    if (p === 0) return "0%";
    return `${Number(p.toPrecision(3))}%`;
  };

  useEffect(() => {
    if (gameState !== "playing") return;
    const el = stepRefs.current[currentStepIndex];
    if (el && stepsScrollRef.current) {
      try {
        el.scrollIntoView({ behavior: "smooth", block: "nearest", inline: "center" });
      } catch (e) {
        const container = stepsScrollRef.current;
        const left = el.offsetLeft - container.clientWidth / 2 + el.clientWidth / 2;
        container.scrollTo({ left, behavior: "smooth" });
      }
    }
  }, [currentStepIndex, gameState]);

  const startGame = () => {
    if (balance < betAmount) {
      alert("Insufficient balance!");
      return;
    }
    if (gameState === "playing") return;

    subtractFromBalance(betAmount);
    setGameState("playing");
    setCurrentStepIndex(0);
    setLastWin(0);
    setScale(1);
    setHasPumped(false);
  };

  const resetSession = () => {
    setGameState("idle");
    setCurrentStepIndex(0);
    setLastWin(0);
    setHasPumped(false);
    setScale(1);
  };

  const changeDifficulty = (level: Difficulty) => {
    if (level === difficulty) return;
    setDifficulty(level);
    resetSession();
  };

  const pump = () => {
    if (gameState !== "playing") return;
    if (!nextStep) return;

    setHasPumped(true);

    setIsPumping(true);

    const currentProb = currentStep.probability;
    const nextProb = nextStep.probability;
    const survivalChance = nextProb / currentProb;

    const random = Math.random();

    setTimeout(() => {
      setIsPumping(false);
      if (random <= survivalChance) {
        setCurrentStepIndex((prev) => prev + 1);
        setScale((prev) => prev + 0.1);
      } else {
        setGameState("popped");
        finalizePendingLoss();
      }
    }, 300);
  };

  const cashOut = () => {
    if (gameState !== "playing") return;

    addToBalance(potentialWin);
    setLastWin(potentialWin);
    setGameState("cashed_out");
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
          <label className="text-xs font-bold text-[#b1bad3] uppercase tracking-wider">
            Difficulty
          </label>
          <div className="bg-[#0f212e] p-1 rounded-md border border-[#2f4553] flex">
            {(["Easy", "Medium", "Hard"] as Difficulty[]).map((level) => (
              <button
                key={level}
                onClick={() => changeDifficulty(level)}
                disabled={gameState === "playing"}
                className={`flex-1 py-2 text-xs font-bold uppercase rounded transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${
                  difficulty === level
                    ? "bg-[#213743] text-white shadow-sm"
                    : "text-[#b1bad3] hover:text-white"
                }`}
              >
                {level}
              </button>
            ))}
          </div>
        </div>

        {gameState === "playing" ? (
          <div className="flex flex-col gap-3">
            <div className="bg-[#0f212e] p-4 rounded border border-[#2f4553] text-center">
              <div className="text-[#b1bad3] text-sm">Current Win</div>
              <div className="text-2xl font-bold text-[#00e701]">
                ${potentialWin.toFixed(2)}
              </div>
              <div className="text-sm text-[#b1bad3] mt-1">
                Next Multiplier: {nextStep.multiplier}x
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <button
                onClick={pump}
                disabled={isPumping || !nextStep}
                className="bg-[#2f4553] hover:bg-[#3e5666] text-white py-3 rounded-md font-bold text-lg transition-all active:scale-95 flex items-center justify-center gap-2 disabled:opacity-50"
              >
                Pump
              </button>
              <button
                onClick={cashOut}
                disabled={isPumping || !hasPumped}
                className="bg-[#00e701] hover:bg-[#00c201] text-black py-3 rounded-md font-bold text-lg shadow-[0_0_20px_rgba(0,231,1,0.2)] transition-all active:scale-95 flex items-center justify-center gap-2 disabled:opacity-50"
              >
                Cashout
              </button>
            </div>
          </div>
        ) : (
          <button
            onClick={startGame}
            className="w-full bg-[#00e701] hover:bg-[#00c201] text-black py-3 rounded-md font-bold text-lg shadow-[0_0_20px_rgba(0,231,1,0.2)] transition-all active:scale-95 flex items-center justify-center gap-2"
          >
            <PlayArrow /> Bet
          </button>
        )}

        {lastWin > 0 && gameState === "cashed_out" && (
          <div className="mt-2 p-4 bg-[#213743] border border-[#00e701] rounded-md text-center animate-pulse">
            <div className="text-xs text-[#b1bad3] uppercase">You Won</div>
            <div className="text-2xl font-bold text-[#00e701]">
              ${lastWin.toFixed(2)}
            </div>
          </div>
        )}
      </div>

      <div className="flex-1 bg-[#0f212e] p-4 sm:p-6 rounded-xl min-h-[400px] sm:min-h-[600px] flex flex-col items-center justify-center relative overflow-hidden">
        <div className="absolute top-10 text-center z-10">
          <div className="text-6xl font-black text-white drop-shadow-lg">
            {currentStep.multiplier}x
          </div>
        </div>

        <div className="relative w-full h-full flex items-center justify-center">
          <div
            className={`transition-transform duration-300 ease-out ${
              isPumping ? "scale-105" : "scale-100"
            }`}
            style={{
              transform: `scale(${
                gameState === "popped" ? 1.5 : 1 + currentStepIndex * 0.05
              })`,
              opacity: gameState === "popped" ? 0 : 1,
              transition:
                gameState === "popped"
                  ? "opacity 0.1s, transform 0.1s"
                  : "transform 0.3s cubic-bezier(0.175, 0.885, 0.32, 1.275)",
            }}
          >
            <svg
              width="200"
              height="240"
              viewBox="0 0 100 120"
              className="drop-shadow-[0_10px_20px_rgba(0,0,0,0.5)]"
            >
              <path
                d="M50 0 C 20 0 0 30 0 60 C 0 90 40 110 48 118 L 46 120 L 54 120 L 52 118 C 60 110 100 90 100 60 C 100 30 80 0 50 0 Z"
                fill={gameState === "popped" ? "#ef4444" : "#3b82f6"}
              />
              <ellipse
                cx="30"
                cy="30"
                rx="10"
                ry="20"
                fill="white"
                fillOpacity="0.2"
                transform="rotate(-20 30 30)"
              />
            </svg>

            <div className="absolute top-[100%] left-1/2 -translate-x-1/2 w-[2px] h-[100px] bg-white/20 origin-top animate-swing"></div>
          </div>

          {gameState === "popped" && (
            <div className="absolute inset-0 flex items-center justify-center">
              <div className="text-[#ef4444] font-black text-4xl">POP!</div>
            </div>
          )}
        </div>

        <div className="w-full mt-4">
          <div
            ref={stepsScrollRef}
            className="w-full overflow-x-auto"
          >
            <div className="flex items-center space-x-2 px-4 py-2">
              {currentData.map((step, idx) => (
                <div
                  key={idx}
                  ref={(el) => { stepRefs.current[idx] = el; }}
                  className={`min-w-[96px] flex-shrink-0 bg-[#213743] p-2 rounded-md border transition-transform ${
                    idx === currentStepIndex ? "border-[#00e701] scale-105" : "border-[#2f4553]"
                  }`}
                >
                  <div className="text-sm text-white font-bold text-center">
                    {step.multiplier}x
                  </div>
                  <div className="text-xs text-[#9fb0c6] mt-1 text-center">
                    {formatProb(step.probability)}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
