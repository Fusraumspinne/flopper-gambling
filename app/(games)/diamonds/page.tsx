"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { PlayArrow } from "@mui/icons-material";
import GameRecordsPanel from "@/components/GameRecordsPanel";
import { useWallet } from "@/components/WalletProvider";
import { useSoundVolume } from "@/components/SoundVolumeProvider";

function cn(...parts: Array<string | false | null | undefined>) {
  return parts.filter(Boolean).join(" ");
}

type DiamondShape =
  | "triangle"
  | "rectRounded"
  | "diamond"
  | "hex"
  | "circle"
  | "rotSquareRounded"
  | "rotSquareSharp"
  | "star"
  | "octagon";

type DiamondType = {
  id: string;
  name: string;
  color: string;
  shape: DiamondShape;
};

type ComboKey =
  | "all_unique"
  | "one_pair"
  | "two_pair"
  | "three_kind"
  | "full_house"
  | "four_kind"
  | "five_kind";

type ComboEntry = {
  key: ComboKey;
  label: string;
  multiplier: number;
  chance: number;
};

type RiskLevel = "low" | "medium" | "high";

const DIAMOND_POOL_BY_RISK: Record<RiskLevel, number> = {
  low: 5,
  medium: 7,
  high: 9,
};

const DIAMONDS: DiamondType[] = [
  { id: "yellow_triangle", name: "Gelbes Dreieck", color: "#facc15", shape: "triangle" },
  { id: "blue_rect", name: "Blaues Rechteck", color: "#3b82f6", shape: "rectRounded" },
  { id: "purple_diamond", name: "Lila Diamant", color: "#8b5cf6", shape: "diamond" },
  { id: "pink_hex", name: "Pinkes Sechseck", color: "#ec4899", shape: "hex" },
  { id: "red_circle", name: "Roter Kreis", color: "#ef4444", shape: "circle" },
  { id: "green_rot_round", name: "Grünes Quadrat", color: "#22c55e", shape: "rotSquareRounded" },
  { id: "lightblue_rot", name: "Hellblaues Quadrat", color: "#22d3ee", shape: "rotSquareSharp" },
  { id: "orange_star", name: "Oranger Stern", color: "#f97316", shape: "star" },
  { id: "white_oct", name: "Weißes Achteck", color: "#f8fafc", shape: "octagon" },
];

const COMBOS_BY_RISK: Record<RiskLevel, ComboEntry[]> = {
  low: [
    { key: "all_unique", label: "nothing", multiplier: 0, chance: 3.84 },
    { key: "one_pair", label: "pair", multiplier: 0.1, chance: 48.0 },
    { key: "two_pair", label: "two pair", multiplier: 1.2, chance: 19.2 },
    { key: "three_kind", label: "three of a kind", multiplier: 1.8, chance: 19.2 },
    { key: "full_house", label: "full house", multiplier: 3, chance: 4.8 },
    { key: "four_kind", label: "four of a kind", multiplier: 4, chance: 4.8 },
    { key: "five_kind", label: "five of a kind", multiplier: 10, chance: 0.16 },
  ],
  medium: [
    { key: "all_unique", label: "nothing", multiplier: 0, chance: 14.99 },
    { key: "one_pair", label: "pair", multiplier: 0.1, chance: 49.98 },
    { key: "two_pair", label: "two pair", multiplier: 2, chance: 18.74 },
    { key: "three_kind", label: "three of a kind", multiplier: 3, chance: 12.49 },
    { key: "full_house", label: "full house", multiplier: 4, chance: 2.5 },
    { key: "four_kind", label: "four of a kind", multiplier: 5, chance: 1.25 },
    { key: "five_kind", label: "five of a kind", multiplier: 50, chance: 0.04 },
  ],
  high: [
    { key: "all_unique", label: "nothing", multiplier: 0, chance: 25.4 },
    { key: "one_pair", label: "pair", multiplier: 0, chance: 50.8 },
    { key: "two_pair", label: "two pair", multiplier: 2.1, chance: 12.7 },
    { key: "three_kind", label: "three of a kind", multiplier: 4, chance: 8.46 },
    { key: "full_house", label: "full house", multiplier: 10, chance: 1.41 },
    { key: "four_kind", label: "four of a kind", multiplier: 18, chance: 1.22 },
    { key: "five_kind", label: "five of a kind", multiplier: 100, chance: 0.01 },
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

function pickWeighted<T extends { chance: number }>(entries: T[]) {
  const total = entries.reduce((s, e) => s + (Number.isFinite(e.chance) ? e.chance : 0), 0);
  if (total <= 0) return entries[0];
  let r = Math.random() * total;
  for (const e of entries) {
    r -= Number.isFinite(e.chance) ? e.chance : 0;
    if (r <= 0) return e;
  }
  return entries[entries.length - 1];
}

function shuffle<T>(arr: T[]) {
  const out = arr.slice();
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

function pickDistinct(count: number, poolSize: number, excludeIds: string[] = []) {
  const pool = DIAMONDS.slice(0, poolSize).filter((d) => !excludeIds.includes(d.id));
  const picked: DiamondType[] = [];
  for (let i = 0; i < count; i++) {
    const idx = Math.floor(Math.random() * pool.length);
    picked.push(pool[idx]);
    pool.splice(idx, 1);
  }
  return picked;
}

function buildDiamondsForCombo(key: ComboKey, poolSize: number) {
  const pool = DIAMONDS.slice(0, poolSize);
  if (key === "five_kind") {
    const d = pool[Math.floor(Math.random() * pool.length)];
    return Array.from({ length: 5 }, () => d);
  }

  if (key === "four_kind") {
    const d = pool[Math.floor(Math.random() * pool.length)];
    const other = pickDistinct(1, poolSize, [d.id]);
    return shuffle([d, d, d, d, other[0]]);
  }

  if (key === "full_house") {
    const d = pool[Math.floor(Math.random() * pool.length)];
    const other = pickDistinct(1, poolSize, [d.id]);
    return shuffle([d, d, d, other[0], other[0]]);
  }

  if (key === "three_kind") {
    const d = pool[Math.floor(Math.random() * pool.length)];
    const others = pickDistinct(2, poolSize, [d.id]);
    return shuffle([d, d, d, others[0], others[1]]);
  }

  if (key === "two_pair") {
    const pairTypes = pickDistinct(2, poolSize);
    const other = pickDistinct(1, poolSize, [pairTypes[0].id, pairTypes[1].id]);
    return shuffle([pairTypes[0], pairTypes[0], pairTypes[1], pairTypes[1], other[0]]);
  }

  if (key === "one_pair") {
    const d = pool[Math.floor(Math.random() * pool.length)];
    const others = pickDistinct(3, poolSize, [d.id]);
    return shuffle([d, d, others[0], others[1], others[2]]);
  }

  const uniques = pickDistinct(5, poolSize);
  return shuffle(uniques);
}

function getComboKeyFromDraw(draw: DiamondType[]): ComboKey {
  const counts = new Map<string, number>();
  for (const d of draw) counts.set(d.id, (counts.get(d.id) ?? 0) + 1);
  const groups = Array.from(counts.values()).sort((a, b) => b - a);

  if (groups[0] === 5) return "five_kind";
  if (groups[0] === 4) return "four_kind";
  if (groups[0] === 3 && groups[1] === 2) return "full_house";
  if (groups[0] === 3) return "three_kind";
  if (groups[0] === 2 && groups[1] === 2) return "two_pair";
  if (groups[0] === 2) return "one_pair";
  return "all_unique";
}

function DiamondIcon({ diamond, highlight }: { diamond: DiamondType; highlight?: boolean }) {
  const hex = diamond.color;
  const gradId = `grad-${diamond.id}`;
  const shineId = `shine-${diamond.id}`;
  const glowId = `glow-${diamond.id}`;

  return (
    <div className="w-16 h-16 flex items-center justify-center" aria-hidden>
      <svg
        viewBox="0 0 80 80"
        width="64"
        height="64"
        preserveAspectRatio="xMidYMid meet"
        overflow="visible"
      >
        <defs>
          <linearGradient id={gradId} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#ffffff" stopOpacity="0.45" />
            <stop offset="45%" stopColor={hex} stopOpacity="1" />
            <stop offset="100%" stopColor="#0b1220" stopOpacity="0.55" />
          </linearGradient>
          <linearGradient id={shineId} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#ffffff" stopOpacity="0.9" />
            <stop offset="100%" stopColor="#ffffff" stopOpacity="0" />
          </linearGradient>
          <filter id={glowId} x="-50%" y="-50%" width="200%" height="200%">
            <feGaussianBlur stdDeviation="2.2" result="blur" />
            <feComposite in="SourceGraphic" in2="blur" operator="over" />
          </filter>
        </defs>

        <g>
          {diamond.shape === "triangle" && (
            <g>
              <polygon points="40,10 72,68 8,68" fill={`url(#${gradId})`} stroke="#0f172a" strokeWidth="1.5" />
              <polygon points="40,18 62,60 18,60" fill={hex} opacity="0.55" />
              <polygon points="22,34 40,18 48,40 30,50" fill={`url(#${shineId})`} opacity="0.6" />
            </g>
          )}

          {diamond.shape === "rectRounded" && (
            <g>
              <rect x="14" y="22" width="52" height="36" rx="6" fill={`url(#${gradId})`} stroke="#0f172a" strokeWidth="1.5" />
              <polygon points="18,26 44,26 34,40" fill="#ffffff" opacity="0.25" />
              <polygon points="62,26 62,52 48,42" fill="#0b1220" opacity="0.35" />
            </g>
          )}

          {diamond.shape === "diamond" && (
            <g>
              <polygon points="40,6 72,40 40,74 8,40" fill={`url(#${gradId})`} stroke="#0f172a" strokeWidth="1.5" />
              <polygon points="40,16 60,40 40,64 20,40" fill={hex} opacity="0.6" />
              <polygon points="30,28 40,16 48,34 34,40" fill={`url(#${shineId})`} opacity="0.65" />
            </g>
          )}

          {diamond.shape === "hex" && (
            <g>
              <polygon points="40,6 68,24 68,56 40,74 12,56 12,24" fill={`url(#${gradId})`} stroke="#0f172a" strokeWidth="1.5" />
              <polygon points="40,14 60,28 60,52 40,66 20,52 20,28" fill={hex} opacity="0.55" />
              <polygon points="22,26 40,14 46,32 30,40" fill={`url(#${shineId})`} opacity="0.6" />
            </g>
          )}

          {diamond.shape === "circle" && (
            <g>
              <polygon
                points="40,8 50,10 58,16 64,24 68,34 68,46 64,56 58,64 50,70 40,72 30,70 22,64 16,56 12,46 12,34 16,24 22,16 30,10"
                fill={`url(#${gradId})`}
                stroke="#0f172a"
                strokeWidth="1.5"
              />
              <polygon points="40,16 52,20 60,28 62,40 60,52 52,60 40,64 28,60 20,52 18,40 20,28 28,20" fill={hex} opacity="0.55" />
              <polygon points="26,26 40,16 46,30 30,36" fill={`url(#${shineId})`} opacity="0.6" />
            </g>
          )}

          {diamond.shape === "rotSquareRounded" && (
            <g>
              <rect x="16" y="16" width="48" height="48" rx="8" fill={`url(#${gradId})`} stroke="#0f172a" strokeWidth="1.5" transform="rotate(45 40 40)" />
              <polygon points="40,16 56,32 40,56 24,32" fill={hex} opacity="0.55" />
              <polygon points="30,28 40,18 46,32 34,36" fill={`url(#${shineId})`} opacity="0.6" />
            </g>
          )}

          {diamond.shape === "rotSquareSharp" && (
            <g>
              <rect x="14" y="14" width="52" height="52" fill={`url(#${gradId})`} stroke="#0f172a" strokeWidth="1.5" transform="rotate(45 40 40)" />
              <polygon points="40,14 58,32 40,58 22,32" fill={hex} opacity="0.55" />
              <polygon points="28,26 40,14 48,30 32,34" fill={`url(#${shineId})`} opacity="0.6" />
            </g>
          )}

          {diamond.shape === "star" && (
            <g>
              <polygon points="40,6 48,32 74,40 48,48 40,74 32,48 6,40 32,32" fill={`url(#${gradId})`} stroke="#0f172a" strokeWidth="1.5" />
              <polygon points="40,16 44,35 60,40 44,45 40,64 36,45 20,40 36,35" fill={hex} opacity="0.55" />
              <polygon points="34,34 40,24 46,34 40,40" fill={`url(#${shineId})`} opacity="0.6" />
            </g>
          )}

          {diamond.shape === "octagon" && (
            <g>
              <polygon points="30,8 50,8 70,28 70,52 50,72 30,72 10,52 10,28" fill={`url(#${gradId})`} stroke="#0f172a" strokeWidth="1.5" />
              <polygon points="32,16 48,16 62,30 62,50 48,64 32,64 18,50 18,30" fill={hex} opacity="0.55" />
              <polygon points="26,30 40,16 48,32 30,40" fill={`url(#${shineId})`} opacity="0.6" />
            </g>
          )}
        </g>
      </svg>
    </div>
  );
}

type SlotState = {
  diamond: DiamondType | null;
  revealed: boolean;
};

export default function DiamondsPage() {
  const { balance, subtractFromBalance, addToBalance, finalizePendingLoss, syncBalance } = useWallet();
  const { volume } = useSoundVolume();

  const [risk, setRisk] = useState<RiskLevel>("low");
  const [betAmount, setBetAmount] = useState<number>(100);
  const [betInput, setBetInput] = useState<string>("100");
  const [playMode, setPlayMode] = useState<"manual" | "auto">("manual");
  const [onWinMode, setOnWinMode] = useState<"reset" | "raise">("reset");
  const [onWinPctInput, setOnWinPctInput] = useState<string>("0");
  const [onLoseMode, setOnLoseMode] = useState<"reset" | "raise">("reset");
  const [onLosePctInput, setOnLosePctInput] = useState<string>("0");
  const [isAutoBetting, setIsAutoBetting] = useState(false);

  const [slots, setSlots] = useState<SlotState[]>(() =>
    Array.from({ length: 5 }, () => ({ diamond: null, revealed: false }))
  );
  const [isDrawing, setIsDrawing] = useState(false);
  const [resultFx, setResultFx] = useState<"rolling" | "win" | "lose" | null>(null);

  const [lastCombo, setLastCombo] = useState<ComboKey | null>(null);
  const [lastMultiplier, setLastMultiplier] = useState<number | null>(null);
  const [lastWin, setLastWin] = useState<number>(0);

  const timeoutsRef = useRef<number[]>([]);
  const betAmountRef = useRef<number>(betAmount);
  const balanceRef = useRef<number>(balance);
  const isAutoBettingRef = useRef<boolean>(false);
  const autoOriginalBetRef = useRef<number>(0);

  const audioRef = useRef<{
    bet: HTMLAudioElement | null;
    reveal: HTMLAudioElement | null;
    win: HTMLAudioElement | null;
    lose: HTMLAudioElement | null;
  }>({ bet: null, reveal: null, win: null, lose: null });

  const ensureAudio = () => {
    if (audioRef.current.bet) return;
    audioRef.current = {
      bet: new Audio("/sounds/Bet.mp3"),
      reveal: new Audio("/sounds/DiamondReveal.mp3"),
      win: new Audio("/sounds/Win.mp3"),
      lose: new Audio("/sounds/LimboLose.mp3"),
    };
  };

  const playAudio = (a: HTMLAudioElement | null) => {
    if (!a) return;
    if (!volume) return;
    try {
      a.volume = volume;
      a.currentTime = 0;
      void a.play();
    } catch (e) {}
  };

  useEffect(() => {
    betAmountRef.current = betAmount;
  }, [betAmount]);

  useEffect(() => {
    balanceRef.current = balance;
  }, [balance]);

  useEffect(() => {
    isAutoBettingRef.current = isAutoBetting;
  }, [isAutoBetting]);

  useEffect(() => {
    if (volume <= 0) return;
    const prime = async () => {
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
    };

    document.addEventListener("pointerdown", prime, { once: true });
    return () => document.removeEventListener("pointerdown", prime);
  }, [volume]);

  useEffect(() => {
    return () => {
      timeoutsRef.current.forEach((t) => clearTimeout(t));
      timeoutsRef.current = [];
    };
  }, []);

  useEffect(() => {
    return () => {
      isAutoBettingRef.current = false;
    };
  }, []);

  const isBusy = useMemo(() => isDrawing || isAutoBetting, [isDrawing, isAutoBetting]);

  const canPlay = useMemo(() => {
    if (isDrawing) return false;
    if (betAmount <= 0) return false;
    if (betAmount > balance) return false;
    return true;
  }, [betAmount, balance, isDrawing]);

  const setBetBoth = (next: number) => {
    const v = normalizeMoney(next);
    setBetAmount(v);
    setBetInput(String(v));
    betAmountRef.current = v;
  };

  const currentCombos = useMemo(() => COMBOS_BY_RISK[risk], [risk]);
  const currentPoolSize = useMemo(() => DIAMOND_POOL_BY_RISK[risk], [risk]);

  const playRound = useCallback(async (opts?: { betAmount?: number }) => {
    if (isDrawing) return null as null | {
      betAmount: number;
      winAmount: number;
      multiplier: number;
    };
    const bet = normalizeMoney(opts?.betAmount ?? betAmountRef.current);
    if (bet <= 0 || bet > balanceRef.current) return null as null | {
      betAmount: number;
      winAmount: number;
      multiplier: number;
    };

    timeoutsRef.current.forEach((t) => clearTimeout(t));
    timeoutsRef.current = [];

    setResultFx("rolling");
    setIsDrawing(true);
    setLastCombo(null);
    setLastMultiplier(null);
    setLastWin(0);
    setSlots(Array.from({ length: 5 }, () => ({ diamond: null, revealed: false })));

    subtractFromBalance(bet);
    playAudio(audioRef.current.bet);

    const combo = pickWeighted(currentCombos);
    const draw = buildDiamondsForCombo(combo.key, currentPoolSize);

    await new Promise<void>((resolve) => {
      draw.forEach((diamond, index) => {
        const t = window.setTimeout(() => {
          setSlots((prev) =>
            prev.map((slot, i) =>
              i === index
                ? { diamond, revealed: true }
                : slot
            )
          );
          playAudio(audioRef.current.reveal);
          if (index === draw.length - 1) resolve();
        }, 220 * index);
        timeoutsRef.current.push(t);
      });
    });

    const payout = normalizeMoney(bet * combo.multiplier);
    const comboKey = getComboKeyFromDraw(draw);

    if (payout > 0) addToBalance(payout);
    else finalizePendingLoss();

    setLastCombo(comboKey);
    setLastMultiplier(combo.multiplier);
    setLastWin(payout);

    const isWin = combo.multiplier >= 1;
    playAudio(isWin ? audioRef.current.win : audioRef.current.lose);
    setResultFx(isWin ? "win" : "lose");

    window.setTimeout(() => setResultFx(null), 500);

    await new Promise((resolve) => setTimeout(resolve, 100));

    setIsDrawing(false);

    return {
      betAmount: bet,
      winAmount: payout,
      multiplier: combo.multiplier,
    };
  }, [addToBalance, currentCombos, currentPoolSize, finalizePendingLoss, isDrawing, subtractFromBalance]);

  const stopAutoBet = useCallback(() => {
    isAutoBettingRef.current = false;
    setIsAutoBetting(false);
    void syncBalance();
  }, [syncBalance]);

  const startAutoBet = useCallback(async () => {
    if (isAutoBettingRef.current) return;
    if (isDrawing) return;

    const startingBet = normalizeMoney(betAmountRef.current);
    if (startingBet <= 0 || startingBet > balanceRef.current) return;

    autoOriginalBetRef.current = startingBet;
    isAutoBettingRef.current = true;
    setIsAutoBetting(true);

    while (isAutoBettingRef.current) {
      const onWinPct = Math.max(0, parseNumberLoose(onWinPctInput));
      const onLosePct = Math.max(0, parseNumberLoose(onLosePctInput));

      const roundBet = normalizeMoney(betAmountRef.current);
      if (roundBet <= 0) break;
      if (roundBet > balanceRef.current) break;

      const result = await playRound({ betAmount: roundBet });
      if (!result) break;

      const didWin = result.multiplier >= 1;

      if (didWin) {
        if (onWinMode === "reset") {
          setBetBoth(autoOriginalBetRef.current);
        } else {
          const next = normalizeMoney(result.betAmount * (1 + onWinPct / 100));
          setBetBoth(next);
        }
      } else {
        if (onLoseMode === "reset") {
          setBetBoth(autoOriginalBetRef.current);
        } else {
          const next = normalizeMoney(result.betAmount * (1 + onLosePct / 100));
          setBetBoth(next);
        }
      }

      await new Promise((resolve) => setTimeout(resolve, 600));
    }

    isAutoBettingRef.current = false;
    setIsAutoBetting(false);
    void syncBalance();
  }, [isDrawing, onLoseMode, onLosePctInput, onWinMode, onWinPctInput, playRound, syncBalance]);

  const changePlayMode = useCallback(
    (mode: "manual" | "auto") => {
      try {
        stopAutoBet();
      } catch {
      }

      timeoutsRef.current.forEach((t) => clearTimeout(t));
      timeoutsRef.current = [];

      setIsDrawing(false);
      setResultFx(null);
      setLastCombo(null);
      setLastMultiplier(null);
      setLastWin(0);
      setSlots(Array.from({ length: 5 }, () => ({ diamond: null, revealed: false })));

      setBetBoth(100);
      setRisk("low");

      setOnWinMode("reset");
      setOnWinPctInput("0");
      setOnLoseMode("reset");
      setOnLosePctInput("0");

      setPlayMode(mode);
    },
    [stopAutoBet]
  );

  const highlightedCombo = lastCombo;

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
              onChange={(e) => {
                let v = e.target.value;
                if (parseFloat(v) < 0) v = "0";
                setBetInput(v);
              }}
              onBlur={() => {
                const raw = betInput.trim();
                const sanitized = raw.replace(/^0+(?=\d)/, "") || "0";
                const num = Number(sanitized);
                setBetBoth(Math.max(0, num));
              }}
              disabled={isBusy}
              className="w-full bg-[#0f212e] border border-[#2f4553] rounded-md py-2 pl-7 pr-4 text-white font-mono focus:outline-none focus:border-[#00e701] transition-colors"
            />
          </div>

          <div className="grid grid-cols-3 gap-2">
            <button
              onClick={() => setBetBoth(Number((betAmount / 2).toFixed(2)))}
              disabled={isBusy}
              className="bg-[#2f4553] hover:bg-[#3e5666] text-xs py-1 rounded text-[#b1bad3]"
            >
              ½
            </button>
            <button
              onClick={() => setBetBoth(Number((betAmount * 2).toFixed(2)))}
              disabled={isBusy}
              className="bg-[#2f4553] hover:bg-[#3e5666] text-xs py-1 rounded text-[#b1bad3]"
            >
              2×
            </button>
            <button
              onClick={() => setBetBoth(Number(balance.toFixed(2)))}
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
            {(["low", "medium", "high"] as RiskLevel[]).map((level) => (
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
            ))}
          </div>
        </div>

        {playMode === "manual" && (
          <button
            onClick={() => void playRound()}
            disabled={!canPlay}
            className="w-full bg-[#00e701] hover:bg-[#00c201] disabled:opacity-50 disabled:cursor-not-allowed text-black py-3 rounded-md font-bold text-lg shadow-[0_0_20px_rgba(0,231,1,0.2)] transition-all active:scale-95 flex items-center justify-center gap-2"
          >
            {!isDrawing && <PlayArrow sx={{ fill: "currentColor" }} />}
            {isDrawing ? "Playing" : "Bet"}
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

            {!isAutoBetting ? (
              <button
                onClick={startAutoBet}
                disabled={isBusy || betAmount <= 0 || betAmount > balance}
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
          <div className="p-4 bg-[#213743] border border-[#00e701] rounded-md text-center">
            <div className="text-xs text-[#b1bad3] uppercase">You Won</div>
            <div className="text-2xl font-bold text-[#00e701]">
              ${lastWin.toFixed(2)}
            </div>
          </div>
        )}
      </div>

      <div className="flex-1 min-w-0 flex flex-col gap-4">
        <div className="flex flex-col items-center justify-start bg-[#0f212e] rounded-xl p-4 sm:p-8 relative overflow-hidden">
          {resultFx === "rolling" && <div className="limbo-roll-glow" />}
          {resultFx === "win" && <div className="limbo-win-flash" />}
          {resultFx === "lose" && <div className="limbo-lose-flash" />}

          <div className="relative z-10 w-full max-w-225">
            <div className="w-full flex items-center justify-center">
              <div className="grid grid-cols-5 gap-3 sm:gap-4">
                {slots.map((slot, idx) => {
                  const isWinningRound = !isDrawing && lastMultiplier !== null && lastMultiplier >= 1;
                  const isLosingRound = !isDrawing && lastMultiplier !== null && lastMultiplier < 1;
                  return (
                    <div
                      key={`slot_${idx}`}
                      className={cn(
                        "w-16 h-20 sm:w-20 sm:h-24 bg-[#1a2c38] border border-[#2f4553] rounded-xl flex items-center justify-center shadow-[0_4px_0_#0b1720] transition-all duration-300",
                        slot.revealed ? "opacity-100 scale-100" : "opacity-50 scale-100"
                      )}
                    >
                      {slot.diamond && (
                        <div className="animate-[scaleIn_200ms_ease-out] drop-shadow-[0_0_12px_rgba(0,0,0,0.3)]">
                          <DiamondIcon diamond={slot.diamond} />
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>

            <div className="mt-8 bg-[#0f212e] border border-[#2f4553] rounded-xl p-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {currentCombos.map((combo) => {
                  const isActive = !isDrawing && highlightedCombo === combo.key;
                  const isWinningCombo = isActive && combo.multiplier >= 1;
                  const isLosingCombo = isActive && combo.multiplier < 1;

                  return (
                    <div
                      key={combo.key}
                      className={cn(
                        "bg-[#213743] border rounded-md px-3 py-2 flex items-center justify-between transition-all duration-300",
                        isWinningCombo ? "border-[#00e701]" : "border-[#2f4553]"
                      )}
                    >
                      <div>
                        <div className="text-[10px] transition-colors text-[#b1bad3] uppercase font-bold">
                          {combo.label}
                        </div>
                        <div className="text-[8px] uppercase text-[#b1bad3] font-mono">
                          {combo.chance}%
                        </div>
                      </div>
                      <div className="text-[10px] text-[#b1bad3] uppercase font-bold">
                        {combo.multiplier}x
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </div>

        <GameRecordsPanel gameId="diamonds" />
      </div>
    </div>
  );
}
