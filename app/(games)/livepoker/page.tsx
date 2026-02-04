"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import { PlayArrow } from "@mui/icons-material";
import { io, Socket } from "socket.io-client";
import GameRecordsPanel from "@/components/GameRecordsPanel";
import { useSession } from "next-auth/react";
import { useWallet } from "@/components/WalletProvider";
import { useSoundVolume } from "@/components/SoundVolumeProvider";

type Suit = "hearts" | "diamonds" | "clubs" | "spades";
type Rank = "2" | "3" | "4" | "5" | "6" | "7" | "8" | "9" | "10" | "J" | "Q" | "K" | "A";

type Stage =
  | "setup"
  | "dealing"
  | "preflop"
  | "flop"
  | "turn"
  | "river"
  | "showdown"
  | "finished";

interface Card {
  id: string;
  suit: Suit;
  rank: Rank;
}

interface PlayerState {
  id: string;
  name: string;
  stack: number;
  folded: boolean;
  allIn: boolean;
  contribution: number;
  roundContribution: number;
  hasActed: boolean;
  lastAction: string;
  payout?: number;
  hole: Card[];
}

interface GameState {
  roomId: string;
  hostId: string | null;
  stage: Stage;
  board: Card[];
  boardRevealCount: number;
  pot: number;
  sidePots: number[];
  currentBet: number;
  minRaise: number;
  dealerPos: number;
  activePlayerIndex: number;
  pendingToAct: number;
  winners: number[];
  players: PlayerState[];
}

const getCardValue = (rank: Rank): number => {
  if (rank === "A") return 14;
  if (rank === "K") return 13;
  if (rank === "Q") return 12;
  if (rank === "J") return 11;
  return parseInt(rank, 10);
};

type ScoreCategory =
  | "High Card"
  | "Pair"
  | "Two Pair"
  | "Three of a Kind"
  | "Straight"
  | "Flush"
  | "Full House"
  | "Four of a Kind"
  | "Straight Flush";

interface HandScore {
  cat: ScoreCategory;
  catRank: number;
  kickers: number[];
}

const scoreFive = (cards: Card[]): HandScore => {
  const values = cards.map((c) => getCardValue(c.rank)).sort((a, b) => b - a);
  const counts: Record<number, number> = {};
  for (const v of values) counts[v] = (counts[v] || 0) + 1;
  const byCountDesc = Object.entries(counts)
    .map(([v, c]) => ({ v: Number(v), c }))
    .sort((a, b) => b.c - a.c || b.v - a.v);

  const isFlush = cards.every((c) => c.suit === cards[0].suit);
  const unique = Array.from(new Set(values)).sort((a, b) => b - a);
  let isStraight = false;
  let straightHigh = 0;
  const wheel = [14, 5, 4, 3, 2];
  if (wheel.every((v) => values.includes(v))) {
    isStraight = true;
    straightHigh = 5;
  } else {
    for (let i = 0; i <= unique.length - 5; i++) {
      const slice = unique.slice(i, i + 5);
      if (slice[0] - slice[4] === 4) {
        isStraight = true;
        straightHigh = slice[0];
        break;
      }
    }
  }

  if (isStraight && isFlush) {
    return { cat: "Straight Flush", catRank: 9, kickers: [straightHigh] };
  }
  if (byCountDesc[0]?.c === 4) {
    const quad = byCountDesc[0].v;
    const kicker = byCountDesc.find((x) => x.v !== quad)?.v || 0;
    return { cat: "Four of a Kind", catRank: 8, kickers: [quad, kicker] };
  }
  if (byCountDesc[0]?.c === 3 && byCountDesc[1]?.c >= 2) {
    return {
      cat: "Full House",
      catRank: 7,
      kickers: [byCountDesc[0].v, byCountDesc[1].v],
    };
  }
  if (isFlush) {
    return { cat: "Flush", catRank: 6, kickers: values.slice(0, 5) };
  }
  if (isStraight) {
    return { cat: "Straight", catRank: 5, kickers: [straightHigh] };
  }
  if (byCountDesc[0]?.c === 3) {
    const trips = byCountDesc[0].v;
    const kickers = byCountDesc
      .filter((x) => x.v !== trips)
      .map((x) => x.v)
      .sort((a, b) => b - a);
    return {
      cat: "Three of a Kind",
      catRank: 4,
      kickers: [trips, ...kickers.slice(0, 2)],
    };
  }
  if (byCountDesc[0]?.c === 2 && byCountDesc[1]?.c === 2) {
    const pair1 = Math.max(byCountDesc[0].v, byCountDesc[1].v);
    const pair2 = Math.min(byCountDesc[0].v, byCountDesc[1].v);
    const kicker =
      values
        .filter((v) => v !== pair1 && v !== pair2)
        .sort((a, b) => b - a)[0] || 0;
    return { cat: "Two Pair", catRank: 3, kickers: [pair1, pair2, kicker] };
  }
  if (byCountDesc[0]?.c === 2) {
    const pair = byCountDesc[0].v;
    const kickers = values
      .filter((v) => v !== pair)
      .sort((a, b) => b - a);
    return { cat: "Pair", catRank: 2, kickers: [pair, ...kickers.slice(0, 3)] };
  }
  return { cat: "High Card", catRank: 1, kickers: values.slice(0, 5) };
};

const scoreStrengthValue = (score: HandScore) => {
  const base = 15;
  const kickers = [...score.kickers, 0, 0, 0, 0, 0].slice(0, 5);
  return (
    score.catRank * base ** 5 +
    kickers[0] * base ** 4 +
    kickers[1] * base ** 3 +
    kickers[2] * base ** 2 +
    kickers[3] * base +
    kickers[4]
  );
};

const compareScores = (a: HandScore, b: HandScore) => scoreStrengthValue(a) - scoreStrengthValue(b);

const evaluateSeven = (hole: Card[], board: Card[]) => {
  const cards = [...hole, ...board];
  let best: HandScore | null = null;
  for (let a = 0; a < cards.length; a++) {
    for (let b = a + 1; b < cards.length; b++) {
      for (let c = b + 1; c < cards.length; c++) {
        for (let d = c + 1; d < cards.length; d++) {
          for (let e = d + 1; e < cards.length; e++) {
            const score = scoreFive([cards[a], cards[b], cards[c], cards[d], cards[e]]);
            if (!best || compareScores(score, best) > 0) {
              best = score;
            }
          }
        }
      }
    }
  }
  return best!;
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

const getCardColor = (suit: Suit) => (suit === "hearts" || suit === "diamonds" ? "text-red-500" : "text-black");

const HAND_EXAMPLES: { name: string; cards: { rank: Rank; suit: Suit }[] }[] = [
  {
    name: "Royal Flush",
    cards: [
      { rank: "10", suit: "hearts" },
      { rank: "J", suit: "hearts" },
      { rank: "Q", suit: "hearts" },
      { rank: "K", suit: "hearts" },
      { rank: "A", suit: "hearts" },
    ],
  },
  {
    name: "Straight Flush",
    cards: [
      { rank: "5", suit: "spades" },
      { rank: "6", suit: "spades" },
      { rank: "7", suit: "spades" },
      { rank: "8", suit: "spades" },
      { rank: "9", suit: "spades" },
    ],
  },
  {
    name: "Four of a Kind",
    cards: [
      { rank: "9", suit: "clubs" },
      { rank: "9", suit: "diamonds" },
      { rank: "9", suit: "hearts" },
      { rank: "9", suit: "spades" },
      { rank: "K", suit: "diamonds" },
    ],
  },
  {
    name: "Full House",
    cards: [
      { rank: "A", suit: "clubs" },
      { rank: "A", suit: "diamonds" },
      { rank: "A", suit: "spades" },
      { rank: "K", suit: "clubs" },
      { rank: "K", suit: "hearts" },
    ],
  },
  {
    name: "Flush",
    cards: [
      { rank: "2", suit: "diamonds" },
      { rank: "6", suit: "diamonds" },
      { rank: "9", suit: "diamonds" },
      { rank: "J", suit: "diamonds" },
      { rank: "K", suit: "diamonds" },
    ],
  },
  {
    name: "Straight",
    cards: [
      { rank: "4", suit: "clubs" },
      { rank: "5", suit: "diamonds" },
      { rank: "6", suit: "hearts" },
      { rank: "7", suit: "spades" },
      { rank: "8", suit: "clubs" },
    ],
  },
  {
    name: "Three of a Kind",
    cards: [
      { rank: "Q", suit: "clubs" },
      { rank: "Q", suit: "diamonds" },
      { rank: "Q", suit: "spades" },
      { rank: "5", suit: "hearts" },
      { rank: "2", suit: "clubs" },
    ],
  },
  {
    name: "Two Pair",
    cards: [
      { rank: "J", suit: "clubs" },
      { rank: "J", suit: "diamonds" },
      { rank: "8", suit: "spades" },
      { rank: "8", suit: "hearts" },
      { rank: "4", suit: "clubs" },
    ],
  },
  {
    name: "Pair",
    cards: [
      { rank: "10", suit: "spades" },
      { rank: "10", suit: "hearts" },
      { rank: "K", suit: "clubs" },
      { rank: "4", suit: "diamonds" },
      { rank: "2", suit: "spades" },
    ],
  },
  {
    name: "High Card",
    cards: [
      { rank: "A", suit: "spades" },
      { rank: "J", suit: "diamonds" },
      { rank: "8", suit: "clubs" },
      { rank: "5", suit: "hearts" },
      { rank: "2", suit: "spades" },
    ],
  },
];

const isBettingStage = (s: Stage) =>
  s === "preflop" || s === "flop" || s === "turn" || s === "river";

const seatPositionClasses: Record<number, string> = {
  0: "right-4 lg:right-8 xl:right-14 top-1/2 -translate-y-1/2",
  1: "left-[80%] bottom-4 lg:bottom-8 xl:bottom-14",
  2: "left-[60%] bottom-4 lg:bottom-8 xl:bottom-14",
  3: "left-[40%] bottom-4 lg:bottom-8 xl:bottom-14",
  4: "left-[20%] bottom-4 lg:bottom-8 xl:bottom-14",
  5: "left-4 lg:left-8 xl:left-14 top-1/2 -translate-y-1/2",
};

export default function LivePokerPage() {
  const socketRef = useRef<Socket | null>(null);
  const lastStackRef = useRef<number | null>(null);
  const prevStageRef = useRef<Stage | null>(null);
  const prevRevealRef = useRef<number>(0);
  const { data: session } = useSession();
  const { balance, creditBalance, debitBalance } = useWallet();
  const { volume } = useSoundVolume();

  const [connected, setConnected] = useState(false);
  const [roomId, setRoomId] = useState<string>("");
  const [playerId, setPlayerId] = useState<string>("");
  const [name, setName] = useState<string>("");
  const [customRaiseAmount, setCustomRaiseAmount] = useState<number>(0);
  const [gameState, setGameState] = useState<GameState | null>(null);
  const [error, setError] = useState<string>("");
  const [rooms, setRooms] = useState<{ roomId: string; hostName: string; playerCount: number; stage: Stage }[]>([]);

  const serverOnline = connected;

  useEffect(() => {
    if (error) {
      const timer = setTimeout(() => setError(""), 2000);
      return () => clearTimeout(timer);
    }
  }, [error]);

  const audioRef = useRef<{
    bet: HTMLAudioElement | null;
    deal: HTMLAudioElement | null;
    flip: HTMLAudioElement | null;
    remove: HTMLAudioElement | null;
    win: HTMLAudioElement | null;
    Lose: HTMLAudioElement | null;
  }>({ bet: null, deal: null, flip: null, remove: null, win: null, Lose: null });

  const ensureAudio = () => {
    if (audioRef.current.bet) return;
    audioRef.current = {
      bet: new Audio("/sounds/Bet.mp3"),
      deal: new Audio("/sounds/DealCards.mp3"),
      flip: new Audio("/sounds/FlipCards.mp3"),
      remove: new Audio("/sounds/RemoveCards.mp3"),
      win: new Audio("/sounds/Win.mp3"),
      Lose: new Audio("/sounds/LimboLose.mp3"),
    };
  };

  const playAudio = (a?: HTMLAudioElement | null, overlap = false) => {
    if (!a) return;
    const v =
      typeof window !== "undefined" &&
      typeof (window as any).__flopper_sound_volume__ === "number"
        ? (window as any).__flopper_sound_volume__
        : 1;
    if (!v) return;
    try {
      if (overlap) {
        const c = a.cloneNode(true) as HTMLAudioElement;
        c.volume = v;
        void c.play();
      } else {
        a.volume = v;
        a.currentTime = 0;
        void a.play();
      }
    } catch (e) {}
  };

  const effectiveName = session?.user?.name?.trim() || name || "Player";
  const nameEditable = !session?.user?.name;
  const buyIn = Math.max(0, Math.floor(balance || 0));

  const connectSocket = () => {
    if (socketRef.current) return socketRef.current;
    const url = process.env.NEXT_PUBLIC_POKER_WS_URL || "http://localhost:4000";
    const socket = io(url, { transports: ["websocket"] });
    socketRef.current = socket;

    socket.on("connect", () => setConnected(true));
    socket.on("disconnect", () => setConnected(false));
    socket.on("state", (state: GameState) => {
      setGameState(state);
      if (!roomId && state?.roomId) setRoomId(state.roomId);
    });
    socket.on("rooms", (list) => {
      if (Array.isArray(list)) setRooms(list);
    });

    return socket;
  };

  useEffect(() => {
    if (session?.user?.name) {
      setName(session.user.name);
    }
  }, [session?.user?.name]);

  useEffect(() => {
    connectSocket();
  }, []);

  useEffect(() => {
    ensureAudio();
  }, []);

  useEffect(() => {
    if (volume <= 0) return;
    const prime = async () => {
      try {
        ensureAudio();
        const items = Object.values(audioRef.current).filter(Boolean) as HTMLAudioElement[];
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
    };
    document.addEventListener("pointerdown", prime, { once: true });
    return () => document.removeEventListener("pointerdown", prime);
  }, [volume]);

  useEffect(() => {
    if (!roomId) lastStackRef.current = null;
  }, [roomId]);

  useEffect(() => {
    return () => {
      socketRef.current?.disconnect();
      socketRef.current = null;
    };
  }, []);

  const playerIndex = useMemo(() => {
    if (!gameState) return -1;
    return gameState.players.findIndex((p) => p.id === playerId);
  }, [gameState, playerId]);

  const player = useMemo(() => {
    if (!gameState || playerIndex < 0) return null;
    return gameState.players[playerIndex];
  }, [gameState, playerIndex]);

  useEffect(() => {
    if (!gameState || playerIndex < 0) return;
    const currentStack = Math.max(0, Math.floor(gameState.players[playerIndex]?.stack ?? 0));
    if (lastStackRef.current === null) {
      lastStackRef.current = currentStack;
      return;
    }
    const delta = currentStack - lastStackRef.current;
    if (delta > 0) creditBalance(delta);
    if (delta < 0) debitBalance(Math.abs(delta));
    lastStackRef.current = currentStack;
  }, [gameState, playerIndex, creditBalance, debitBalance]);

  useEffect(() => {
    if (!gameState) return;

    const prevStage = prevStageRef.current;
    if (prevStage !== gameState.stage) {
      if ((prevStage === "setup" || prevStage === "finished") && gameState.stage === "preflop") {
        playAudio(audioRef.current.deal, true);
      }
      if (gameState.stage === "finished" && prevStage !== "finished" && player) {
        playAudio((player.payout ?? 0) > 0 ? audioRef.current.win : audioRef.current.Lose);
      }
      prevStageRef.current = gameState.stage;
    }

    if (gameState.stage === "setup") {
      prevRevealRef.current = 0;
      return;
    }

    const prevReveal = prevRevealRef.current;
    if (gameState.boardRevealCount > prevReveal) {
      const diff = gameState.boardRevealCount - prevReveal;
      for (let i = 0; i < diff; i++) {
        window.setTimeout(() => playAudio(audioRef.current.flip, true), i * 120);
      }
      prevRevealRef.current = gameState.boardRevealCount;
    }
  }, [gameState, player]);

  const playerCanAct =
    !!gameState &&
    isBettingStage(gameState.stage) &&
    playerIndex === gameState.activePlayerIndex &&
    !!player &&
    !player.folded &&
    !player.allIn;

  const bigBlindValue = 100;
  const minRaiseSize = Math.max(gameState?.minRaise || bigBlindValue, bigBlindValue);
  const minRaiseTotal = (gameState?.currentBet || 0) + minRaiseSize;
  const maxRaiseTotal = Math.floor((player?.stack || 0) + (player?.roundContribution || 0));
  const safeMinRaiseTotal = Math.min(minRaiseTotal, maxRaiseTotal || minRaiseTotal);
  const clampRaiseTotal = (value: number) => Math.min(maxRaiseTotal || value, Math.max(safeMinRaiseTotal, Math.floor(value)));

  const currentPlayerCategory = useMemo(() => {
    if (!gameState || !player || player.folded || player.hole.length < 2) return null;
    if (gameState.stage === "setup" || gameState.stage === "dealing") return null;
    const currentBoard = gameState.board.slice(0, gameState.boardRevealCount);
    if (currentBoard.length === 0) {
      if (player.hole[0].rank === player.hole[1].rank) return "Pair";
      return "High Card";
    }
    if (currentBoard.length < 3) return null;

    const bestScore = evaluateSeven(player.hole, currentBoard);
    if (bestScore.cat === "Straight Flush" && bestScore.kickers[0] === 14) {
      return "Royal Flush";
    }
    return bestScore.cat;
  }, [gameState, player]);

  const createRoom = () => {
    setError("");
    if (!serverOnline) {
      setError("Server startet noch, bitte kurz warten...");
      return;
    }
    if (buyIn <= 0) {
      setError("Your balance is too low.");
      return;
    }
    const socket = connectSocket();
    socket.emit("create_room", { name: effectiveName, buyIn }, (res: any) => {
      if (!res?.ok) {
        setError(res?.error || "Failed to create room.");
        return;
      }
      setRoomId(res.roomId);
      setPlayerId(res.playerId);
    });
  };

  const joinRoom = (targetRoomId: string) => {
    setError("");
    if (!targetRoomId) return;
    if (!serverOnline) {
      setError("Server startet noch, bitte kurz warten...");
      return;
    }
    if (buyIn <= 0) {
      setError("Your balance is too low.");
      return;
    }
    const socket = connectSocket();
    socket.emit("join_room", { roomId: targetRoomId, name: effectiveName, buyIn }, (res: any) => {
      if (!res?.ok) {
        setError(res?.error || "Failed to join room.");
        return;
      }
      setRoomId(res.roomId);
      setPlayerId(res.playerId);
    });
  };

  const leaveRoom = () => {
    const socket = socketRef.current;
    if (!socket || !roomId) return;
    socket.emit("leave_room", { roomId }, () => {
      setRoomId("");
      setGameState(null);
      setPlayerId("");
      lastStackRef.current = null;
    });
  };

  const startHand = () => {
    if (!gameState || gameState.hostId !== playerId) return;
    if (gameState.stage !== "setup" && gameState.stage !== "finished") return;
    const socket = socketRef.current;
    if (!socket) return;
    ensureAudio();
    playAudio(audioRef.current.bet);
    socket.emit("start_hand", { roomId: gameState.roomId, buyIn, bigBlind: 100 }, (res: any) => {
      if (!res?.ok) setError(res?.error || "Start failed");
    });
  };

  const handlePlayerFold = () => {
    if (!playerCanAct || !gameState) return;
    playAudio(audioRef.current.bet);
    socketRef.current?.emit("action", { roomId: gameState.roomId, action: "fold" });
  };

  const handlePlayerCall = () => {
    if (!playerCanAct || !gameState) return;
    playAudio(audioRef.current.bet);
    socketRef.current?.emit("action", { roomId: gameState.roomId, action: "call" });
  };

  const handlePlayerRaise = (arg?: unknown) => {
    if (!playerCanAct || !gameState) return;
    let targetBet =
      typeof arg === "number"
        ? arg
        : customRaiseAmount > 0
        ? customRaiseAmount
        : minRaiseTotal;

    if (targetBet < minRaiseTotal) targetBet = minRaiseTotal;
    const clamped = clampRaiseTotal(targetBet);
    playAudio(audioRef.current.bet);
    socketRef.current?.emit("action", { roomId: gameState.roomId, action: "raise", amount: clamped });
  };

  const renderCardFace = (card: Card, revealed: boolean, small = false, delay = 0) => (
    <div
      style={{ animationDelay: `${delay}s` }}
      className={`bj-card w-9 h-12 ${
        small ? "sm:w-10 sm:h-14 lg:w-11 lg:h-16" : "sm:w-11 sm:h-16 md:w-13 md:h-18 lg:w-15 lg:h-21 xl:w-18 xl:h-26"
      } rounded-lg shadow-lg animate-slide-in card-deal ${revealed ? "bj-flipped" : ""}`}
    >
      <div className="bj-card-inner" style={{ transitionDelay: `${delay}s` }}>
        <div className="bj-card-face bj-card-back rounded-lg border border-[#0f212e] bg-[#007bff] relative overflow-hidden">
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="w-5 h-9 sm:w-6 sm:h-11 lg:w-7 lg:h-13 border-2 border-white/10 rounded flex items-center justify-center transform rotate-12">
              <span className="text-white/20 font-bold -rotate-12 text-[4px]">FLOPPER</span>
            </div>
          </div>
        </div>

        <div className={`bj-card-face bj-card-front rounded-lg bg-white ${getCardColor(card.suit)} p-1 sm:p-2`}>
          <div className="self-start font-bold text-[7px] sm:text-[9px] lg:text-[10px] leading-none">{card.rank}</div>
          <div className="text-sm sm:text-base lg:text-xl">{getSuitIcon(card.suit)}</div>
          <div className="self-end font-bold text-[7px] sm:text-[9px] lg:text-[10px] leading-none rotate-180">{card.rank}</div>
        </div>
      </div>
    </div>
  );

  const renderBoard = () => (
    <div className="flex gap-3 items-center justify-center">
      {gameState?.board.slice(0, 5).map((card, idx) => (
        <div key={card.id} className="relative">
          {renderCardFace(card, idx < (gameState?.boardRevealCount || 0), true, idx * 0.15)}
        </div>
      ))}
    </div>
  );

  const renderSeatUi = (s: PlayerState, seatIndex: number) => {
    const isWinner = !!gameState?.winners?.includes(seatIndex);
    const activeGlow = isWinner ? "drop-shadow-[0_0_10px_rgba(0,231,1,0.8)]" : "";
    const faded = s.folded ? "opacity-40 grayscale" : "";
    const renderCardBack = (key: string, delay: number) =>
      renderCardFace({ id: key, suit: "spades", rank: "A" }, false, true, delay);

    return (
      <div
        key={s.id}
        className={`absolute ${seatPositionClasses[seatIndex] || seatPositionClasses[0]} ${
          seatIndex === 1 || seatIndex === 2 || seatIndex === 3 || seatIndex === 4 ? "-translate-x-1/2" : "translate-x-0"
        } ${faded} transition-all duration-300 pointer-events-none`}
      >
        <div className={`relative flex flex-col items-center gap-1 ${activeGlow} pointer-events-auto transition-all duration-500`}>
          {gameState?.dealerPos === seatIndex && (
            <div className="absolute -top-3 -right-2 z-40 bg-white text-black text-[10px] font-bold w-5 h-5 rounded-full flex items-center justify-center border border-gray-300 shadow-md">
              D
            </div>
          )}

          <div className="flex items-center gap-2">
            <div className="flex flex-col items-end justify-center min-w-12 gap-0.5 z-20 mr-1">
              {s.lastAction && (
                <div className="text-[8px] sm:text-[9px] uppercase font-bold text-right whitespace-nowrap text-white">
                  {s.lastAction}
                </div>
              )}
            </div>
            <div>
              <div className="flex justify-center">
                {s.roundContribution > 0 && (
                  <div className="absolute top-full mt-1 xl:mt-2 z-40 text-[#fbbf24] text-[10px] px-2 py-0.5 font-mono whitespace-nowrap">
                    ${s.roundContribution}
                  </div>
                )}
              </div>

              <div className="flex flex-col items-start z-20">
                <div className="flex items-center">
                  {gameState?.activePlayerIndex === seatIndex && (
                    <div className="w-1.5 h-1.5 rounded-full bg-[#00e701] shadow-[0_0_6px_#00e701] animate-pulse me-1" />
                  )}
                  <div className="text-white text-[9px] sm:text-[10px] font-bold rounded-full">
                    {s.name}
                  </div>
                </div>
                <div className="text-[10px] text-[#b1bad3] lowercase">${Math.max(0, Math.floor(s.stack)).toFixed(0)}</div>
              </div>

              <div className="flex items-center justify-center z-10">
                {s.hole.length === 0 ? (
                  <div className="flex gap-1">
                    <div className="cursor-default">{renderCardBack(`back-${seatIndex}-0`, seatIndex * 0.1)}</div>
                    <div className="-ml-4 cursor-default">{renderCardBack(`back-${seatIndex}-1`, seatIndex * 0.1 + 0.1)}</div>
                  </div>
                ) : (
                  s.hole.slice(0, 2).map((c, i) => (
                    <div key={c.id} className={`${i > 0 ? "-ml-4" : ""} cursor-default`}>
                      {renderCardFace(c, true, true, (seatIndex * 2 + i) * 0.1)}
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  };

  return (
    <>
      <div className="p-2 sm:p-4 lg:p-6 max-w-350 mx-auto flex flex-col lg:flex-row gap-4 lg:gap-8">
        <div className="w-full lg:w-60 flex flex-col gap-3 bg-[#0f212e] p-2 sm:p-3 rounded-xl h-fit text-xs">
          {!roomId ? (
            <div className="space-y-3">
              <div className="text-xs font-bold text-[#b1bad3] uppercase tracking-wider">Live Poker Lobby</div>
              <button
                onClick={createRoom}
                disabled={buyIn <= 0 || !serverOnline}
                className="w-full bg-[#00e701] hover:bg-[#00c201] text-black py-3 rounded-md font-bold text-sm shadow-[0_0_20px_rgba(0,231,1,0.2)] transition-all active:scale-95"
              >
                Create room
              </button>

              {error && <div className="text-red-400 text-[10px]">{error}</div>}
              {!serverOnline && !error && (
                <div className="text-[#fbbf24] text-[10px]">Server is starting... please wait a moment</div>
              )}
              <div className="text-[10px] text-[#b1bad3]">Max 6 players per room</div>

              <div className="space-y-2 pt-2 border-t border-[#2f4553]">
                <div className="text-[10px] font-bold text-[#b1bad3] uppercase tracking-wider">Open rooms</div>
                {rooms.length === 0 ? (
                  <div className="text-[10px] text-[#b1bad3]">No open rooms</div>
                ) : (
                  <div className="space-y-2">
                    {rooms.map((room) => (
                      <div
                        key={room.roomId}
                        className="flex items-center justify-between gap-2 bg-[#0f212e] border border-[#2f4553] rounded-md px-2 py-2"
                      >
                        <div className="text-[10px] text-[#b1bad3]">
                          <div className="text-white font-mono text-[10px]">{room.roomId}</div>
                          <div>Host: {room.hostName || "-"}</div>
                          <div>
                            {room.playerCount}/6 · {room.stage}
                          </div>
                        </div>
                        <button
                          onClick={() => {
                            joinRoom(room.roomId);
                          }}
                          disabled={room.playerCount >= 6 || buyIn <= 0 || !serverOnline}
                          className="bg-[#2f4553] hover:bg-[#3e5666] text-white py-1.5 px-2 rounded-md text-[10px] font-bold disabled:opacity-50"
                        >
                          Join
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          ) : (
            <>
              <div>
                <div className="flex items-center">
                  <div className="text-[10px] text-[#b1bad3] uppercase">Room: </div>
                  <div className="text-white font-mono text-[10px] break-all ms-1">{roomId}</div>
                </div>
                <div className="text-[10px] text-[#b1bad3]">{connected ? "Connected" : "Offline"}</div>
                <button
                  onClick={leaveRoom}
                  className="w-full bg-[#2f4553] hover:bg-[#3e5666] text-white py-2 rounded-md font-bold text-xs mt-2"
                >
                  Leave room
                </button>
              </div>

              {gameState?.hostId === playerId ? (
                (gameState.stage === "setup" || gameState.stage === "finished") && (
                  <button
                    onClick={startHand}
                    className="w-full bg-[#00e701] hover:bg-[#00c201] text-black py-3 rounded-md font-bold text-lg shadow-[0_0_20px_rgba(0,231,1,0.2)] transition-all active:scale-95 flex items-center justify-center gap-2"
                  >
                    <PlayArrow /> Start Game
                  </button>
                )
              ) : (gameState?.stage === "setup" || gameState?.stage === "finished") ? (
                <div className="text-[#b1bad3] text-xs text-center border border-dashed border-[#2f4553] p-4 rounded-md">
                  Waiting for host to start game...
                </div>
              ) : null}

              {gameState?.stage === "finished" && (player?.payout ?? 0) > 0 && (
                <div className="p-4 bg-[#213743] border border-[#00e701] rounded-md text-center">
                  <div className="text-xs text-[#b1bad3] uppercase">You Won</div>
                  <div className="text-xl font-bold text-[#00e701]">
                    ${(player?.payout ?? 0).toFixed(2)}
                  </div>
                </div>
              )}

              {gameState && isBettingStage(gameState.stage) && (
                <div className="flex flex-col gap-2">
                  <div className={`transition-opacity ${playerCanAct ? "" : "opacity-50 pointer-events-none"}`}>
                    <div className="bg-[#0f212e] rounded-md border border-[#2f4553] p-2">
                      <input
                        type="range"
                        min={safeMinRaiseTotal}
                        max={maxRaiseTotal || safeMinRaiseTotal}
                        step={1}
                        value={customRaiseAmount > 0 ? customRaiseAmount : safeMinRaiseTotal}
                        disabled={!playerCanAct}
                        onChange={(e) => setCustomRaiseAmount(Number(e.target.value))}
                        className="w-full accent-[#00e701] cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                      />
                      <div className="flex justify-between text-xs text-[#b1bad3] mt-2">
                        <span>${safeMinRaiseTotal.toFixed(0)}</span>
                        <span className="text-white font-bold">${(customRaiseAmount || safeMinRaiseTotal).toFixed(0)}</span>
                        <span>${(maxRaiseTotal || safeMinRaiseTotal).toFixed(0)}</span>
                      </div>
                    </div>
                    <div className="mt-2 text-start text-[11px] text-[#b1bad3]">
                      <span className="uppercase">Call:</span>{" "}
                      <span className="text-white font-bold">
                        ${Math.max(0, Math.floor((gameState.currentBet || 0) - (player?.roundContribution || 0))).toFixed(0)}
                      </span>
                    </div>
                  </div>
                  <div className="grid grid-cols-3 gap-2">
                    <button
                      onClick={handlePlayerFold}
                      disabled={!playerCanAct}
                      className="bg-[#2f4553] hover:bg-[#3e5666] text-white py-2 rounded-md font-bold disabled:opacity-50 text-xs"
                    >
                      Fold
                    </button>
                    <button
                      onClick={handlePlayerCall}
                      disabled={!playerCanAct}
                      className="bg-[#2f4553] hover:bg-[#3e5666] text-white py-2 rounded-md font-bold disabled:opacity-50 text-xs"
                    >
                      Call
                    </button>
                    <button
                      onClick={(e) => handlePlayerRaise(e)}
                      disabled={!playerCanAct || (player?.stack || 0) <= 0}
                      className="bg-[#00e701] hover:bg-[#00c201] text-black py-2 rounded-md font-bold disabled:opacity-50 text-xs"
                    >
                      Raise
                    </button>
                  </div>
                </div>
              )}

              {error && <div className="text-red-400 text-[10px]">{error}</div>}
            </>
          )}
        </div>

        <div className="flex-1 flex flex-col gap-4">
          <div className="flex-1 bg-[#0f212e] p-2 sm:p-6 rounded-xl min-h-200 flex flex-col gap-6 relative overflow-hidden">
            <div className="relative flex-1 rounded-[60px] lg:rounded-[90px] xl:rounded-[120px] border-12 lg:border-18 xl:border-26 border-[#131518] overflow-hidden bg-[#2d5a36]">
              <div className="absolute inset-0 border-8 lg:border-12 xl:border-16 border-[#654321] rounded-[48px] lg:rounded-[72px] xl:rounded-[92px] pointer-events-none opacity-95" />

              <div className="absolute inset-0 pointer-events-none">
                <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,rgba(255,255,255,0.05),transparent_70%)] opacity-30" />
                <div className="absolute inset-4 lg:inset-6 xl:inset-12 rounded-[40px] lg:rounded-[60px] xl:rounded-[80px] border border-[#ffffff10]" />
              </div>

              <div className="absolute left-1/2 -translate-x-1/2 top-6 xl:top-12">
                {gameState?.stage !== "setup" && <div className="px-3 py-2">{renderBoard()}</div>}
              </div>

              <div className="absolute left-1/2 -translate-x-1/2 top-1/2 -translate-y-1/2">
                {gameState?.stage !== "setup" && (gameState?.pot || 0) > 0 && (
                  <div className="flex flex-col items-center gap-1">
                    <div className="text-white font-black text-2xl">${(gameState?.pot || 0).toFixed(0)}</div>
                  </div>
                )}
              </div>

              {gameState?.players?.slice(0, 6).map((p, idx) => renderSeatUi(p, idx))}
            </div>

            <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-3">
              {HAND_EXAMPLES.map((hand, idx) => {
                const isActive = hand.name === currentPlayerCategory;
                return (
                  <div
                    key={hand.name}
                    className={`p-2 rounded border flex flex-col items-center gap-2 transition-all duration-300 ${
                      isActive ? "bg-[#1d353f] border-[#00e701]" : "bg-[#1a2c38] border-[#2f4553]"
                    }`}
                  >
                    <div className="text-[10px] uppercase font-bold transition-colors text-[#b1bad3] ">{idx + 1}. {hand.name}</div>
                    <div className="flex justify-center -space-x-1">
                      {hand.cards.map((c, i) => (
                        <div
                          key={i}
                          style={{ zIndex: i }}
                          className={`w-6 h-8 rounded bg-white ${getCardColor(c.suit)} flex flex-col items-center justify-center p-0.5 shadow-sm border border-gray-300 relative`}
                          title={`${c.rank} of ${c.suit}`}
                        >
                          <div className="text-[8px] font-bold leading-none">{c.rank}</div>
                          <div className="text-[10px] leading-none">{getSuitIcon(c.suit)}</div>
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          <GameRecordsPanel gameId="livepoker" />
        </div>
      </div>
    </>
  );
}
