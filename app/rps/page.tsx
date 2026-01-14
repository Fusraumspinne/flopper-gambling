"use client";

import React, { useState, useEffect, useRef } from "react";
import { useWallet } from "@/components/WalletProvider";
import { useSoundVolume } from "@/components/SoundVolumeProvider";
import { PlayArrow } from "@mui/icons-material";
import GameRecordsPanel from "@/components/GameRecordsPanel";

type Choice = "rock" | "paper" | "scissors";
type GameResult = "win" | "lose" | "draw";
type GameState = "idle" | "playing" | "cashed_out" | "lost";

type RoundData = {
  result: GameResult;
  user: Choice;
  computer: Choice;
};

const HOUSE_EDGE_MULTIPLIER = 1.98;
const CHOICES: Choice[] = ["rock", "paper", "scissors"];

export default function RPSPage() {
  const { balance, subtractFromBalance, addToBalance, finalizePendingLoss } =
    useWallet();

  const { volume } = useSoundVolume();

  const [betAmount, setBetAmount] = useState<number>(100);
  const [betInput, setBetInput] = useState<string>("100");
  const [gameState, setGameState] = useState<GameState>("idle");
  const [streak, setStreak] = useState<number>(0);
  const [history, setHistory] = useState<RoundData[]>([]);
  const [isProcessing, setIsProcessing] = useState<boolean>(false);
  const [isLocked, setIsLocked] = useState<boolean>(false);
  const [activeStepIndex, setActiveStepIndex] = useState<number | null>(null);

  const [userChoice, setUserChoice] = useState<Choice | null>(null);
  const [computerChoice, setComputerChoice] = useState<Choice | null>(null);
  const [lastResult, setLastResult] = useState<GameResult | null>(null);
  const [lastWin, setLastWin] = useState<number>(0);
  const [resultFx, setResultFx] = useState<"rolling" | "win" | "lose" | null>(
    null
  );
  const resultTimeoutRef = useRef<number | null>(null);

  const audioRef = useRef<{
    bet: HTMLAudioElement | null;
    win: HTMLAudioElement | null;
    limboLose: HTMLAudioElement | null;
    flipCards: HTMLAudioElement | null;
  }>({ bet: null, win: null, limboLose: null, flipCards: null });

  const playAudio = (a: HTMLAudioElement | null) => {
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
    } catch (e) {}
  };

  useEffect(() => {
    if (volume <= 0) return;

    if (!audioRef.current.bet) {
      audioRef.current = {
        bet: new Audio("/sounds/Bet.mp3"),
        win: new Audio("/sounds/Win.mp3"),
        limboLose: new Audio("/sounds/LimboLose.mp3"),
        flipCards: new Audio("/sounds/FlipCards.mp3"),
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
      if (resultTimeoutRef.current) {
        clearTimeout(resultTimeoutRef.current);
        resultTimeoutRef.current = null;
      }
    };
  }, []);

  const currentMultiplier = Math.pow(HOUSE_EDGE_MULTIPLIER, streak);
  const nextMultiplier = Math.pow(HOUSE_EDGE_MULTIPLIER, streak + 1);
  const currentPayout = betAmount * currentMultiplier;
  const nextPayout = betAmount * nextMultiplier;

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

  const placeBet = () => {
    if (balance <= 0) return;

    let actualBet = betAmount;
    if (betAmount > balance) {
      actualBet = Number(balance.toFixed(2));
      setBetAmount(actualBet);
      setBetInput(String(actualBet));
    }

    subtractFromBalance(actualBet);
    playAudio(audioRef.current.bet);
    setGameState("playing");
    setStreak(0);
    setHistory([]);
    setLastWin(0);
    setIsLocked(false);
    setActiveStepIndex(null);
    setUserChoice(null);
    setComputerChoice(null);
    setLastResult(null);
  };

  const startGame = (choice: Choice) => {
    if (balance <= 0) return;

    let actualBet = betAmount;
    if (betAmount > balance) {
      actualBet = Number(balance.toFixed(2));
      setBetAmount(actualBet);
      setBetInput(String(actualBet));
    }

    subtractFromBalance(actualBet);
    playAudio(audioRef.current.bet);
    setGameState("playing");
    setStreak(0);
    setHistory([]);
    setLastWin(0);
    setIsLocked(false);
    setActiveStepIndex(null);
    setUserChoice(null);
    setComputerChoice(null);
    setLastResult(null);
    playRound(choice);
  };

  const continueGame = (choice: Choice) => {
    if (gameState !== "playing") return;
    playRound(choice);
  };

  const getComputerChoice = (): Choice => {
    const randomIndex = Math.floor(Math.random() * CHOICES.length);
    return CHOICES[randomIndex];
  };

  const determineWinner = (user: Choice, computer: Choice): GameResult => {
    if (user === computer) return "draw";
    if (
      (user === "rock" && computer === "scissors") ||
      (user === "paper" && computer === "rock") ||
      (user === "scissors" && computer === "paper")
    ) {
      return "win";
    }
    return "lose";
  };

  const playRound = async (choice: Choice) => {
    if (isProcessing || isLocked) return;

    const stepIndex = streak;
    setIsProcessing(true);
    setActiveStepIndex(stepIndex);
    setUserChoice(choice);
    setComputerChoice(null);
    setLastResult(null);
    if (resultTimeoutRef.current) {
      clearTimeout(resultTimeoutRef.current);
      resultTimeoutRef.current = null;
    }
    setResultFx("rolling");

    await new Promise((resolve) => setTimeout(resolve, 600));

    const compChoice = getComputerChoice();
    setComputerChoice(compChoice);
    playAudio(audioRef.current.flipCards);

    const result = determineWinner(choice, compChoice);
    setLastResult(result);
    setResultFx(null);
    setIsProcessing(false);

    if (result === "win") {
      setIsLocked(true);
      setHistory((prev) => {
        const next = [...prev];
        next[stepIndex] = { result, user: choice, computer: compChoice };
        return next;
      });
      setStreak((prev) => prev + 1);
      setResultFx("win");
      if (resultTimeoutRef.current) {
        clearTimeout(resultTimeoutRef.current);
      }
      resultTimeoutRef.current = window.setTimeout(() => {
        setResultFx(null);
        setComputerChoice(null);
        setUserChoice(null);
        setLastResult(null);
        setActiveStepIndex(null);
        setIsLocked(false);
      }, 600);
    } else if (result === "draw") {
      // Do not advance and do not commit to history; flip back to covered and allow retry.
      setIsLocked(true);
      if (resultTimeoutRef.current) {
        clearTimeout(resultTimeoutRef.current);
      }
      resultTimeoutRef.current = window.setTimeout(() => {
        setComputerChoice(null);
        setUserChoice(null);
        setLastResult(null);
        setActiveStepIndex(null);
        setResultFx(null);
        setIsLocked(false);
      }, 700);
    } else if (result === "lose") {
      setGameState("lost");
      finalizePendingLoss();
      if (resultTimeoutRef.current) {
        clearTimeout(resultTimeoutRef.current);
      }
      playAudio(audioRef.current.limboLose);
      setResultFx("lose");
      resultTimeoutRef.current = window.setTimeout(() => {
        setResultFx(null);
        setGameState("idle"); // Reset to idle to slide back to start
        setStreak(0);
        setHistory([]);
        setComputerChoice(null);
        setUserChoice(null);
        setLastResult(null);
        setActiveStepIndex(null);
        setIsLocked(false);
      }, 2000);
    }
  };

  const cashOut = () => {
    if (gameState !== "playing" || streak === 0) return;
    if (isProcessing || isLocked) return;

    addToBalance(currentPayout);
    setLastWin(currentPayout);
    playAudio(audioRef.current.win);
    setGameState("cashed_out");
    if (resultTimeoutRef.current) {
      clearTimeout(resultTimeoutRef.current);
    }
    setResultFx("win");
    resultTimeoutRef.current = window.setTimeout(() => setResultFx(null), 900);
  };

  const getEmoji = (c: Choice | null) => {
    if (!c) return "❓";
    switch (c) {
      case "rock":
        return "🪨";
      case "paper":
        return "📄";
      case "scissors":
        return "✂️";
    }
  };

  return (
    <>
    <main className="p-2 sm:p-4 lg:p-6 max-w-350 mx-auto flex flex-col lg:flex-row items-start gap-4 lg:gap-8">
      <div className="w-full lg:w-60 flex flex-col gap-3 bg-[#0f212e] p-2 sm:p-3 rounded-xl h-fit text-xs self-start">
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
              disabled={gameState === "playing"}
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
            <button
              onClick={() => {
                const newBet = Number(balance.toFixed(2));
                setBetAmount(newBet);
                setBetInput(String(newBet));
              }}
              disabled={gameState === "playing"}
              className="bg-[#2f4553] hover:bg-[#3e5666] text-xs py-1 rounded text-[#b1bad3] disabled:opacity-50"
            >
              All In
            </button>
          </div>
          {gameState !== "playing" && (
            <div className="mt-2">
              <button
                onClick={placeBet}
                disabled={betAmount <= 0}
                className="w-full bg-[#00e701] hover:bg-[#00c201] disabled:opacity-50 disabled:cursor-not-allowed text-black py-3 rounded-md font-bold text-lg shadow-[0_0_20px_rgba(0,231,1,0.2)] transition-all active:scale-95 flex items-center justify-center gap-2"
              >
                <PlayArrow />
                Bet
              </button>
            </div>
          )}
 
          {gameState === "playing" && (
            <div className="flex flex-col mt-2">
              <button
                onClick={cashOut}
                disabled={isProcessing || isLocked || streak === 0}
                className="w-full bg-[#00e701] hover:bg-[#00c201] text-black py-3 rounded-md font-bold text-lg shadow-[0_0_20px_rgba(0,231,1,0.2)] transition-all active:scale-95 flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Cashout
              </button>
            </div>
          )}
        </div>


        {gameState === "playing" && (
          <div className="bg-[#0f212e] p-4 rounded border border-[#2f4553] text-center">
            <div className="text-[#b1bad3] text-sm">Current Win</div>
            <div className="text-2xl font-bold text-[#00e701]">
              ${currentPayout.toFixed(2)}
            </div>
            <div className="text-sm text-[#b1bad3] mt-1">
              Next: {nextMultiplier.toFixed(2)}x
            </div>
          </div>
        )}

        {lastWin > 0 && gameState === "cashed_out" && (
          <div className="p-4 bg-[#213743] border border-[#00e701] rounded-md text-center">
            <div className="text-xs text-[#b1bad3] uppercase">You Won</div>
            <div className="text-xl font-bold text-[#00e701]">
              ${lastWin.toFixed(2)}
            </div>
          </div>
        )}
      </div>

      <div className="flex-1 min-w-0 flex flex-col gap-4">
      <div className="w-full flex flex-col items-center justify-center bg-[#0f212e] rounded-xl p-4 sm:p-8 relative min-h-100 sm:min-h-125 overflow-hidden">
        {resultFx === "rolling" && (
          <div className="limbo-roll-glow absolute inset-0 pointer-events-none z-0" />
        )}
        {resultFx === "win" && (
          <div
            key={`rps-win-${history.length}`}
            className="limbo-win-flash absolute inset-0 pointer-events-none z-0"
          />
        )}
        {resultFx === "lose" && (
          <div
            key={`rps-lose-${history.length}`}
            className="limbo-lose-flash absolute inset-0 pointer-events-none z-0"
          />
        )}

        <div className="relative w-full h-full flex flex-col items-center justify-center z-10 gap-8">
          <div 
            className="w-full overflow-hidden relative h-60"
            style={{ maskImage: 'linear-gradient(to right, transparent, black 10%, black 90%, transparent)', WebkitMaskImage: 'linear-gradient(to right, transparent, black 10%, black 90%, transparent)' }}
          >
            <div
              className="absolute left-1/2 top-8 flex gap-4 transition-transform duration-500 ease-out will-change-transform"
              style={{
                transform: `translateX(calc(-50px - ${streak * 116}px))`,
              }}
            >
              {Array.from({ length: Math.max(streak, history.length) + 8 }).map(
                (_, i) => {
                  const currentStep = streak;
                  const isPast = i < currentStep;
                  const isCurrent = i === currentStep;
                  const isFuture = i > currentStep;
                  const stepMult = Math.pow(HOUSE_EDGE_MULTIPLIER, i + 1);
                  const roundData = history[i];

                  const isRevealingCurrent =
                    isCurrent &&
                    activeStepIndex === i &&
                    (gameState === "playing" || gameState === "lost");
                  const currentResult = isRevealingCurrent ? lastResult : null;

                  const isCovered = isFuture || (isCurrent && !isRevealingCurrent);

                  let borderClass = "border-[#2f4553]";
                  let bgClass = "bg-[#0f212e]";
                  let shadowClass = "";

                  if (isCovered) {
                    bgClass = "bg-[#007bff]";
                    borderClass = "border-[#0056b3]";
                    shadowClass = "shadow-[0_4px_0_#0056b3]";
                  } else if (isCurrent) {
                    bgClass = "bg-[#213743]";
                    borderClass = "border-[#b1bad3]";
                    shadowClass = "shadow-[0_0_30px_rgba(0,0,0,0.5)]";

                    if (currentResult === "win") {
                      borderClass = "border-[#00e701]";
                      shadowClass = "shadow-[0_0_30px_rgba(0,231,1,0.2)]";
                    } else if (currentResult === "lose") {
                      borderClass = "border-red-500";
                      shadowClass = "shadow-[0_0_30px_rgba(239,68,68,0.2)]";
                    } else if (currentResult === "draw") {
                      borderClass = "border-yellow-500";
                      shadowClass = "shadow-[0_0_30px_rgba(234,179,8,0.2)]";
                    }
                  } else if (isPast && roundData) {
                    bgClass = "bg-[#213743]";
                    if (roundData.result === "win") {
                      borderClass = "border-[#00e701]";
                    } else if (roundData.result === "lose") {
                      borderClass = "border-red-500";
                    } else if (roundData.result === "draw") {
                      borderClass = "border-yellow-500";
                    }
                  }

                  return (
                    <div
                      key={i}
                      className="flex flex-col items-center gap-3 w-25 shrink-0 transition-opacity duration-300"
                      style={{ opacity: 1 }}
                    >
                      <div
                        className={`
                    w-25 h-35 rounded-lg border flex items-center justify-center text-4xl shadow-lg transition-all duration-300 relative overflow-hidden
                    ${bgClass} ${borderClass} ${shadowClass}
                    ${isCurrent ? "scale-105 z-10" : ""}
                  `}
                      >
                        {isCovered && (
                          <div className="absolute inset-0 flex items-center justify-center">
                            <div className="w-18 h-26 border-2 border-white/10 rounded flex items-center justify-center transform rotate-12">
                              <span className="text-white/20 font-bold -rotate-12 text-xs">
                                FLOPPER
                              </span>
                            </div>
                          </div>
                        )}

                        {isPast && roundData && (
                          <div className="flex flex-col items-center justify-center gap-1 h-full w-full">
                            <div className="flex flex-col items-center">
                              <span className="emoji-white text-2xl">{getEmoji(roundData.computer)}</span>
                            </div>
                            <div className="w-full h-px bg-white/10 my-1" />
                            <div className="flex flex-col items-center opacity-80">
                              <span className="emoji-white text-2xl">{getEmoji(roundData.user)}</span>
                            </div>
                          </div>
                        )}

                        {isRevealingCurrent && (
                          <div className="flex flex-col items-center justify-center gap-1 h-full w-full">
                            {computerChoice ? (
                              <>
                                <div className="flex flex-col items-center rps-emoji-pop">
                                  <span className="emoji-white text-2xl sm:text-3xl">
                                    {getEmoji(computerChoice)}
                                  </span>
                                </div>
                                <div className="w-full h-px bg-white/10 my-1" />
                                <div className="flex flex-col items-center opacity-80">
                                  <span className="emoji-white text-2xl sm:text-3xl">
                                    {getEmoji(userChoice)}
                                  </span>
                                </div>
                              </>
                            ) : (
                              <div className="w-full h-full bg-[#213743] flex items-center justify-center">
                                <span className="emoji-white opacity-40 text-2xl animate-pulse">❓</span>
                              </div>
                            )}
                          </div>
                        )}
                      </div>

                      <div
                        className={`text-xs font-bold px-3 py-1 rounded-full ${
                          isCurrent
                            ? "bg-[#2f4553] text-white border border-[#b1bad3]"
                            : "text-[#b1bad3]"
                        }`}
                      >
                        {stepMult.toFixed(2)}x
                      </div>
                    </div>
                  );
                }
              )}
            </div>

            {/* Center Indicator */}
            <div className="absolute left-1/2 top-8 -translate-x-1/2 w-27.5 h-37.5 -mt-1.25 pointer-events-none z-20 flex flex-col items-center justify-end">
              <div className="w-0 h-0 border-l-8 border-l-transparent border-r-8 border-r-transparent border-b-12 border-b-white translate-y-10 drop-shadow-[0_0_10px_rgba(255,255,255,0.5)]"></div>
            </div>
          </div>

          {/* Connector Lines */}
           <div className="absolute top-60 left-0 w-full h-15 pointer-events-none z-0">
             <svg width="100%" height="100%" className="overflow-visible">
                <path d="M 50% 0 L 50% 20 L 20% 60" fill="none" stroke="#2f4553" strokeWidth="4" className="opacity-50" />
                <path d="M 50% 0 L 50% 60" fill="none" stroke="#2f4553" strokeWidth="4" className="opacity-50" />
                <path d="M 50% 0 L 50% 20 L 80% 60" fill="none" stroke="#2f4553" strokeWidth="4" className="opacity-50" />
                
                {/* Animated active paths */}
                {gameState === 'playing' && !isProcessing && (
                   <>
                     <path d="M 50% 0 L 50% 20 L 20% 60" fill="none" stroke="#00e701" strokeWidth="2" className="opacity-30 animate-pulse" />
                     <path d="M 50% 0 L 50% 60" fill="none" stroke="#00e701" strokeWidth="2" className="opacity-30 animate-pulse" />
                     <path d="M 50% 0 L 50% 20 L 80% 60" fill="none" stroke="#00e701" strokeWidth="2" className="opacity-30 animate-pulse" />
                   </>
                )}
             </svg>
          </div>

          {/* Controls */}
          <div className="flex gap-4 justify-center items-center relative z-30">
            {CHOICES.map((choice) => (
              <button
                key={choice}
                onClick={() => continueGame(choice)}
                disabled={
                  isProcessing ||
                  isLocked ||
                  gameState !== "playing"
                }
                className={`
                  w-20 h-20 sm:w-24 sm:h-24 rounded-xl bg-[#374151] border-b-4 border-[#1f2937] 
                  hover:bg-[#4b5563] hover:-translate-y-1 active:translate-y-0 active:border-b-0
                  transition-all flex items-center justify-center text-4xl shadow-lg
                  disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:translate-y-0
                  text-white
                `}
              >
                <span className="emoji-white text-2xl sm:text-4xl">{getEmoji(choice)}</span>
              </button>
            ))}
          </div>
        </div>
      </div>

      <GameRecordsPanel gameId="rps" />
      </div>
    </main>
    </>
  );
}
