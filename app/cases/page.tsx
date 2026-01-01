"use client";

import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { PlayArrow, Refresh } from "@mui/icons-material";
import { useWallet } from "@/components/WalletProvider";

function cn(...parts: Array<string | false | null | undefined>) {
  return parts.filter(Boolean).join(" ");
}

type RiskLevel = "low" | "medium" | "high" | "expert";

type CaseColor =
  | "gray"
  | "lightblue"
  | "blue"
  | "red"
  | "green"
  | "purple"
  | "gold";

type CaseEntry = {
  color: CaseColor;
  multiplier: number;
  chance: number;
};

type StripItem = {
  id: string;
  entry: CaseEntry;
};

type PlateTier = 1 | 2 | 3;

const CASE_TABLE: Record<RiskLevel, CaseEntry[]> = {
  low: [
    { color: "gray", multiplier: 0.1, chance: 41 },
    { color: "lightblue", multiplier: 0.4, chance: 35 },
    { color: "blue", multiplier: 1.09, chance: 10 },
    { color: "red", multiplier: 2, chance: 7 },
    { color: "green", multiplier: 3, chance: 4 },
    { color: "purple", multiplier: 10, chance: 2 },
    { color: "gold", multiplier: 23, chance: 1 },
  ],
  medium: [
    { color: "gray", multiplier: 0, chance: 30 },
    { color: "lightblue", multiplier: 0.2, chance: 27 },
    { color: "lightblue", multiplier: 0.4, chance: 18 },
    { color: "blue", multiplier: 1.5, chance: 13 },
    { color: "blue", multiplier: 2, chance: 6 },
    { color: "red", multiplier: 3.5, chance: 3 },
    { color: "red", multiplier: 7.5, chance: 1.5 },
    { color: "green", multiplier: 10, chance: 0.85 },
    { color: "green", multiplier: 15, chance: 0.4 },
    { color: "purple", multiplier: 41, chance: 0.15 },
    { color: "gold", multiplier: 115, chance: 0.1 },
  ],
  high: [
    { color: "gray", multiplier: 0, chance: 35 },
    { color: "lightblue", multiplier: 0.2, chance: 25 },
    { color: "lightblue", multiplier: 0.4, chance: 12 },
    { color: "lightblue", multiplier: 0.8, chance: 10 },
    { color: "blue", multiplier: 1.5, chance: 10 },
    { color: "blue", multiplier: 3, chance: 5 },
    { color: "blue", multiplier: 8, chance: 2 },
    { color: "red", multiplier: 10, chance: 0.4 },
    { color: "red", multiplier: 15, chance: 0.3 },
    { color: "green", multiplier: 35, chance: 0.2 },
    { color: "green", multiplier: 50, chance: 0.04 },
    { color: "purple", multiplier: 100, chance: 0.03 },
    { color: "purple", multiplier: 250, chance: 0.015 },
    { color: "gold", multiplier: 495, chance: 0.01 },
    { color: "gold", multiplier: 1000, chance: 0.005 },
  ],
  expert: [
    { color: "gray", multiplier: 0, chance: 35.39 },
    { color: "lightblue", multiplier: 0.15, chance: 20 },
    { color: "lightblue", multiplier: 0.3, chance: 15 },
    { color: "lightblue", multiplier: 0.7, chance: 15 },
    { color: "blue", multiplier: 1.5, chance: 8 },
    { color: "blue", multiplier: 5, chance: 3 },
    { color: "blue", multiplier: 7, chance: 2 },
    { color: "red", multiplier: 10, chance: 0.8 },
    { color: "red", multiplier: 15, chance: 0.5 },
    { color: "red", multiplier: 20, chance: 0.2 },
    { color: "green", multiplier: 50, chance: 0.04 },
    { color: "green", multiplier: 75, chance: 0.03 },
    { color: "green", multiplier: 100, chance: 0.02 },
    { color: "purple", multiplier: 250, chance: 0.01 },
    { color: "purple", multiplier: 460, chance: 0.005 },
    { color: "purple", multiplier: 850, chance: 0.003 },
    { color: "gold", multiplier: 1500, chance: 0.0012 },
    { color: "gold", multiplier: 3500, chance: 0.0006 },
    { color: "gold", multiplier: 10000, chance: 0.0002 },
  ],
};

function normalizeMoney(value: number) {
  if (!Number.isFinite(value)) return 0;
  const rounded = Math.round((value + Number.EPSILON) * 100) / 100;
  return Object.is(rounded, -0) ? 0 : rounded;
}

function parseNumberLoose(raw: string) {
  const normalized = raw.replace(",", ".").trim();
  const n = Number(normalized);
  return Number.isFinite(n) ? n : 0;
}

function pickWeighted(entries: CaseEntry[], rnd = Math.random) {
  const total = entries.reduce(
    (s, e) => s + (Number.isFinite(e.chance) ? e.chance : 0),
    0
  );
  if (total <= 0) return entries[0];

  let r = rnd() * total;
  for (const e of entries) {
    const w = Number.isFinite(e.chance) ? e.chance : 0;
    r -= w;
    if (r <= 0) return e;
  }
  return entries[entries.length - 1];
}

function buildDisplayTable(entries: CaseEntry[]) {
  const total = entries.reduce(
    (s, e) => s + (Number.isFinite(e.chance) ? e.chance : 0),
    0
  );
  const uniform = entries.length > 0 ? total / entries.length : 0;

  const DISPLAY_MIX = 0.2;

  return entries.map((e) => {
    const base = Number.isFinite(e.chance) ? e.chance : 0;
    const mixed = base * (1 - DISPLAY_MIX) + uniform * DISPLAY_MIX;
    return { ...e, chance: mixed };
  });
}

function easeOutCubic(t: number) {
  return 1 - Math.pow(1 - t, 3);
}

function formatMultiplier(m: number) {
  if (!Number.isFinite(m)) return "—";
  if (m >= 1000) return `${Math.round(m)}x`;
  if (m >= 10) return `${m.toFixed(1).replace(/\.0$/, "")}x`;
  return `${m.toFixed(2).replace(/0$/, "").replace(/\.0$/, "")}x`;
}

function colorStyles(color: CaseColor) {
  switch (color) {
    case "gray":
      return {
        bg: "bg-[#2f4553]",
        text: "text-white",
        accent: "ring-[#2f4553]",
      };
    case "lightblue":
      return {
        bg: "bg-[#00ffff]",
        text: "text-black",
        accent: "ring-[#00ffff]",
      };
    case "blue":
      return {
        bg: "bg-[#3b82f6]",
        text: "text-white",
        accent: "ring-[#3b82f6]",
      };
    case "red":
      return {
        bg: "bg-[#ef4444]",
        text: "text-black",
        accent: "ring-[#ef4444]",
      };
    case "green":
      return {
        bg: "bg-[#00e701]",
        text: "text-black",
        accent: "ring-[#00e701]",
      };
    case "purple":
      return {
        bg: "bg-[#8b5cf6]",
        text: "text-white",
        accent: "ring-[#8b5cf6]",
      };
    case "gold":
      return {
        bg: "bg-[#eab308]",
        text: "text-black",
        accent: "ring-[#eab308]",
      };
    default:
      return {
        bg: "bg-[#2f4553]",
        text: "text-white",
        accent: "ring-[#2f4553]",
      };
  }
}

const COLOR_HEX: Record<CaseColor, string> = {
  gray: "#2f4553",
  lightblue: "#00ffff",
  blue: "#3b82f6",
  red: "#ef4444",
  green: "#00e701",
  purple: "#8b5cf6",
  gold: "#eab308",
};

function PlateIndicator({
  color,
  tier,
}: {
  color: CaseColor;
  tier: PlateTier;
}) {
  const hex = COLOR_HEX[color] ?? "#ffffff";
  const topOn = tier >= 3;
  const midOn = tier >= 2;
  const bottomOn = true;

  return (
    <div className="w-12 h-16 flex items-center justify-center" aria-hidden>
      <svg
        viewBox="0 0 80 120"
        width="50"
        height="60"
        preserveAspectRatio="xMidYMid meet"
        overflow="visible"
        style={{
          transform: "translateY(-10px) scale(1.25)",
          transformOrigin: "50% 50%",
        }}
      >
        <path
          d="M18 6 H62 L74 18 V102 L62 114 H18 L6 102 V18 Z"
          fill="#2f4553"
          stroke="#0f212e"
          strokeWidth="3"
        />

        <path
          d="M24 12 H56 L68 24 V96 L56 108 H24 L12 96 V24 Z"
          fill="none"
          stroke={hex}
          strokeWidth="3"
        />

        <path
          d="M26 18 H54 L62 26 V94 L54 102 H26 L18 94 V26 Z"
          fill="#1a2c38"
          stroke="#0f212e"
          strokeWidth="1"
        />

        <g>
          <rect
            x="30"
            y="28"
            width="20"
            height="20"
            rx="5"
            fill={topOn ? hex : "none"}
          />
          <rect
            x="30"
            y="52"
            width="20"
            height="20"
            rx="5"
            fill={midOn ? hex : "none"}
          />
          <rect
            x="30"
            y="76"
            width="20"
            height="20"
            rx="5"
            fill={bottomOn ? hex : "none"}
          />
        </g>
      </svg>
    </div>
  );
}

export default function CasesPage() {
  const { balance, subtractFromBalance, addToBalance, finalizePendingLoss } =
    useWallet();

  const [betAmount, setBetAmount] = useState<number>(100);
  const [betInput, setBetInput] = useState<string>("100");
  const [risk, setRisk] = useState<RiskLevel>("low");

  const [playMode, setPlayMode] = useState<"manual" | "auto">("manual");
  const [onWinMode, setOnWinMode] = useState<"reset" | "raise">("reset");
  const [onWinPctInput, setOnWinPctInput] = useState<string>("0");
  const [onLoseMode, setOnLoseMode] = useState<"reset" | "raise">("reset");
  const [onLosePctInput, setOnLosePctInput] = useState<string>("0");
  const [stopProfitInput, setStopProfitInput] = useState<string>("0");
  const [stopLossInput, setStopLossInput] = useState<string>("0");
  const [isAutoBetting, setIsAutoBetting] = useState(false);

  const [isSpinning, setIsSpinning] = useState(false);
  const isSpinningRef = useRef(false);

  const betAmountRef = useRef<number>(100);
  const balanceRef = useRef<number>(0);
  const riskRef = useRef<RiskLevel>("low");
  const isAutoBettingRef = useRef(false);
  const autoOriginalBetRef = useRef<number>(0);
  const autoNetRef = useRef<number>(0);

  const [resultFx, setResultFx] = useState<"rolling" | "win" | "lose" | null>(
    null
  );
  const resultTimeoutRef = useRef<number | null>(null);
  const audioRef = useRef<{
    bet: HTMLAudioElement | null;
    win: HTMLAudioElement | null;
    limboLose: HTMLAudioElement | null;
    spin: HTMLAudioElement | null;
    caseOpen: HTMLAudioElement | null;
  }>({
    bet: null,
    win: null,
    limboLose: null,
    spin: null,
    caseOpen: null,
  });

  const playAudio = (a: HTMLAudioElement | null) => {
    if (!a) return;
    try {
      a.currentTime = 0;
      void a.play();
    } catch (e) {}
  };

  useEffect(() => {
    audioRef.current = {
      bet: new Audio("/sounds/Bet.mp3"),
      win: new Audio("/sounds/Win.mp3"),
      limboLose: new Audio("/sounds/LimboLose.mp3"),
      spin: new Audio("/sounds/Spin.mp3"),
      caseOpen: new Audio("/sounds/CaseOpen.mp3"),
    };

    const prime = async () => {
      try {
        const items = Object.values(audioRef.current) as HTMLAudioElement[];
        for (const a of items) {
          if (!a) continue;
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

  const viewportRef = useRef<HTMLDivElement | null>(null);
  const rafRef = useRef<number | null>(null);

  const ITEM_W = 74;
  const ITEM_GAP = 10;
  const STRIP_LEN = 90;
  const TARGET_INDEX = 42;
  const SPIN_STEPS = 18;

  const [strip, setStrip] = useState<StripItem[]>(() => []);
  const stripRef = useRef<StripItem[]>([]);
  const trackRef = useRef<HTMLDivElement | null>(null);
  const translateXRef = useRef<number>(0);
  const [viewportWidth, setViewportWidth] = useState<number>(0);
  const [openedIndex, setOpenedIndex] = useState<number | null>(null);
  const [activeIndex, setActiveIndex] = useState<number | null>(null);
  const [renderStart, setRenderStart] = useState<number>(0);
  const [renderEnd, setRenderEnd] = useState<number>(0);
  const [lastMultiplier, setLastMultiplier] = useState<number | null>(null);
  const [lastWin, setLastWin] = useState<number>(0);

  const isBusy = isSpinning || isAutoBetting;

  const setBetBoth = (next: number) => {
    const v = normalizeMoney(next);
    setBetAmount(v);
    setBetInput(String(v));
  };

  useEffect(() => {
    betAmountRef.current = betAmount;
  }, [betAmount]);
  useEffect(() => {
    balanceRef.current = balance;
  }, [balance]);
  useEffect(() => {
    riskRef.current = risk;
  }, [risk]);
  useEffect(() => {
    isAutoBettingRef.current = isAutoBetting;
  }, [isAutoBetting]);

  useEffect(() => {
    return () => {
      if (resultTimeoutRef.current) {
        clearTimeout(resultTimeoutRef.current);
        resultTimeoutRef.current = null;
      }
      isAutoBettingRef.current = false;
    };
  }, []);

  const canSpin = useMemo(() => {
    if (isBusy) return false;
    if (betAmount <= 0) return false;
    if (betAmount > balance) return false;
    return true;
  }, [betAmount, balance, isBusy]);

  const displayEntries = useMemo(
    () => buildDisplayTable(CASE_TABLE[risk]),
    [risk]
  );

  const plateTierByKey = useMemo(() => {
    const table = CASE_TABLE[risk];
    const byColor = new Map<CaseColor, number[]>();

    for (const e of table) {
      const arr = byColor.get(e.color) ?? [];
      arr.push(e.multiplier);
      byColor.set(e.color, arr);
    }

    const tierMap = new Map<string, PlateTier>();
    for (const [color, multipliers] of byColor) {
      const unique = Array.from(new Set(multipliers)).sort((a, b) => a - b);
      const n = unique.length;

      for (let i = 0; i < n; i++) {
        let tier: PlateTier = 1;
        if (n === 2) tier = i === 0 ? 1 : 2;
        else if (n >= 3) tier = i === 0 ? 1 : i === n - 1 ? 3 : 2;
        tierMap.set(`${color}:${unique[i]}`, tier);
      }
    }
    return tierMap;
  }, [risk]);

  const setTrackX = useCallback((x: number) => {
    translateXRef.current = x;
    const el = trackRef.current;
    if (!el) return;
    el.style.setProperty("--cases-x", `${x}px`);
  }, []);

  const computeActiveIndex = useCallback(
    (x: number) => {
      if (stripRef.current.length === 0) return null;
      const vpW =
        viewportWidth ||
        viewportRef.current?.getBoundingClientRect().width ||
        0;
      if (vpW <= 0) return null;
      const centerX = vpW / 2;

      const step = ITEM_W + ITEM_GAP;
      const approx = (centerX - x - ITEM_W / 2) / step;
      const idx = Math.round(approx);
      const clamped = Math.max(0, Math.min(stripRef.current.length - 1, idx));
      return clamped;
    },
    [ITEM_GAP, ITEM_W, viewportWidth]
  );

  const computeRenderRange = useCallback(
    (x: number) => {
      const len = stripRef.current.length;
      if (len === 0) return { start: 0, end: 0 };

      const vpW =
        viewportWidth ||
        viewportRef.current?.getBoundingClientRect().width ||
        0;
      if (vpW <= 0) return { start: 0, end: len };

      const step = ITEM_W + ITEM_GAP;
      const buffer = 220;

      const minI = Math.floor((-buffer - x - ITEM_W) / step);
      const maxI = Math.ceil((vpW + buffer - x) / step);

      const start = Math.max(0, Math.min(len - 1, minI));
      const end = Math.max(start + 1, Math.min(len, maxI + 1));
      return { start, end };
    },
    [ITEM_GAP, ITEM_W, viewportWidth]
  );

  const makeItem = useCallback(
    (entry: CaseEntry) => {
      return {
        id: `${Date.now()}_${risk}_${Math.random().toString(16).slice(2)}`,
        entry,
      } as StripItem;
    },
    [risk]
  );

  const makeRandomItem = useCallback(
    () => makeItem(pickWeighted(displayEntries)),
    [displayEntries, makeItem]
  );

  const initStrip = useCallback(() => {
    const items: StripItem[] = [];
    for (let i = 0; i < STRIP_LEN; i++) items.push(makeRandomItem());
    return items;
  }, [STRIP_LEN, makeRandomItem]);

  const computeFinalTranslate = useCallback(() => {
    const vp = viewportRef.current;
    if (!vp) return 0;
    const vpW = vp.getBoundingClientRect().width;
    const centerX = vpW / 2;
    const itemCenter = TARGET_INDEX * (ITEM_W + ITEM_GAP) + ITEM_W / 2;
    return centerX - itemCenter;
  }, []);

  useEffect(() => {
    stripRef.current = strip;
  }, [strip]);

  useEffect(() => {
    setStrip(initStrip());
    setOpenedIndex(null);
    setLastMultiplier(null);
    setLastWin(0);
    const baseX = computeFinalTranslate();
    setTrackX(baseX);
    setActiveIndex(computeActiveIndex(baseX));
    const rr = computeRenderRange(baseX);
    setRenderStart(rr.start);
    setRenderEnd(rr.end);
  }, [risk, initStrip]);

  useEffect(() => {
    if (isSpinningRef.current) return;
    const id = requestAnimationFrame(() => {
      if (isSpinningRef.current) return;
      const baseX = computeFinalTranslate();
      setTrackX(baseX);
      setActiveIndex(computeActiveIndex(baseX));
      const rr = computeRenderRange(baseX);
      setRenderStart(rr.start);
      setRenderEnd(rr.end);
    });
    return () => cancelAnimationFrame(id);
  }, [
    computeActiveIndex,
    computeFinalTranslate,
    computeRenderRange,
    setTrackX,
    strip,
  ]);

  useEffect(() => {
    const onResize = () => {
      if (isSpinningRef.current) return;
      const w = viewportRef.current?.getBoundingClientRect().width ?? 0;
      setViewportWidth(w);
      const baseX = computeFinalTranslate();
      setTrackX(baseX);
      setActiveIndex(computeActiveIndex(baseX));
      const rr = computeRenderRange(baseX);
      setRenderStart(rr.start);
      setRenderEnd(rr.end);
    };
    onResize();
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [
    computeActiveIndex,
    computeFinalTranslate,
    computeRenderRange,
    setTrackX,
  ]);

  useEffect(() => {
    return () => {
      if (rafRef.current) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
    };
  }, []);

  const playRound = useCallback(
    async (opts?: { betAmount?: number; postDelayMs?: number }) => {
      if (isSpinningRef.current)
        return null as null | {
          betAmount: number;
          multiplier: number;
          winAmount: number;
        };

      const bet = normalizeMoney(opts?.betAmount ?? betAmountRef.current);
      const currentRisk = riskRef.current;
      if (bet <= 0 || bet > balanceRef.current) return null;

      const target = pickWeighted(CASE_TABLE[currentRisk]);

      const landingIndex = TARGET_INDEX + SPIN_STEPS;

      const base = stripRef.current;
      let planned = base.length > 0 ? base.slice() : initStrip();
      while (planned.length <= landingIndex + 6) {
        planned.push(makeRandomItem());
      }
      if (planned.length > STRIP_LEN) {
        planned = planned.slice(0, STRIP_LEN);
      }
      if (landingIndex < planned.length) {
        planned[landingIndex] = makeItem(target);
      }

      setOpenedIndex(null);
      setLastMultiplier(null);
      setLastWin(0);
      setResultFx("rolling");

      subtractFromBalance(bet);
      playAudio(audioRef.current.bet);
      // play spin sound when a spin starts
      setTimeout(() => playAudio(audioRef.current.spin), 40);

      setIsSpinning(true);
      isSpinningRef.current = true;

      setStrip(planned);

      const duration = 2400;
      const startTime = performance.now();

      const baseX = computeFinalTranslate();
      const travel = (ITEM_W + ITEM_GAP) * SPIN_STEPS;
      const startX = baseX;
      const endX = baseX - travel;

      await new Promise<void>((resolve) => {
        const animate = (now: number) => {
          const t = Math.min((now - startTime) / duration, 1);
          const eased = easeOutCubic(t);
          const x = startX + (endX - startX) * eased;
          setTrackX(x);

          const nextActive = computeActiveIndex(x);
          setActiveIndex((prev) => (prev === nextActive ? prev : nextActive));

          const rr = computeRenderRange(x);
          setRenderStart((prev) => (prev === rr.start ? prev : rr.start));
          setRenderEnd((prev) => (prev === rr.end ? prev : rr.end));

          if (t < 1) {
            rafRef.current = requestAnimationFrame(animate);
            return;
          }
          resolve();
        };

        rafRef.current = requestAnimationFrame(animate);
      });

      if (rafRef.current) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }

      const shifted: StripItem[] = planned.slice(SPIN_STEPS);
      while (shifted.length < STRIP_LEN) shifted.push(makeRandomItem());
      setStrip(shifted);
      setTrackX(baseX);
      setActiveIndex(computeActiveIndex(baseX));
      const rr = computeRenderRange(baseX);
      setRenderStart(rr.start);
      setRenderEnd(rr.end);

      const payout = normalizeMoney(bet * target.multiplier);
      setOpenedIndex(TARGET_INDEX);
      setLastMultiplier(target.multiplier);
      setLastWin(payout);
      setTimeout(() => playAudio(audioRef.current.caseOpen), 80);

      if (resultTimeoutRef.current) {
        clearTimeout(resultTimeoutRef.current);
        resultTimeoutRef.current = null;
      }

      const isWin = target.multiplier >= 1;

      if (isWin) {
        addToBalance(payout);
        playAudio(audioRef.current.win);
      } else {
        finalizePendingLoss();
        playAudio(audioRef.current.limboLose);
      }

      setResultFx(isWin ? "win" : "lose");

      // Allow faster manual re-bets: don't block "busy" state on the FX timeout.
      setIsSpinning(false);
      isSpinningRef.current = false;

      resultTimeoutRef.current = window.setTimeout(() => {
        setResultFx(null);
        resultTimeoutRef.current = null;
      }, 450);

      // AutoBet should still show the opening/result briefly before the next round resets UI.
      const postDelayMs = Math.max(0, Math.floor(opts?.postDelayMs ?? 0));
      if (postDelayMs > 0) {
        await new Promise<void>((resolve) =>
          window.setTimeout(resolve, postDelayMs)
        );
      }
      return {
        betAmount: bet,
        multiplier: target.multiplier,
        winAmount: payout,
      };
    },
    [
      addToBalance,
      computeFinalTranslate,
      finalizePendingLoss,
      initStrip,
      makeItem,
      makeRandomItem,
      subtractFromBalance,
    ]
  );

  const playGame = useCallback(async () => {
    await playRound();
  }, [playRound]);

  const stopAutoBet = useCallback(() => {
    isAutoBettingRef.current = false;
    setIsAutoBetting(false);
  }, []);

  const startAutoBet = useCallback(async () => {
    if (isAutoBettingRef.current) return;

    const startingBet = normalizeMoney(betAmountRef.current);
    if (startingBet <= 0 || startingBet > balanceRef.current) return;
    if (isSpinningRef.current) return;

    autoOriginalBetRef.current = startingBet;
    autoNetRef.current = 0;

    isAutoBettingRef.current = true;
    setIsAutoBetting(true);

    while (isAutoBettingRef.current) {
      const stopProfit = Math.max(
        0,
        normalizeMoney(parseNumberLoose(stopProfitInput))
      );
      const stopLoss = Math.max(
        0,
        normalizeMoney(parseNumberLoose(stopLossInput))
      );
      const onWinPct = Math.max(0, parseNumberLoose(onWinPctInput));
      const onLosePct = Math.max(0, parseNumberLoose(onLosePctInput));

      const roundBet = normalizeMoney(betAmountRef.current);
      if (roundBet <= 0) break;
      if (roundBet > balanceRef.current) break;

      const result = await playRound({ betAmount: roundBet, postDelayMs: 650 });
      if (!result) break;

      const lastNet = normalizeMoney(result.winAmount - result.betAmount);
      autoNetRef.current = normalizeMoney(autoNetRef.current + lastNet);

      // In Cases, payouts can be > 0 even when the round is a loss (multiplier < 1).
      // For AutoBet strategy (On Win/On Loss), align win/loss with the FX: multiplier >= 1.
      const isRoundWin = result.multiplier >= 1;

      // Stop conditions: support both "total session" net (autoNet) and "single-round" net (lastNet).
      if (
        stopProfit > 0 &&
        (autoNetRef.current >= stopProfit || lastNet >= stopProfit)
      ) {
        stopAutoBet();
        break;
      }
      if (
        stopLoss > 0 &&
        (autoNetRef.current <= -stopLoss || lastNet <= -stopLoss)
      ) {
        stopAutoBet();
        break;
      }

      if (isRoundWin) {
        if (onWinMode === "reset") {
          setBetBoth(autoOriginalBetRef.current);
          betAmountRef.current = autoOriginalBetRef.current;
        } else {
          const next = normalizeMoney(result.betAmount * (1 + onWinPct / 100));
          setBetBoth(next);
          betAmountRef.current = next;
        }
      } else {
        if (onLoseMode === "reset") {
          setBetBoth(autoOriginalBetRef.current);
          betAmountRef.current = autoOriginalBetRef.current;
        } else {
          const next = normalizeMoney(result.betAmount * (1 + onLosePct / 100));
          setBetBoth(next);
          betAmountRef.current = next;
        }
      }
    }

    isAutoBettingRef.current = false;
    setIsAutoBetting(false);
  }, [
    onLoseMode,
    onLosePctInput,
    onWinMode,
    onWinPctInput,
    playRound,
    stopAutoBet,
    stopLossInput,
    stopProfitInput,
  ]);

  const changePlayMode = useCallback(
    (mode: "manual" | "auto") => {
      try {
        stopAutoBet();
      } catch (e) {}

      if (resultTimeoutRef.current) {
        clearTimeout(resultTimeoutRef.current);
        resultTimeoutRef.current = null;
      }

      setOpenedIndex(null);
      setLastMultiplier(null);
      setLastWin(0);
      setResultFx(null);

      setBetBoth(100);
      betAmountRef.current = 100;
      setRisk("low");

      setOnWinMode("reset");
      setOnWinPctInput("0");
      setOnLoseMode("reset");
      setOnLosePctInput("0");
      setStopProfitInput("0");
      setStopLossInput("0");

      isAutoBettingRef.current = false;
      setIsAutoBetting(false);
      autoOriginalBetRef.current = 0;
      autoNetRef.current = 0;

      setPlayMode(mode);
    },
    [stopAutoBet]
  );

  return (
    <div className="p-2 sm:p-4 lg:p-6 max-w-350 mx-auto flex flex-col lg:flex-row lg:items-start gap-4 lg:gap-8">
      <div className="w-full lg:w-60 flex flex-col gap-3 bg-[#0f212e] p-2 sm:p-3 rounded-xl h-fit text-xs">
        <div className="space-y-2">
          <label className="text-xs font-bold text-[#b1bad3] uppercase tracking-wider">
            Mode
          </label>
          <div className="bg-[#0f212e] p-1 rounded-md border border-[#2f4553] flex">
            {(["manual", "auto"] as const).map((mode) => (
              <button
                key={mode}
                onClick={() => !isBusy && changePlayMode(mode)}
                disabled={isBusy}
                className={cn(
                  "flex-1 py-2 text-[10px] font-bold uppercase rounded transition-colors disabled:opacity-50 disabled:cursor-not-allowed",
                  playMode === mode
                    ? "bg-[#213743] text-white shadow-sm"
                    : "text-[#b1bad3] hover:text-white"
                )}
              >
                {mode === "manual" ? "Manual" : "Auto"}
              </button>
            ))}
          </div>
        </div>

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
                setBetBoth(num);
              }}
              disabled={isBusy}
              className="w-full bg-[#0f212e] border border-[#2f4553] rounded-md py-2 pl-7 pr-4 text-white font-mono focus:outline-none focus:border-[#00e701] transition-colors"
            />
          </div>

          <div className="grid grid-cols-3 gap-2">
            <button
              onClick={() => {
                const newBet = Number((betAmount / 2).toFixed(2));
                setBetBoth(newBet);
              }}
              disabled={isBusy}
              className="bg-[#2f4553] hover:bg-[#3e5666] text-xs py-1 rounded text-[#b1bad3]"
            >
              ½
            </button>
            <button
              onClick={() => {
                const newBet = Number((betAmount * 2).toFixed(2));
                setBetBoth(newBet);
              }}
              disabled={isBusy}
              className="bg-[#2f4553] hover:bg-[#3e5666] text-xs py-1 rounded text-[#b1bad3]"
            >
              2×
            </button>
            <button
              onClick={() => {
                const newBet = Number(balance.toFixed(2));
                setBetBoth(newBet);
              }}
              disabled={isBusy}
              className="bg-[#2f4553] hover:bg-[#3e5666] text-xs py-1 rounded text-[#b1bad3]"
            >
              All In
            </button>
          </div>
        </div>

        <div className="space-y-2">
          <label className="text-xs font-bold text-[#b1bad3] uppercase tracking-wider">
            Risk
          </label>
          <div className="bg-[#0f212e] p-1 rounded-md border border-[#2f4553] flex">
            {(["low", "medium", "high", "expert"] as RiskLevel[]).map(
              (level) => (
                <button
                  key={level}
                  onClick={() => !isBusy && setRisk(level)}
                  disabled={isBusy}
                  className={cn(
                    "flex-1 py-2 text-[10px] font-bold uppercase rounded transition-colors disabled:opacity-50 disabled:cursor-not-allowed",
                    risk === level
                      ? "bg-[#213743] text-white shadow-sm"
                      : "text-[#b1bad3] hover:text-white"
                  )}
                >
                  {level}
                </button>
              )
            )}
          </div>
        </div>

        {playMode === "manual" && (
          <button
            onClick={playGame}
            disabled={!canSpin}
            className="w-full bg-[#00e701] hover:bg-[#00c201] disabled:opacity-50 disabled:cursor-not-allowed text-black py-3 rounded-md font-bold text-lg shadow-[0_0_20px_rgba(0,231,1,0.2)] transition-all active:scale-95 flex items-center justify-center gap-2"
          >
            {isSpinning ? (
              <Refresh className="animate-spin" />
            ) : (
              <PlayArrow sx={{ fill: "currentColor" }} />
            )}
            {isSpinning ? "Playing..." : "Bet"}
          </button>
        )}

        {playMode === "auto" && (
          <>
            <div className="space-y-2">
              <label className="text-xs font-bold text-[#b1bad3] uppercase tracking-wider">
                On Win
              </label>
              <div className="bg-[#0f212e] p-1 rounded-md border border-[#2f4553] flex">
                {(["reset", "raise"] as const).map((m) => (
                  <button
                    key={m}
                    onClick={() => !isBusy && setOnWinMode(m)}
                    disabled={isBusy}
                    className={cn(
                      "flex-1 py-2 text-[10px] font-bold uppercase rounded transition-colors disabled:opacity-50 disabled:cursor-not-allowed",
                      onWinMode === m
                        ? "bg-[#213743] text-white shadow-sm"
                        : "text-[#b1bad3] hover:text-white"
                    )}
                  >
                    {m === "reset" ? "Reset" : "Raise"}
                  </button>
                ))}
              </div>
              {onWinMode === "raise" && (
                <div className="relative">
                  <div className="absolute left-3 top-1/2 -translate-y-1/2 text-[#b1bad3]">
                    %
                  </div>
                  <input
                    type="number"
                    value={onWinPctInput}
                    onChange={(e) => setOnWinPctInput(e.target.value)}
                    onBlur={() => {
                      const raw = onWinPctInput.trim();
                      const sanitized = raw.replace(/^0+(?=\d)/, "") || "0";
                      setOnWinPctInput(sanitized);
                    }}
                    disabled={isBusy}
                    className="w-full bg-[#0f212e] border border-[#2f4553] rounded-md py-2 pl-7 pr-4 text-white font-mono focus:outline-none focus:border-[#00e701] transition-colors"
                    placeholder="0"
                  />
                </div>
              )}
            </div>

            <div className="space-y-2">
              <label className="text-xs font-bold text-[#b1bad3] uppercase tracking-wider">
                On Loss
              </label>
              <div className="bg-[#0f212e] p-1 rounded-md border border-[#2f4553] flex">
                {(["reset", "raise"] as const).map((m) => (
                  <button
                    key={m}
                    onClick={() => !isBusy && setOnLoseMode(m)}
                    disabled={isBusy}
                    className={cn(
                      "flex-1 py-2 text-[10px] font-bold uppercase rounded transition-colors disabled:opacity-50 disabled:cursor-not-allowed",
                      onLoseMode === m
                        ? "bg-[#213743] text-white shadow-sm"
                        : "text-[#b1bad3] hover:text-white"
                    )}
                  >
                    {m === "reset" ? "Reset" : "Raise"}
                  </button>
                ))}
              </div>
              {onLoseMode === "raise" && (
                <div className="relative">
                  <div className="absolute left-3 top-1/2 -translate-y-1/2 text-[#b1bad3]">
                    %
                  </div>
                  <input
                    type="number"
                    value={onLosePctInput}
                    onChange={(e) => setOnLosePctInput(e.target.value)}
                    onBlur={() => {
                      const raw = onLosePctInput.trim();
                      const sanitized = raw.replace(/^0+(?=\d)/, "") || "0";
                      setOnLosePctInput(sanitized);
                    }}
                    disabled={isBusy}
                    className="w-full bg-[#0f212e] border border-[#2f4553] rounded-md py-2 pl-7 pr-4 text-white font-mono focus:outline-none focus:border-[#00e701] transition-colors"
                    placeholder="0"
                  />
                </div>
              )}
            </div>

            <div className="space-y-2">
              <label className="text-xs font-bold text-[#b1bad3] uppercase tracking-wider">
                Stop on Profit
              </label>
              <div className="relative">
                <div className="absolute left-3 top-1/2 -translate-y-1/2 text-[#b1bad3]">
                  $
                </div>
                <input
                  type="number"
                  value={stopProfitInput}
                  onChange={(e) => setStopProfitInput(e.target.value)}
                  onBlur={() => {
                    const raw = stopProfitInput.trim();
                    const sanitized = raw.replace(/^0+(?=\d)/, "") || "0";
                    setStopProfitInput(sanitized);
                  }}
                  disabled={isBusy}
                  className="w-full bg-[#0f212e] border border-[#2f4553] rounded-md py-2 pl-7 pr-4 text-white font-mono focus:outline-none focus:border-[#00e701] transition-colors"
                />
              </div>
            </div>

            <div className="space-y-2">
              <label className="text-xs font-bold text-[#b1bad3] uppercase tracking-wider">
                Stop on Loss
              </label>
              <div className="relative">
                <div className="absolute left-3 top-1/2 -translate-y-1/2 text-[#b1bad3]">
                  $
                </div>
                <input
                  type="number"
                  value={stopLossInput}
                  onChange={(e) => setStopLossInput(e.target.value)}
                  onBlur={() => {
                    const raw = stopLossInput.trim();
                    const sanitized = raw.replace(/^0+(?=\d)/, "") || "0";
                    setStopLossInput(sanitized);
                  }}
                  disabled={isBusy}
                  className="w-full bg-[#0f212e] border border-[#2f4553] rounded-md py-2 pl-7 pr-4 text-white font-mono focus:outline-none focus:border-[#00e701] transition-colors"
                />
              </div>
            </div>

            {!isAutoBetting ? (
              <button
                onClick={startAutoBet}
                disabled={!canSpin}
                className="w-full bg-[#00e701] hover:bg-[#00c201] disabled:opacity-50 disabled:cursor-not-allowed text-black py-3 rounded-md font-bold text-lg transition-all active:scale-95 flex items-center justify-center gap-2"
              >
                <PlayArrow sx={{ fill: "currentColor" }} />
                Autobet
              </button>
            ) : (
              <button
                onClick={stopAutoBet}
                className="w-full bg-[#ef4444] hover:bg-[#dc2626] text-white py-3 rounded-md font-bold text-lg transition-all active:scale-95 flex items-center justify-center gap-2"
              >
                Stop
              </button>
            )}
          </>
        )}

        {lastMultiplier !== null && lastWin > 0 && (
          <div className="p-4 bg-[#213743] border border-[#00e701] rounded-md text-center animate-pulse">
            <div className="text-xs text-[#b1bad3] uppercase">You Won</div>
            <div className="text-2xl font-bold text-[#00e701]">
              ${lastWin.toFixed(2)}
            </div>
          </div>
        )}
      </div>

      <div className="flex-1 flex flex-col gap-4">
        <div className="flex flex-col items-center justify-start bg-[#0f212e] rounded-xl p-4 sm:p-8 relative min-h-100 sm:min-h-125 overflow-hidden">
          {resultFx === "rolling" && <div className="limbo-roll-glow" />}
          {resultFx === "win" && <div className="limbo-win-flash" />}
          {resultFx === "lose" && <div className="limbo-lose-flash" />}

          <div className="relative z-10 w-full max-w-225">
            <div className="w-full flex items-center justify-center h-52 sm:h-60">
              <div className="relative w-full">
                <div
                  ref={viewportRef}
                  className="relative w-full h-30 bg-[#1a2c38] border border-[#2f4553] rounded-xl overflow-hidden"
                >
                  <div
                    ref={trackRef}
                    className="absolute top-0 left-0 h-full flex items-center"
                    style={{
                      transform: "translateX(var(--cases-x, 0px))",
                      willChange: "transform",
                    }}
                  >
                    <div className="flex items-center">
                      {renderStart > 0 && (
                        <div
                          style={{ width: renderStart * (ITEM_W + ITEM_GAP) }}
                          aria-hidden
                        />
                      )}

                      {strip
                        .slice(renderStart, renderEnd)
                        .map((it, localIdx) => {
                          const idx = renderStart + localIdx;
                          const s = colorStyles(it.entry.color);
                          const isOpen = openedIndex === idx;
                          const isActive = activeIndex === idx;
                          const tier = (plateTierByKey.get(
                            `${it.entry.color}:${it.entry.multiplier}`
                          ) ?? 1) as PlateTier;
                          return (
                            <div
                              key={it.id}
                              className={cn(
                                "relative shrink-0 rounded-lg border border-[#0f212e] shadow-[0_6px_0_#0b1720] overflow-hidden transition-transform duration-200 ease-out",
                                isActive && "-translate-y-2",
                                isOpen && "scale-[1.04]",
                                isOpen ? "z-20" : isActive ? "z-10" : "z-0"
                              )}
                              style={{
                                width: ITEM_W,
                                height: 84,
                                marginRight:
                                  idx < strip.length - 1 ? ITEM_GAP : 0,
                              }}
                            >
                              <div className={cn("absolute inset-0", s.bg)} />

                              <div
                                className={cn(
                                  "absolute top-0 left-0 w-full h-7 rounded-t-lg border-b border-[#0f212e] transition-transform duration-300 ease-out",
                                  s.bg,
                                  isOpen ? "-translate-y-full" : "translate-y-0"
                                )}
                              >
                                <div className="absolute left-0 right-0 bottom-0 h-1 bg-[#1a2c38]" />
                                <div className="absolute left-1/2 -translate-x-1/2 bottom-0 w-8 h-3 bg-[#1a2c38] rounded-b-sm" />
                              </div>

                              <div
                                className={cn(
                                  "absolute left-2 right-2 bottom-2 transition-all duration-300 ease-out pointer-events-none overflow-visible",
                                  isOpen ? "opacity-100" : "opacity-0"
                                )}
                                style={{ height: 44 }}
                              >
                                <div className="relative h-full w-full flex items-center justify-center">
                                  <div className="flex flex-col items-center justify-center gap-1">
                                    <PlateIndicator
                                      color={it.entry.color}
                                      tier={tier}
                                    />
                                  </div>
                                </div>
                              </div>

                              <div className="absolute inset-0 pointer-events-none shadow-[inset_0_0_0_1px_rgba(15,33,46,0.25)]" />
                            </div>
                          );
                        })}

                      {renderEnd < strip.length && (
                        <div
                          style={{
                            width:
                              (strip.length - renderEnd) * (ITEM_W + ITEM_GAP) -
                              ITEM_GAP,
                          }}
                          aria-hidden
                        />
                      )}
                    </div>
                  </div>
                </div>

                <div className="absolute left-1/2 -translate-x-1/2 top-30 -translate-y-1/2 z-20 pointer-events-none">
                  <svg
                    className="w-5 h-5 drop-shadow-[0_-4px_0_#1a2c38]"
                    viewBox="0 0 20 20"
                    aria-hidden
                    focusable="false"
                  >
                    <path d="M10 0 L20 20 H0 Z" fill="#ef4444" />
                  </svg>
                </div>
              </div>
            </div>

            <div className="w-full flex items-end justify-center gap-1 px-2">
              {(() => {
                const map = new Map<string, CaseEntry[]>();
                for (const e of CASE_TABLE[risk]) {
                  const arr = map.get(e.color) ?? [];
                  arr.push(e);
                  map.set(e.color, arr);
                }

                const cols = Array.from(map.entries()).map(([color, items]) => {
                  const tiers = items
                    .slice()
                    .sort((a, b) => a.multiplier - b.multiplier);
                  const best = Math.max(
                    ...tiers.map((t) => Number(t.multiplier) || 0)
                  );
                  return { color, tiers, best };
                });

                cols.sort((a, b) => a.best - b.best);

                return cols.map((col) => {
                  const s = colorStyles(col.color as CaseColor);
                  const hex = COLOR_HEX[col.color as CaseColor] ?? "#ffffff";
                  const n = col.tiers.length;
                  return (
                    <div
                      key={col.color}
                      className="flex flex-col items-center gap-2"
                    >
                      <div className="flex flex-col-reverse justify-end bg-transparent gap-1">
                        {col.tiers.map((t, idx) => {
                          return (
                            <div
                              key={`${col.color}_${t.multiplier}_${idx}`}
                              className="bg-[#0f212e] border border-[#2f4553] rounded-md px-2 py-1 flex items-center gap-1 whitespace-nowrap"
                              title={`${formatMultiplier(t.multiplier)} — ${
                                t.chance
                              }%`}
                            >
                              <span
                                className="w-2.5 h-2.5 rounded-full border border-[#2f4553] shrink-0"
                                style={{ backgroundColor: hex }}
                                aria-hidden
                              />

                              <span className="text-[12px] text-white font-bold">
                                {formatMultiplier(t.multiplier)}
                              </span>

                              <span className="text-[10px] text-[#b1bad3] font-mono">
                                {t.chance}%
                              </span>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  );
                });
              })()}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
