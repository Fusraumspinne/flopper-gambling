"use client";

import React, { useEffect, useRef, useState } from "react";
import { PlayArrow } from "@mui/icons-material";
import { useWallet } from "@/components/WalletProvider";
import { useSoundVolume } from "@/components/SoundVolumeProvider";
import GameRecordsPanel from "@/components/GameRecordsPanel";

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

interface BotPersona {
  name: string;
  aggression: number;
  bluff: number;
  consistency: number;
  minDelay: number;
  maxDelay: number;
  tagline: string;
}

interface BotState {
  id: string;
  persona: BotPersona;
  hole: Card[];
  stack: number;
  contribution: number;
  roundContribution: number;
  folded: boolean;
  allIn: boolean;
  tilt: number;
  frustration: number;
  bluffCaught: number;
  lastAction: string;
  hasActed: boolean;
}

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

const BOT_NAMES = [
  "Jeffry Epstein",
  "PDiddy",
  "Charlie Kirk",
  "Klaus Mausi",
  "Der Markus",
  "Adolf Uunona",
  "Sigma",
  "67",
  "ChatGPT",
  "Boobie Monster",
];

const personaTemplates: Omit<BotPersona, "name">[] = [
  {
    aggression: 0.18,
    bluff: 0.05,
    consistency: 0.92,
    minDelay: 1000,
    maxDelay: 1600,
    tagline: "Tight-Passive",
  },
  {
    aggression: 0.82,
    bluff: 0.65,
    consistency: 0.48,
    minDelay: 520,
    maxDelay: 900,
    tagline: "Loose-Aggressive",
  },
  {
    aggression: 0.44,
    bluff: 0.14,
    consistency: 0.96,
    minDelay: 900,
    maxDelay: 1300,
    tagline: "Solid",
  },
  {
    aggression: 0.62,
    bluff: 0.52,
    consistency: 0.22,
    minDelay: 360,
    maxDelay: 980,
    tagline: "Unpredictable",
  },
  {
    aggression: 0.3,
    bluff: 0.12,
    consistency: 0.88,
    minDelay: 820,
    maxDelay: 1400,
    tagline: "Controlled",
  },
  {
    aggression: 0.76,
    bluff: 0.4,
    consistency: 0.35,
    minDelay: 480,
    maxDelay: 880,
    tagline: "Tilt-Prone",
  },
];

const DEFAULT_BOT_STACK = 5000;

const getCardValue = (rank: Rank): number => {
  if (rank === "A") return 14;
  if (rank === "K") return 13;
  if (rank === "Q") return 12;
  if (rank === "J") return 11;
  return parseInt(rank, 10);
};

const createDeck = (): Card[] => {
  let cardId = 0;
  const deck: Card[] = [];
  for (const suit of SUITS) {
    for (const rank of RANKS) {
      deck.push({ id: `${Date.now()}-${cardId++}`, suit, rank });
    }
  }
  return deck.sort(() => Math.random() - 0.5);
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
    const kicker = byCountDesc.find((x) => x.c === 1)?.v || 0;
    return { cat: "Two Pair", catRank: 3, kickers: [pair1, pair2, kicker] };
  }
  if (byCountDesc[0]?.c === 2) {
    const pair = byCountDesc[0].v;
    const kickers = byCountDesc
      .filter((x) => x.v !== pair)
      .map((x) => x.v)
      .sort((a, b) => b - a);
    return { cat: "Pair", catRank: 2, kickers: [pair, ...kickers.slice(0, 3)] };
  }
  return { cat: "High Card", catRank: 1, kickers: values.slice(0, 5) };
};

const evaluateSeven = (hole: Card[], board: Card[]) => {
  const cards = [...hole, ...board];
  let best: HandScore | null = null;
  for (let a = 0; a < cards.length; a++) {
    for (let b = a + 1; b < cards.length; b++) {
      for (let c = b + 1; c < cards.length; c++) {
        for (let d = c + 1; d < cards.length; d++) {
          for (let e = d + 1; e < cards.length; e++) {
            const score = scoreFive([
              cards[a],
              cards[b],
              cards[c],
              cards[d],
              cards[e],
            ]);
            if (!best) {
              best = score;
            } else if (score.catRank > best.catRank) {
              best = score;
            } else if (score.catRank === best.catRank) {
              const len = Math.max(score.kickers.length, best.kickers.length);
              let better = false;
              for (let i = 0; i < len; i++) {
                const left = score.kickers[i] ?? 0;
                const right = best.kickers[i] ?? 0;
                if (left > right) {
                  better = true;
                  break;
                }
                if (left < right) break;
              }
              if (better) best = score;
            }
          }
        }
      }
    }
  }
  return best!;
};

const winStrength = (score: HandScore): number => {
  const catPart = (score.catRank - 1) / 8;
  const weights = [0.42, 0.22, 0.14, 0.12, 0.1];
  const denom = weights.reduce((a, b) => a + b, 0);
  const kickerPart =
    weights.reduce((acc, w, i) => acc + w * ((score.kickers[i] ?? 0) / 14), 0) /
    (denom || 1);

  const combined = catPart * 0.72 + kickerPart * 0.28;
  return Math.max(0, Math.min(1, combined));
};

const estimatePreflopStrength = (hole: Card[]): number => {
  if (hole.length < 2) return 0;
  const a = getCardValue(hole[0].rank);
  const b = getCardValue(hole[1].rank);
  const hi = Math.max(a, b);
  const lo = Math.min(a, b);
  const isPair = a === b;
  const suited = hole[0].suit === hole[1].suit;
  const gap = Math.max(0, hi - lo - 1);
  const connected = gap === 0;

  let s = 0.12;
  s += (hi / 14) * 0.28;
  s += (lo / 14) * 0.16;
  if (isPair) s += 0.26 + (hi / 14) * 0.12;
  if (suited) s += 0.06;
  if (connected) s += 0.06;
  if (gap === 1) s += 0.03;
  if (hi >= 13 && lo >= 10) s += 0.05;
  return Math.max(0, Math.min(1, s));
};

const formatAction = (name: string, action: string) => `${name}: ${action}`;

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

const getCardColor = (suit: Suit) =>
  suit === "hearts" || suit === "diamonds" ? "text-red-500" : "text-black";

const choosePersonas = (count: number): BotPersona[] => {
  const availableNames = [...BOT_NAMES].sort(() => Math.random() - 0.5);
  const shuffledTemplates = [...personaTemplates].sort(
    () => Math.random() - 0.5
  );

  const picks: BotPersona[] = [];
  for (let i = 0; i < count; i++) {
    const base = shuffledTemplates[i % shuffledTemplates.length];
    const name = availableNames[i % availableNames.length];

    const spice = (n: number, delta: number) =>
      Math.max(0, Math.min(1, n + (Math.random() - 0.5) * delta));

    picks.push({
      ...base,
      name,
      aggression: spice(base.aggression, 0.12),
      bluff: spice(base.bluff, 0.16),
      consistency: spice(base.consistency, 0.1),
    });
  }
  return picks;
};

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

export default function PokerPage() {
  const { balance, subtractFromBalance, addToBalance, finalizePendingLoss, debitBalance, creditBalance } =
    useWallet();
  const { volume } = useSoundVolume();

  const [betAmount, setBetAmount] = useState<number>(100);
  const [betInput, setBetInput] = useState<string>("100");
  const [customRaiseAmount, setCustomRaiseAmount] = useState<number>(0);
  const [numBots, setNumBots] = useState<number>(2);
  const [stage, setStage] = useState<Stage>("setup");
  const [deck, setDeck] = useState<Card[]>([]);
  const [board, setBoard] = useState<Card[]>([]);
  const [boardRevealCount, setBoardRevealCount] = useState<number>(0);
  const [playerHole, setPlayerHole] = useState<Card[]>([]);
  const [bots, setBots] = useState<BotState[]>([]);
  const [pot, setPot] = useState<number>(0);
  const [currentBet, setCurrentBet] = useState<number>(0);
  const [minRaise, setMinRaise] = useState<number>(0);
  const [dealerPos, setDealerPos] = useState<number>(0);
  const [lastAggressor, setLastAggressor] = useState<number>(-1);
  const [activePlayerIndex, setActivePlayerIndex] = useState<number>(0);
  const [pendingToAct, setPendingToAct] = useState<number>(0);
  const [playerContribution, setPlayerContribution] = useState<number>(0);
  const [playerRoundContribution, setPlayerRoundContribution] =
    useState<number>(0);
  const [playerFolded, setPlayerFolded] = useState<boolean>(false);
  const [playerAllIn, setPlayerAllIn] = useState<boolean>(false);
  const [actionLog, setActionLog] = useState<string[]>([]);
  const [resultFx, setResultFx] = useState<"rolling" | "win" | "lose" | null>(
    null
  );
  const [lastWin, setLastWin] = useState<number>(0);
  const [handLabel, setHandLabel] = useState<string>("");
  const [playerLastAction, setPlayerLastAction] = useState<string>("");
  const [playerHasActed, setPlayerHasActed] = useState<boolean>(false);
  const [winners, setWinners] = useState<number[]>([]);
  const [actionHistoryBySeat, setActionHistoryBySeat] = useState<
    Record<number, string[]>
  >({});
  const timers = useRef<number[]>([]);
  const resultTimeoutRef = useRef<number | null>(null);
  const botTurnInFlightRef = useRef<boolean>(false);
  const playerWagersRef = useRef<number[]>([]);
  const tableRef = useRef<HTMLDivElement | null>(null);
  const potRef = useRef<HTMLDivElement | null>(null);

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

  useEffect(() => {
    ensureAudio();
  }, []);

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

  useEffect(() => {
    if (volume <= 0) return;
    const prime = async () => {
      try {
        ensureAudio();
        const items = Object.values(audioRef.current).filter(
          Boolean
        ) as HTMLAudioElement[];
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
    return () => {
      timers.current.forEach((t) => clearTimeout(t));
      if (resultTimeoutRef.current) clearTimeout(resultTimeoutRef.current);
    };
  }, []);

  const clearTimers = () => {
    timers.current.forEach((t) => clearTimeout(t));
    timers.current = [];
  };

  const addLog = (entry: string) => {
    setActionLog((prev) => [...prev.slice(-7), entry]);
  };

  const pushSeatAction = (seatIndex: number, label: string) => {
    let clean = "";
    const lower = label.toLowerCase();
    if (lower.includes("fold")) clean = "Fold";
    else if (lower.includes("call")) clean = "Call";
    else if (lower.includes("check")) clean = "Check";
    else if (lower.includes("raise")) clean = "Raise";

    if (!clean) return;

    setActionHistoryBySeat((prev) => {
      const existing = prev[seatIndex] ?? [];
      const next = [...existing, clean].slice(-4);
      return { ...prev, [seatIndex]: next };
    });
  };

  const isBettingStage = (s: Stage) =>
    s === "preflop" || s === "flop" || s === "turn" || s === "river";

  const getPlayerCountForHand = (botList: BotState[]) => 1 + botList.length;

  const isAlive = (idx: number, botList: BotState[], pFolded: boolean) => {
    if (idx === 0) return !pFolded;
    const b = botList[idx - 1];
    return !!b && !b.folded;
  };

  const isActor = (
    idx: number,
    botList: BotState[],
    pFolded: boolean,
    pAllIn: boolean
  ) => {
    if (!isAlive(idx, botList, pFolded)) return false;
    if (idx === 0) return !pAllIn;
    const b = botList[idx - 1];
    return !b.allIn;
  };

  const getRoundContribution = (
    idx: number,
    botList: BotState[],
    pRound: number
  ) => {
    if (idx === 0) return pRound;
    return botList[idx - 1]?.roundContribution ?? 0;
  };

  const getTotalContribution = (
    idx: number,
    botList: BotState[],
    pTotal: number
  ) => {
    if (idx === 0) return pTotal;
    return botList[idx - 1]?.contribution ?? 0;
  };

  const recomputePot = (botList: BotState[], pTotal: number) => {
    const botSum = botList.reduce((acc, b) => acc + (b.contribution || 0), 0);
    return botSum + (pTotal || 0);
  };

  const countActors = (
    botList: BotState[],
    pFolded: boolean,
    pAllIn0: boolean
  ) => {
    let n = 0;
    const pc = getPlayerCountForHand(botList);
    for (let i = 0; i < pc; i++) {
      if (isActor(i, botList, pFolded, pAllIn0)) n++;
    }
    return n;
  };

  const countAlive = (botList: BotState[], pFolded: boolean) => {
    let n = pFolded ? 0 : 1;
    n += botList.filter((b) => !b.folded).length;
    return n;
  };

  const isRoundOver = (
    botList: BotState[],
    pFolded: boolean,
    pAllIn: boolean,
    pContribution: number,
    pActed: boolean,
    currentBet: number
  ) => {
    if (!pFolded) {
      if (!pAllIn) {
        if (pContribution < currentBet) return false;
        if (!pActed) return false;
      }
    }

    for (const b of botList) {
      if (!b.folded) {
        if (!b.allIn) {
          if (b.roundContribution < currentBet) return false;
          if (!b.hasActed) return false;
        }
      }
    }
    return true;
  };

  const nextActorIndex = (
    from: number,
    botList: BotState[],
    pFolded: boolean,
    pAllIn0: boolean
  ) => {
    const pc = getPlayerCountForHand(botList);
    if (pc <= 0) return -1;
    for (let step = 1; step <= pc; step++) {
      const idx = (from + step) % pc;
      if (isActor(idx, botList, pFolded, pAllIn0)) return idx;
    }
    return -1;
  };

  const resetStreet = (botList: BotState[]) =>
    botList.map((b) => ({
      ...b,
      roundContribution: 0,
      hasActed: false,
      lastAction: b.folded ? "Fold" : b.allIn ? "All-In" : "",
    }));

  const settlePlayerPendingWithPayout = (payout: number) => {
    const wagers = playerWagersRef.current;

    const totalWager = wagers.reduce((a, b) => a + b, 0);

    if (totalWager > 0) {
      creditBalance(totalWager);
      subtractFromBalance(totalWager);
    } else if (payout > 0) {
      addToBalance(payout);
      return;
    } else {
        return;
    }

    if (payout > 0) {
      addToBalance(payout);
    } else {
      finalizePendingLoss();
    }

    playerWagersRef.current = [];
  };

  const finishHandEarly = (
    botList: BotState[],
    pFolded: boolean,
    pTotal: number
  ) => {
    const potValue = recomputePot(botList, pTotal);
    const aliveInfo = botList.reduce(
      (acc, b, i) => {
        if (!b.folded) acc.push(i + 1);
        return acc;
      },
      !pFolded ? [0] : ([] as number[])
    );
    const aliveCount = aliveInfo.length;

    if (aliveCount === 1) {
      const winnerIdx = aliveInfo[0];
      if (winnerIdx === 0) {
        settlePlayerPendingWithPayout(potValue);
        setLastWin(potValue);
        setHandLabel("All folded");
        setResultFx("win");
        playAudio(audioRef.current.win);
        addLog("All opponents have folded");
        setWinners([botList.length]);
      } else {
        settlePlayerPendingWithPayout(0);
        const bi = winnerIdx - 1;
        const winnerName = botList[bi]?.persona.name || "Bot";
        addLog(`${winnerName} wins (all others folded)`);
        setWinners([bi]);
        setLastWin(0);
        setHandLabel("Lost");
        setResultFx("lose");
        playAudio(audioRef.current.Lose);
      }
      resultTimeoutRef.current = window.setTimeout(
        () => setResultFx(null),
        900
      );
      setBoardRevealCount(5);
      setPot(potValue);
      setStage("finished");
      return true;
    }

    return false;
  };

  const resolveShowdown = (
    botList: BotState[],
    pFolded: boolean,
    pTotal: number
  ) => {
    const potValue = recomputePot(botList, pTotal);
    setPot(potValue);

    const activeParticipants = [];
    if (!pFolded) activeParticipants.push("player");
    botList.forEach((b) => {
      if (!b.folded) activeParticipants.push("bot");
    });
    
    let flipDelay = 0;
    activeParticipants.forEach(() => {
        setTimeout(() => playAudio(audioRef.current.flip, true), flipDelay);
        flipDelay += 100;
        setTimeout(() => playAudio(audioRef.current.flip, true), flipDelay);
        flipDelay += 100;
    });

    const pc = getPlayerCountForHand(botList);
    const contribs: { idx: number; amount: number }[] = [];
    for (let i = 0; i < pc; i++) {
      contribs.push({
        idx: i,
        amount: getTotalContribution(i, botList, pTotal),
      });
    }

    const levels = Array.from(
      new Set(contribs.map((c) => c.amount).filter((x) => x > 0))
    ).sort((a, b) => a - b);
    let prev = 0;
    let playerPayout = 0;
    let nextBots = [...botList];
    const moneyWinners = new Set<number>();

    const scoreByIdx = new Map<number, HandScore>();
    const getScore = (idx: number): HandScore => {
      const existing = scoreByIdx.get(idx);
      if (existing) return existing;
      const hole = idx === 0 ? playerHole : nextBots[idx - 1]?.hole ?? [];
      const s = evaluateSeven(hole, board);
      scoreByIdx.set(idx, s);
      return s;
    };

    const compare = (a: HandScore, b: HandScore) => {
      if (a.catRank !== b.catRank) return a.catRank - b.catRank;
      const len = Math.max(a.kickers.length, b.kickers.length);
      for (let i = 0; i < len; i++) {
        const av = a.kickers[i] ?? 0;
        const bv = b.kickers[i] ?? 0;
        if (av !== bv) return av - bv;
      }
      return 0;
    };

    for (const lvl of levels) {
      const inPot = contribs.filter((c) => c.amount >= lvl).length;
      const potTier = Math.max(0, (lvl - prev) * inPot);
      prev = lvl;
      if (potTier <= 0) continue;

      const eligible = contribs
        .filter((c) => c.amount >= lvl)
        .map((c) => c.idx)
        .filter((idx) => isAlive(idx, nextBots, pFolded));

      if (eligible.length === 0) continue;

      let bestIdxs: number[] = [eligible[0]];
      let bestScore = getScore(eligible[0]);

      for (const idx of eligible.slice(1)) {
        const s = getScore(idx);
        const cmp = compare(s, bestScore);
        if (cmp > 0) {
          bestScore = s;
          bestIdxs = [idx];
        } else if (cmp === 0) {
          bestIdxs.push(idx);
        }
      }

      const share = potTier / bestIdxs.length;
      for (const w of bestIdxs) {
        moneyWinners.add(w);
        if (w === 0) playerPayout += share;
        else {
          const bi = w - 1;
          if (nextBots[bi])
            nextBots[bi] = {
              ...nextBots[bi],
              stack: nextBots[bi].stack + share,
            };
        }
      }
    }

    settlePlayerPendingWithPayout(playerPayout);

    const playerWon = playerPayout > 0;
    setLastWin(playerWon ? playerPayout : 0);
    setResultFx(playerWon ? "win" : "lose");
    playAudio(playerWon ? audioRef.current.win : audioRef.current.Lose);
    setHandLabel(playerWon ? "Won" : "Lost");
    addLog(
      playerWon
        ? `Showdown: You win $${playerPayout.toFixed(0)}`
        : "Showdown: You lose"
    );

    setWinners(
      Array.from(moneyWinners).map((idx) =>
        idx === 0 ? nextBots.length : idx - 1
      )
    );
    setBots(nextBots);
    resultTimeoutRef.current = window.setTimeout(() => setResultFx(null), 900);
    setBoardRevealCount(5);
    setStage("finished");
  };

  const startHand = () => {
    if (stage !== "setup" && stage !== "finished") return;
    if (numBots < 2 || numBots > 5) return;
    if (betAmount <= 0) return;

    ensureAudio();
    playAudio(audioRef.current.bet);
    clearTimers();
    botTurnInFlightRef.current = false;
    playerWagersRef.current = [];

    const bigBlind = Math.max(1, Math.floor(betAmount));
    const smallBlind = Math.max(1, Math.floor(bigBlind / 2));

    const freshDeck = createDeck();
    const playerHoleCards = [freshDeck.pop()!, freshDeck.pop()!];
    const personaList = choosePersonas(numBots);
    const botStates: BotState[] = personaList.map((p, idx) => ({
      id: `bot-${idx}-${Date.now()}`,
      persona: p,
      hole: [freshDeck.pop()!, freshDeck.pop()!],
      stack: DEFAULT_BOT_STACK,
      contribution: 0,
      roundContribution: 0,
      folded: false,
      allIn: false,
      tilt: 0,
      frustration: 0,
      bluffCaught: 0,
      lastAction: "",
      hasActed: false,
    }));

    freshDeck.pop(); 
    const flop = [freshDeck.pop()!, freshDeck.pop()!, freshDeck.pop()!];
    freshDeck.pop(); 
    const turn = freshDeck.pop()!;
    freshDeck.pop(); 
    const river = freshDeck.pop()!;
    
    const boardCards = [...flop, turn, river];

    const playerCount = 1 + botStates.length;
    const newDealer = playerCount > 0 ? (dealerPos + 1) % playerCount : 0;
    setDealerPos(newDealer);

    const sbIndex =
      playerCount === 2 ? newDealer : (newDealer + 1) % playerCount;
    const bbIndex =
      playerCount === 2
        ? (newDealer + 1) % playerCount
        : (newDealer + 2) % playerCount;

    setDeck(freshDeck);
    setPlayerHole(playerHoleCards);
    setBoard(boardCards);
    setBoardRevealCount(0);
    setPlayerContribution(0);
    setPlayerRoundContribution(0);
    setPlayerFolded(false);
    setPlayerAllIn(false);
    setPlayerLastAction("");
    setHandLabel("");
    setLastWin(0);
    setResultFx("rolling");
    setWinners([]);
    setActionLog(["Neue Hand (Blinds werden gesetzt)"]);
    setActionHistoryBySeat({});

    let nextBots = [...botStates];
    let pTotal = 0;
    let pRound = 0;
    let pAllIn0 = false;
    let playerStack = Math.max(0, Math.floor(balance));

    const postChips = (idx: number, amount: number) => {
      const a = Math.max(0, Math.floor(amount));
      if (a <= 0) return;
      if (idx === 0) {
        const pay = Math.min(a, playerStack);
        if (pay > 0) {
          debitBalance(pay);
          playerWagersRef.current.push(pay);
          pTotal += pay;
          pRound += pay;
          playerStack -= pay;
        }
        if (pay < a || playerStack <= 0) pAllIn0 = pay > 0 ? true : pAllIn0;
      } else {
        const bi = idx - 1;
        const b = nextBots[bi];
        if (!b) return;
        const pay = Math.min(a, Math.floor(b.stack));
        nextBots[bi] = {
          ...b,
          stack: b.stack - pay,
          contribution: b.contribution + pay,
          roundContribution: b.roundContribution + pay,
          allIn: b.stack - pay <= 0,
          lastAction: "",
        };
      }
    };

    postChips(sbIndex, smallBlind);
    postChips(bbIndex, bigBlind);
    pushSeatAction(sbIndex, `SB $${smallBlind}`);
    pushSeatAction(bbIndex, `BB $${bigBlind}`);

    nextBots = nextBots.map((b) => ({ ...b, hasActed: false }));
    setPlayerHasActed(false);

    setBots(nextBots);
    setPlayerContribution(pTotal);
    setPlayerRoundContribution(pRound);
    setPlayerAllIn(pAllIn0);

    const potValue = recomputePot(nextBots, pTotal);
    setPot(potValue);

    const openingBet = Math.max(
      getRoundContribution(0, nextBots, pRound),
      ...nextBots.map((b) => b.roundContribution)
    );
    setCurrentBet(openingBet);
    setMinRaise(bigBlind);
    setLastAggressor(-1);
    setCustomRaiseAmount(0);

    const startIdxRequest = (bbIndex + 1) % playerCount;
    
    const firstActor = isActor(startIdxRequest, nextBots, false, pAllIn0)
      ? startIdxRequest
      : nextActorIndex(startIdxRequest, nextBots, false, pAllIn0);

    setActivePlayerIndex(firstActor === -1 ? 0 : firstActor);
    setStage("preflop");

    const totalCards = playerCount * 2;
    for (let i = 0; i < totalCards; i++) {
      setTimeout(() => {
        playAudio(audioRef.current.deal, true);
      }, i * 100);
    }
  };

  const applyActionAndAdvance = (
    actorIdx: number,
    nextBots: BotState[],
    nextP: {
      total: number;
      round: number;
      folded: boolean;
      allIn: boolean;
    },
    nextCurrentBet: number,
    nextMinRaise: number,
    actionLabel: string,
    isRaise: boolean
  ) => {
    setPlayerContribution(nextP.total);
    setPlayerRoundContribution(nextP.round);
    setPlayerFolded(nextP.folded);
    setPlayerAllIn(nextP.allIn);
    setCurrentBet(nextCurrentBet);
    setMinRaise(nextMinRaise);

    if (isRaise) {
      setLastAggressor(actorIdx);
    }

    let currentNextBots = [...nextBots];
    if (actorIdx > 0) {
      const bi = actorIdx - 1;
      if (currentNextBots[bi]) {
        currentNextBots[bi] = { ...currentNextBots[bi], hasActed: true };
      }
    } else {
      setPlayerHasActed(true);
    }
    setBots(currentNextBots);

    const potValue = recomputePot(currentNextBots, nextP.total);
    setPot(potValue);

    if (finishHandEarly(currentNextBots, nextP.folded, nextP.total)) return;

    const roundOver = isRoundOver(
      currentNextBots,
      nextP.folded,
      nextP.allIn,
      nextP.round,
      actorIdx === 0 ? true : playerHasActed,
      nextCurrentBet
    );

    if (!roundOver) {
      const nextIdx = nextActorIndex(
        actorIdx,
        currentNextBots,
        nextP.folded,
        nextP.allIn
      );
      setActivePlayerIndex(nextIdx === -1 ? 0 : nextIdx);
    } else {
      const bigBlind = Math.max(1, Math.floor(betAmount));

      const pc = getPlayerCountForHand(currentNextBots);
      const postFlopStart = (dealerPos + 1) % pc;

      const nextStreetBots = resetStreet(currentNextBots);

      const startPostFlopActor = isActor(
        postFlopStart,
        nextStreetBots,
        nextP.folded,
        nextP.allIn
      )
        ? postFlopStart
        : nextActorIndex(postFlopStart, nextStreetBots, nextP.folded, nextP.allIn);

      if (stage === "preflop") {
        const delays = [0, 150, 300];
        delays.forEach((d) =>
          setTimeout(() => playAudio(audioRef.current.flip, true), d)
        );
        setBoardRevealCount(3);
        setStage("flop");
        setBots(nextStreetBots);
        setPlayerRoundContribution(0);
        setPlayerHasActed(false);
        setCurrentBet(0);
        setMinRaise(bigBlind);
        setLastAggressor(-1);
        setActivePlayerIndex(
          startPostFlopActor === -1 ? 0 : startPostFlopActor
        );
      } else if (stage === "flop") {
        setTimeout(() => playAudio(audioRef.current.flip, true), 450);
        setBoardRevealCount(4);
        setStage("turn");
        setBots(nextStreetBots);
        setPlayerRoundContribution(0);
        setPlayerHasActed(false);
        setCurrentBet(0);
        setMinRaise(bigBlind);
        setLastAggressor(-1);
        setActivePlayerIndex(
          startPostFlopActor === -1 ? 0 : startPostFlopActor
        );
      } else if (stage === "turn") {
        setTimeout(() => playAudio(audioRef.current.flip, true), 600);
        setBoardRevealCount(5);
        setStage("river");
        setBots(nextStreetBots);
        setPlayerRoundContribution(0);
        setPlayerHasActed(false);
        setCurrentBet(0);
        setMinRaise(bigBlind);
        setLastAggressor(-1);
        setActivePlayerIndex(
          startPostFlopActor === -1 ? 0 : startPostFlopActor
        );
      } else if (stage === "river") {
        setStage("showdown");
        resolveShowdown(currentNextBots, nextP.folded, nextP.total);
      }
    }

    if (actionLabel) {
      addLog(actionLabel);
      const simplified = actionLabel.includes(":")
        ? actionLabel.split(":").slice(1).join(":").trim()
        : actionLabel;
      pushSeatAction(actorIdx, simplified);
    }
  };

  const playerCanAct =
    isBettingStage(stage) &&
    activePlayerIndex === 0 &&
    !playerFolded &&
    !playerAllIn;

  const handlePlayerFold = () => {
    if (!playerCanAct) return;

    setPlayerLastAction("Fold");
    const nextP = {
      total: playerContribution,
      round: playerRoundContribution,
      folded: true,
      allIn: playerAllIn,
    };
    setPlayerFolded(true);

    applyActionAndAdvance(
      0,
      [...bots],
      nextP,
      currentBet,
      minRaise,
      "You fold",
      false
    );
    playAudio(audioRef.current.bet, true);
  };

  const handlePlayerCall = () => {
    if (!playerCanAct) return;
    const toCall = Math.max(
      0,
      Math.floor(currentBet - playerRoundContribution)
    );
    const pay = Math.min(toCall, Math.floor(balance));

    let nextBots = [...bots];
    let nextTotal = playerContribution;
    let nextRound = playerRoundContribution;
    let nextAllIn: boolean = playerAllIn;

    if (pay > 0) {
      debitBalance(pay);
      playerWagersRef.current.push(pay);
      nextTotal += pay;
      nextRound += pay;
    }

    if (pay < toCall || Math.floor(balance) - pay <= 0) nextAllIn = true;

    setPlayerLastAction(toCall > 0 ? "Call" : "Check");
    applyActionAndAdvance(
      0,
      nextBots,
      { total: nextTotal, round: nextRound, folded: false, allIn: nextAllIn },
      currentBet,
      minRaise,
      toCall > 0 ? "You call" : "You check",
      false
    );
    playAudio(audioRef.current.bet, true);
  };

  const handlePlayerRaise = (arg?: unknown) => {
    if (!playerCanAct) return;
    const bigBlind = Math.max(1, Math.floor(betAmount));

    const minBetTotal = currentBet + (minRaise || bigBlind);
    let targetBet =
      typeof arg === "number"
        ? arg
        : customRaiseAmount > 0
        ? customRaiseAmount
        : minBetTotal;

    if (targetBet < minBetTotal) targetBet = minBetTotal;

    const need = Math.max(0, Math.floor(targetBet - playerRoundContribution));
    const pay = Math.min(need, Math.floor(balance));

    let nextBots = [...bots];
    let nextTotal = playerContribution;
    let nextRound = playerRoundContribution;
    let nextAllIn: boolean = playerAllIn;

    if (pay > 0) {
      debitBalance(pay);
      playerWagersRef.current.push(pay);
      nextTotal += pay;
      nextRound += pay;
    }

    const actualBet = nextRound;
    const isValidRaise =
      actualBet > currentBet &&
      actualBet - currentBet >= (minRaise || bigBlind);
    const nextCurrentBet = isValidRaise ? actualBet : currentBet;
    const nextMinRaise = isValidRaise ? actualBet - currentBet : minRaise;

    if (pay < need || Math.floor(balance) - pay <= 0) nextAllIn = true;

    const actionStr = nextAllIn
      ? "All-In"
      : isValidRaise
      ? `Raise auf $${actualBet.toFixed(0)}`
      : need > 0
      ? "Call"
      : "Check";

    setPlayerLastAction(actionStr);

    applyActionAndAdvance(
      0,
      nextBots,
      { total: nextTotal, round: nextRound, folded: false, allIn: nextAllIn },
      nextCurrentBet,
      nextMinRaise,
      actionStr === "All-In"
        ? "You go All-In"
        : isValidRaise
        ? `You raise to $${actualBet.toFixed(0)}`
        : need > 0
        ? "You call"
        : "You check",
      isValidRaise || (nextAllIn && actualBet > currentBet)
    );
    playAudio(audioRef.current.bet, true);
  };

  useEffect(() => {
    if (!isBettingStage(stage)) return;
    if (activePlayerIndex <= 0) return;
    if (botTurnInFlightRef.current) return;

    const bi = activePlayerIndex - 1;
    const bot = bots[bi];
    if (!bot || bot.folded || bot.allIn) return;

    botTurnInFlightRef.current = true;

    const delay = playerFolded 
      ? 400 
      : bot.persona.minDelay +
        Math.random() * (bot.persona.maxDelay - bot.persona.minDelay);
    
    const t = window.setTimeout(() => {
      botTurnInFlightRef.current = false;

      if (!isBettingStage(stage)) return;
      if (activePlayerIndex !== bi + 1) return;

      const revealed = boardRevealCount;
      const boardNow = board.slice(0, revealed);
      const strength =
        revealed >= 3
          ? winStrength(evaluateSeven(bot.hole, boardNow))
          : estimatePreflopStrength(bot.hole);

      const toCall = Math.max(
        0,
        Math.floor(currentBet - bot.roundContribution)
      );

      const pc = 1 + bots.length;
      const dist = (bi + 1 - dealerPos + pc) % pc;
      const positionFactor = dist / pc;

      const activeOpponents =
        bots.filter((b) => !b.folded).length + (playerFolded ? 0 : 1);
      const crowdFactor = Math.max(0, (activeOpponents - 2) * 0.04);

      const potOdds = toCall > 0 ? toCall / Math.max(1, pot + toCall) : 0;

      const tiltBoost = bot.frustration >= 3 ? 0.12 : 0;
      const bluffDecay = bot.bluffCaught >= 3 ? -0.12 : 0;
      const noise =
        (Math.random() - 0.5) * (0.12 - bot.persona.consistency * 0.08);

      const effective =
        strength +
        (bot.persona.aggression - 0.5) * 0.2 +
        positionFactor * 0.15 -
        crowdFactor +
        tiltBoost +
        bluffDecay +
        noise;

      let action: "fold" | "call" | "raise" = "call";

      if (toCall > 0) {
        const requiredStrength = Math.max(0.15, potOdds);
        
        if (effective < requiredStrength * 0.8 && Math.random() < bot.persona.consistency) {
          action = "fold";
        }
      }

      const wantsValueRaise =
        effective > 0.75 + (playerFolded ? 0.1 : 0) &&
        Math.random() < 0.6 + bot.persona.aggression * 0.4;
      
      const wantsBluff =
        !wantsValueRaise &&
        effective < 0.4 && 
        strength < 0.4 && 
        Math.random() < bot.persona.bluff * 0.5 + positionFactor * 0.2;

      const shouldTrap =
        toCall === 0 &&
        strength > 0.85 &&
        Math.random() < 0.4;

      if ((wantsValueRaise || wantsBluff) && !shouldTrap) {
         action = "raise";
      }

      let nextBots = [...bots];
      let nextP = {
        total: playerContribution,
        round: playerRoundContribution,
        folded: playerFolded,
        allIn: playerAllIn,
      };
      let nextCurrent = currentBet;
      let nextMinR = minRaise;

      const payBot = (amount: number) => {
        const a = Math.max(0, Math.floor(amount));
        const cur = nextBots[bi];
        if (!cur || cur.folded || cur.allIn || a <= 0) return 0;
        const pay = Math.min(a, Math.floor(cur.stack));
        nextBots[bi] = {
          ...cur,
          stack: cur.stack - pay,
          contribution: cur.contribution + pay,
          roundContribution: cur.roundContribution + pay,
          allIn: cur.stack - pay <= 0,
        };
        return pay;
      };

      const name = bot.persona.name;

      if (action === "fold") {
        nextBots[bi] = {
          ...nextBots[bi],
          folded: true,
          lastAction: "Fold",
          frustration: nextBots[bi].frustration + 1,
        };
        applyActionAndAdvance(
          activePlayerIndex,
          nextBots,
          nextP,
          nextCurrent,
          nextMinR,
          formatAction(name, "Fold"),
          false
        );
        playAudio(audioRef.current.bet, true);
        return;
      }

      if (action === "call") {
        const paid = payBot(toCall);
        nextBots[bi] = {
          ...nextBots[bi],
          lastAction: toCall > 0 ? "Call" : "Check",
        };
        applyActionAndAdvance(
          activePlayerIndex,
          nextBots,
          nextP,
          nextCurrent,
          nextMinR,
          formatAction(name, toCall > 0 ? "Call" : "Check"),
          false
        );
        playAudio(audioRef.current.bet, true);
        return;
      }

      const bigBlind = Math.max(1, Math.floor(betAmount));
      const minR = Math.max(nextMinR || bigBlind, bigBlind);
      let raiseAmt = minR;

      const currentStreetPot =
        bots.reduce((s, b) => s + b.roundContribution, 0) +
        playerRoundContribution;
      const totalPot = pot + currentStreetPot;

      const rand = Math.random();
      if (rand < 0.4) {
        raiseAmt = minR;
      } else if (rand < 0.7) {
        raiseAmt = Math.max(minR, Math.floor(totalPot * 0.5));
      } else if (rand < 0.9) {
        raiseAmt = Math.max(minR, Math.floor(totalPot));
      } else {
        if (bot.persona.aggression > 0.7)
          raiseAmt = Math.max(minR, Math.floor(totalPot * 1.5));
        else raiseAmt = minR;
      }

      const target = nextCurrent + raiseAmt;
      const need = Math.max(
        0,
        Math.floor(target - nextBots[bi].roundContribution)
      );
      payBot(need);

      const actualBet = nextBots[bi].roundContribution;
      const isValidRaise =
        actualBet > nextCurrent &&
        (actualBet - nextCurrent >= (nextMinR || bigBlind) ||
          nextBots[bi].allIn);

      if (isValidRaise) {
        const raiseDiff = actualBet - nextCurrent;
        if (raiseDiff >= (nextMinR || bigBlind)) {
          nextMinR = raiseDiff;
        }
        nextCurrent = actualBet;
        const actionStr = nextBots[bi].allIn
          ? "All-In"
          : `Raise: $${actualBet.toFixed(0)}`;
        nextBots[bi] = {
          ...nextBots[bi],
          lastAction: actionStr,
        };
        applyActionAndAdvance(
          activePlayerIndex,
          nextBots,
          nextP,
          nextCurrent,
          nextMinR,
          formatAction(name, actionStr),
          true
        );
      } else {
        nextBots[bi] = {
          ...nextBots[bi],
          lastAction: toCall > 0 ? "Call" : "Check",
        };
        applyActionAndAdvance(
          activePlayerIndex,
          nextBots,
          nextP,
          nextCurrent,
          nextMinR,
          formatAction(name, toCall > 0 ? "Call" : "Check"),
          false
        );
      }

      playAudio(audioRef.current.bet, true);
    }, delay);

    timers.current.push(t);
    return () => clearTimeout(t);
  }, [
    stage,
    activePlayerIndex,
    bots,
    currentBet,
    minRaise,
    pot,
    board,
    boardRevealCount,
    betAmount,
    playerContribution,
    playerRoundContribution,
    playerFolded,
    playerAllIn,
  ]);

  useEffect(() => {
    if (activePlayerIndex === 0) setCustomRaiseAmount(0);
  }, [activePlayerIndex, currentBet, stage]);

  type SeatUi = {
    seatIndex: number;
    id: string;
    name: string;
    tagline: string;
    cards: Card[];
    folded: boolean;
    showCards: boolean;
    dealer: boolean;
    active: boolean;
    actions: string[];
    roundContribution: number;
  };

  const buildSeats = (): SeatUi[] => {
    if (stage === "setup") return [];

    const showCards = stage === "showdown" || stage === "finished";

    const playerSeatIndex = bots.length;

    const playerSeat: SeatUi = {
      seatIndex: playerSeatIndex,
      id: "player",
      name: "You",
      tagline: "",
      cards: playerHole,
      folded: playerFolded,
      showCards: true,
      dealer: dealerPos === 0,
      active: isBettingStage(stage) && activePlayerIndex === 0,
      actions: actionHistoryBySeat[0] ?? [],
      roundContribution: playerRoundContribution,
    };

    const botSeats: SeatUi[] = bots.map((b, idx) => ({
      seatIndex: idx,
      id: b.id,
      name: b.persona.name,
      tagline: b.persona.tagline,
      cards: b.hole,
      folded: b.folded,
      showCards,
      dealer: dealerPos === idx + 1,
      active: isBettingStage(stage) && activePlayerIndex === idx + 1,
      actions: actionHistoryBySeat[idx + 1] ?? [],
      roundContribution: b.roundContribution,
    }));

    return [...botSeats, playerSeat];
  };

  const seatPositionClasses: Record<number, string> = {
    0: "right-4 lg:right-8 xl:right-14 top-1/2 -translate-y-1/2",
    1: "left-[80%] bottom-4 lg:bottom-8 xl:bottom-14",
    2: "left-[60%] bottom-4 lg:bottom-8 xl:bottom-14",
    3: "left-[40%] bottom-4 lg:bottom-8 xl:bottom-14",
    4: "left-[20%] bottom-4 lg:bottom-8 xl:bottom-14",
    5: "left-4 lg:left-8 xl:left-14 top-1/2 -translate-y-1/2",
  };
  const renderSeatUi = (s: SeatUi) => {
    const isWinner = winners.includes(s.seatIndex);
    const activeGlow = isWinner
      ? "drop-shadow-[0_0_10px_rgba(0,231,1,0.8)]"
      : "";
    const faded = s.folded ? "opacity-40 grayscale" : "";
    const empty = s.id.startsWith("empty-");

    const alignClass = "translate-x-0";

    return (
      <div
        key={s.id}
        className={`absolute ${seatPositionClasses[s.seatIndex]} ${
          s.seatIndex === 1 ||
          s.seatIndex === 2 ||
          s.seatIndex === 3 ||
          s.seatIndex === 4
            ? "-translate-x-1/2"
            : "translate-x-0"
        } ${faded} transition-all duration-300 pointer-events-none`}
      >
        <div
          className={`relative flex flex-col items-center gap-1 ${activeGlow} pointer-events-auto transition-all duration-500`}
        >
          {s.dealer && (
            <div className="absolute -top-3 -right-2 z-40 bg-white text-black text-[10px] font-bold w-5 h-5 rounded-full flex items-center justify-center border border-gray-300 shadow-md">
              D
            </div>
          )}

          <div className="flex items-center gap-2">
            <div className="flex flex-col items-end justify-center min-w-[60px] gap-0.5 z-20 mr-2">
              {s.actions
                .slice(-2)
                .reverse()
                .map((a, idx) => (
                  <div
                    key={`${s.id}-a-${idx}`}
                    className={`text-[10px] uppercase font-bold text-right whitespace-nowrap ${
                      idx === 0 ? "text-white" : "text-white/40"
                    }`}
                  >
                    {a}
                  </div>
                ))}
            </div>
            <div>
              <div className="flex justify-center">
                {s.roundContribution > 0 && (
                  <div className="absolute top-full mt-2 z-40 text-[#fbbf24] text-[10px] px-2 py-0.5 font-mono whitespace-nowrap">
                    🪙 ${s.roundContribution}
                  </div>
                )}
              </div>

              <div className="flex items-center justify-left mb-1 z-20">
                {s.active && (
                  <div className="w-2 h-2 rounded-full bg-[#00e701] shadow-[0_0_8px_#00e701] animate-pulse me-1" />
                )}
                <div className="text-white text-[10px] sm:text-xs font-bold py-0.5 rounded-full">
                  {s.name}
                </div>
              </div>

              <div className="flex items-center justify-center z-10">
                {empty ? (
                  <div className="flex gap-1">
                    <div className="w-10 h-14 rounded bg-[#ffffff05] border-2 border-white/5" />
                    <div className="w-10 h-14 rounded bg-[#ffffff05] border-2 border-white/5" />
                  </div>
                ) : (
                  s.cards.slice(0, 2).map((c, i) => (
                    <div
                      key={c.id}
                      className={`${i > 0 ? "-ml-6" : ""} cursor-default`}
                    >
                      {renderCardFace(
                        c,
                        (s.showCards || s.id === "player") && !s.folded,
                        true,
                        (s.seatIndex * 2 + i) * 0.1
                      )}
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

  const renderCardFace = (
    card: Card,
    revealed: boolean,
    small = false,
    delay = 0
  ) => (
    <div
      style={{ animationDelay: `${delay}s` }}
      className={`bj-card w-10 h-14 ${
        small
          ? "sm:w-11 sm:h-16 lg:w-12 lg:h-18"
          : "sm:w-12 sm:h-18 md:w-14 md:h-20 lg:w-16 lg:h-24 xl:w-20 xl:h-28"
      } rounded-lg shadow-lg animate-slide-in card-deal ${
        revealed ? "bj-flipped" : ""
      }`}
    >
      <div className="bj-card-inner" style={{ transitionDelay: `${delay}s` }}>
        <div className="bj-card-face bj-card-back rounded-lg border-1 border-[#0f212e] bg-[#007bff] relative overflow-hidden">
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="w-5 h-9 sm:w-6 sm:h-11 lg:w-7 lg:h-13 border-2 border-white/10 rounded flex items-center justify-center transform rotate-12">
              <span className="text-white/20 font-bold -rotate-12 text-[4px]">
                FLOPPER
              </span>
            </div>
          </div>
        </div>

        <div
          className={`bj-card-face bj-card-front rounded-lg bg-white ${getCardColor(
            card.suit
          )} p-1 sm:p-2`}
        >
          <div className="self-start font-bold text-[8px] sm:text-[10px] lg:text-sm leading-none">
            {card.rank}
          </div>
          <div className="text-base sm:text-lg lg:text-2xl">
            {getSuitIcon(card.suit)}
          </div>
          <div className="self-end font-bold text-[8px] sm:text-[10px] lg:text-sm leading-none rotate-180">
            {card.rank}
          </div>
        </div>
      </div>
    </div>
  );

  const renderBoard = () => (
    <div className="flex gap-3 items-center justify-center">
      {board.slice(0, 5).map((card, idx) => (
        <div key={card.id} className="relative">
          {renderCardFace(card, idx < boardRevealCount, true, idx * 0.15)}
        </div>
      ))}
    </div>
  );

  return (
    <>
      <div className="p-2 sm:p-4 lg:p-6 max-w-350 mx-auto flex flex-col lg:flex-row gap-4 lg:gap-8">
        <div className="w-full lg:w-60 flex flex-col gap-3 bg-[#0f212e] p-2 sm:p-3 rounded-xl h-fit text-xs">
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
                onChange={(e) => {
                  let v = e.target.value;
                  if (parseFloat(v) < 0) v = "0";
                  setBetInput(v);
                }}
                onBlur={() => {
                  const raw = betInput.trim();
                  const sanitized = raw.replace(/^0+(?=\d)/, "") || "0";
                  const num = Number(sanitized);
                  setBetAmount(num);
                  setBetInput(sanitized);
                }}
                disabled={stage !== "setup" && stage !== "finished"}
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
                disabled={stage !== "setup" && stage !== "finished"}
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
                disabled={stage !== "setup" && stage !== "finished"}
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
                disabled={stage !== "setup" && stage !== "finished"}
                className="bg-[#2f4553] hover:bg-[#3e5666] text-xs py-1 rounded text-[#b1bad3] disabled:opacity-50"
              >
                All In
              </button>
            </div>
          </div>

          <div className="space-y-2">
            <label className="text-xs font-bold text-[#b1bad3] uppercase tracking-wider">
              Bots
            </label>
            <div className="bg-[#0f212e] p-1 rounded-md border border-[#2f4553] flex">
              {[2, 3, 4, 5].map((n) => (
                <button
                  key={n}
                  onClick={() => setNumBots(n)}
                  disabled={stage !== "setup" && stage !== "finished"}
                  className={`flex-1 py-2 text-[10px] font-bold uppercase rounded transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${
                    numBots === n
                      ? "bg-[#213743] text-white shadow-sm"
                      : "text-[#b1bad3] hover:text-white"
                  }`}
                >
                  {n}
                </button>
              ))}
            </div>
          </div>

          {stage === "setup" || stage === "finished" ? (
            <button
              onClick={startHand}
              disabled={betAmount <= 0}
              className="w-full bg-[#00e701] hover:bg-[#00c201] text-black py-3 rounded-md font-bold text-lg shadow-[0_0_20px_rgba(0,231,1,0.2)] transition-all active:scale-95 flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <PlayArrow /> Bet
            </button>
          ) : isBettingStage(stage) ? (
            <div className="flex flex-col gap-2">
              <div
                className={`transition-opacity ${
                  playerCanAct ? "" : "opacity-50 pointer-events-none"
                }`}
              >
                <div className="bg-[#0f212e] rounded-md border border-[#2f4553] p-2">
                  <input
                    type="range"
                    min={
                      currentBet +
                      (minRaise || Math.max(1, Math.floor(betAmount)))
                    }
                    max={Math.floor(balance + playerRoundContribution)}
                    step={1}
                    value={
                      customRaiseAmount > 0
                        ? customRaiseAmount
                        : currentBet +
                          (minRaise || Math.max(1, Math.floor(betAmount)))
                    }
                    disabled={!playerCanAct}
                    onChange={(e) =>
                      setCustomRaiseAmount(Number(e.target.value))
                    }
                    className="w-full accent-[#00e701] cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                  />
                  <div className="flex justify-between text-xs text-[#b1bad3] mt-2">
                    <span>
                      $
                      {(
                        currentBet +
                        (minRaise || Math.max(1, Math.floor(betAmount)))
                      ).toFixed(0)}
                    </span>
                    <span className="text-white font-bold">
                      $
                      {(
                        customRaiseAmount ||
                        currentBet +
                          (minRaise || Math.max(1, Math.floor(betAmount)))
                      ).toFixed(0)}
                    </span>
                    <span>
                      $
                      {(Math.floor(balance) + playerRoundContribution).toFixed(
                        0
                      )}
                    </span>
                  </div>
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
                  disabled={!playerCanAct || balance <= 0}
                  className="bg-[#00e701] hover:bg-[#00c201] text-black py-2 rounded-md font-bold disabled:opacity-50 text-xs"
                >
                  Raise
                </button>
              </div>
            </div>
          ) : (
            <div className="text-[#b1bad3] text-xs">Round in progress…</div>
          )}

          {lastWin > 0 && stage === "finished" && (
            <div className="p-4 bg-[#213743] border border-[#00e701] rounded-md text-center">
              <div className="text-xs text-[#b1bad3] uppercase">You Won</div>
              <div className="text-xl font-bold text-[#00e701]">
                ${lastWin.toFixed(2)}
              </div>
            </div>
          )}
        </div>

        <div className="flex-1 flex flex-col gap-4">
          <div className="flex-1 bg-[#0f212e] p-2 sm:p-6 rounded-xl min-h-200 flex flex-col gap-6 relative overflow-hidden">
            <div
              ref={tableRef}
              className="relative flex-1 rounded-[60px] lg:rounded-[90px] xl:rounded-[120px] border-[12px] lg:border-[18px] xl:border-[26px] border-[#131518] overflow-hidden bg-[#2d5a36]"
            >
              <div className="absolute inset-0 border-[8px] lg:border-[12px] xl:border-[16px] border-[#654321] rounded-[48px] lg:rounded-[72px] xl:rounded-[92px] pointer-events-none opacity-95" />

              <div className="absolute inset-0 pointer-events-none">
                <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,rgba(255,255,255,0.05),transparent_70%)] opacity-30" />

                <div className="absolute inset-4 lg:inset-6 xl:inset-12 rounded-[40px] lg:rounded-[60px] xl:rounded-[80px] border border-[#ffffff10]" />
              </div>

              <div className="absolute left-1/2 -translate-x-1/2 top-6 xl:top-12">
                {stage !== "setup" && (
                  <div className="px-3 py-2">{renderBoard()}</div>
                )}
              </div>

              <div className="absolute left-1/2 -translate-x-1/2 top-1/2 -translate-y-1/2">
                {stage !== "setup" && (
                  <div className="text-white font-black text-2xl">
                    ${pot.toFixed(0)}
                  </div>
                )}
              </div>

              {buildSeats().map((s) => renderSeatUi(s))}
            </div>

            <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-3">
              {HAND_EXAMPLES.map((hand, idx) => (
                <div
                  key={hand.name}
                  className="bg-[#1a2c38] p-2 rounded border border-[#2f4553] flex flex-col items-center gap-2"
                >
                  <div className="text-[10px] uppercase font-bold text-[#b1bad3]">
                    {idx + 1}. {hand.name}
                  </div>
                  <div className="flex justify-center -space-x-1">
                    {hand.cards.map((c, i) => (
                      <div
                        key={i}
                        style={{ zIndex: i }}
                        className={`w-6 h-8 rounded bg-white ${getCardColor(
                          c.suit
                        )} flex flex-col items-center justify-center p-0.5 shadow-sm border border-gray-300 relative`}
                        title={`${c.rank} of ${c.suit}`}
                      >
                        <div className="text-[8px] font-bold leading-none">
                          {c.rank}
                        </div>
                        <div className="text-[10px] leading-none">
                          {getSuitIcon(c.suit)}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>

          <GameRecordsPanel gameId="poker" />
        </div>
      </div>
    </>
  );
}
