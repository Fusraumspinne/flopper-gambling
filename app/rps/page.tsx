"use client";

import React, { useState } from "react";
import { useWallet } from "@/components/WalletProvider";

type Choice = "rock" | "paper" | "scissors";
type GameResult = "win" | "lose" | "draw";
type GameState = "idle" | "playing" | "cashed_out" | "lost";

const HOUSE_EDGE_MULTIPLIER = 1.98;
const CHOICES: Choice[] = ["rock", "paper", "scissors"];

export default function RPSPage() {
  const { balance, subtractFromBalance, addToBalance } = useWallet();

  const [betAmount, setBetAmount] = useState<number>(10);
  const [betInput, setBetInput] = useState<string>("10");
  const [gameState, setGameState] = useState<GameState>("idle");
  const [streak, setStreak] = useState<number>(0);
  const [history, setHistory] = useState<GameResult[]>([]);
  const [isProcessing, setIsProcessing] = useState<boolean>(false);
  
  const [userChoice, setUserChoice] = useState<Choice | null>(null);
  const [computerChoice, setComputerChoice] = useState<Choice | null>(null);
  const [lastResult, setLastResult] = useState<GameResult | null>(null);
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

  const startGame = (choice: Choice) => {
    if (balance < betAmount) return;
    
    subtractFromBalance(betAmount);
    setGameState("playing");
    setStreak(0);
    setHistory([]);
    setLastWin(0);
    playRound(choice);
  };

  const continueGame = (choice: Choice) => {
    if (gameState !== "playing") return;
    playRound(choice);
  };

  const getComputerChoice = (): Choice => {
    const randomIndex = Math.floor(Math.random() * CHOICES.length);
    return CHOICES[randomIndex];
  };

  const determineWinner = (user: Choice, computer: Choice): GameResult => {
    if (user === computer) return "draw";
    if (
      (user === "rock" && computer === "scissors") ||
      (user === "paper" && computer === "rock") ||
      (user === "scissors" && computer === "paper")
    ) {
      return "win";
    }
    return "lose";
  };

  const playRound = async (choice: Choice) => {
    if (isProcessing) return;
    setIsProcessing(true);
    setUserChoice(choice);
    setComputerChoice(null);
    setLastResult(null);

    await new Promise(resolve => setTimeout(resolve, 600));

    const compChoice = getComputerChoice();
    setComputerChoice(compChoice);
    
    const result = determineWinner(choice, compChoice);
    setLastResult(result);
    setHistory(prev => [...prev, result]);
    setIsProcessing(false);

    if (result === "win") {
      setStreak(prev => prev + 1);
    } else if (result === "lose") {
      setGameState("lost");
      setStreak(0);
    }
  };

  const cashOut = () => {
    if (gameState !== "playing" || streak === 0) return;
    
    addToBalance(currentPayout);
    setLastWin(currentPayout);
    setGameState("cashed_out");
  };

  const getEmoji = (c: Choice | null) => {
    if (!c) return "❓";
    switch (c) {
      case "rock": return "🪨";
      case "paper": return "📄";
      case "scissors": return "✂️";
    }
  };

  return (
    <div className="p-6 max-w-[1400px] mx-auto flex flex-col lg:flex-row gap-8">
      <div className="w-full lg:w-[350px] flex flex-col gap-6 bg-[#0f212e] p-6 rounded-xl h-fit">
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
              disabled={isProcessing || streak === 0}
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

      <div className="flex-1 flex flex-col items-center justify-center bg-[#0f212e] rounded-xl p-8 relative min-h-[500px]">
        
        <div className="flex justify-center items-center gap-8 mb-12 min-h-[200px]">
          <div className="flex flex-col items-center gap-4">
             <div className="text-[#b1bad3] text-sm uppercase tracking-wider">You</div>
             <div className={`w-32 h-32 rounded-full bg-[#213743] border-4 border-[#2f4553] flex items-center justify-center text-6xl shadow-lg
                ${lastResult === 'win' ? 'border-[#00e701] shadow-[0_0_20px_rgba(0,231,1,0.2)]' : ''}
             `}>
                {userChoice ? getEmoji(userChoice) : <span className="text-4xl opacity-20">👤</span>}
             </div>
          </div>

          <div className="text-2xl font-bold text-[#2f4553]">VS</div>

          <div className="flex flex-col items-center gap-4">
             <div className="text-[#b1bad3] text-sm uppercase tracking-wider">Computer</div>
             <div className={`w-32 h-32 rounded-full bg-[#213743] border-4 border-[#2f4553] flex items-center justify-center text-6xl shadow-lg
                ${isProcessing ? 'animate-pulse' : ''}
                ${lastResult === 'lose' ? 'border-red-500 shadow-[0_0_20px_rgba(239,68,68,0.2)]' : ''}
             `}>
                {computerChoice ? getEmoji(computerChoice) : <span className="text-4xl opacity-20">🤖</span>}
             </div>
          </div>
        </div>

        <div className="flex gap-4 w-full max-w-2xl">
          {CHOICES.map((choice) => (
            <button
              key={choice}
              onClick={() => gameState === "playing" ? continueGame(choice) : startGame(choice)}
              disabled={isProcessing || (gameState === "playing" && streak === 0 && lastResult !== 'draw')} 
              className={`
                flex-1 py-6 rounded-xl font-bold text-xl transition-all active:scale-95 flex flex-col items-center gap-2
                disabled:opacity-50 disabled:cursor-not-allowed
                bg-[#213743] hover:bg-[#2f4553] text-white shadow-lg border-b-4 border-[#0f212e]
              `}
            >
              <span className="text-4xl">{getEmoji(choice)}</span>
              <span className="uppercase text-sm tracking-wider opacity-80">{choice}</span>
            </button>
          ))}
        </div>

        <div className="mt-12 flex gap-2 overflow-x-auto max-w-full p-2">
          {history.map((res, i) => (
            <div 
              key={i} 
              className={`w-8 h-8 rounded-full flex items-center justify-center text-[10px] font-bold border-2 shrink-0 ${
                res === 'win' 
                  ? 'bg-[#00e701] border-[#00c201] text-black' 
                  : res === 'lose'
                  ? 'bg-red-500 border-red-600 text-white'
                  : 'bg-yellow-500 border-yellow-600 text-black'
              }`}
            >
              {res === 'win' ? 'W' : res === 'lose' ? 'L' : 'D'}
            </div>
          ))}
        </div>

      </div>
    </div>
  );
}
