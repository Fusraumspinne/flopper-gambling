"use client";

import React, { useState, useEffect, useMemo } from "react";
import { useWallet } from "@/components/WalletProvider";
import {
  PlayArrow,
  SkipNext,
  ArrowUpward,
  ArrowDownward,
} from "@mui/icons-material";

type Suit = "hearts" | "diamonds" | "clubs" | "spades";
type Rank =
  | "A"
  | "2"
  | "3"
  | "4"
  | "5"
  | "6"
  | "7"
  | "8"
  | "9"
  | "10"
  | "J"
  | "Q"
  | "K";

interface Card {
  suit: Suit;
  rank: Rank;
  value: number;
}

type GameState = "idle" | "playing" | "cashed_out" | "game_over";

const SUITS: Suit[] = ["hearts", "diamonds", "clubs", "spades"];
const RANKS: Rank[] = [
  "A",
  "2",
  "3",
  "4",
  "5",
  "6",
  "7",
  "8",
  "9",
  "10",
  "J",
  "Q",
  "K",
];

const getCardValue = (rank: Rank): number => {
  return RANKS.indexOf(rank) + 1;
};

const generateCard = (): Card => {
  const suit = SUITS[Math.floor(Math.random() * SUITS.length)];
  const rank = RANKS[Math.floor(Math.random() * RANKS.length)];
  return { suit, rank, value: getCardValue(rank) };
};

export default function HiloPage() {
  const { balance, addToBalance, subtractFromBalance, finalizePendingLoss } =
    useWallet();

  const [betAmount, setBetAmount] = useState<number>(100);
  const [betInput, setBetInput] = useState<string>("100");
  const [gameState, setGameState] = useState<GameState>("idle");
  const [currentCard, setCurrentCard] = useState<Card | null>(null);
  const [nextCard, setNextCard] = useState<Card | null>(null);
  const [history, setHistory] = useState<Card[]>([]);
  const [multiplier, setMultiplier] = useState<number>(1);
  const [lastWin, setLastWin] = useState<number>(0);

  useEffect(() => {
    setCurrentCard(generateCard());
  }, []);

  const probabilities = useMemo(() => {
    if (!currentCard) return { higher: 0, lower: 0, equal: 0, lowerOrEqual: 0 };

    const totalRanks = 13;
    const currentVal = currentCard.value;

    const higherCount = 13 - currentVal;
    const lowerCount = currentVal - 1;
    const equalCount = 1;

    const probHigher = higherCount / totalRanks;
    const probLower = lowerCount / totalRanks;
    const probEqual = equalCount / totalRanks;
    const probLowerOrEqual = (lowerCount + equalCount) / totalRanks;

    return {
      higher: probHigher,
      lower: probLower,
      equal: probEqual,
      lowerOrEqual: probLowerOrEqual,
    };
  }, [currentCard]);

  const multipliers = useMemo(() => {
    const houseEdge = 0.99;
    const { higher, lowerOrEqual } = probabilities;

    return {
      higher: higher > 0 ? Number((houseEdge / higher).toFixed(2)) : 0,
      lower:
        lowerOrEqual > 0 ? Number((houseEdge / lowerOrEqual).toFixed(2)) : 0,
    };
  }, [probabilities]);

  const startGame = () => {
    if (balance < betAmount) {
      return;
    }
    if (gameState === "playing") return;

    subtractFromBalance(betAmount);
    setGameState("playing");
    setHistory([]);
    setMultiplier(1);
    setLastWin(0);
    setNextCard(null);
  };

  const skipCard = () => {
    if (nextCard) return;

    if (gameState === "playing" && currentCard) {
      setHistory((prev) => [...prev, currentCard].slice(-5));
    }
    setCurrentCard(generateCard());
  };

  const guess = (direction: "higher" | "lower") => {
    if (gameState !== "playing" || !currentCard) return;

    const newCard = generateCard();
    setNextCard(newCard);

    setHistory((prev) => [...prev, currentCard].slice(-5));

    setTimeout(() => {
      const isHigher = newCard.value > currentCard.value;
      const isLower = newCard.value < currentCard.value;
      const isEqual = newCard.value === currentCard.value;

      let won = false;
      if (direction === "higher" && isHigher) won = true;
      if (direction === "lower" && (isLower || isEqual)) won = true;

      if (won) {
        const stepMult =
          direction === "higher" ? multipliers.higher : multipliers.lower;
        setMultiplier((prev) => Number((prev * stepMult).toFixed(2)));
        setCurrentCard(newCard);
        setNextCard(null);
      } else {
        setGameState("idle");
        setCurrentCard(newCard);
        setNextCard(null);
        setMultiplier(1);
        finalizePendingLoss();
      }
    }, 300);
  };

  const cashOut = () => {
    if (gameState !== "playing") return;
    const winAmount = betAmount * multiplier;
    addToBalance(winAmount);
    setLastWin(winAmount);
    setGameState("cashed_out");
  };

  const getSuitIcon = (suit: Suit) => {
    switch (suit) {
      case "hearts":
        return "♥";
      case "diamonds":
        return "♦";
      case "clubs":
        return "♣";
      case "spades":
        return "♠";
    }
  };

  const getCardColor = (suit: Suit) => {
    return suit === "hearts" || suit === "diamonds"
      ? "text-red-500"
      : "text-black";
  };

  const renderCard = (card: Card, isLarge = false) => {
    return (
      <div
        className={`
          ${isLarge ? "w-32 h-48 sm:w-40 sm:h-56" : "w-16 h-24"} 
          bg-white rounded-xl flex flex-col items-center justify-between p-2 shadow-xl select-none 
          ${getCardColor(card.suit)} transition-all duration-300
        `}
      >
        <div
          className={`self-start font-bold ${
            isLarge ? "text-2xl" : "text-lg"
          } leading-none`}
        >
          {card.rank}
        </div>
        <div className={`${isLarge ? "text-6xl" : "text-3xl"}`}>
          {getSuitIcon(card.suit)}
        </div>
        <div
          className={`self-end font-bold ${
            isLarge ? "text-2xl" : "text-lg"
          } leading-none rotate-180`}
        >
          {card.rank}
        </div>
      </div>
    );
  };

  const currentWin = betAmount * multiplier;

  return (
    <div className="p-2 sm:p-4 lg:p-6 max-w-[1400px] mx-auto flex flex-col lg:flex-row gap-4 lg:gap-8">
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

        {gameState === "playing" ? (
          <div className="flex flex-col gap-3">
            <button
              onClick={cashOut}
              disabled={multiplier === 1}
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

        {gameState === "playing" && (
          <div className="bg-[#0f212e] p-4 rounded border border-[#2f4553] text-center">
            <div className="text-[#b1bad3] text-sm">Current Win</div>
            <div className="text-2xl font-bold text-[#00e701]">
              ${currentWin.toFixed(2)}
            </div>
            <div className="text-sm text-[#b1bad3] mt-1">
              Current: {multiplier}x
            </div>
          </div>
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

      <div className="flex-1 bg-[#0f212e] p-4 sm:p-6 rounded-xl min-h-[500px] flex flex-col items-center justify-center relative overflow-hidden gap-8">
        <div className="absolute top-4 right-4 flex gap-2 opacity-50">
          {history.map((card, i) => (
            <div key={i} className="scale-75 origin-top-right">
              {renderCard(card)}
            </div>
          ))}
        </div>

        <div className="flex items-center gap-8 sm:gap-16">
          <div className="relative">
            {currentCard ? (
              <>{renderCard(currentCard, true)}</>
            ) : (
              <div className="w-32 h-48 sm:w-40 sm:h-56 bg-[#2f4553] rounded-xl animate-pulse" />
            )}
          </div>

          {nextCard && (
            <div className="animate-slide-in-right">
              {renderCard(nextCard, true)}
            </div>
          )}
        </div>

        <div className="flex flex-col items-center gap-4 w-full max-w-md">
          {gameState === "playing" ? (
            <>
              <div className="grid grid-cols-2 gap-4 w-full">
                <button
                  onClick={() => guess("higher")}
                  disabled={probabilities.higher === 0 || !!nextCard}
                  className="bg-[#2f4553] hover:bg-[#3e5666] p-4 rounded-xl flex flex-col items-center gap-2 transition-all active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed group"
                >
                  <div className="flex items-center gap-2 text-[#b1bad3] group-hover:text-white">
                    <ArrowUpward />
                    <span className="font-bold uppercase">Higher</span>
                  </div>
                  <div className="text-[#00e701] font-bold text-xl">
                    {multipliers.higher.toFixed(2)}x
                  </div>
                  <div className="text-xs text-[#b1bad3]">
                    {(probabilities.higher * 100).toFixed(2)}%
                  </div>
                </button>

                <button
                  onClick={() => guess("lower")}
                  disabled={!!nextCard}
                  className="bg-[#2f4553] hover:bg-[#3e5666] p-4 rounded-xl flex flex-col items-center gap-2 transition-all active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed group"
                >
                  <div className="flex items-center gap-2 text-[#b1bad3] group-hover:text-white">
                    <ArrowDownward />
                    <span className="font-bold uppercase">Lower / Equal</span>
                  </div>
                  <div className="text-[#00e701] font-bold text-xl">
                    {multipliers.lower.toFixed(2)}x
                  </div>
                  <div className="text-xs text-[#b1bad3]">
                    {(probabilities.lowerOrEqual * 100).toFixed(2)}%
                  </div>
                </button>
              </div>

              <button
                onClick={skipCard}
                disabled={!!nextCard}
                className="bg-[#2f4553] hover:bg-[#3e5666] text-[#b1bad3] hover:text-white py-3 px-8 rounded-full font-bold flex items-center gap-2 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <SkipNext /> Skip Card
              </button>
            </>
          ) : (
            <button
              onClick={skipCard}
              disabled={!!nextCard}
              className="bg-[#2f4553] hover:bg-[#3e5666] text-[#b1bad3] hover:text-white py-3 px-8 rounded-full font-bold flex items-center gap-2 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <SkipNext /> Skip Card
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
