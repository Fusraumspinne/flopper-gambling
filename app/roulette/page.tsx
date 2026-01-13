"use client";

import React, {
  useState,
  useEffect,
  useRef,
  useLayoutEffect,
  useCallback,
} from "react";
import { useWallet } from "@/components/WalletProvider";
import { useSoundVolume } from "@/components/SoundVolumeProvider";
import GameRecordsPanel from "@/components/GameRecordsPanel";
import { Delete, PlayArrow, Refresh } from "@mui/icons-material";

const WHEEL_NUMBERS = [
  0, 32, 15, 19, 4, 21, 2, 25, 17, 34, 6, 27, 13, 36, 11, 30, 8, 23, 10, 5, 24,
  16, 33, 1, 20, 14, 31, 9, 22, 18, 29, 7, 28, 12, 35, 3, 26,
];

const RED_NUMBERS = [
  1, 3, 5, 7, 9, 12, 14, 16, 18, 19, 21, 23, 25, 27, 30, 32, 34, 36,
];

const getNumberColor = (n: number) => {
  if (n === 0) return "green";
  return RED_NUMBERS.includes(n) ? "red" : "black";
};

type BetType = "number" | "color" | "parity" | "range" | "dozen" | "column";

type Bet = {
  type: BetType;
  value: string | number;
  amount: number;
};

type BoardCell = {
  label: React.ReactNode;
  value: any;
  type: BetType;
  color?: string;
  gridArea?: string;
  extraClass?: string;
};

const easeOutCubic = (x: number): number => {
  return 1 - Math.pow(1 - x, 3);
};

const normalizeMoney = (value: number): number => {
  if (!Number.isFinite(value)) return 0;
  const rounded = Math.round((value + Number.EPSILON) * 100) / 100;
  return Object.is(rounded, -0) ? 0 : rounded;
};

export default function RoulettePage() {
  const { balance, subtractFromBalance, addToBalance, finalizePendingLoss } =
    useWallet();
  const { volume } = useSoundVolume();

  const [betAmount, setBetAmount] = useState<number>(100);
  const [bets, setBets] = useState<Bet[]>([]);
  const [isSpinning, setIsSpinning] = useState(false);
  const [lastResult, setLastResult] = useState<number | null>(null);
  const [lastPayout, setLastPayout] = useState(0);
  const [lastWonDisplay, setLastWonDisplay] = useState(0);

  const totalBet = bets.reduce((acc, b) => acc + b.amount, 0);

  const [resultFx, setResultFx] = useState<"rolling" | "win" | "lose" | null>(
    null
  );
  const resultTimeoutRef = useRef<number | null>(null);
  const spinFinishTimeoutRef = useRef<number | null>(null);
  const dropTimeoutRef = useRef<number | null>(null);

  const wheelRef = useRef<HTMLDivElement>(null);
  const currentRotationRef = useRef(0);
  const spinStartRotationRef = useRef(0);
  const spinTargetRotationRef = useRef(0);
  const spinStartTimeRef = useRef(0);
  const isSpinningRef = useRef(false);

  const ballWrapperRef = useRef<HTMLDivElement>(null);
  const ballDotRef = useRef<HTMLDivElement>(null);
  const ballAnimRef = useRef<{
    startTime: number;
    durationMs: number;
    dropStartMs: number;
    endAngleDeg: number;
    numberAngleOnWheel?: number;
    rimRadiusPx: number;
    pocketRadiusPx: number;
    settleMs: number;
    fadeMs: number;
  } | null>(null);
  const ballFadeStartedRef = useRef(false);
  const [isBallMounted, setIsBallMounted] = useState(false);

  const audioRef = useRef({
    bet: new Audio("/sounds/Bet.mp3"),
    win: new Audio("/sounds/Win.mp3"),
    rouletteSpin: new Audio("/sounds/RouletteSpin.mp3"),
    rouletteDrop: new Audio("/sounds/RouletteDrop.mp3"),
    lose: new Audio("/sounds/MinePop.mp3"),
  });

  const playAudio = useCallback(
    (a?: HTMLAudioElement) => {
      if (!a) return;
      if (volume <= 0) return;
      try {
        a.volume = volume;
        a.currentTime = 0;
        void a.play();
      } catch (e) {}
    },
    [volume]
  );

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

  useEffect(() => {
    return () => {
      if (resultTimeoutRef.current) {
        clearTimeout(resultTimeoutRef.current);
        resultTimeoutRef.current = null;
      }
      if (spinFinishTimeoutRef.current) {
        clearTimeout(spinFinishTimeoutRef.current);
        spinFinishTimeoutRef.current = null;
      }
      if (dropTimeoutRef.current) {
        clearTimeout(dropTimeoutRef.current);
        dropTimeoutRef.current = null;
      }
    };
  }, []);

  const showFx = useCallback((fx: "win" | "lose") => {
    if (resultTimeoutRef.current) {
      clearTimeout(resultTimeoutRef.current);
      resultTimeoutRef.current = null;
    }
    setResultFx(fx);
    resultTimeoutRef.current = window.setTimeout(() => {
      setResultFx(null);
      resultTimeoutRef.current = null;
    }, 900);
  }, []);

  const WHEEL_DEG_PER_SEC = 60;

  const clamp01 = (x: number) => Math.min(1, Math.max(0, x));
  const smoothstep = (x: number) => x * x * (3 - 2 * x);

  useLayoutEffect(() => {
    let animationFrameId: number;
    let lastTime = performance.now();

    const animate = () => {
      const now = performance.now();
      const deltaMs = now - lastTime;
      lastTime = now;

      currentRotationRef.current -= WHEEL_DEG_PER_SEC * (deltaMs / 1000);

      if (wheelRef.current) {
        wheelRef.current.style.transform = `rotate(${currentRotationRef.current}deg)`;
      }

      const ballAnim = ballAnimRef.current;
      if (ballAnim && ballWrapperRef.current && ballDotRef.current) {
        const elapsed = now - ballAnim.startTime;
        const duration = ballAnim.durationMs;
        const dropStart = ballAnim.dropStartMs;

        if (elapsed < duration) {
          const p = clamp01(elapsed / duration);
          const angleDeg = ballAnim.endAngleDeg * easeOutCubic(p);
          ballWrapperRef.current.style.transform = `rotate(${angleDeg}deg)`;

          let radiusPx = ballAnim.rimRadiusPx;
          if (elapsed >= dropStart) {
            const u = clamp01((elapsed - dropStart) / (duration - dropStart));
            const base =
              ballAnim.rimRadiusPx +
              (ballAnim.pocketRadiusPx - ballAnim.rimRadiusPx) * smoothstep(u);
            const bounceAmplitude = 14 * (1 - u);
            const bounce = bounceAmplitude * Math.sin(u * Math.PI * 6);
            radiusPx = base + bounce;
          }
          radiusPx = Math.min(
            ballAnim.rimRadiusPx,
            Math.max(ballAnim.pocketRadiusPx - 25, radiusPx)
          );
          ballDotRef.current.style.transform = `translateY(-${radiusPx}px)`;
        } else {
          const wheelRot = currentRotationRef.current;
          const lockedAngle = wheelRot + (ballAnim.numberAngleOnWheel || 0);
          ballWrapperRef.current.style.transform = `rotate(${lockedAngle}deg)`;
          ballDotRef.current.style.transform = `translateY(-${ballAnim.pocketRadiusPx}px)`;

          const fadeStartAt = duration + ballAnim.settleMs;
          const hideAt = fadeStartAt + ballAnim.fadeMs;

          if (elapsed >= fadeStartAt && !ballFadeStartedRef.current) {
            ballFadeStartedRef.current = true;
            ballWrapperRef.current.style.opacity = "0";
            ballWrapperRef.current.style.transition = `opacity ${ballAnim.fadeMs}ms ease`;
          }

          if (elapsed >= hideAt) {
            ballAnimRef.current = null;
            setIsBallMounted(false);
          }
        }
      }

      animationFrameId = requestAnimationFrame(animate);
    };

    animationFrameId = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(animationFrameId);
  }, []);

  const placeBet = (type: BetType, value: string | number) => {
    if (isSpinning) return;

    playAudio(audioRef.current.bet);

    setBets((prev) => {
      const existing = prev.find((b) => b.type === type && b.value === value);
      if (existing) {
        return prev.map((b) =>
          b === existing ? { ...b, amount: b.amount + betAmount } : b
        );
      } else {
        return [...prev, { type, value, amount: betAmount }];
      }
    });
  };

  const clearBets = () => {
    if (isSpinning) return;
    setBets([]);
  };

  const spin = async () => {
    const totalBetNow = bets.reduce((acc, b) => acc + b.amount, 0);
    if (isSpinning || totalBetNow <= 0) return;
    if (totalBetNow > balance) {
      alert("Insufficient balance!");
      return;
    }

    if (resultTimeoutRef.current) {
      clearTimeout(resultTimeoutRef.current);
      resultTimeoutRef.current = null;
    }
    if (spinFinishTimeoutRef.current) {
      clearTimeout(spinFinishTimeoutRef.current);
      spinFinishTimeoutRef.current = null;
    }
    if (dropTimeoutRef.current) {
      clearTimeout(dropTimeoutRef.current);
      dropTimeoutRef.current = null;
    }

    setResultFx("rolling");
    playAudio(audioRef.current.bet);

    const betsSnapshot = bets.slice();
    subtractFromBalance(totalBetNow);
    setIsSpinning(true);
    isSpinningRef.current = true;
    setLastResult(null);
    setLastPayout(0);
    setLastWonDisplay(0);

    const resultIndex = Math.floor(Math.random() * 37);
    const resultNumber = WHEEL_NUMBERS[resultIndex];

    const DURATION_SECONDS = 5;

    const predictedWheelRot =
      currentRotationRef.current - WHEEL_DEG_PER_SEC * DURATION_SECONDS;

    const segmentAngle = 360 / 37;
    const numberAngleOnWheel = resultIndex * segmentAngle;

    const targetWorldAngle = predictedWheelRot + numberAngleOnWheel;

    const baseAngle = ((targetWorldAngle % 360) + 360) % 360;

    const extraSpins = 360 * 4;
    const finalBallRot = baseAngle + extraSpins;

    setIsBallMounted(true);
    ballFadeStartedRef.current = false;
    ballAnimRef.current = {
      startTime: performance.now(),
      durationMs: DURATION_SECONDS * 1000,
      dropStartMs: DURATION_SECONDS * 1000 * 0.65,
      endAngleDeg: finalBallRot,
      numberAngleOnWheel: numberAngleOnWheel,
      rimRadiusPx: 155,
      pocketRadiusPx: 114,
      settleMs: 0,
      fadeMs: 0,
    };
    if (ballWrapperRef.current) {
      ballWrapperRef.current.style.opacity = "1";
      ballWrapperRef.current.style.transition = "opacity 250ms ease";
      ballWrapperRef.current.style.transform = "rotate(0deg)";
    }
    if (ballDotRef.current) {
      ballDotRef.current.style.transform = "translateY(-155px)";
    }

    playAudio(audioRef.current.rouletteSpin);

    dropTimeoutRef.current = window.setTimeout(() => {
      playAudio(audioRef.current.rouletteDrop);
    }, DURATION_SECONDS * 1000 * 0.65);

    spinFinishTimeoutRef.current = window.setTimeout(() => {
      setIsSpinning(false);
      isSpinningRef.current = false;
      setLastResult(resultNumber);

      let totalWin = 0;
      let totalLost = 0;
      betsSnapshot.forEach((bet) => {
        let won = false;
        let multiplier = 0;

        if (bet.type === "number") {
          if (bet.value === resultNumber) {
            won = true;
            multiplier = 36;
          }
        } else if (bet.type === "color") {
          const color = getNumberColor(resultNumber);
          if (bet.value === color) {
            won = true;
            multiplier = 2;
          }
        } else if (bet.type === "parity") {
          if (resultNumber !== 0) {
            const isEven = resultNumber % 2 === 0;
            if (
              (bet.value === "even" && isEven) ||
              (bet.value === "odd" && !isEven)
            ) {
              won = true;
              multiplier = 2;
            }
          }
        } else if (bet.type === "range") {
          if (resultNumber !== 0) {
            if (bet.value === "1-18" && resultNumber <= 18) {
              won = true;
              multiplier = 2;
            } else if (bet.value === "19-36" && resultNumber >= 19) {
              won = true;
              multiplier = 2;
            }
          }
        } else if (bet.type === "dozen") {
          if (resultNumber !== 0) {
            if (bet.value === "1st 12" && resultNumber <= 12) {
              won = true;
              multiplier = 3;
            } else if (
              bet.value === "2nd 12" &&
              resultNumber > 12 &&
              resultNumber <= 24
            ) {
              won = true;
              multiplier = 3;
            } else if (bet.value === "3rd 12" && resultNumber > 24) {
              won = true;
              multiplier = 3;
            }
          }
        } else if (bet.type === "column") {
          if (resultNumber !== 0) {
            const col = resultNumber % 3;
            if (bet.value === "col1" && col === 1) {
              won = true;
              multiplier = 3;
            }
            if (bet.value === "col2" && col === 2) {
              won = true;
              multiplier = 3;
            }
            if (bet.value === "col3" && col === 0) {
              won = true;
              multiplier = 3;
            }
          }
        }

        if (won) {
          totalWin += bet.amount * multiplier;
        } else {
          totalLost += bet.amount;
        }
      });

      const payout = normalizeMoney(totalWin);
      const netProfit = normalizeMoney(payout - totalBetNow);
      setLastPayout(payout);
      setLastWonDisplay(normalizeMoney(payout - totalLost));

      if (payout > 0) {
        addToBalance(payout);
      } else {
        finalizePendingLoss();
      }

      if (netProfit > 0) {
        playAudio(audioRef.current.win);
        showFx("win");
      } else if (netProfit < 0) {
        playAudio(audioRef.current.lose);
        showFx("lose");
      } else {
        showFx("win");
      }
    }, DURATION_SECONDS * 1000);
  };

  const renderNumberCell = (n: number) => {
    const color = getNumberColor(n);
    const bg =
      color === "red"
        ? "bg-[#ff0000]"
        : color === "black"
        ? "bg-[#2f4553]"
        : "bg-green-600";
    const bet = bets.find((b) => b.type === "number" && b.value === n);

    return (
      <div
        key={n}
        className={`${bg} text-white font-bold cursor-pointer border border-[#1a2c38] h-8 sm:h-12 hover:brightness-110 transition-all select-none rounded-md shadow-sm active:scale-95 flex flex-col items-center justify-center leading-none`}
        onClick={() => placeBet("number", n)}
      >
        <div
          className={`text-[10px] sm:text-[11px] md:text-xs transition-transform duration-150 ${
            bet ? "-translate-y-1" : ""
          }`}
        >
          {n}
        </div>
        {bet ? (
          <div className="h-3 text-[8px] sm:text-[9px] md:text-[10px] font-mono text-white font-semibold">
            ${bet.amount}
          </div>
        ) : null}
      </div>
    );
  };

  const rowTop = [3, 6, 9, 12, 15, 18, 21, 24, 27, 30, 33, 36];
  const rowMid = [2, 5, 8, 11, 14, 17, 20, 23, 26, 29, 32, 35];
  const rowBot = [1, 4, 7, 10, 13, 16, 19, 22, 25, 28, 31, 34];

  const segmentAngle = 360 / 37;
  const conicGradient = `conic-gradient(from -${
    segmentAngle / 2
  }deg, ${WHEEL_NUMBERS.map((n, i) => {
    const color =
      n === 0 ? "#16a34a" : RED_NUMBERS.includes(n) ? "#ff0000" : "#2f4553";
    const start = i * segmentAngle;
    const end = (i + 1) * segmentAngle;
    return `${color} ${start}deg ${end}deg`;
  }).join(", ")})`;

  const wheelBackground = `radial-gradient(circle at 50% 50%, rgba(0,0,0,0) 0 60%, rgba(0,0,0,0.22) 60% 100%), ${conicGradient}`;

  const renderBetBox = (
    label: string,
    type: BetType,
    value: string | number,
    className: string
  ) => {
    const bet = bets.find((b) => b.type === type && b.value === value);
    return (
      <div
        className={`${className} cursor-pointer border border-[#1a2c38] hover:brightness-110 transition-all select-none rounded-md shadow-sm active:scale-95 flex flex-col items-center justify-center font-bold text-xs sm:text-sm leading-none`}
        onClick={() => placeBet(type, value)}
      >
        <div
          className={`text-[10px] sm:text-[11px] md:text-xs transition-transform duration-150 ${
            bet ? "-translate-y-1" : ""
          } ${label ? "" : "opacity-0"}`}
        >
          {label || "_"}
        </div>
        {bet ? (
          <div className="h-3 text-[8px] sm:text-[9px] md:text-[10px] font-mono text-white font-semibold">
            ${bet.amount}
          </div>
        ) : null}
      </div>
    );
  };

  return (
    <div className="p-2 sm:p-4 lg:p-6 max-w-350 mx-auto flex flex-col lg:flex-row items-start gap-4 lg:gap-8">
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
              value={betAmount || ""}
              onChange={(e) =>
                setBetAmount(parseInt(e.target.value) || 0)
              }
              disabled={isSpinning}
              className="w-full bg-[#0f212e] border border-[#2f4553] rounded-md py-2 pl-7 pr-4 text-white font-mono focus:outline-none focus:border-[#00e701] transition-colors disabled:opacity-50"
            />
          </div>
          <div className="grid grid-cols-3 gap-2 mt-2">
            <button
              onClick={() =>
                setBetAmount(Math.max(1, Math.floor(betAmount / 2)))
              }
              disabled={isSpinning}
              className="bg-[#2f4553] hover:bg-[#3e5666] text-xs py-1 rounded text-[#b1bad3] disabled:opacity-50"
            >
              ½
            </button>
            <button
              onClick={() => setBetAmount(Math.min(balance, betAmount * 2))}
              disabled={isSpinning}
              className="bg-[#2f4553] hover:bg-[#3e5666] text-xs py-1 rounded text-[#b1bad3] disabled:opacity-50"
            >
              2×
            </button>
            <button
              onClick={() => setBetAmount(Math.max(1, balance))}
              disabled={isSpinning}
              className="bg-[#2f4553] hover:bg-[#3e5666] text-xs py-1 rounded text-[#b1bad3] disabled:opacity-50"
            >
              All In
            </button>
          </div>
        </div>

        <div className="flex justify-between items-center text-[#b1bad3]">
          <span className="font-bold uppercase text-xs">Total Bet</span>
          <span className="font-mono text-white text-sm">${totalBet}</span>
        </div>

        <button
          onClick={clearBets}
          disabled={isSpinning || bets.length === 0}
          className="w-full bg-[#2f4553] hover:bg-[#3e5666] text-white py-2 rounded-md font-bold text-xs disabled:opacity-50 flex items-center justify-center gap-2"
        >
          <Delete fontSize="small" /> Clear
        </button>

        <button
          onClick={spin}
          disabled={isSpinning || totalBet === 0}
          className="w-full bg-[#00e701] hover:bg-[#00c201] text-black py-3 rounded-md font-bold text-lg shadow-[0_0_20px_rgba(0,231,1,0.2)] transition-all active:scale-95 flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {isSpinning ? (
            <Refresh className="animate-spin" />
          ) : (
            <PlayArrow />
          )}
          {isSpinning ? "Playing..." : "Bet"}
        </button>

        {lastWonDisplay > 0 && !isSpinning && (
          <div className="p-4 bg-[#213743] border border-[#00e701] rounded-md text-center">
            <div className="text-xs text-[#b1bad3] uppercase">You Won</div>
            <div className="text-xl font-bold text-[#00e701]">${lastWonDisplay.toFixed(2)}</div>
          </div>
        )}
      </div>

      <div className="w-full flex-1 min-w-0 flex flex-col gap-4">
        <div className="flex-1 bg-[#0f212e] p-4 rounded-xl flex flex-col items-center gap-8 overflow-hidden min-h-125 relative">
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
          <div className="relative w-full max-w-[320px] aspect-square flex items-center justify-center shrink-0">
            <div className="relative rounded-full border-8 border-zinc-800 shadow-2xl overflow-hidden bg-zinc-900 flex items-center justify-center w-full h-full">
              <div
                ref={wheelRef}
                className="absolute inset-0 rounded-full will-change-transform"
                style={{
                  background: wheelBackground,
                }}
              >
                {WHEEL_NUMBERS.map((n, i) => {
                  const angle = (360 / 37) * i;
                  const color = getNumberColor(n);
                  return (
                    <div
                      key={n}
                      className="absolute w-8 h-[50%] left-[calc(50%-1rem)] top-0 origin-bottom flex justify-center pt-1"
                      style={{ transform: `rotate(${angle}deg)` }}
                    >
                      <span
                        className={`text-xs font-bold ${
                          color === "black" ? "text-white" : "text-white"
                        }`}
                      >
                        {n}
                      </span>
                      {!isSpinning && lastResult === n && (
                        <div className="absolute top-8.5 w-3 h-3 bg-white rounded-full shadow-[0_0_5px_rgba(0,0,0,0.5)] z-20"></div>
                      )}
                    </div>
                  );
                })}
              </div>

              <div className="absolute w-48 h-48 bg-zinc-900 rounded-full z-10 flex items-center justify-center border-4 border-zinc-700 shadow-inner"></div>

              {lastResult !== null && !isSpinning && (
                <div className="absolute inset-0 flex items-center justify-center bg-transparent z-30 rounded-full pointer-events-none">
                  <span
                    className={`text-4xl font-bold drop-shadow-md ${
                      getNumberColor(lastResult) === "red"
                        ? "text-red-500"
                        : getNumberColor(lastResult) === "black"
                        ? "text-white"
                        : "text-green-500"
                    } leading-none text-center`}
                    style={{ transform: "none" }}
                  >
                    {lastResult}
                  </span>
                </div>
              )}
            </div>

            {isBallMounted && (
              <div
                ref={ballWrapperRef}
                className="absolute inset-0 z-40 pointer-events-none flex justify-center items-center"
              >
                <div
                  ref={ballDotRef}
                  className="w-3 h-3 bg-white rounded-full shadow-[0_0_5px_rgba(0,0,0,0.5)]"
                />
              </div>
            )}
          </div>

          <div className="w-full pb-2">
            <div className="grid grid-cols-[44px_repeat(12,minmax(0,1fr))_44px] sm:grid-cols-[60px_repeat(12,minmax(0,1fr))_60px] gap-0.5 sm:gap-1 select-none w-full">
              <div
                className={`col-start-1 row-start-1 row-span-3 bg-green-600 rounded-md flex items-center justify-center text-white font-bold cursor-pointer hover:brightness-110 border border-[#1a2c38] relative transition-all active:scale-95 shadow-sm`}
                onClick={() => placeBet("number", 0)}
              >
                {(() => {
                  const bet0 = bets.find(
                    (b) => b.type === "number" && b.value === 0
                  );
                  return (
                    <div className="flex flex-col items-center justify-center leading-none">
                      <div
                        className={`text-[10px] sm:text-[11px] md:text-xs transition-transform duration-150 ${
                          bet0 ? "-translate-y-1" : ""
                        }`}
                      >
                        0
                      </div>
                      {bet0 ? (
                        <div className="h-3 text-[8px] sm:text-[9px] md:text-[10px] font-mono text-white">
                          ${bet0.amount}
                        </div>
                      ) : null}
                    </div>
                  );
                })()}
              </div>

              {rowTop.map((n) => renderNumberCell(n))}
              {renderBetBox("2:1", "column", "col3", "bg-[#2f4553] text-white")}

              {rowMid.map((n) => renderNumberCell(n))}
              {renderBetBox("2:1", "column", "col2", "bg-[#2f4553] text-white")}

              {rowBot.map((n) => renderNumberCell(n))}
              {renderBetBox("2:1", "column", "col1", "bg-[#2f4553] text-white")}

              <div className="col-start-2 col-span-4">
                {renderBetBox(
                  "1 to 12",
                  "dozen",
                  "1st 12",
                  "w-full h-8 sm:h-12 bg-[#2f4553] text-white"
                )}
              </div>
              <div className="col-start-6 col-span-4">
                {renderBetBox(
                  "13 to 24",
                  "dozen",
                  "2nd 12",
                  "w-full h-8 sm:h-12 bg-[#2f4553] text-white"
                )}
              </div>
              <div className="col-start-10 col-span-4">
                {renderBetBox(
                  "25 to 36",
                  "dozen",
                  "3rd 12",
                  "w-full h-8 sm:h-12 bg-[#2f4553] text-white"
                )}
              </div>

              <div className="col-start-2 col-span-2">
                {renderBetBox(
                  "1 to 18",
                  "range",
                  "1-18",
                  "w-full h-8 sm:h-12 bg-[#2f4553] text-white"
                )}
              </div>
              <div className="col-start-4 col-span-2">
                {renderBetBox(
                  "Even",
                  "parity",
                  "even",
                  "w-full h-8 sm:h-12 bg-[#2f4553] text-white"
                )}
              </div>
              <div className="col-start-6 col-span-2">
                {renderBetBox(
                  "Red",
                  "color",
                  "red",
                  "w-full h-8 sm:h-12 bg-[#ff0000] text-white"
                )}
              </div>
              <div className="col-start-8 col-span-2">
                {renderBetBox(
                  "Black",
                  "color",
                  "black",
                  "w-full h-8 sm:h-12 bg-[#2f4553] text-white"
                )}
              </div>
              <div className="col-start-10 col-span-2">
                {renderBetBox(
                  "Odd",
                  "parity",
                  "odd",
                  "w-full h-8 sm:h-12 bg-[#2f4553] text-white"
                )}
              </div>
              <div className="col-start-12 col-span-2">
                {renderBetBox(
                  "19 to 36",
                  "range",
                  "19-36",
                  "w-full h-8 sm:h-12 bg-[#2f4553] text-white"
                )}
              </div>
            </div>
          </div>
        </div>

        <GameRecordsPanel gameId="roulette" />
      </div>
    </div>
  );
}
