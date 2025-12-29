"use client";

import React, { useState, useEffect, useRef } from "react";
import { useWallet } from "@/components/WalletProvider";

type Choice = "rock" | "paper" | "scissors";
type GameResult = "win" | "lose" | "draw";
type GameState = "idle" | "playing" | "cashed_out" | "lost";

const HOUSE_EDGE_MULTIPLIER = 1.98;
const CHOICES: Choice[] = ["rock", "paper", "scissors"];

export default function RPSPage() {
  const { balance, subtractFromBalance, addToBalance, finalizePendingLoss } =
    useWallet();

  const [betAmount, setBetAmount] = useState<number>(100);
  const [betInput, setBetInput] = useState<string>("100");
  const [gameState, setGameState] = useState<GameState>("idle");
  const [streak, setStreak] = useState<number>(0);
  const [history, setHistory] = useState<GameResult[]>([]);
  const [isProcessing, setIsProcessing] = useState<boolean>(false);

  const [userChoice, setUserChoice] = useState<Choice | null>(null);
  const [computerChoice, setComputerChoice] = useState<Choice | null>(null);
  const [lastResult, setLastResult] = useState<GameResult | null>(null);
  const [lastWin, setLastWin] = useState<number>(0);
  const [resultFx, setResultFx] = useState<"rolling" | "win" | "lose" | null>(
    null
  );
  const resultTimeoutRef = useRef<number | null>(null);

  useEffect(() => {
    return () => {
      if (resultTimeoutRef.current) {
        clearTimeout(resultTimeoutRef.current);
        resultTimeoutRef.current = null;
      }
    };
  }, []);

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
    if (resultTimeoutRef.current) {
      clearTimeout(resultTimeoutRef.current);
      resultTimeoutRef.current = null;
    }
    setResultFx("rolling");

    await new Promise((resolve) => setTimeout(resolve, 600));

    const compChoice = getComputerChoice();
    setComputerChoice(compChoice);

    const result = determineWinner(choice, compChoice);
    setLastResult(result);
    setHistory((prev) => [...prev, result]);
    setIsProcessing(false);

    if (result === "win") {
      setStreak((prev) => prev + 1);
    } else if (result === "lose") {
      setGameState("lost");
      setStreak(0);
      finalizePendingLoss();
      if (resultTimeoutRef.current) {
        clearTimeout(resultTimeoutRef.current);
      }
      setResultFx("lose");
      resultTimeoutRef.current = window.setTimeout(() => setResultFx(null), 900);
    }
  };

  const cashOut = () => {
    if (gameState !== "playing" || streak === 0) return;

    addToBalance(currentPayout);
    setLastWin(currentPayout);
    setGameState("cashed_out");
    if (resultTimeoutRef.current) {
      clearTimeout(resultTimeoutRef.current);
    }
    setResultFx("win");
    resultTimeoutRef.current = window.setTimeout(() => setResultFx(null), 900);
  };

  const getEmoji = (c: Choice | null) => {
    if (!c) return "❓";
    switch (c) {
      case "rock":
        return "🪨";
      case "paper":
        return "📄";
      case "scissors":
        return "✂️";
    }
  };

  const userRingAnimClass =
    lastResult === "win"
      ? "rps-win"
      : lastResult === "lose"
      ? "rps-lose"
      : lastResult === "draw"
      ? "rps-draw"
      : "";

  const computerRingAnimClass =
    lastResult === "lose"
      ? "rps-win"
      : lastResult === "win"
      ? "rps-lose"
      : lastResult === "draw"
      ? "rps-draw"
      : "";

  const thinkingClass = isProcessing ? "rps-thinking" : "";
  const computerRevealClass = computerChoice ? "rps-reveal" : "";

  return (
    <main className="p-2 sm:p-4 lg:p-6 max-w-[1400px] mx-auto flex flex-col lg:flex-row gap-4 lg:gap-8">
      <div className="w-full lg:w-[240px] flex flex-col gap-3 bg-[#0f212e] p-2 sm:p-3 rounded-xl h-fit text-xs">
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
              onChange={handleBetInputChange}
              onBlur={handleBetInputBlur}
              disabled={gameState === "playing"}
              className="w-full bg-[#0f212e] border border-[#2f4553] rounded-md py-2 pl-7 pr-4 text-white font-mono focus:outline-none focus:border-[#00e701] transition-colors disabled:opacity-50"
            />
          </div>
          <div className="grid grid-cols-3 gap-2">
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
            <button
              onClick={() => {
                const newBet = Number(balance.toFixed(2));
                setBetAmount(newBet);
                setBetInput(String(newBet));
              }}
              disabled={gameState === "playing"}
              className="bg-[#2f4553] hover:bg-[#3e5666] text-xs py-1 rounded text-[#b1bad3] disabled:opacity-50"
            >
              All In
            </button>
          </div>
        </div>

        {gameState === "playing" && (
          <div className="flex flex-col gap-3">
            <button
              onClick={cashOut}
              disabled={isProcessing || streak === 0}
              className="w-full bg-[#00e701] hover:bg-[#00c201] text-black py-3 rounded-md font-bold text-lg shadow-[0_0_20px_rgba(0,231,1,0.2)] transition-all active:scale-95 flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Cashout
            </button>
          </div>
        )}

        {gameState === "playing" && (
          <div className="bg-[#0f212e] p-4 rounded border border-[#2f4553] text-center">
            <div className="text-[#b1bad3] text-sm">Current Win</div>
            <div className="text-2xl font-bold text-[#00e701]">
              ${currentPayout.toFixed(2)}
            </div>
            <div className="text-sm text-[#b1bad3] mt-1">
              Next: {nextMultiplier.toFixed(2)}x
            </div>
          </div>
        )}

        {lastWin > 0 && gameState === "cashed_out" && (
          <div className="mt-4 p-4 bg-[#213743] border border-[#00e701] rounded-md text-center">
            <div className="text-xs text-[#b1bad3] uppercase">You Won</div>
            <div className="text-xl font-bold text-[#00e701]">
              ${lastWin.toFixed(2)}
            </div>
          </div>
        )}
      </div>

      <div className="flex-1 flex flex-col items-center justify-center bg-[#0f212e] rounded-xl p-4 sm:p-8 relative min-h-[400px] sm:min-h-[500px] overflow-hidden">
        {resultFx === "rolling" && (
          <div className="limbo-roll-glow absolute inset-0 pointer-events-none z-0" />
        )}
        {resultFx === "win" && (
          <div
            key={`rps-win-${history.length}`}
            className="limbo-win-flash absolute inset-0 pointer-events-none z-0"
          />
        )}
        {resultFx === "lose" && (
          <div
            key={`rps-lose-${history.length}`}
            className="limbo-lose-flash absolute inset-0 pointer-events-none z-0"
          />
        )}

        <div className="relative z-10 w-full">
          <div className="flex flex-col sm:flex-row justify-center items-center gap-4 sm:gap-8 mb-8 sm:mb-12 min-h-[200px]">
          <div className="flex flex-col items-center gap-2 sm:gap-4">
            <div className="text-[#b1bad3] text-xs sm:text-sm uppercase tracking-wider">
              You
            </div>
            <div
              className={`w-24 h-24 sm:w-32 sm:h-32 rounded-full bg-[#213743] border-4 border-[#2f4553] flex items-center justify-center text-4xl sm:text-6xl shadow-lg transition-all duration-300
                ${
                  lastResult === "win"
                    ? "border-[#00e701] shadow-[0_0_20px_rgba(0,231,1,0.2)] scale-110"
                    : ""
                }
                ${thinkingClass}
                ${userRingAnimClass}
             `}
            >
              {userChoice ? (
                <span
                  key={`u-${history.length}-${userChoice}`}
                  className={lastResult ? "rps-emoji-pop" : ""}
                >
                  {getEmoji(userChoice)}
                </span>
              ) : (
                <span className="text-4xl opacity-20">👤</span>
              )}
            </div>
          </div>

          <div className="text-xl sm:text-2xl font-bold text-[#2f4553] my-2 sm:my-0">
            VS
          </div>

          <div className="flex flex-col items-center gap-2 sm:gap-4">
            <div className="text-[#b1bad3] text-xs sm:text-sm uppercase tracking-wider">
              Computer
            </div>
            <div
              className={`w-24 h-24 sm:w-32 sm:h-32 rounded-full bg-[#213743] border-4 border-[#2f4553] flex items-center justify-center text-4xl sm:text-6xl shadow-lg transition-all duration-300
                ${thinkingClass}
                ${computerRingAnimClass}
                ${computerRevealClass}
                ${
                  lastResult === "lose"
                    ? "border-red-500 shadow-[0_0_20px_rgba(239,68,68,0.2)] scale-110"
                    : ""
                }
             `}
            >
              {computerChoice ? (
                <span
                  key={`c-${history.length}-${computerChoice}`}
                  className={lastResult ? "rps-emoji-pop" : ""}
                >
                  {getEmoji(computerChoice)}
                </span>
              ) : (
                <span className="text-4xl opacity-20">🤖</span>
              )}
            </div>
          </div>
        </div>

        <div className="flex gap-2 sm:gap-4 w-full max-w-2xl mx-auto justify-center">
          {CHOICES.map((choice) => (
            <button
              key={choice}
              onClick={() =>
          gameState === "playing"
            ? continueGame(choice)
            : startGame(choice)
              }
              disabled={
          isProcessing ||
          (gameState === "playing" &&
            streak === 0 &&
            lastResult !== "draw")
              }
              className={`
          px-6 min-w-[88px] py-4 sm:py-6 rounded-xl font-bold text-lg sm:text-xl transition-all active:scale-95 flex flex-col items-center gap-1 sm:gap-2
          disabled:opacity-50 disabled:cursor-not-allowed
          bg-[#213743] hover:bg-[#2f4553] text-white shadow-lg border-b-4 border-[#0f212e]
              `}
            >
              <span className="text-2xl sm:text-4xl">{getEmoji(choice)}</span>
            </button>
          ))}
        </div>

        <div className="mt-8 sm:mt-12 flex gap-2 overflow-x-auto max-w-full p-2 w-full justify-start sm:justify-center">
          {history.map((res, i) => (
            <div
              key={i}
              className={`w-6 h-6 sm:w-8 sm:h-8 shrink-0 rounded-full flex items-center justify-center text-[8px] sm:text-[10px] font-bold border-2 animate-scale-in ${
                res === "win"
                  ? "bg-[#00e701] border-[#00c201] text-black"
                  : res === "lose"
                  ? "bg-red-500 border-red-600 text-white"
                  : "bg-yellow-500 border-yellow-600 text-black"
              }`}
              style={{ animationDelay: `${i * 0.05}s` }}
            >
              {res === "win" ? "W" : res === "lose" ? "L" : "D"}
            </div>
          ))}
        </div>
      </div>
    </div>
    </main>
  );
}
