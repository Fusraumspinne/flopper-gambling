"use client";

import React, { useState, useEffect, useCallback, useRef } from "react";
import { useWallet } from "@/components/WalletProvider";
import { PlayArrow, Refresh, Bolt } from "@mui/icons-material";

type Suit = "hearts" | "diamonds" | "clubs" | "spades";
type Rank =
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
  | "K"
  | "A";

interface Card {
  id: string;
  suit: Suit;
  rank: Rank;
  value: number;
}

interface Hand {
  cards: Card[];
  bet: number;
  isFinished: boolean;
  isDoubled: boolean;
  status: "playing" | "bust" | "stand" | "blackjack" | "push" | "win" | "lose";
}

type GameState = "betting" | "playing" | "dealerTurn" | "finished";

const SUITS: Suit[] = ["hearts", "diamonds", "clubs", "spades"];
const RANKS: Rank[] = [
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
  "A",
];

const getCardValue = (rank: Rank): number => {
  if (["J", "Q", "K"].includes(rank)) return 10;
  if (rank === "A") return 11;
  return parseInt(rank);
};

let __cardId = 0;
const createDeck = (): Card[] => {
  const deck: Card[] = [];
  for (const suit of SUITS) {
    for (const rank of RANKS) {
      deck.push({ id: String(__cardId++), suit, rank, value: getCardValue(rank) });
    }
  }
  return deck.sort(() => Math.random() - 0.5);
};

const calculateHandValue = (cards: Card[]): number => {
  let value = 0;
  let aces = 0;
  for (const card of cards) {
    value += card.value;
    if (card.rank === "A") aces += 1;
  }
  while (value > 21 && aces > 0) {
    value -= 10;
    aces -= 1;
  }
  return value;
};

export default function BlackjackPage() {
  const { balance, subtractFromBalance, addToBalance, finalizePendingLoss } = useWallet();

  const [betAmount, setBetAmount] = useState<number>(100);
  const [betInput, setBetInput] = useState<string>(betAmount.toString());
  const [gameState, setGameState] = useState<GameState>("betting");
  const [deck, setDeck] = useState<Card[]>([]);
  const [dealerHand, setDealerHand] = useState<Card[]>([]);
  const [playerHands, setPlayerHands] = useState<Hand[]>([]);
  const [currentHandIndex, setCurrentHandIndex] = useState<number>(0);
  const [lastWin, setLastWin] = useState<number>(0);
  const [revealedCards, setRevealedCards] = useState<Record<string, boolean>>({});
  const dealTimeouts = React.useRef<number[]>([]);
  const resultTimeoutRef = React.useRef<number | null>(null);
  const [resultFx, setResultFx] = useState<"rolling" | "win" | "lose" | null>(null);

  const audioRef = useRef({
    bet: new Audio("/sounds/Bet.mp3"),
    deal: new Audio("/sounds/DealCards.mp3"),
    flip: new Audio("/sounds/FlipCards.mp3"),
    remove: new Audio("/sounds/RemoveCards.mp3"),
    win: new Audio("/sounds/Win.mp3"),
  });

  const playAudio = (a?: HTMLAudioElement) => {
    if (!a) return;
    try {
      a.currentTime = 0;
      void a.play();
    } catch (e) {
    }
  };

  useEffect(() => {
    const prime = async () => {
      try {
        const items = Object.values(audioRef.current) as HTMLAudioElement[];
        for (const a of items) {
          try {
            a.muted = true;
            await a.play();
            a.pause();
            a.currentTime = 0;
            a.muted = false;
          } catch (e) {
            a.muted = false;
          }
        }
      } catch (e) {}
      document.removeEventListener("pointerdown", prime);
    };
    document.addEventListener("pointerdown", prime, { once: true });
    return () => document.removeEventListener("pointerdown", prime);
  }, []);

  useEffect(() => {
    return () => {
      if (resultTimeoutRef.current) {
        clearTimeout(resultTimeoutRef.current);
        resultTimeoutRef.current = null;
      }
      dealTimeouts.current.forEach((t) => clearTimeout(t));
      dealTimeouts.current = [];
    };
  }, []);

  const dealGame = () => {
    if (betAmount <= 0 || betAmount > balance) return;

    subtractFromBalance(betAmount);
    playAudio(audioRef.current.bet);
    const newDeck = createDeck();

    const pCard1 = newDeck.pop()!;
    const dCard1 = newDeck.pop()!;
    const pCard2 = newDeck.pop()!;
    const dCard2 = newDeck.pop()!;

    const initialHand: Hand = {
      cards: [pCard1, pCard2],
      bet: betAmount,
      isFinished: false,
      isDoubled: false,
      status: "playing",
    };

    setDeck(newDeck);
    setDealerHand([dCard1, dCard2]);
    setPlayerHands([initialHand]);
    setCurrentHandIndex(0);
    setGameState("playing");
    setLastWin(0);
    setResultFx("rolling");

    setRevealedCards({});
    dealTimeouts.current.forEach((t) => clearTimeout(t));
    dealTimeouts.current = [];
    playAudio(audioRef.current.deal);
    const dealtOrder = [pCard1, dCard1, pCard2];
    dealtOrder.forEach((c, i) => {
      const delay = 120 + i * 80;
      const t = window.setTimeout(() => {
        playAudio(audioRef.current.flip);
        setRevealedCards((r) => ({ ...r, [c.id]: true }));
      }, delay);
      dealTimeouts.current.push(t);
    });

    const pValue = calculateHandValue([pCard1, pCard2]);
    if (pValue === 21) {
      handleBlackjack([initialHand], [dCard1, dCard2]);
    }
  };

  const handleBlackjack = (hands: Hand[], dHand: Card[]) => {
    const hand = hands[0];
    if (calculateHandValue(hand.cards) === 21) {
      stand(0, hands);
    }
  };

  const hit = () => {
    if (gameState !== "playing") return;

    const newDeck = [...deck];
    const card = newDeck.pop()!;
    setDeck(newDeck);

    const newHands = [...playerHands];
    const currentHand = newHands[currentHandIndex];
    currentHand.cards.push(card);

    const t = window.setTimeout(() => {
      setRevealedCards((r) => ({ ...r, [card.id]: true }));
    }, 160);
    dealTimeouts.current.push(t);
    playAudio(audioRef.current.deal);
    const flipT = window.setTimeout(() => playAudio(audioRef.current.flip), 160);
    dealTimeouts.current.push(flipT);

    const value = calculateHandValue(currentHand.cards);
    if (value > 21) {
      currentHand.status = "bust";
      currentHand.isFinished = true;
      processNextHand(newHands);
    } else if (value === 21) {
      currentHand.status = "stand";
      currentHand.isFinished = true;
      processNextHand(newHands);
    } else {
      setPlayerHands(newHands);
    }
  };

  const stand = (handIndex = currentHandIndex, hands = playerHands) => {
    const newHands = [...hands];
    newHands[handIndex].status = "stand";
    newHands[handIndex].isFinished = true;
    processNextHand(newHands);
  };

  const double = () => {
    if (gameState !== "playing") return;
    const currentHand = playerHands[currentHandIndex];
    if (balance < currentHand.bet) return;

    subtractFromBalance(currentHand.bet);

    const newDeck = [...deck];
    const card = newDeck.pop()!;
    setDeck(newDeck);

    const newHands = [...playerHands];
    const hand = newHands[currentHandIndex];
    hand.bet *= 2;
    hand.isDoubled = true;
    hand.cards.push(card);

    const t = window.setTimeout(() => {
      setRevealedCards((r) => ({ ...r, [card.id]: true }));
    }, 160);
    dealTimeouts.current.push(t);

    playAudio(audioRef.current.deal);
    const flipT2 = window.setTimeout(() => playAudio(audioRef.current.flip), 160);
    dealTimeouts.current.push(flipT2);

    const value = calculateHandValue(hand.cards);
    if (value > 21) {
      hand.status = "bust";
    } else {
      hand.status = "stand";
    }
    hand.isFinished = true;
    processNextHand(newHands);
  };

  const split = () => {
    if (gameState !== "playing") return;
    const currentHand = playerHands[currentHandIndex];
    if (currentHand.cards.length !== 2) return;
    if (
      getCardValue(currentHand.cards[0].rank) !==
      getCardValue(currentHand.cards[1].rank)
    )
      return;

    if (balance < currentHand.bet) return;
    subtractFromBalance(currentHand.bet);

    const newDeck = [...deck];
    const card1 = newDeck.pop()!;
    const card2 = newDeck.pop()!;
    setDeck(newDeck);

    const splitCard1 = currentHand.cards[0];
    const splitCard2 = currentHand.cards[1];

    const hand1: Hand = {
      cards: [splitCard1, card1],
      bet: currentHand.bet,
      isFinished: false,
      isDoubled: false,
      status: "playing",
    };

    const hand2: Hand = {
      cards: [splitCard2, card2],
      bet: currentHand.bet,
      isFinished: false,
      isDoubled: false,
      status: "playing",
    };

    const newHands = [...playerHands];
    newHands.splice(currentHandIndex, 1, hand1, hand2);

    setPlayerHands(newHands);

    const t1 = window.setTimeout(() => setRevealedCards((r) => ({ ...r, [card1.id]: true })), 140);
    const t2 = window.setTimeout(() => setRevealedCards((r) => ({ ...r, [card2.id]: true })), 280);
    playAudio(audioRef.current.deal);
    const f1 = window.setTimeout(() => playAudio(audioRef.current.flip), 140);
    const f2 = window.setTimeout(() => playAudio(audioRef.current.flip), 280);
    dealTimeouts.current.push(t1, t2, f1, f2);
  };

  const processNextHand = (hands: Hand[]) => {
    let nextIndex = -1;
    for (let i = 0; i < hands.length; i++) {
      if (!hands[i].isFinished) {
        nextIndex = i;
        break;
      }
    }

    if (nextIndex !== -1) {
      setPlayerHands(hands);
      setCurrentHandIndex(nextIndex);
    } else {
      setPlayerHands(hands);
      setGameState("dealerTurn");
      playDealerTurn(hands);
    }
  };

  const playDealerTurn = async (finalPlayerHands: Hand[]) => {
    const allBusted = finalPlayerHands.every((h) => h.status === "bust");

    let currentDealerHand = [...dealerHand];
    let dValue = calculateHandValue(currentDealerHand);

    if (!allBusted) {
      while (dValue < 17) {
        await new Promise((r) => setTimeout(r, 800));
        const newDeck = [...deck];
        break;
      }
    }
  };

  useEffect(() => {
    if (gameState === "dealerTurn") {
      const playDealer = async () => {
        const allBusted = playerHands.every((h) => h.status === "bust");
        if (allBusted) {
          finishGame(dealerHand);
          return;
        }

        let dHand = [...dealerHand];
        let currentDeck = [...deck];
        let dValue = calculateHandValue(dHand);

        if (dHand[1] && !revealedCards[dHand[1].id]) {
          const tHole = window.setTimeout(() => {
            playAudio(audioRef.current.flip);
            setRevealedCards((r) => ({ ...r, [dHand[1].id]: true }));
          }, 160);
          dealTimeouts.current.push(tHole);
        }

        while (dValue < 17) {
          await new Promise((r) => setTimeout(r, 800));
          const card = currentDeck.pop();
          if (!card) break;
          playAudio(audioRef.current.deal);
          dHand = [...dHand, card];
          setDealerHand(dHand);
          setDeck(currentDeck);
          dValue = calculateHandValue(dHand);

          const latest = dHand[dHand.length - 1];
          if (latest && !revealedCards[latest.id]) {
            const t = window.setTimeout(() => {
              playAudio(audioRef.current.flip);
              setRevealedCards((r) => ({ ...r, [latest.id]: true }));
            }, 180);
            dealTimeouts.current.push(t);
          }
        }

        finishGame(dHand);
      };
      playDealer();
    }
  }, [gameState]);

  const finishGame = (finalDealerHand: Card[]) => {
    const dValue = calculateHandValue(finalDealerHand);
    let totalWin = 0;
    const newHands = playerHands.map((hand) => {
      const pValue = calculateHandValue(hand.cards);
      let status: Hand["status"] = "lose";
      let winAmount = 0;

      if (hand.status === "bust") {
        status = "bust";
      } else {
        if (dValue > 21) {
          status = "win";
          winAmount = hand.bet * 2;
        } else if (pValue > dValue) {
          status = "win";
          winAmount = hand.bet * 2;
          if (
            pValue === 21 &&
            hand.cards.length === 2 &&
            !hand.isDoubled &&
            playerHands.length === 1
          ) {
            status = "blackjack";
            winAmount = hand.bet * 2.5;
          }
        } else if (pValue === dValue) {
          status = "push";
          winAmount = hand.bet;
        } else {
          status = "lose";
        }
      }

      if (winAmount > 0) {
        addToBalance(winAmount);
        totalWin += winAmount;
      } else {
        if (status === "lose" || status === "bust") {
          finalizePendingLoss();
        }
      }
      return { ...hand, status };
    });

    setPlayerHands(newHands);
    setLastWin(totalWin);
    setGameState("finished");
    if (resultTimeoutRef.current) {
      clearTimeout(resultTimeoutRef.current);
    }
    const anyWin = totalWin > 0;
    if (anyWin) {
      playAudio(audioRef.current.win);
    } else {
      playAudio(audioRef.current.remove);
    }
    setResultFx(anyWin ? "win" : "lose");
    resultTimeoutRef.current = window.setTimeout(() => setResultFx(null), 900);
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

  const getVisibleDealerValue = () => {
    if (dealerHand.length === 0) return 0;
    const hole = dealerHand[1];
    const holeRevealed = hole && !!revealedCards?.[hole.id];
    if (gameState === "dealerTurn" || holeRevealed) {
      return calculateHandValue(dealerHand);
    }
    return calculateHandValue([dealerHand[0]]);
  };

  const getCardColor = (suit: Suit) => {
    return suit === "hearts" || suit === "diamonds"
      ? "text-red-500"
      : "text-black";
  };

  const renderCard = (card: Card, index = 0) => {
    const translateY = index * -8;
    const zIndex = 100 + index;
    const animationDelay = `${index * 0.06}s`;
    const isRevealed = !!revealedCards?.[card.id];

    return (
      <div
        className={`bj-card w-12 h-16 sm:w-16 sm:h-24 md:w-20 md:h-28 rounded-lg shadow-lg animate-slide-in card-deal ${
          isRevealed ? "bj-flipped" : ""
        }`}
        style={{ animationDelay, marginTop: `${translateY}px`, zIndex }}
      >
        <div className="bj-card-inner">
          <div className="bj-card-face bj-card-back rounded-lg border-2 border-[#0f212e] bg-[#007bff] relative overflow-hidden">
            <div className="absolute inset-0 flex items-center justify-center">
              <div className="w-10 h-14 sm:w-12 sm:h-18 border-2 border-white/10 rounded flex items-center justify-center transform rotate-12">
                <span className="text-white/20 font-bold -rotate-12 text-[8px]">FLOPPER</span>
              </div>
            </div>
          </div>

          <div className={`bj-card-face bj-card-front rounded-lg bg-white ${getCardColor(card.suit)} p-1 sm:p-2`}>
            <div className="self-start font-bold text-xs sm:text-lg leading-none">{card.rank}</div>
            <div className="text-xl sm:text-2xl md:text-3xl">{getSuitIcon(card.suit)}</div>
            <div className="self-end font-bold text-xs sm:text-lg leading-none rotate-180">{card.rank}</div>
          </div>
        </div>
      </div>
    );
  };

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
              disabled={gameState === "playing" || gameState === "dealerTurn"}
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
              disabled={gameState === "playing" || gameState === "dealerTurn"}
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
              disabled={gameState === "playing" || gameState === "dealerTurn"}
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
              disabled={gameState === "playing" || gameState === "dealerTurn"}
              className="bg-[#2f4553] hover:bg-[#3e5666] text-xs py-1 rounded text-[#b1bad3] disabled:opacity-50"
            >
              All In
            </button>
          </div>
        </div>

        {gameState === "betting" || gameState === "finished" ? (
          <button
            onClick={dealGame}
            className="w-full bg-[#00e701] hover:bg-[#00c201] text-black py-3 rounded-md font-bold text-lg shadow-[0_0_20px_rgba(0,231,1,0.2)] transition-all active:scale-95 flex items-center justify-center gap-2"
          >
            <PlayArrow /> Bet
          </button>
        ) : (
          <div className="grid grid-cols-2 gap-3">
            <button
              onClick={hit}
              className="bg-[#2f4553] hover:bg-[#3e5666] text-white py-3 rounded-md font-bold"
            >
              Hit
            </button>
            <button
              onClick={() => stand()}
              className="bg-[#00e701] hover:bg-[#00c201] text-black py-3 rounded-md font-bold"
            >
              Stand
            </button>

            <button
              onClick={double}
              disabled={
                playerHands[currentHandIndex].cards.length !== 2 ||
                balance < playerHands[currentHandIndex].bet
              }
              className="bg-[#2f4553] hover:bg-[#3e5666] disabled:opacity-50 text-white py-3 rounded-md font-bold"
            >
              Double
            </button>

            <button
              onClick={split}
              disabled={
                playerHands[currentHandIndex].cards.length !== 2 ||
                getCardValue(playerHands[currentHandIndex].cards[0].rank) !==
                  getCardValue(playerHands[currentHandIndex].cards[1].rank) ||
                balance < playerHands[currentHandIndex].bet
              }
              className="bg-[#2f4553] hover:bg-[#3e5666] disabled:opacity-50 text-white py-3 rounded-md font-bold"
            >
              Split
            </button>
          </div>
        )}
        
        {lastWin > 0 && gameState !== "playing" && (
          <div className="p-4 bg-[#213743] border border-[#00e701] rounded-md text-center">
            <div className="text-xs text-[#b1bad3] uppercase">You Won</div>
            <div className="text-xl font-bold text-[#00e701]">${lastWin.toFixed(2)}</div>
          </div>
        )}
      </div>

      <div className="flex-1 bg-[#0f212e] p-2 sm:p-6 rounded-xl min-h-[500px] flex flex-col justify-between relative overflow-hidden">
        {resultFx === "rolling" && <div className="limbo-roll-glow" />}
        {resultFx === "win" && <div className="limbo-win-burst" />}
        {resultFx === "lose" && <div className="limbo-lose-flash" />}
        <div className="flex flex-col items-center gap-4">
          <div className="text-[#b1bad3] font-bold uppercase tracking-wider text-sm">
            Dealer
          </div>
          <div className="flex justify-center items-center">
            {dealerHand.map((card, i) => (
              <div key={i} className={`relative ${i > 0 ? "-ml-6 sm:-ml-8 md:-ml-10" : ""}`}>
                {renderCard(card, i)}
              </div>
            ))}
            {dealerHand.length === 0 && (
              <div className="flex gap-2">
                <div className="w-12 h-16 sm:w-16 sm:h-24 md:w-20 md:h-28 rounded-lg border-2 border-dashed border-[#2f4553]"></div>
                <div className="w-12 h-16 sm:w-16 sm:h-24 md:w-20 md:h-28 rounded-lg border-2 border-dashed border-[#2f4553]"></div>
              </div>
            )}
          </div>
          {dealerHand.length > 0 && (
            <div className="bg-[#213743] px-3 py-1 rounded-full text-white font-bold text-sm animate-scale-in">
              {getVisibleDealerValue()}
            </div>
          )}
        </div>

        {gameState === "finished" && (
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-10"></div>
        )}

        {resultFx === "rolling" && (
          <div
            className="absolute inset-0 pointer-events-none"
            style={{
              background:
                "radial-gradient(circle at 50% 55%, rgba(47,69,83,0.22) 0%, rgba(15,33,46,0.0) 68%)",
              opacity: 0.85,
            }}
          />
        )}

        <div className="flex justify-center gap-4 sm:gap-8 flex-wrap">
          {playerHands.map((hand, index) => {
            const isCurrent =
              index === currentHandIndex && gameState === "playing";
            return (
              <div
                key={index}
                className={`flex flex-col items-center gap-4 transition-all duration-300 ${
                  gameState === "playing" && !isCurrent
                    ? "opacity-50 scale-90"
                    : "opacity-100 scale-100"
                }`}
              >
                <div className="flex items-center relative">
                  {hand.cards.map((card, i) => (
                    <div
                      key={i}
                      className={`relative ${i > 0 ? "-ml-6 sm:-ml-8 md:-ml-10" : ""}`}
                    >
                      {renderCard(card, i)}
                    </div>
                  ))}
                </div>
                <div className="flex flex-col items-center gap-1">
                  <div
                    className={`px-3 py-1 rounded-full font-bold text-sm transition-colors ${
                      isCurrent
                        ? "bg-[#00e701] text-black animate-pulse"
                        : "bg-[#213743] text-white"
                    }`}
                  >
                    {calculateHandValue(hand.cards)}
                  </div>
                  <div className="text-[#b1bad3] text-xs font-mono">
                    ${hand.bet.toFixed(2)}
                  </div>
                  {hand.status !== "playing" && (
                    <div
                      className={`text-sm font-bold uppercase animate-bounce-in ${
                        hand.status === "win" || hand.status === "blackjack"
                          ? "text-[#00e701]"
                          : hand.status === "lose" || hand.status === "bust"
                          ? "text-red-500"
                          : "text-white"
                      }`}
                    >
                      {hand.status}
                    </div>
                  )}
                </div>
              </div>
            );
          })}
          {playerHands.length === 0 && (
            <div className="flex flex-col items-center gap-4 opacity-50">
              <div className="flex gap-2">
                <div className="w-12 h-16 sm:w-16 sm:h-24 md:w-20 md:h-28 rounded-lg border-2 border-dashed border-[#2f4553]"></div>
                <div className="w-12 h-16 sm:w-16 sm:h-24 md:w-20 md:h-28 rounded-lg border-2 border-dashed border-[#2f4553]"></div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
