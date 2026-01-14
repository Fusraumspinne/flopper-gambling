"use client";

import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { Refresh, AutoAwesome, Brightness7 } from "@mui/icons-material";
import { useWallet } from "@/components/WalletProvider";
import { useSoundVolume } from "@/components/SoundVolumeProvider";
import { PlayArrow } from "@mui/icons-material";
import GameRecordsPanel from "@/components/GameRecordsPanel";

type RiskLevel = "Low" | "Medium" | "High" | "Expert";

type CaseColor =
  | "gray"
  | "lightblue"
  | "blue"
  | "red"
  | "green"
  | "purple"
  | "gold";

type WeightedOption = { value: number; weight: number };

type TarotTable = Record<
  RiskLevel,
  {
    mid: WeightedOption[];
    side: WeightedOption[];
  }
>;

const TAROT_TABLE: TarotTable = {
  Low: {
    mid: [
      { value: 1, weight: 51 },
      { value: 2, weight: 22 },
      { value: 3, weight: 10 },
      { value: 4, weight: 10 },
      { value: 5, weight: 7 },
    ],
    side: [
      { value: 0, weight: 10 },
      { value: 0.4, weight: 60 },
      { value: 1.1, weight: 10 },
      { value: 1.5, weight: 10 },
      { value: 2, weight: 10 },
    ],
  },
  Medium: {
    mid: [
      { value: 1, weight: 55 },
      { value: 2, weight: 23 },
      { value: 3, weight: 13 },
      { value: 5, weight: 6 },
      { value: 10, weight: 3 },
    ],
    side: [
      { value: 0, weight: 19 },
      { value: 0.3, weight: 50 },
      { value: 0.6, weight: 15 },
      { value: 2, weight: 9 },
      { value: 4, weight: 7 },
    ],
  },
  High: {
    mid: [
      { value: 1, weight: 60 },
      { value: 2, weight: 26 },
      { value: 4, weight: 10 },
      { value: 8, weight: 3 },
      { value: 24, weight: 1 },
    ],
    side: [
      { value: 0, weight: 26 },
      { value: 0.15, weight: 40 },
      { value: 0.55, weight: 20 },
      { value: 2, weight: 9 },
      { value: 7, weight: 5 },
    ],
  },
  Expert: {
    mid: [
      { value: 1, weight: 60 },
      { value: 2, weight: 30 },
      { value: 5, weight: 8 },
      { value: 10, weight: 1.5 },
      { value: 50, weight: 0.5 },
    ],
    side: [
      { value: 0, weight: 47 },
      { value: 0.15, weight: 20 },
      { value: 0.35, weight: 20 },
      { value: 3, weight: 10 },
      { value: 10, weight: 3 },
    ],
  },
};

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

function multiplierToColor(mult: number | null): CaseColor {
  const m = typeof mult === "number" && Number.isFinite(mult) ? mult : 0;
  if (m <= 0) return "gray";
  if (m < 1) return "lightblue";
  if (m < 2) return "blue";
  if (m < 4) return "red";
  if (m < 10) return "green";
  if (m < 25) return "purple";
  return "gold";
}

function normalizeMoney(value: number): number {
  if (!Number.isFinite(value)) return 0;
  const rounded = Math.round((value + Number.EPSILON) * 100) / 100;
  return Object.is(rounded, -0) ? 0 : rounded;
}

function pickWeighted(options: WeightedOption[]): number {
  const total = options.reduce((sum, o) => sum + Math.max(0, o.weight), 0);
  if (total <= 0) return options[0]?.value ?? 0;

  let r = Math.random() * total;
  for (const o of options) {
    const w = Math.max(0, o.weight);
    r -= w;
    if (r <= 0) return o.value;
  }
  return options[options.length - 1]?.value ?? 0;
}

function formatMultiplier(m: number | null): string {
  if (m === null) return "—";
  if (!Number.isFinite(m)) return "—";
  return m.toFixed(2);
}

function formatMultiplierLegend(m: number): string {
  if (!Number.isFinite(m)) return "—";
  if (m >= 1000) return `${Math.round(m)}x`;
  if (m >= 10) return `${m.toFixed(1).replace(/\.0$/, "")}x`;
  return `${m.toFixed(2).replace(/0$/, "").replace(/\.0$/, "")}x`;
}

function formatChancePct(pct: number): string {
  if (!Number.isFinite(pct)) return "—";
  if (pct >= 10) return `${pct.toFixed(0)}%`;
  if (pct >= 1) return `${pct.toFixed(1)}%`;
  return `${pct.toFixed(2)}%`;
}

type TarotChanceEntry = {
  color: CaseColor;
  multiplier: number;
  chancePct: number;
};

function buildChanceEntries(options: WeightedOption[]): TarotChanceEntry[] {
  const total = options.reduce((sum, o) => sum + Math.max(0, o.weight), 0);
  return options.map((o) => {
    const w = Math.max(0, o.weight);
    const chancePct = total > 0 ? (w / total) * 100 : 0;
    return {
      color: multiplierToColor(o.value),
      multiplier: o.value,
      chancePct,
    };
  });
}

function parseNumberLoose(raw: string) {
  const normalized = raw.replace(",", ".").trim();
  const n = Number(normalized);
  return Number.isFinite(n) ? n : 0;
}

function cn(...parts: Array<string | false | null | undefined>) {
  return parts.filter(Boolean).join(" ");
}

type GameState = "betting" | "rolling" | "finished";

type TarotDraw = {
  left: number | null;
  mid: number | null;
  right: number | null;
};

type RevealState = {
  left: boolean;
  mid: boolean;
  right: boolean;
};

function TarotCard({
  label,
  multiplier,
  revealed,
  size,
  animationDelay,
}: {
  label: string;
  multiplier: number | null;
  revealed: boolean;
  size: "side" | "mid";
  animationDelay: string;
}) {
  const sizeClass =
    size === "mid"
      ? "w-28 h-40 sm:w-36 sm:h-52 md:w-44 md:h-64"
      : "w-22 h-32 sm:w-28 sm:h-40 md:w-32 md:h-48";

  const color = multiplierToColor(multiplier);
  const styles = colorStyles(color);

  return (
    <div
      className={`bj-card ${sizeClass} rounded-xl shadow-2xl transition-all duration-500 ${
        revealed ? "bj-flipped" : ""
      }`}
    >
      <div className="bj-card-inner">
        <div className="bj-card-face bj-card-back rounded-xl border-4 border-[#0f212e] bg-[#007bff] relative overflow-hidden">
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="w-18 h-26 sm:w-22 sm:h-34 border-2 border-white/10 rounded flex items-center justify-center transform rotate-12">
              <span className="text-white/20 font-black -rotate-12 text-[16px] tracking-tighter">
                FLOPPER
              </span>
            </div>
          </div>
        </div>

        <div
          className={`bj-card-face bj-card-front rounded-xl flex flex-col items-center justify-center p-3 relative overflow-hidden border-4 border-[#1a2c38] ${styles.bg} ${styles.text} ring-1 ring-inset ring-white/30 shadow-[inset_0_0_40px_rgba(0,0,0,0.4)]`}
        >
          {[
            "top-0 left-0",
            "top-0 right-0 rotate-90",
            "bottom-0 left-0 -rotate-90",
            "bottom-0 right-0 rotate-180",
          ].map((pos) => (
              <div key={pos} className={`absolute ${pos} w-8 h-8 p-1 opacity-40`}>
                <div className="w-full h-full border-t-2 border-l-2 border-white/70 rounded-tl-lg" />
            </div>
          ))}

          <div className="relative z-10 flex flex-col h-full items-center justify-center">
            <div
              className={`font-black tracking-tighter text-white drop-shadow-[0_2px_4px_rgba(0,0,0,0.5)] ${
                size === "mid"
                  ? "text-xl sm:text-2xl md:text-3xl"
                  : "text-lg sm:text-xl md:text-2xl"
              }`}
            >
              x{formatMultiplier(multiplier)}
            </div>
            
            <div className="flex items-center gap-1.5 mt-0.5 w-full justify-center opacity-60 scale-75">
              <div className="h-0.5 w-6 bg-white rounded-full opacity-60" />
              <div className="w-1 h-1 rounded-full bg-white opacity-80" />
              <div className="h-0.5 w-6 bg-white rounded-full opacity-60" />
            </div>
          </div>
          
          <div className="absolute inset-0 opacity-15 pointer-events-none mix-blend-overlay bg-[url('https://www.transparenttextures.com/patterns/paper-fibers.png')]" />
          <div className="absolute inset-3 border border-white opacity-10 rounded-lg pointer-events-none" />
          <div className="absolute inset-3 border border-white/20 opacity-10 rounded-lg pointer-events-none" />
        </div>
      </div>
    </div>
  );
}

export default function TarotPage() {
  const {
    balance,
    subtractFromBalance,
    addToBalance,
    finalizePendingLoss,
    syncBalance,
  } = useWallet();
  const { volume } = useSoundVolume();

  const audioRef = useRef({
    bet: new Audio("/sounds/Bet.mp3"),
    flip: new Audio("/sounds/FlipCards.mp3"),
    lose: new Audio("/sounds/LimboLose.mp3"),
    win: new Audio("/sounds/Win.mp3"),
  });

  const playAudio = (a?: HTMLAudioElement) => {
    if (!a) return;
    const v =
      typeof window !== "undefined" && typeof (window as any).__flopper_sound_volume__ === "number"
        ? (window as any).__flopper_sound_volume__
        : 1;
    if (!v) return;
    try {
      a.volume = v;
      a.currentTime = 0;
      void a.play();
    } catch (e) {
    }
  };

  useEffect(() => {
    if (volume <= 0) return;
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
    };
    document.addEventListener("pointerdown", prime, { once: true });
    return () => document.removeEventListener("pointerdown", prime);
  }, [volume]);

  const [betAmount, setBetAmount] = useState<number>(100);
  const [betInput, setBetInput] = useState<string>("100");

  const [playMode, setPlayMode] = useState<"manual" | "auto">("manual");
  const [risk, setRisk] = useState<RiskLevel>("Low");
  const [gameState, setGameState] = useState<GameState>("betting");

  const [isAutoActive, setIsAutoActive] = useState(false);
  const [totalBetsCount, setTotalBetsCount] = useState(0);

  const [onWinMode, setOnWinMode] = useState<"reset" | "raise">("reset");
  const [onWinPctInput, setOnWinPctInput] = useState("0");
  const [onLoseMode, setOnLoseMode] = useState<"reset" | "raise">("reset");
  const [onLosePctInput, setOnLosePctInput] = useState("0");

  const [stopProfitInput, setStopProfitInput] = useState("0");
  const [stopLossInput, setStopLossInput] = useState("0");

  const autoActiveRef = useRef(false);
  const betAmountRef = useRef(betAmount);
  const balanceRef = useRef(balance);

  useEffect(() => {
    betAmountRef.current = betAmount;
  }, [betAmount]);

  useEffect(() => {
    balanceRef.current = balance;
  }, [balance]);

  const [draw, setDraw] = useState<TarotDraw>({
    left: null,
    mid: null,
    right: null,
  });
  const [revealed, setRevealed] = useState<RevealState>({
    left: false,
    mid: false,
    right: false,
  });

  const [lastPayout, setLastPayout] = useState<number>(0);
  const [lastWin, setLastWin] = useState<number>(0);
  const [lastMultiplier, setLastMultiplier] = useState<number | null>(null);
  const [resultFx, setResultFx] = useState<"rolling" | "win" | "lose" | null>(
    null
  );
  const [recordsRefreshCounter, setRecordsRefreshCounter] = useState(0);

  const isSpinning = gameState === "rolling";
  const isBusy = isSpinning;

  const timeoutsRef = useRef<number[]>([]);
  const resultTimeoutRef = useRef<number | null>(null);

  useEffect(() => {
    return () => {
      if (resultTimeoutRef.current) {
        clearTimeout(resultTimeoutRef.current);
        resultTimeoutRef.current = null;
      }
      timeoutsRef.current.forEach((t) => clearTimeout(t));
      timeoutsRef.current = [];
    };
  }, []);

  const setBetBoth = (next: number) => {
    const v = normalizeMoney(next);
    setBetAmount(v);
    setBetInput(String(v));
  };

  const changePlayMode = (mode: "manual" | "auto") => {
    if (mode === "manual") {
      if (autoActiveRef.current) stopAutoBet();
      setIsAutoActive(false);
      autoActiveRef.current = false;
    }

    setPlayMode(mode);

    setBetBoth(100);
    setRisk("Low");
    setOnWinMode("reset");
    setOnWinPctInput("0");
    setOnLoseMode("reset");
    setOnLosePctInput("0");
    setStopProfitInput("0");
    setStopLossInput("0");
    setGameState("betting");
    setLastPayout(0);
    setLastMultiplier(null);
  };

  const canSpin = useMemo(() => {
    if (isBusy) return false;
    if (betAmount <= 0) return false;
    if (betAmount > balance) return false;
    return true;
  }, [betAmount, balance, isBusy]);

  const chanceMid = useMemo(
    () => buildChanceEntries(TAROT_TABLE[risk].mid),
    [risk]
  );
  const chanceSide = useMemo(
    () => buildChanceEntries(TAROT_TABLE[risk].side),
    [risk]
  );

  const ChanceColumns = ({ entries }: { entries: TarotChanceEntry[] }) => {
    return (
      <div className="w-full flex items-end justify-center gap-1 px-2">
        {(() => {
          const map = new Map<string, TarotChanceEntry[]>();
          for (const e of entries) {
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
            const hex = COLOR_HEX[col.color as CaseColor] ?? "#ffffff";
            return (
              <div key={col.color} className="flex flex-col items-center gap-2">
                <div className="flex flex-col-reverse justify-end bg-transparent gap-1">
                  {col.tiers.map((t, idx) => {
                    return (
                      <div
                        key={`${col.color}_${t.multiplier}_${idx}`}
                        className="bg-[#0f212e] border border-[#2f4553] rounded-md px-2 py-1 flex items-center gap-1 whitespace-nowrap"
                        title={`${formatMultiplierLegend(
                          t.multiplier
                        )} — ${formatChancePct(t.chancePct)}`}
                      >
                        <span
                          className="w-2.5 h-2.5 rounded-full border border-[#2f4553] shrink-0"
                          style={{ backgroundColor: hex }}
                          aria-hidden
                        />

                        <span className="text-[12px] text-white font-bold">
                          {formatMultiplierLegend(t.multiplier)}
                        </span>

                        <span className="text-[10px] text-[#b1bad3] font-mono">
                          {formatChancePct(t.chancePct)}
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
    );
  };

  const totalMultiplier = useMemo(() => {
    const l = draw.left ?? 0;
    const m = draw.mid ?? 0;
    const r = draw.right ?? 0;
    return l * m * r;
  }, [draw.left, draw.mid, draw.right]);

  const stopAutoBet = useCallback(() => {
    setIsAutoActive(false);
    autoActiveRef.current = false;
    syncBalance();
  }, [syncBalance]);

  const playRound = useCallback(
    async (currentBet: number) => {
      if (balanceRef.current < currentBet || currentBet <= 0) {
        if (autoActiveRef.current) stopAutoBet();
        return { success: false, profit: 0 };
      }

      subtractFromBalance(currentBet);
      playAudio(audioRef.current.bet);

      if (resultTimeoutRef.current) {
        clearTimeout(resultTimeoutRef.current);
        resultTimeoutRef.current = null;
      }
      timeoutsRef.current.forEach((t) => clearTimeout(t));
      timeoutsRef.current = [];

      const table = TAROT_TABLE[risk];
      const left = pickWeighted(table.side);
      const right = pickWeighted(table.side);
      const mid = pickWeighted(table.mid);

      setDraw({ left, mid, right });
      setRevealed({ left: false, mid: false, right: false });
      setLastPayout(0);
      setLastWin(0);
      setLastMultiplier(null);
      setGameState("rolling");
      setResultFx("rolling");

      timeoutsRef.current.push(
        window.setTimeout(() => {
          playAudio(audioRef.current.flip);
          setRevealed((s) => ({ ...s, mid: true }));
        }, 220),
        window.setTimeout(
          () => {
            playAudio(audioRef.current.flip);
            setRevealed((s) => ({ ...s, left: true }));
          },
          340
        ),
        window.setTimeout(
          () => {
            playAudio(audioRef.current.flip);
            setRevealed((s) => ({ ...s, right: true }));
          },
          460
        )
      );

      const mult = normalizeMoney(left * mid * right);
      const payout = normalizeMoney(currentBet * mult);

      return new Promise<{ success: boolean; profit: number }>((resolve) => {
        const finishT = window.setTimeout(() => {
          setLastMultiplier(mult);
          setLastPayout(payout);

          if (payout > currentBet) {
            setLastWin(payout);
          }

          if (payout > 0) {
            addToBalance(payout);
          } else {
            finalizePendingLoss();
          }

          if (mult >= 1) {
            playAudio(audioRef.current.win);
          } else {
            playAudio(audioRef.current.lose);
          }

          const isProfit = payout > currentBet;
          const isLoss = payout < currentBet;
          const anyIndividualUnder1 = [left, mid, right].some(
            (v) => Number.isFinite(v) && v < 1
          );
          setResultFx(
            isProfit ? "win" : anyIndividualUnder1 || isLoss ? "lose" : null
          );
          setGameState("finished");
          setTotalBetsCount((prev) => prev + 1);
          setRecordsRefreshCounter((prev) => prev + 1);

          if (resultTimeoutRef.current) clearTimeout(resultTimeoutRef.current);
          resultTimeoutRef.current = window.setTimeout(
            () => setResultFx(null),
            900
          );

          resolve({ success: true, profit: payout - currentBet });
        }, 540);

        timeoutsRef.current.push(finishT);
      });
    },
    [risk, subtractFromBalance, addToBalance, finalizePendingLoss, stopAutoBet]
  );

  const onBetManual = async () => {
    if (gameState === "rolling") return;
    await playRound(betAmount);
    setGameState("betting");
  };

  const startAutoBet = async () => {
    if (isAutoActive) {
      stopAutoBet();
      return;
    }

    const initialBet = betAmountRef.current;
    if (balanceRef.current < initialBet || initialBet <= 0) return;

    setIsAutoActive(true);
    autoActiveRef.current = true;

    let currentBet = initialBet;
    let sessionProfit = 0;

    while (autoActiveRef.current) {
      const res = await playRound(currentBet);
      if (!res.success) break;

      sessionProfit += res.profit;

      const sp = parseNumberLoose(stopProfitInput);
      const sl = parseNumberLoose(stopLossInput);

      if (sp > 0 && res.profit >= sp) {
        stopAutoBet();
        break;
      }
      if (sl > 0 && res.profit <= -sl) {
        stopAutoBet();
        break;
      }

      if (res.profit > 0) {
        if (onWinMode === "reset") {
          currentBet = initialBet;
        } else {
          currentBet *= 1 + parseNumberLoose(onWinPctInput) / 100;
        }
      } else {
        if (onLoseMode === "reset") {
          currentBet = initialBet;
        } else {
          currentBet *= 1 + parseNumberLoose(onLosePctInput) / 100;
        }
      }

      await new Promise((r) => setTimeout(r, 1000));
      if (!autoActiveRef.current) break;

      setBetBoth(currentBet);
      setGameState("betting");
    }
  };

  return (
    <div className="p-2 sm:p-4 lg:p-6 max-w-350 mx-auto flex flex-col lg:flex-row gap-4 lg:gap-8 items-stretch">
      <div className="w-full lg:w-60 flex flex-col gap-3 bg-[#0f212e] p-2 sm:p-3 rounded-xl text-xs shrink-0 self-start lg:h-auto">
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
            {(["Low", "Medium", "High", "Expert"] as RiskLevel[]).map((lvl) => (
              <button
                key={lvl}
                onClick={() => !isBusy && setRisk(lvl)}
                disabled={isBusy}
                className={cn(
                  "flex-1 py-2 text-[10px] font-bold uppercase rounded transition-colors disabled:opacity-50 disabled:cursor-not-allowed",
                  risk === lvl
                    ? "bg-[#213743] text-white shadow-sm"
                    : "text-[#b1bad3] hover:text-white"
                )}
              >
                {lvl}
              </button>
            ))}
          </div>
        </div>

        {playMode === "manual" ? (
          <button
            onClick={() => onBetManual()}
            disabled={!canSpin || betAmount <= 0}
            className="w-full bg-[#00e701] hover:bg-[#00c201] disabled:opacity-50 disabled:cursor-not-allowed text-black py-3 rounded-md font-bold text-lg transition-all active:scale-95 flex items-center justify-center gap-2"
          >
            {isSpinning ? (
              <Refresh className="animate-spin" />
            ) : (
              <PlayArrow sx={{ fill: "currentColor" }} />
            )}
            {isSpinning ? "Playing..." : "Bet"}
          </button>
        ) : (
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

            {!isAutoActive ? (
              <button
                onClick={startAutoBet}
                disabled={!canSpin || betAmount <= 0}
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

        {lastMultiplier !== null &&
          (lastPayout > 0 || (lastMultiplier > 0 && lastMultiplier < 1)) && (
            <div className="p-4 bg-[#213743] border border-[#00e701] rounded-md text-center">
              <div className="text-xs text-[#b1bad3] uppercase">You Won</div>
              <div className="text-2xl font-bold text-[#00e701]">
                ${lastPayout.toFixed(2)}
              </div>
            </div>
          )}
      </div>

      <div className="flex-1 flex flex-col gap-4">
        <div className="flex-1 bg-[#0f212e] p-2 sm:p-6 rounded-xl min-h-125 flex flex-col relative overflow-hidden">
          <div className="absolute inset-0 pointer-events-none z-0">
            {resultFx === "rolling" && <div className="limbo-roll-glow" />}
            {resultFx === "win" && <div className="limbo-win-burst" />}
            {resultFx === "lose" && <div className="limbo-lose-flash" />}
          </div>

          <div className="relative z-10 flex-1 flex flex-col justify-between items-center gap-4">
            <div className="flex items-center justify-center gap-3 sm:gap-6 mt-4 sm:mt-8">
              <TarotCard
                label="Left"
                multiplier={draw.left}
                revealed={revealed.left}
                size="side"
                animationDelay="0s"
              />
              <TarotCard
                label="Mid"
                multiplier={draw.mid}
                revealed={revealed.mid}
                size="mid"
                animationDelay="0.06s"
              />
              <TarotCard
                label="Right"
                multiplier={draw.right}
                revealed={revealed.right}
                size="side"
                animationDelay="0.12s"
              />
            </div>

            <div className="w-full mb-4">
              <div className="p-3 sm:p-4">
                <div className="text-xs font-bold text-[#b1bad3] uppercase tracking-wider">
                  Mid chances
                </div>
                <div className="mt-2">
                  <ChanceColumns entries={chanceMid} />
                </div>

                <div className="mt-4 text-xs font-bold text-[#b1bad3] uppercase tracking-wider">
                  Side chances (each)
                </div>
                <div className="mt-2">
                  <ChanceColumns entries={chanceSide} />
                </div>
              </div>
            </div>
          </div>
        </div>

        <GameRecordsPanel
          gameId="tarot"
        />
      </div>
    </div>
  );
}