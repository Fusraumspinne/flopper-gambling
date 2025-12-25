"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import { useWallet } from "@/components/WalletProvider";
import { PlayArrow, Refresh } from "@mui/icons-material";

type GameState = "idle" | "rolling" | "won" | "lost";

const HOUSE_EDGE = 0.99;
const MIN_TARGET = 1.01;
const MAX_TARGET = Infinity;
const ROLL_ANIMATION_MS = 1000;

const clamp = (v: number, min: number, max: number) => Math.max(min, Math.min(max, v));

const formatMultiplier = (m: number) => {
  if (!Number.isFinite(m)) return "—";
  return m.toFixed(2);
};

export default function LimboPage() {
  const { balance, subtractFromBalance, addToBalance, finalizePendingLoss } = useWallet();

  const [betAmount, setBetAmount] = useState<number>(10);
  const [betInput, setBetInput] = useState<string>("10");

  const [targetMultiplier, setTargetMultiplier] = useState<number>(2);
  const [targetInput, setTargetInput] = useState<string>("2.00");
  
  const [gameState, setGameState] = useState<GameState>("idle");
  const [rolledMultiplier, setRolledMultiplier] = useState<number | null>(null);
  const [rollingDisplayMultiplier, setRollingDisplayMultiplier] = useState<number>(1);
  const [lastWin, setLastWin] = useState<number>(0);
  const [history, setHistory] = useState<{ mult: number; win: boolean }[]>([]);

  const rafRef = useRef<number | null>(null);

  useEffect(() => {
    return () => {
      if (rafRef.current !== null) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
    };
  }, []);

  const potentialProfit = useMemo(() => {
    return betAmount * targetMultiplier - betAmount;
  }, [betAmount, targetMultiplier]);

  const handleBetInputBlur = () => {
    const raw = betInput.trim();
    const sanitized = raw.replace(/^0+(?=\d)/, "") || "0";
    const num = Number(sanitized);
    setBetAmount(num);
    setBetInput(sanitized);
  };

  const handleTargetBlur = () => {
    const raw = targetInput.trim();
    const sanitized = raw.replace(/^0+(?=\d)/, "") || "0";
    let num = Number(sanitized);
    num = clamp(num, MIN_TARGET, MAX_TARGET);
    
    setTargetMultiplier(num);
    setTargetInput(num.toFixed(2));
    
    const newChance = (HOUSE_EDGE / num) * 100;
  };

  const roll = async () => {
    if (gameState === "rolling") return;
    if (betAmount <= 0) return;
    if (betAmount > balance) return;

    const t = clamp(targetMultiplier, MIN_TARGET, MAX_TARGET);

    subtractFromBalance(betAmount);
    setLastWin(0);
    setGameState("rolling");
    setRolledMultiplier(null);
    setRollingDisplayMultiplier(1);

    if (rafRef.current !== null) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }

    const floatVal = Math.random();
    const rawResult = HOUSE_EDGE / (floatVal || 0.00000001);
    const result = Math.max(1.00, rawResult);
    
    const isWin = result >= t;

    await new Promise<void>((resolve) => {
      const start = performance.now();
      const logResult = Math.log(result);

      const tick = (now: number) => {
        const elapsed = now - start;
        const p = clamp(elapsed / ROLL_ANIMATION_MS, 0, 1);

        const m = Math.exp(logResult * p);
        setRollingDisplayMultiplier(m);

        if (p >= 1) {
          rafRef.current = null;
          setRollingDisplayMultiplier(result);
          resolve();
          return;
        }

        rafRef.current = requestAnimationFrame(tick);
      };

      rafRef.current = requestAnimationFrame(tick);
    });

    setRolledMultiplier(result);
    setHistory((prev) => [...prev, { mult: result, win: result >= t }].slice(-8));

    if (isWin) {
      const payout = betAmount * t;
      addToBalance(payout);
      setLastWin(payout);
      setGameState("won");
    } else {
      finalizePendingLoss();
      setGameState("lost");
    }
  };

  const isLocked = gameState === "rolling";
  const shownMultiplier = gameState === "rolling" ? rollingDisplayMultiplier : rolledMultiplier;

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
              onBlur={handleBetInputBlur}
              disabled={isLocked}
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
              disabled={isLocked}
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
              disabled={isLocked}
              className="bg-[#2f4553] hover:bg-[#3e5666] text-xs py-1 rounded text-[#b1bad3] disabled:opacity-50"
            >
              2×
            </button>
          </div>
        </div>

        <div className="space-y-2">
          <label className="text-xs font-bold text-[#b1bad3] uppercase tracking-wider">Target Multiplier</label>
          <div className="relative">
            <input
              type="number"
              step="0.01"
              min={MIN_TARGET}
              max={Number.isFinite(MAX_TARGET) ? MAX_TARGET : undefined}
              value={targetInput}
              onChange={(e) => setTargetInput(e.target.value)}
              onBlur={handleTargetBlur}
              disabled={isLocked}
              className="w-full bg-[#0f212e] border border-[#2f4553] rounded-md py-2 px-4 text-white font-mono focus:outline-none focus:border-[#00e701] transition-colors disabled:opacity-50"
            />
            <div className="absolute right-3 top-1/2 -translate-y-1/2 text-[#b1bad3] text-sm">x</div>
          </div>
        </div>

        <button
          onClick={roll}
          disabled={isLocked}
          className="w-full bg-[#00e701] hover:bg-[#00c201] text-black py-4 rounded-md font-bold text-lg shadow-[0_0_20px_rgba(0,231,1,0.2)] transition-all active:scale-95 flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {isLocked ? (
             <Refresh className="animate-spin" />
          ) : (
             <PlayArrow />
          )}
          {isLocked ? "Rolling..." : "Bet"}
        </button>

        {lastWin > 0 && gameState === "won" && (
          <div className="mt-2 p-4 bg-[#213743] border border-[#00e701] rounded-md text-center animate-pulse">
            <div className="text-xs text-[#b1bad3] uppercase">You Won</div>
            <div className="text-2xl font-bold text-[#00e701]">${lastWin.toFixed(2)}</div>
          </div>
        )}
      </div>

      <div className="flex-1 flex flex-col items-center justify-center bg-[#0f212e] rounded-xl p-8 relative h-[400px] sm:h-[600px] overflow-hidden">
        
        <div className="relative z-10 flex flex-col items-center">
           <div className={`text-[4rem] sm:text-[6rem] md:text-[8rem] lg:text-[10rem] font-black font-mono leading-none transition-all duration-300 ${
              gameState === "won" ? "text-[#00e701] drop-shadow-[0_0_30px_rgba(0,231,1,0.4)] scale-110" :
              gameState === "lost" ? "text-[#ef4444] drop-shadow-[0_0_30px_rgba(239,68,68,0.4)]" :
              "text-white"
           }`}>
              {shownMultiplier === null ? "1.00x" : `${formatMultiplier(shownMultiplier)}x`}
           </div>
           {gameState === "won" && (
             <div className="mt-4 text-[#00e701] font-bold text-xl sm:text-2xl animate-bounce-in">
               WIN!
             </div>
           )}
        </div>
       
        {/* recent multipliers: start at center and grow to the right */}
        <div className="absolute top-4 left-1/2 -translate-x-1/2 z-10 flex gap-2">
          {history.map((h, i) => (
            <div
              key={i}
              className={`w-10 h-8 rounded-full flex items-center justify-center text-[10px] font-bold shadow-md animate-scale-in ${
                h.win ? "text-black" : "text-white"
              }`}
              style={{ backgroundColor: h.win ? "#00e701" : "#6b7280" }}
            >
              {formatMultiplier(h.mult)}x
            </div>
          ))}
        </div>
        
        {/* Background pulse effect */}
        {gameState === "rolling" && (
          <div className="absolute inset-0 bg-radial-gradient from-[#2f4553]/20 to-transparent animate-pulse pointer-events-none"></div>
        )}

      </div>
    </div>
  );
}
