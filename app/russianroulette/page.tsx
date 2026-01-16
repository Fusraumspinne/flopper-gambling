"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import { PlayArrow } from "@mui/icons-material";
import { useWallet } from "@/components/WalletProvider";
import { useSoundVolume } from "@/components/SoundVolumeProvider";
import GameRecordsPanel from "@/components/GameRecordsPanel";

type GameState = "idle" | "playing" | "firing" | "resolved";

const CHAMBER_COUNT = 8;
const HOUSE_EDGE = 0.98;

const createChambers = (bullets: number) => {
  const slots = Array.from({ length: CHAMBER_COUNT }, () => false);
  const indices = Array.from({ length: CHAMBER_COUNT }, (_, i) => i);
  for (let i = indices.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [indices[i], indices[j]] = [indices[j], indices[i]];
  }
  indices.slice(0, bullets).forEach((idx) => {
    slots[idx] = true;
  });
  return slots;
};

export default function RussianRoulettePage() {
  const { balance, subtractFromBalance, addToBalance, finalizePendingLoss } =
    useWallet();
  const { volume } = useSoundVolume();

  const [betAmount, setBetAmount] = useState<number>(100);
  const [betInput, setBetInput] = useState<string>("100");
  const [bulletCount, setBulletCount] = useState<number>(1);
  const [activeBulletCount, setActiveBulletCount] = useState<number>(1);
  const [chambers, setChambers] = useState<boolean[]>(createChambers(1));
  const [gameState, setGameState] = useState<GameState>("idle");
  const [currentStep, setCurrentStep] = useState<number>(0);
  const [result, setResult] = useState<"win" | "lose" | null>(null);
  const [lastWin, setLastWin] = useState<number>(0);
  const [resultFx, setResultFx] = useState<"rolling" | "win" | "lose" | null>(
    null
  );
  const [isFiring, setIsFiring] = useState(false);
  const [recoil, setRecoil] = useState(false);
  const [accumulatedMultiplier, setAccumulatedMultiplier] = useState<number>(1);
  const [showMuzzle, setShowMuzzle] = useState(false);
  const [revealed, setRevealed] = useState<boolean>(false);

  const resultTimeoutRef = useRef<number | null>(null);
  const fireTimeoutRef = useRef<number | null>(null);
  const muzzleTimeoutRef = useRef<number | null>(null);

  const audioRef = useRef<{
    bet: HTMLAudioElement | null;
    win: HTMLAudioElement | null;
    lose: HTMLAudioElement | null;
    tick: HTMLAudioElement | null;
  }>({ bet: null, win: null, lose: null, tick: null });

  const ensureAudio = () => {
    if (audioRef.current.bet) return;
    audioRef.current = {
      bet: new Audio("/sounds/Bet.mp3"),
      win: new Audio("/sounds/Win.mp3"),
      lose: new Audio("/sounds/MinePop.mp3"),
      tick: new Audio("/sounds/Tick.mp3"),
    };
  };

  const playAudio = (a?: HTMLAudioElement | null) => {
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
    const prime = async () => {
      try {
        ensureAudio();
        const items = Object.values(audioRef.current).filter(
          Boolean,
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
      if (resultTimeoutRef.current) {
        clearTimeout(resultTimeoutRef.current);
        resultTimeoutRef.current = null;
      }
      if (fireTimeoutRef.current) {
        clearTimeout(fireTimeoutRef.current);
        fireTimeoutRef.current = null;
      }
      if (muzzleTimeoutRef.current) {
        clearTimeout(muzzleTimeoutRef.current);
        muzzleTimeoutRef.current = null;
      }
    };
  }, []);

  const stepMultipliers = useMemo(() => {
    const multis: number[] = [];
    let currentMulti = 1.0;
    const displayCount =
      gameState === "playing" || gameState === "firing"
        ? activeBulletCount
        : bulletCount;
    const safeCount = CHAMBER_COUNT - displayCount;

    for (let i = 0; i < safeCount; i++) {
      // P(safe) = (safe - i) / (total - i)
      const pSafe = (safeCount - i) / (CHAMBER_COUNT - i);
      currentMulti = currentMulti * (1 / pSafe);
      multis.push(Math.round(currentMulti * HOUSE_EDGE * 100) / 100);
    }
    return multis;
  }, [activeBulletCount, bulletCount, gameState]);

  const cylinderMultiplier =
    currentStep > 0 ? stepMultipliers[currentStep - 1] : 1;
  const totalMultiplier = accumulatedMultiplier * cylinderMultiplier;
  const nextCylinderMulti =
    currentStep < stepMultipliers.length ? stepMultipliers[currentStep] : 0;
  const nextTotalMultiplier = accumulatedMultiplier * nextCylinderMulti;

  const handleBetInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    let v = e.target.value;
    if (parseFloat(v) < 0) v = "0";
    setBetInput(v);
  };

  const handleBetInputBlur = () => {
    const raw = betInput.trim();
    let sanitized = raw.replace(/^0+(?=\d)/, "") || "0";
    let num = Number(sanitized);
    if (num < 0) {
      num = 0;
      sanitized = "0";
    }
    setBetAmount(num);
    setBetInput(sanitized);
  };

  const placeBet = () => {
    if (betAmount <= 0 || balance < betAmount) return;
    subtractFromBalance(betAmount);
    playAudio(audioRef.current.bet);

    setChambers(createChambers(bulletCount));
    setActiveBulletCount(bulletCount);
    setAccumulatedMultiplier(1);
    setCurrentStep(0);
    setResult(null);
    setLastWin(0);
    setResultFx(null);
    setRevealed(false);
    setGameState("playing");
  };

  const showFx = (next: "win" | "lose") => {
    if (resultTimeoutRef.current) {
      clearTimeout(resultTimeoutRef.current);
      resultTimeoutRef.current = null;
    }
    setResultFx(next);
    resultTimeoutRef.current = window.setTimeout(() => setResultFx(null), 900);
  };

  const handleShoot = () => {
    if (gameState !== "playing" || isFiring) return;
    setIsFiring(true);
    setGameState("firing");
    setResultFx("rolling");
    playAudio(audioRef.current.bet);

    const idx = currentStep;

    fireTimeoutRef.current = window.setTimeout(() => {
      const hit = chambers[idx];
      
      if (hit) {
        setRecoil(true);
        window.setTimeout(() => setRecoil(false), 150);

        setShowMuzzle(true);
        if (muzzleTimeoutRef.current) {
          clearTimeout(muzzleTimeoutRef.current);
        }
        muzzleTimeoutRef.current = window.setTimeout(() => {
          setShowMuzzle(false);
          muzzleTimeoutRef.current = null;
        }, 300);

        setResult("lose");
        setRevealed(true);
        playAudio(audioRef.current.lose);
        finalizePendingLoss();
        showFx("lose");
        setGameState("resolved");
      } else {
        const nextStep = currentStep + 1;
        setCurrentStep(nextStep);
        setResultFx(null);

        if (nextStep === CHAMBER_COUNT - activeBulletCount) {
          setRevealed(true);
        }
        setGameState("playing");
      }
      setIsFiring(false);
    }, 700);
  };

  const handleCashout = () => {
    if (
      gameState !== "playing" ||
      (currentStep === 0 && accumulatedMultiplier === 1) ||
      isFiring
    )
      return;
    const payout = betAmount * totalMultiplier;
    setLastWin(payout);
    addToBalance(payout);
    playAudio(audioRef.current.win);
    showFx("win");
    setRevealed(true);
    setGameState("resolved");
  };

  const handleNextCylinder = () => {
    if (
      gameState !== "playing" ||
      currentStep < CHAMBER_COUNT - activeBulletCount
    )
      return;

    // Play bet sound on reload as well
    playAudio(audioRef.current.bet);

    setAccumulatedMultiplier(totalMultiplier);

    setChambers(createChambers(bulletCount));
    setActiveBulletCount(bulletCount);
    setCurrentStep(0);
    setResult(null);
    setResultFx(null);
    setRevealed(false);
  };

  return (
    <div className="p-2 sm:p-4 lg:p-6 max-w-[1400px] mx-auto flex flex-col lg:flex-row items-start gap-4 lg:gap-8">
      <div className="w-full lg:w-60 lg:shrink-0 flex flex-col gap-3 bg-[#0f212e] p-2 sm:p-3 rounded-xl h-fit text-xs">
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
              disabled={gameState === "playing" || gameState === "firing"}
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
              disabled={gameState === "playing" || gameState === "firing"}
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
              disabled={gameState === "playing" || gameState === "firing"}
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
              disabled={gameState === "playing" || gameState === "firing"}
              className="bg-[#2f4553] hover:bg-[#3e5666] text-xs py-1 rounded text-[#b1bad3] disabled:opacity-50 cf-press"
            >
              All In
            </button>
          </div>

          <div className="pt-2">
            <div className="flex items-center justify-between text-xs text-[#b1bad3]">
              <span>Bullets</span>
              <span className="font-mono">{bulletCount} / 8</span>
            </div>
            <input
              type="range"
              min={1}
              max={7}
              step={1}
              value={bulletCount}
              disabled={
                (gameState === "playing" &&
                  currentStep < CHAMBER_COUNT - activeBulletCount) ||
                gameState === "firing"
              }
              onChange={(e) => setBulletCount(Number(e.target.value))}
              className="mt-2 w-full accent-[#00e701]"
            />
          </div>

          <div className="mt-4">
            {(gameState === "idle" || gameState === "resolved") ? (
              <button
                onClick={placeBet}
                disabled={betAmount <= 0 || isFiring}
                className="w-full bg-[#00e701] hover:bg-[#00c201] disabled:opacity-50 disabled:cursor-not-allowed text-black py-3 rounded-md font-bold text-lg shadow-[0_0_20px_rgba(0,231,1,0.2)] transition-all active:scale-95 flex items-center justify-center gap-2 cf-press"
              >
                <PlayArrow />
                Bet
              </button>
            ) : (
              <div className="flex gap-2">
                {currentStep < CHAMBER_COUNT - activeBulletCount ? (
                  <button
                    onClick={handleShoot}
                    disabled={isFiring}
                    className="flex-1 bg-[#2f4553] hover:bg-[#3e5666] disabled:opacity-50 disabled:cursor-not-allowed text-white py-3 rounded-md font-bold text-lg transition-all active:scale-95 flex items-center justify-center gap-2 cf-press text-md"
                  >
                     Shoot
                  </button>
                ) : (
                  <button
                    onClick={handleNextCylinder}
                    disabled={isFiring}
                    className="flex-1 bg-[#2f4553] hover:bg-[#3e5666] disabled:opacity-50 disabled:cursor-not-allowed text-white py-3 rounded-md font-bold text-lg transition-all active:scale-95 flex items-center justify-center gap-2 cf-press"
                  >
                    Reload
                  </button>
                )}
                <button
                  onClick={handleCashout}
                  disabled={isFiring || (currentStep === 0 && accumulatedMultiplier === 1)}
                  className="px-4 bg-[#00e701] hover:bg-[#00c201] text-black rounded-md font-bold text-lg disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 shadow-[0_0_20px_rgba(0,231,1,0.2)] transition-all active:scale-95 cf-press"
                >
                  Cashout
                </button>
              </div>
            )}
          </div>
        </div>

        {(gameState === "playing" || gameState === "firing") && (
          <div className="bg-[#0f212e] p-4 rounded border border-[#2f4553] text-center">
            <div className="text-[#b1bad3] text-sm">Current Win</div>
            <div className="text-2xl font-bold text-[#00e701]">
              ${(betAmount * (totalMultiplier || 1)).toFixed(2)}
            </div>
            <div className="text-sm text-[#b1bad3] mt-1">
              Next:{" "}
              {nextTotalMultiplier > 0
                ? nextTotalMultiplier.toFixed(2) + "x"
                : "-"}
            </div>
          </div>
        )}

        {lastWin > 0 && (
          <div className="p-4 bg-[#213743] border border-[#00e701] rounded-md text-center">
            <div className="text-xs text-[#b1bad3] uppercase">You Won</div>
            <div className="text-xl font-bold text-[#00e701]">
              {lastWin.toFixed(2)}
            </div>
          </div>
        )}
      </div>

      <div className="flex-1 flex flex-col gap-4 w-full h-full">
        <div className="flex-1 flex flex-col items-center justify-center bg-[#0f212e] rounded-xl relative min-h-[360px] sm:min-h-[500px] overflow-hidden">
          {resultFx === "rolling" && <div className="limbo-roll-glow" />}
          {resultFx === "win" && <div className="limbo-win-flash" />}
          {resultFx === "lose" && <div className="limbo-lose-flash" />}
          {resultFx === "rolling" && (
            <div
              className="absolute inset-0 pointer-events-none"
              style={{
                background:
                  "radial-gradient(circle at 50% 55%, rgba(47,69,83,0.18) 0%, rgba(15,33,46,0.0) 68%)",
                opacity: 0.9,
              }}
            />
          )}

          <div className="w-full max-w-4xl flex flex-col items-center">
            <div className="w-full flex flex-col items-center justify-center py-2">
              <div className="flex items-center justify-center gap-0 sm:gap-4 scale-[0.85] sm:scale-100 transition-transform">
                <div className="relative -left-20 w-[320px] h-[160px] flex-shrink-0 origin-right scale-[0.45] sm:scale-[0.7] -translate-x-12 sm:translate-x-0">
                  <div 
                    className={`w-full h-full relative transition-transform duration-100 ease-out origin-[100px_130px] ${
                      recoil 
                        ? (chambers[currentStep] ? "rotate-[-12deg] -translate-x-4" : "rotate-[-3deg] -translate-x-1") 
                        : "rotate-0 translate-x-0"
                    }`}
                  >
                    <div
                      className="absolute left-[73px] top-[100px] w-[55px] h-[85px] bg-gradient-to-b from-[#451a03] via-[#78350f] to-[#451a03] border-x border-b border-[#291305] rounded-b-[35px] rounded-tr-[15px] z-0 shadow-xl"
                      style={{ transform: "skewX(-10deg)" }}
                    >
                      <div className="absolute top-[30px] left-[25px] w-2 h-2 rounded-full bg-[#94a3b8] border border-[#475569] opacity-40" />
                    </div>

                    <div className="absolute left-[80px] top-[45px] w-[55px] h-[55px] bg-gradient-to-br from-[#94a3b8] to-[#475569] border border-[#334155] rounded-tl-[25px] z-10" />

                    <div className="absolute left-[85px] top-[35px] w-3 h-5 origin-bottom-left rotate-[-25deg] z-5">
                      <div className="w-full h-full bg-gradient-to-b from-[#cbd5e1] to-[#64748b] border border-[#475569] rounded-t-lg" />
                    </div>

                    <div className="absolute left-[125px] top-[40px] w-[75px] h-[70px] bg-gradient-to-br from-[#cbd5e1] via-[#94a3b8] to-[#64748b] border-2 border-[#475569] rounded-sm z-10" />

                    <div className="absolute left-[130px] top-[50px] w-[65px] h-[50px] bg-gradient-to-br from-[#e2e8f0] via-[#cbd5e1] to-[#64748b] border border-[#475569] z-25 shadow-inner rounded-sm overflow-hidden">
                      <div className="absolute inset-y-1 left-2 w-2.5 bg-[#475569] rounded-full opacity-30 shadow-inner" />
                      <div className="absolute inset-y-1 left-1/2 -translate-x-1/2 w-2.5 bg-[#475569] rounded-full opacity-30 shadow-inner" />
                      <div className="absolute inset-y-1 right-2 w-2.5 bg-[#475569] rounded-full opacity-30 shadow-inner" />
                    </div>

                    <div className="absolute left-[195px] top-[54px] w-[115px] h-[22px] bg-gradient-to-b from-[#e2e8f0] via-[#94a3b8] to-[#475569] border-t border-r border-[#94a3b8] shadow-sm z-20" />

                    <div className="absolute left-[198px] top-[78px] w-[109px] h-[8px] bg-gradient-to-b from-[#94a3b8] via-[#64748b] to-[#334155] rounded-full border border-[#475569] z-15" />

                    <div className="absolute left-[225px] top-[74px] w-[14px] h-[10px] bg-[#64748b] border border-[#475569] rounded-sm z-15" />

                    <div className="absolute left-[300px] top-[44px] w-2 h-10 bg-[#475569] rounded-t-sm z-10" />

                    <div className="absolute left-[137px] top-[109px] w-[50px] h-[35px] rounded-b-full border-2 border-[#475569] border-t-0 z-10" />
                    <div className="absolute left-[159px] top-[107px] w-1.5 h-6 bg-gradient-to-b from-[#64748b] to-[#1e293b] rounded-b-md z-15" />

                    {showMuzzle && (
                      <div className="absolute left-[285px] top-[42px] w-12 h-12 pointer-events-none z-10">
                        <style>{`@keyframes muzzle-fade{from{transform:scale(1);opacity:1}to{transform:scale(1.5);opacity:0}}@keyframes muzzle-burst{from{transform:scale(1);opacity:1}to{transform:scale(1.3);opacity:0}}`}</style>
                        <div
                          className="absolute inset-0 rounded-full bg-gradient-to-r from-yellow-300 via-orange-300 to-transparent opacity-80"
                          style={{
                            filter: "blur(6px)",
                            animation: "muzzle-fade 300ms ease-out forwards",
                          }}
                        />
                        <div
                          className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-6 h-6 bg-white rounded-full opacity-90"
                          style={{
                            animation: "muzzle-burst 180ms ease-out forwards",
                          }}
                        />
                      </div>
                    )}
                  </div>
                </div>

                <div className="relative -left-15 w-32 sm:w-52 h-40 flex-shrink-0 -translate-x-8 sm:translate-x-0">
                  <style>{`
                    .explode-money .bundle { transform-origin: center; animation: fly-side 900ms forwards; }
                    @keyframes fly-side { 
                      to { 
                        transform: translateY(-180px) translateX(var(--tx, 0px)) rotate(var(--rot, 0deg)) scale(0.6); 
                        opacity: 0; 
                      } 
                    }

                    .bomb-pop { animation: bomb-pop 900ms forwards; }
                    @keyframes bomb-pop { 
                      30% { transform: translateY(-12px) scale(1.05); } 
                      100% { transform: translateY(-180px) scale(0.5); opacity: 0; } 
                    }
                  `}</style>

                  <div
                    className={`absolute bottom-0 left-0 right-0 flex items-end justify-center gap-3 ${result === "lose" ? "explode-money" : ""}`}
                  >
                    <div
                      className="flex flex-col-reverse items-center mb-1"
                      style={{ "--tx": "-80px", "--rot": "-25deg" } as any}
                    >
                      {[0, 1].map((i) => (
                        <div
                          key={i}
                          className="bundle w-14 h-4 bg-gradient-to-b from-[#22c55e] to-[#15803d] border border-[#14532d] rounded-sm relative mb-[-3px]"
                          style={{
                            animationDelay: `${i * 40}ms`,
                            zIndex: 5 - i,
                          }}
                        >
                          <div className="absolute inset-y-0 left-1/4 w-[1px] bg-black opacity-10" />
                          <div className="absolute inset-y-0 right-1/4 w-[1px] bg-black opacity-10" />
                          <div className="absolute inset-y-0 left-1/2 -translate-x-1/2 w-3 bg-[#facc15] opacity-40 shadow-sm" />
                        </div>
                      ))}
                    </div>

                    <div
                      className="flex flex-col-reverse items-center"
                      style={{ "--tx": "0px", "--rot": "0deg" } as any}
                    >
                      {[0, 1, 2].map((i) => (
                        <div
                          key={i}
                          className="bundle w-20 h-5 bg-gradient-to-b from-[#22c55e] to-[#15803d] border border-[#14532d] rounded-sm relative mb-[-4px]"
                          style={{
                            animationDelay: `${80 + i * 40}ms`,
                            zIndex: 10 - i,
                          }}
                        >
                          <div className="absolute inset-y-0 left-1/4 w-[1px] bg-black opacity-10" />
                          <div className="absolute inset-y-0 right-1/4 w-[1px] bg-black opacity-10" />
                          <div className="absolute inset-y-0 left-1/2 -translate-x-1/2 w-4 bg-[#facc15] opacity-40 shadow-sm" />
                        </div>
                      ))}
                    </div>

                    <div
                      className="flex flex-col-reverse items-center mb-1"
                      style={{ "--tx": "80px", "--rot": "25deg" } as any}
                    >
                      {[0, 1].map((i) => (
                        <div
                          key={i}
                          className="bundle w-14 h-4 bg-gradient-to-b from-[#22c55e] to-[#15803d] border border-[#14532d] rounded-sm relative mb-[-3px]"
                          style={{
                            animationDelay: `${160 + i * 40}ms`,
                            zIndex: 5 - i,
                          }}
                        >
                          <div className="absolute inset-y-0 left-1/4 w-[1px] bg-black opacity-10" />
                          <div className="absolute inset-y-0 right-1/4 w-[1px] bg-black opacity-10" />
                          <div className="absolute inset-y-0 left-1/2 -translate-x-1/2 w-3 bg-[#facc15] opacity-40 shadow-sm" />
                        </div>
                      ))}
                    </div>
                  </div>

                  <div
                    className={`absolute bottom-3 sm:bottom-4 left-1/2 -translate-x-1/2 flex items-end justify-center ${result === "lose" ? "bomb-pop" : ""}`}
                  >
                    <div className="flex gap-1 items-end relative">
                      {[0, 1, 2].map((i) => (
                        <div
                          key={i}
                          className="w-5 h-20 sm:w-6 sm:h-24 bg-gradient-to-r from-red-700 via-red-600 to-red-800 rounded-sm border-x border-red-900 shadow-md relative flex items-center justify-center overflow-hidden"
                        >
                          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 rotate-90 text-[10px] font-black text-red-950 opacity-40 select-none">
                            TNT
                          </div>
                          <div className="absolute top-0 left-0 right-0 h-1 bg-red-900 opacity-30" />
                        </div>
                      ))}

                      <div className="absolute top-1/5 left-[-2px] right-[-2px] h-3 sm:h-4 bg-[#1a1a1a] border-y border-black shadow-sm z-10" />
                      <div className="absolute bottom-1/5 left-[-2px] right-[-2px] h-3 sm:h-4 bg-[#1a1a1a] border-y border-black shadow-sm z-10" />

                      <div className="absolute -top-4 left-1/2 -translate-x-1/2 w-8 h-4 flex justify-between px-1">
                        {[0, 1, 2].map((i) => (
                          <div
                            key={i}
                            className="w-[2px] h-full bg-[#713f12] origin-bottom"
                            style={{ transform: `rotate(${(i - 1) * 15}deg)` }}
                          />
                        ))}
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <div className="w-full max-w-md mt-2">
              <div className="flex items-center justify-center gap-2 sm:gap-3">
                {Array.from({ length: CHAMBER_COUNT }).map((_, i) => {
                  const isPast = i < currentStep;
                  const isCurrent =
                    i === currentStep && gameState === "playing";
                  const isBullet = chambers[i];
                  const showActual = revealed;

                  let colorClass = "bg-[#1a2c38] border-[#3f5666]";
                  if (showActual) {
                    colorClass = isBullet
                      ? "bg-red-500 border-red-400"
                      : "bg-[#00e701] border-[#00c201]";
                  } else if (isPast) {
                    colorClass =
                      "bg-[#00e701] border-[#00c201] opacity-60";
                  } else if (isCurrent) {
                    colorClass =
                      "bg-[#1a2c38] border-[#00e701] animate-pulse scale-110";
                  }

                  return (
                    <div
                      key={i}
                      className={`w-5 h-5 sm:w-6 sm:h-6 rounded-full border-2 transition-all duration-300 ${colorClass}`}
                    />
                  );
                })}
              </div>
            </div>
          </div>
        </div>

        <GameRecordsPanel gameId="russianroulette" />
      </div>
    </div>
  );
}
