"use client";

import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useWallet } from "@/components/WalletProvider";
import { useSoundVolume } from "@/components/SoundVolumeProvider";
import { PlayArrow } from "@mui/icons-material";
import GameRecordsPanel from "@/components/GameRecordsPanel";

const MIN_HORSES = 2;
const MAX_HORSES = 8;
const HOUSE_EDGE = 0.01;
const RACE_DURATION = 10000;

const HORSE_NAMES = [
  "Thunder",
  "Blaze",
  "Shadow",
  "Comet",
  "Viper",
  "Storm",
  "Rocket",
  "Phantom",
];

const HORSE_COLORS = [
  "#f97316",
  "#22c55e",
  "#38bdf8",
  "#a78bfa",
  "#f59e0b",
  "#ef4444",
  "#14b8a6",
  "#eab308",
];

type Horse = {
  id: number;
  name: string;
  probability: number;
  quote: number;
  payout: number;
  color: string;
};

type RaceProfile = {
  finishTime: number;
  phase1: number;
  phase2: number;
  surge: number;
  lastProgress: number;
  baseSpeed: number;
  tempMultiplier: number;
};

type RaceState = "idle" | "running" | "finished";

type LastResult = {
  winnerId: number | null;
  winAmount: number;
  multiplier: number;
};

const HorseRow = React.memo(
  ({
    index,
    horse,
    progress,
    isWinner,
    isLeader,
    raceState,
  }: {
    index: number;
    horse: Horse;
    progress: number;
    isWinner: boolean;
    isLeader: boolean;
    raceState: RaceState;
  }) => {
    const isHighlighted = isLeader || isWinner;
    const leftPct = Math.min(100, Math.max(0, progress * 100));

    const startOffset = 10;
    const finishBuffer = 83;

    const leftValue = `calc(${startOffset}px + ${leftPct}% - ${((leftPct / 100) * (startOffset + finishBuffer)).toFixed(2)}px)`;

    return (
      <div className="relative h-12 rounded-md">
        <div className="absolute left-1 top-1/2 -translate-y-1/2 w-12 h-10 border-l-2 border-t-2 border-b-2 border-white/70 bg-white/5 rounded-l-sm flex items-center justify-center" />

        <div
          className={`absolute top-1/2 -translate-y-1/2 ${
            isHighlighted ? "drop-shadow-[0_0_10px_rgba(0,231,1,0.6)]" : ""
          } transition-[filter] duration-300 ease-in-out`}
          style={{
            left: leftValue,
            willChange: "left",
          }}
        >
          <div className="relative flex items-center group">
            <div
              className="relative ml-1 w-8 h-6 rounded-sm border border-white/40 flex items-center justify-center text-[11px] font-black text-white shadow-md transform -skew-x-12"
              style={{ backgroundColor: horse.color }}
            >
              <span className="transform skew-x-12">{index + 1}</span>
              <div className="absolute inset-x-1 top-0 h-[2px] bg-black/10" />
            </div>
            <div
              className="ml-3 text-2xl filter drop-shadow-sm pointer-events-none"
              style={{ transform: "scaleX(-1)" }}
              aria-hidden
            >
              🐎
            </div>
          </div>
        </div>
      </div>
    );
  },
);
HorseRow.displayName = "HorseRow";

const round2 = (value: number) => Math.round(value * 100) / 100;

const generateOdds = (count: number): Horse[] => {
  const weights: number[] = [];
  const favoriteIndex =
    Math.random() < 0.35 ? Math.floor(Math.random() * count) : -1;
  for (let i = 0; i < count; i += 1) {
    let base = Math.random();
    if (i === favoriteIndex) {
      base = 0.7 + Math.random() * 0.6;
    } else {
      base = 0.1 + Math.random() * 0.8;
    }
    base = Math.pow(base, 1.6);
    weights.push(base);
  }
  const totalWeight = weights.reduce((acc, v) => acc + v, 0);

  let points = weights.map((w) =>
    Math.max(1, Math.round((w / totalWeight) * 100)),
  );
  let currentTotal = points.reduce((a, b) => a + b, 0);

  while (currentTotal !== 100) {
    if (currentTotal < 100) {
      const idx = Math.floor(Math.random() * count);
      points[idx]++;
      currentTotal++;
    } else {
      const idx = Math.floor(Math.random() * count);
      if (points[idx] > 1) {
        points[idx]--;
        currentTotal--;
      }
    }
  }

  return points.map((p, index) => {
    const probability = p / 100;
    const quote = 1 / probability;
    const payout = round2(quote * (1 - HOUSE_EDGE));
    return {
      id: index,
      name: HORSE_NAMES[index],
      probability,
      quote,
      payout,
      color: HORSE_COLORS[index],
    };
  });
};

const pickWinner = (horses: Horse[]) => {
  const roll = Math.random();
  let acc = 0;
  for (const horse of horses) {
    acc += horse.probability;
    if (roll <= acc) return horse.id;
  }
  return horses[horses.length - 1]?.id ?? 0;
};

const createProfiles = (count: number, winnerId: number): RaceProfile[] => {
  return Array.from({ length: count }, (_, index) => {
    const finishTime =
      index === winnerId ? RACE_DURATION : RACE_DURATION + Math.random() * 1000;
    const finishMs = Math.round(finishTime);
    const baseSpeed = 1 / finishMs;

    return {
      finishTime: finishMs,
      phase1: Math.random() * Math.PI * 2,
      phase2: Math.random() * Math.PI * 2,
      surge: 0.04 + Math.random() * 0.04,
      lastProgress: 0,
      baseSpeed,
      tempMultiplier: 0.8 + Math.random() * 1.2,
    };
  });
};

export default function HorseRacePage() {
  const { balance, subtractFromBalance, addToBalance, finalizePendingLoss } =
    useWallet();
  const { volume } = useSoundVolume();

  const [betAmount, setBetAmount] = useState<number>(100);
  const [betInput, setBetInput] = useState<string>("100");
  const [horseCount, setHorseCount] = useState<number>(6);
  const [horses, setHorses] = useState<Horse[]>(() => generateOdds(6));
  const [selectedHorse, setSelectedHorse] = useState<number>(0);
  const [positions, setPositions] = useState<number[]>(() => Array(6).fill(0));
  const [raceState, setRaceState] = useState<RaceState>("idle");
  const [winnerId, setWinnerId] = useState<number | null>(null);
  const [lastResult, setLastResult] = useState<LastResult>({
    winnerId: null,
    winAmount: 0,
    multiplier: 0,
  });

  const audioRef = useRef<{
    bet: HTMLAudioElement | null;
    win: HTMLAudioElement | null;
    lose: HTMLAudioElement | null;
  }>({ bet: null, win: null, lose: null });

  const raceRef = useRef<{
    startTime: number | null;
    lastTime: number | null;
    profiles: RaceProfile[];
    maxFinish: number;
    rafId: number | null;
  } | null>(null);
  const resetTimeoutRef = useRef<number | null>(null);
  const startTimeoutRef = useRef<number | null>(null);

  const selectedHorseRef = useRef<number>(selectedHorse);
  const betAmountRef = useRef<number>(betAmount);
  const horsesRef = useRef<Horse[]>(horses);
  const horseCountRef = useRef<number>(horseCount);
  const winnerRef = useRef<number | null>(winnerId);
  const raceStateRef = useRef<RaceState>(raceState);

  useEffect(() => {
    selectedHorseRef.current = selectedHorse;
  }, [selectedHorse]);

  useEffect(() => {
    betAmountRef.current = betAmount;
  }, [betAmount]);

  useEffect(() => {
    horsesRef.current = horses;
  }, [horses]);

  useEffect(() => {
    horseCountRef.current = horseCount;
  }, [horseCount]);

  useEffect(() => {
    winnerRef.current = winnerId;
  }, [winnerId]);

  useEffect(() => {
    raceStateRef.current = raceState;
  }, [raceState]);

  const playAudio = (a: HTMLAudioElement | null) => {
    if (!a) return;
    const v =
      typeof window !== "undefined" &&
      typeof (window as any).__flopper_sound_volume__ === "number"
        ? (window as any).__flopper_sound_volume__
        : 1;
    if (!v) return;
    try {
      a.volume = v;
      a.currentTime = 0;
      void a.play();
    } catch (e) {}
  };

  useEffect(() => {
    if (volume <= 0) return;

    if (!audioRef.current.bet) {
      audioRef.current = {
        bet: new Audio("/sounds/Bet.mp3"),
        win: new Audio("/sounds/Win.mp3"),
        lose: new Audio("/sounds/LimboLose.mp3"),
      };
    }

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
    };

    document.addEventListener("pointerdown", prime, { once: true });
    return () => document.removeEventListener("pointerdown", prime);
  }, [volume]);

  useEffect(() => {
    return () => {
      if (raceRef.current?.rafId) {
        cancelAnimationFrame(raceRef.current.rafId);
      }
      if (resetTimeoutRef.current) {
        clearTimeout(resetTimeoutRef.current);
      }
      if (startTimeoutRef.current) {
        clearTimeout(startTimeoutRef.current);
      }
    };
  }, []);

  const handleBetInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    let v = e.target.value;
    if (parseFloat(v) < 0) v = "0";
    setBetInput(v);
  };

  const handleBetInputBlur = () => {
    const raw = betInput.trim();
    const sanitized = raw.replace(/^0+(?=\d)/, "") || "0";
    const num = Number(sanitized);
    setBetAmount(num);
    setBetInput(sanitized);
  };

  const updateHorseCount = (next: number) => {
    if (raceState !== "idle") return;
    const clamped = Math.max(MIN_HORSES, Math.min(MAX_HORSES, next));
    setHorseCount(clamped);
    setHorses(generateOdds(clamped));
    setPositions(Array(clamped).fill(0));
    setSelectedHorse((prev) => Math.min(prev, clamped - 1));
    setWinnerId(null);
  };

  const animateRace = useCallback((time: number) => {
    const race = raceRef.current;
    if (!race) return;

    if (!race.startTime) race.startTime = time;
    const elapsed = time - race.startTime;

    const nextPositions = race.profiles.map((profile) => {
      const t = Math.min(elapsed / profile.finishTime, 1);

      const variationCurve = Math.sin(Math.PI * (0.05 + 0.9 * t));
      const wave =
        (Math.sin(elapsed / 400 + profile.phase1) * 0.4 +
          Math.sin(elapsed / 700 + profile.phase2) * 0.35 +
          Math.cos(elapsed / 1100 + profile.phase1 * 0.7) * 0.25) *
        profile.surge *
        variationCurve;

      let pos = t + wave;

      const prev = profile.lastProgress;
      const finalPos = Math.max(prev + 0.00005, Math.min(1, pos));

      profile.lastProgress = finalPos;
      return finalPos;
    });

    setPositions(nextPositions);

    if (elapsed < race.maxFinish + 100) {
      race.rafId = requestAnimationFrame(animateRace);
    } else {
      race.rafId = null;
      finishRace();
    }
  }, []);

  const finishRace = () => {
    setRaceState("finished");
    const winner = winnerRef.current;
    const currentHorses = horsesRef.current;
    if (winner == null || !currentHorses[winner]) {
      finalizePendingLoss();
      return;
    }
    const won = winner === selectedHorseRef.current;
    if (won) {
      const payout = round2(
        betAmountRef.current * currentHorses[winner].payout,
      );
      addToBalance(payout);
      setLastResult({
        winnerId: winner,
        winAmount: payout,
        multiplier: currentHorses[winner].payout,
      });
      playAudio(audioRef.current.win);
    } else {
      finalizePendingLoss();
      setLastResult({
        winnerId: winner,
        winAmount: 0,
        multiplier: currentHorses[winner].payout,
      });
      playAudio(audioRef.current.lose);
    }

    if (resetTimeoutRef.current) {
      clearTimeout(resetTimeoutRef.current);
    }
    resetTimeoutRef.current = window.setTimeout(() => {
      if (raceStateRef.current === "running") return;
      setHorses(generateOdds(horseCountRef.current));
      setRaceState("idle");
    }, 100);
  };

  const startRace = () => {
    if (raceState !== "idle") return;
    if (betAmount <= 0 || betAmount > balance) return;

    if (resetTimeoutRef.current) {
      clearTimeout(resetTimeoutRef.current);
      resetTimeoutRef.current = null;
    }

    subtractFromBalance(betAmount);
    playAudio(audioRef.current.bet);

    const winner = pickWinner(horsesRef.current);
    setWinnerId(winner);
    setLastResult({ winnerId: null, winAmount: 0, multiplier: 0 });
    setPositions(Array(horsesRef.current.length).fill(0));
    setRaceState("running");

    const profiles = createProfiles(horsesRef.current.length, winner);
    raceRef.current = {
      startTime: null,
      lastTime: null,
      profiles,
      maxFinish: Math.max(...profiles.map((p) => p.finishTime)),
      rafId: null,
    };

    if (startTimeoutRef.current) {
      clearTimeout(startTimeoutRef.current);
      startTimeoutRef.current = null;
    }

    startTimeoutRef.current = window.setTimeout(() => {
      if (!raceRef.current) return;
      raceRef.current.rafId = requestAnimationFrame(animateRace);
      startTimeoutRef.current = null;
    }, 500);
  };

  const leaderId = useMemo(() => {
    let best = 0;
    let leader = 0;
    positions.forEach((pos, index) => {
      if (pos > best) {
        best = pos;
        leader = index;
      }
    });
    return leader;
  }, [positions]);

  const formatMultiplier = (value: number) => {
    if (!Number.isFinite(value)) return "—";
    if (value >= 1000) return value.toFixed(0);
    return value.toFixed(2);
  };

  return (
    <>
      <div className="p-2 sm:p-4 lg:p-6 max-w-[1400px] mx-auto flex flex-col lg:flex-row items-start gap-4 lg:gap-8">
        <div className="w-full lg:w-72 flex flex-col gap-3 bg-[#0f212e] p-2 sm:p-3 rounded-xl h-fit text-xs self-start">
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
                disabled={raceState !== "idle"}
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
                disabled={raceState !== "idle"}
                className="bg-[#2f4553] hover:bg-[#3e5666] text-xs py-1 rounded text-[#b1bad3] disabled:opacity-50 cf-press"
              >
                ½
              </button>
              <button
                onClick={() => {
                  const newBet = Number((betAmount * 2).toFixed(2));
                  setBetAmount(newBet);
                  setBetInput(String(newBet));
                }}
                disabled={raceState !== "idle"}
                className="bg-[#2f4553] hover:bg-[#3e5666] text-xs py-1 rounded text-[#b1bad3] disabled:opacity-50 cf-press"
              >
                2×
              </button>
              <button
                onClick={() => {
                  const newBet = Number(balance.toFixed(2));
                  setBetAmount(newBet);
                  setBetInput(String(newBet));
                }}
                disabled={raceState !== "idle"}
                className="bg-[#2f4553] hover:bg-[#3e5666] text-xs py-1 rounded text-[#b1bad3] disabled:opacity-50 cf-press"
              >
                All In
              </button>
            </div>

            <div className="mt-3 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-[#b1bad3] uppercase tracking-wider">
                  Horses
                </span>
                <span className="text-sm text-white font-bold">
                  {horseCount}
                </span>
              </div>
              <input
                type="range"
                min={MIN_HORSES}
                max={MAX_HORSES}
                step={1}
                value={horseCount}
                onChange={(e) => updateHorseCount(Number(e.target.value))}
                disabled={raceState !== "idle"}
                className="w-full accent-[#00e701]"
              />
            </div>

            <div className="mt-3">
              <div className="text-xs font-bold text-[#b1bad3] uppercase tracking-wider mb-2">
                Pick a Horse
              </div>
              <div className="grid grid-cols-1 gap-2">
                {horses.map((horse) => {
                  const active = selectedHorse === horse.id;
                  return (
                    <button
                      key={horse.id}
                      onClick={() => setSelectedHorse(horse.id)}
                      disabled={raceState !== "idle"}
                      className={`flex items-center justify-between gap-2 px-3 py-2 rounded-md border text-left transition-colors cf-press ${
                        active
                          ? "border-[#00e701] bg-[#142c3b]"
                          : "border-[#2f4553] bg-[#0f212e] hover:bg-[#142c3b]"
                      } ${raceState !== "idle" ? "opacity-60" : ""}`}
                    >
                      <div className="flex items-center gap-2">
                        <span
                          className="inline-flex h-2.5 w-2.5 rounded-full"
                          style={{ backgroundColor: horse.color }}
                        />
                        <span className="text-white text-sm font-semibold">
                          {horse.name}
                        </span>
                      </div>
                      <div className="text-right">
                        <div className="text-sm text-white font-bold">
                          {Math.round(horse.probability * 100)}/100
                        </div>
                        <div className="text-[10px] text-[#7f8ca3]">
                          {formatMultiplier(horse.payout)}x
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="mt-3">
              <button
                onClick={startRace}
                disabled={betAmount <= 0 || raceState !== "idle"}
                className="w-full bg-[#00e701] hover:bg-[#00c201] disabled:opacity-50 disabled:cursor-not-allowed text-black py-3 rounded-md font-bold text-lg shadow-[0_0_20px_rgba(0,231,1,0.2)] transition-all active:scale-95 flex items-center justify-center gap-2 cf-press"
              >
                {raceState === "running" ? (
                  "Playing"
                ) : (
                  <>
                    <PlayArrow />
                    Bet
                  </>
                )}
              </button>
            </div>
          </div>

          {lastResult.winAmount > 0 && (
            <div className="p-4 bg-[#213743] border border-[#00e701] rounded-md text-center">
              <div className="text-xs text-[#b1bad3] uppercase">You Won</div>
              <div className="text-2xl font-bold text-[#00e701]">
                ${lastResult.winAmount.toFixed(2)}
              </div>
            </div>
          )}
        </div>

        <div className="flex-1 w-full">
          <div className="bg-[#0f212e] rounded-xl p-4 sm:p-6 flex flex-col gap-4">
            <div className="relative w-full rounded-xl p-4 sm:p-5 flex flex-col gap-3 overflow-hidden border border-[#243b4a] bg-gradient-to-b from-[#1f5f2b] via-[#1f5f2b] to-[#1a4c24]">
              <div className="absolute left-4 right-4 top-2 h-2 rounded-full bg-[#0f3b1b] opacity-70" />
              <div className="absolute left-4 right-4 bottom-2 h-2 rounded-full bg-[#0f3b1b] opacity-70" />

              <div className="relative rounded-lg bg-[#c89f6c] border border-[#8a6a3f] shadow-[inset_0_0_0_2px_rgba(255,255,255,0.05)] px-3 py-4 flex flex-col gap-3">
                <div
                  className="absolute inset-0 opacity-30"
                  style={{
                    backgroundImage:
                      "repeating-linear-gradient(90deg, rgba(255,255,255,0.08) 0 14px, rgba(0,0,0,0.05) 14px 28px)",
                  }}
                />
                <div className="absolute left-2 right-2 top-2 h-[2px] bg-white/70" />
                <div className="absolute left-2 right-2 bottom-2 h-[2px] bg-white/70" />
                <div className="absolute right-12 top-2 bottom-2 w-1 bg-white/80 rounded-full my-2" />

                {horses.map((horse, index) => (
                  <HorseRow
                    key={horse.id}
                    index={index}
                    horse={horse}
                    progress={positions[index] ?? 0}
                    isWinner={raceState !== "running" && winnerId === horse.id}
                    isLeader={raceState === "running" && leaderId === horse.id}
                    raceState={raceState}
                  />
                ))}
              </div>
            </div>
          </div>

          <div className="mt-4 lg:mt-8">
            <GameRecordsPanel gameId="horserace" />
          </div>
        </div>
      </div>
    </>
  );
}
