"use client";

import React, { useState } from "react";
import { useWallet } from "@/components/WalletProvider";
import { MonetizationOn } from "@mui/icons-material";

type CoinSide = "heads" | "tails";
type GameState = "idle" | "playing" | "cashed_out" | "lost";

const HOUSE_EDGE_MULTIPLIER = 1.98;

export default function CoinFlipPage() {
  const { balance, subtractFromBalance, addToBalance, finalizePendingLoss } = useWallet();

  const [betAmount, setBetAmount] = useState<number>(10);
  const [betInput, setBetInput] = useState<string>("10");
  const [gameState, setGameState] = useState<GameState>("idle");
  const [streak, setStreak] = useState<number>(0);
  const [history, setHistory] = useState<CoinSide[]>([]);
  const [isFlipping, setIsFlipping] = useState<boolean>(false);
  const [lastResult, setLastResult] = useState<CoinSide | null>(null);
  const [lastWin, setLastWin] = useState<number>(0);

  const currentMultiplier = Math.pow(HOUSE_EDGE_MULTIPLIER, streak);
  const nextMultiplier = Math.pow(HOUSE_EDGE_MULTIPLIER, streak + 1);
  const currentPayout = betAmount * currentMultiplier;
  const nextPayout = betAmount * nextMultiplier;

  const handleBetInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setBetInput(e.target.value);
  };

  const handleBetInputBlur = () => {
    const raw = betInput.trim();
    const sanitized = raw.replace(/^0+(?=\d)/, "") || "0";
    const num = Number(sanitized);
    setBetAmount(num);
    setBetInput(sanitized);
  };

  const startGame = (choice: CoinSide) => {
    if (balance < betAmount) return;
    
    subtractFromBalance(betAmount);
    setGameState("playing");
    setStreak(0);
    setHistory([]);
    setLastWin(0);
    flipCoin(choice);
  };

  const continueGame = (choice: CoinSide) => {
    if (gameState !== "playing") return;
    flipCoin(choice);
  };

  const flipCoin = async (choice: CoinSide) => {
    if (isFlipping) return;
    setIsFlipping(true);

    const result: CoinSide = Math.random() > 0.5 ? "heads" : "tails";
    
    await new Promise(resolve => setTimeout(resolve, 1000));

    setLastResult(result);
    setHistory(prev => [...prev, result]);
    setIsFlipping(false);

    if (result === choice) {
      setStreak(prev => prev + 1);
    } else {
      setGameState("lost");
      setStreak(0);
      finalizePendingLoss();
    }
  };

  const cashOut = () => {
    if (gameState !== "playing" || streak === 0) return;
    
    addToBalance(currentPayout);
    setLastWin(currentPayout);
    setGameState("cashed_out");
  };

  return (
    <div className="p-2 sm:p-4 lg:p-6 max-w-[1400px] mx-auto flex flex-col lg:flex-row gap-4 lg:gap-8">
      <div className="w-full lg:w-[240px] flex flex-col gap-3 bg-[#0f212e] p-2 sm:p-3 rounded-xl h-fit text-xs">
        <div className="space-y-2">
          <label className="text-xs font-bold text-[#b1bad3] uppercase tracking-wider">Bet Amount</label>
          <div className="relative">
            <div className="absolute left-3 top-1/2 -translate-y-1/2 text-[#b1bad3]">$</div>
            <input
              type="number"
              value={betInput}
              onChange={handleBetInputChange}
              onBlur={handleBetInputBlur}
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

        {gameState === "playing" && (
          <div className="flex flex-col gap-3">
            <div className="bg-[#0f212e] p-4 rounded border border-[#2f4553] text-center">
              <div className="text-[#b1bad3] text-sm">Current Profit ({currentMultiplier.toFixed(2)}x)</div>
              <div className="text-2xl font-bold text-[#00e701]">{currentPayout.toFixed(2)}</div>
              <div className="text-sm text-[#b1bad3] mt-1">
                Next: {nextPayout.toFixed(2)} ({nextMultiplier.toFixed(2)}x)
              </div>
            </div>
            <button
              onClick={cashOut}
              disabled={isFlipping || streak === 0}
              className="w-full bg-[#00e701] hover:bg-[#00c201] text-black py-3 rounded-md font-bold text-lg shadow-[0_0_20px_rgba(0,231,1,0.2)] transition-all active:scale-95 flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Cashout
            </button>
          </div>
        )}

        {lastWin > 0 && gameState === "cashed_out" && (
          <div className="mt-4 p-4 bg-[#213743] border border-[#00e701] rounded-md text-center">
            <div className="text-xs text-[#b1bad3] uppercase">You Won</div>
            <div className="text-xl font-bold text-[#00e701]">{lastWin.toFixed(2)}</div>
          </div>
        )}
      </div>

      <div className="flex-1 flex flex-col items-center justify-center bg-[#0f212e] rounded-xl p-4 sm:p-8 relative min-h-[400px] sm:min-h-[500px]">
        
        <div className="relative w-32 h-32 sm:w-48 sm:h-48 mb-8 sm:mb-12 cf-perspective">
          <div className={`w-full h-full relative cf-3d ${isFlipping ? "cf-flip" : ""}`}>
             <div className={`w-full h-full rounded-full flex items-center justify-center border-4 transition-all duration-300 ${
               lastResult === "tails"
                 ? "shadow-[0_0_30px_rgba(59,130,246,0.25)] bg-linear-to-br from-blue-300 to-blue-600 border-blue-400"
                 : "shadow-[0_0_30px_rgba(234,179,8,0.25)] bg-linear-to-br from-yellow-300 to-yellow-600 border-yellow-400"
             }`}>
                {isFlipping ? (
                  <span className="text-4xl sm:text-6xl font-bold text-white/80">?</span>
                ) : (
                  <MonetizationOn className={`w-20! h-20! sm:w-32! sm:h-32! ${lastResult === 'tails' ? 'text-blue-100' : 'text-yellow-100'}`} />
                )}
             </div>
          </div>
          {lastResult && !isFlipping && (
             <div className="absolute -bottom-10 left-1/2 -translate-x-1/2 text-xl font-bold uppercase tracking-widest text-white cf-pop animate-bounce-in">
               {lastResult}
             </div>
          )}
        </div>

        <div className="flex gap-4 w-full max-w-md">
          <button
            onClick={() => gameState === "playing" ? continueGame("heads") : startGame("heads")}
            disabled={isFlipping || (gameState === "playing" && streak === 0)} 
            className="flex-1 bg-[#eab308] hover:bg-[#ca8a04] disabled:opacity-50 disabled:cursor-not-allowed text-black py-4 rounded-xl font-bold text-lg sm:text-xl shadow-[0_0_20px_rgba(234,179,8,0.2)] transition-all active:scale-95 flex flex-col items-center gap-2"
          >
            <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-full bg-yellow-200 flex items-center justify-center">
               <MonetizationOn className="text-yellow-700" />
            </div>
            HEADS
          </button>

          <button
            onClick={() => gameState === "playing" ? continueGame("tails") : startGame("tails")}
            disabled={isFlipping || (gameState === "playing" && streak === 0)}
            className="flex-1 bg-blue-500 hover:bg-blue-600 disabled:opacity-50 disabled:cursor-not-allowed text-black py-4 rounded-xl font-bold text-lg sm:text-xl shadow-[0_0_20px_rgba(59,130,246,0.2)] transition-all active:scale-95 flex flex-col items-center gap-2"
          >
            <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-full bg-blue-200 flex items-center justify-center">
               <MonetizationOn className="text-blue-700" />
            </div>
            TAILS
          </button>
        </div>

        <div className="mt-12 flex gap-2 overflow-x-auto max-w-full p-2 w-full justify-start sm:justify-center">
          {history.map((side, i) => (
            <div 
              key={i} 
              className={`w-8 h-8 shrink-0 rounded-full flex items-center justify-center text-[10px] font-bold border-2 animate-scale-in ${
                side === 'heads' 
                  ? 'bg-yellow-500 border-yellow-300 text-yellow-900' 
                  : 'bg-blue-500 border-blue-300 text-blue-950'
              }`}
              style={{ animationDelay: `${i * 0.05}s` }}
            >
              {side === 'heads' ? 'H' : 'T'}
            </div>
          ))}
        </div>

      </div>
    </div>
  );
}
