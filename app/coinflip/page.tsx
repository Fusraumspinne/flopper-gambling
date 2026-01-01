"use client";

import React, { useState } from "react";
import { useWallet } from "@/components/WalletProvider";
import { PlayArrow } from "@mui/icons-material";

type CoinSide = "heads" | "tails";
type GameState = "idle" | "playing" | "cashed_out" | "lost";

const HOUSE_EDGE_MULTIPLIER = 1.98;

export default function CoinFlipPage() {
  const { balance, subtractFromBalance, addToBalance, finalizePendingLoss } =
    useWallet();

  const [betAmount, setBetAmount] = useState<number>(100);
  const [betInput, setBetInput] = useState<string>("100");
  const [gameState, setGameState] = useState<GameState>("idle");
  const [streak, setStreak] = useState<number>(0);
  const [history, setHistory] = useState<CoinSide[]>([]);
  const [isFlipping, setIsFlipping] = useState<boolean>(false);
  const [lastResult, setLastResult] = useState<CoinSide | null>(null);
  const [lastWin, setLastWin] = useState<number>(0);
  const [lastChoice, setLastChoice] = useState<CoinSide | null>(null);
  const [fx, setFx] = useState<"win" | "lose" | null>(null);
  const [fxKey, setFxKey] = useState<number>(0);
  const resultTimeoutRef = React.useRef<number | null>(null);
  const [pendingResult, setPendingResult] = useState<CoinSide | null>(null);
  const [flipKey, setFlipKey] = useState<number>(0);

  const audioRef = React.useRef<{
    bet: HTMLAudioElement | null;
    win: HTMLAudioElement | null;
    limboLose: HTMLAudioElement | null;
    coinflip: HTMLAudioElement | null;
    coin: HTMLAudioElement | null;
  }>({ bet: null, win: null, limboLose: null, coinflip: null, coin: null });

  const playAudio = (a: HTMLAudioElement | null) => {
    if (!a) return;
    try {
      a.currentTime = 0;
      void a.play();
    } catch (e) {}
  };

  React.useEffect(() => {
    audioRef.current = {
      bet: new Audio("/sounds/Bet.mp3"),
      win: new Audio("/sounds/Win.mp3"),
      limboLose: new Audio("/sounds/LimboLose.mp3"),
      coinflip: new Audio("/sounds/Coinflip.mp3"),
      coin: new Audio("/sounds/Coin.mp3"),
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

  const currentMultiplier = Math.pow(HOUSE_EDGE_MULTIPLIER, streak);
  const nextMultiplier = Math.pow(HOUSE_EDGE_MULTIPLIER, streak + 1);
  const currentPayout = betAmount * currentMultiplier;
  const nextPayout = betAmount * nextMultiplier;

  const handleBetInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setBetInput(e.target.value);
  };

  const handleBetInputBlur = () => {
    const raw = betInput.trim();
    const sanitized = raw.replace(/^0+(?=\d)/, "") || "0";
    const num = Number(sanitized);
    setBetAmount(num);
    setBetInput(sanitized);
  };

  const placeBet = () => {
    if (balance < betAmount) return;
    subtractFromBalance(betAmount);
    playAudio(audioRef.current.bet);
    setGameState("playing");
    setStreak(0);
    setHistory([]);
    setLastWin(0);
    setLastChoice(null);
    setFx(null);
  };

  const startGame = (choice: CoinSide) => {
    if (balance < betAmount) return;

    subtractFromBalance(betAmount);
    playAudio(audioRef.current.bet);
    setGameState("playing");
    setStreak(0);
    setHistory([]);
    setLastWin(0);
    setLastChoice(choice);
    setFx(null);
    flipCoin(choice);
  };

  const continueGame = (choice: CoinSide) => {
    if (gameState !== "playing") return;
    setLastChoice(choice);
    flipCoin(choice);
  };

  const flipCoin = async (choice: CoinSide) => {
    if (isFlipping) return;
    setIsFlipping(true);
    setFx(null);

    playAudio(audioRef.current.coinflip);

    const result: CoinSide = Math.random() > 0.5 ? "heads" : "tails";
    setPendingResult(result);
    setFlipKey((k) => k + 1);

    await new Promise((resolve) => setTimeout(resolve, 1000));

    setLastResult(result);
    setHistory((prev) => [...prev, result]);
    setIsFlipping(false);
    setPendingResult(null);

    const didWin = result === choice;
    if (didWin) {
      setFx(null);
      playAudio(audioRef.current.coin);
    } else {
      if (resultTimeoutRef.current) {
        clearTimeout(resultTimeoutRef.current);
        resultTimeoutRef.current = null;
      }
      setFx("lose");
      playAudio(audioRef.current.limboLose);
      setFxKey((k) => k + 1);
      resultTimeoutRef.current = window.setTimeout(() => setFx(null), 900);
    }

    if (didWin) {
      setStreak((prev) => prev + 1);
    } else {
      setGameState("lost");
      setStreak(0);
      finalizePendingLoss();
    }
  };

  const cashOut = () => {
    if (gameState !== "playing" || streak === 0) return;

    addToBalance(currentPayout);
    setLastWin(currentPayout);
    playAudio(audioRef.current.win);
    setGameState("cashed_out");
    if (resultTimeoutRef.current) {
      clearTimeout(resultTimeoutRef.current);
      resultTimeoutRef.current = null;
    }
    setFx("win");
    setFxKey((k) => k + 1);
    resultTimeoutRef.current = window.setTimeout(() => setFx(null), 900);
  };

  return (
    <div className="p-2 sm:p-4 lg:p-6 max-w-[1400px] mx-auto flex flex-col lg:flex-row items-start gap-4 lg:gap-8">
      <div className="w-full lg:w-[240px] flex flex-col gap-3 bg-[#0f212e] p-2 sm:p-3 rounded-xl h-fit text-xs self-start">
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
              disabled={gameState === "playing"}
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
              disabled={gameState === "playing"}
              className="bg-[#2f4553] hover:bg-[#3e5666] text-xs py-1 rounded text-[#b1bad3] disabled:opacity-50 cf-press"
            >
              All In
            </button>
          </div>
          {gameState !== "playing" && (
            <div className="mt-2">
              <button
                onClick={placeBet}
                className="w-full bg-[#00e701] hover:bg-[#00c201] disabled:opacity-50 disabled:cursor-not-allowed text-black py-3 rounded-md font-bold text-lg shadow-[0_0_20px_rgba(0,231,1,0.2)] transition-all active:scale-95 flex items-center justify-center gap-2 cf-press"
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
                disabled={isFlipping || streak === 0}
                className="w-full bg-[#00e701] hover:bg-[#00c201] text-black py-3 rounded-md font-bold text-lg shadow-[0_0_20px_rgba(0,231,1,0.2)] transition-all active:scale-95 flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed cf-press"
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
              {lastWin.toFixed(2)}
            </div>
          </div>
        )}
      </div>

      <div className="flex-1 flex flex-col items-center justify-center bg-[#0f212e] rounded-xl p-4 sm:p-8 relative min-h-[400px] sm:min-h-[500px] overflow-hidden">
        {isFlipping && <div className="limbo-roll-glow" />}
        {!isFlipping && fx === "win" && <div key={`win-${fxKey}`} className="limbo-win-flash" />}
        {!isFlipping && fx === "lose" && <div key={`lose-${fxKey}`} className="limbo-lose-flash" />}

        <div className="relative w-32 h-32 sm:w-48 sm:h-48 mb-8 sm:mb-12 cf-perspective z-10">
          {(() => {
            const fromSide: CoinSide = lastResult ?? "heads";
            const toSide: CoinSide = pendingResult ?? lastResult ?? "heads";
            const fromDeg = fromSide === "tails" ? 180 : 0;
            const baseDeg = toSide === "tails" ? 180 : 0;
            const delta = (baseDeg - fromDeg + 360) % 360;
            const fullTurns = 5;
            const toDeg = fromDeg + fullTurns * 360 + delta;

            const faceBorder = "border-4";
            const headsFace =
              "shadow-[0_0_30px_rgba(234,179,8,0.25)] bg-linear-to-br from-yellow-300 to-yellow-600 border-yellow-400";
            const tailsFace =
              "shadow-[0_0_30px_rgba(59,130,246,0.25)] bg-linear-to-br from-blue-300 to-blue-600 border-blue-400";

            return (
              <div className="cf-coin">
                <div
                  key={flipKey}
                  className={`cf-coin-inner ${isFlipping ? "cf-coin-flipping" : ""}`}
                  style={
                    {
                      transform: `rotateY(${isFlipping ? fromDeg : baseDeg}deg)`,
                      ["--cf-from" as any]: `${fromDeg}deg`,
                      ["--cf-to" as any]: `${toDeg}deg`,
                    } as React.CSSProperties
                  }
                >
                  {Array.from({ length: 16 }).map((_, i) => (
                    <div
                      key={`edge-${i}`}
                      className={
                        isFlipping
                          ? "absolute inset-0 rounded-full bg-gray-600"
                          : "absolute inset-0 rounded-full bg-[#2f4553] border border-[#557086]"
                      }
                      style={{
                        transform: `translateZ(${i - 7.5}px)`,
                      }}
                    />
                  ))}

                  <div
                    className={`cf-coin-face ${faceBorder} ${
                      isFlipping ? "bg-gray-400 border-0 shadow-none" : headsFace
                    }`}
                    style={{ transform: "translateZ(8px)" }}
                  >
                    <div
                      className={
                        isFlipping
                          ? "hidden"
                          : "w-[55%] h-[55%] rounded-full bg-[#2f4553]"
                      }
                    />
                  </div>

                  <div
                    className={`cf-coin-face ${faceBorder} ${
                      isFlipping ? "bg-gray-400 border-0 shadow-none" : tailsFace
                    }`}
                    style={{ transform: "rotateY(180deg) translateZ(8px)" }}
                  >
                    <div
                      className={
                        isFlipping
                          ? "hidden"
                          : "w-[45%] h-[45%] bg-[#2f4553] transform rotate-45"
                      }
                    />
                  </div>
                </div>
              </div>
            );
          })()}
        </div>

        <div className="flex gap-4 w-full max-w-md justify-center">
          <button
            onClick={() => continueGame("heads")}
            disabled={isFlipping || gameState !== "playing"}
            aria-label="Heads"
            className="w-20 sm:w-24 h-12 sm:h-14 bg-[#2f4553] hover:bg-[#3e5666] disabled:opacity-50 disabled:cursor-not-allowed text-black rounded-xl shadow-[0_0_8px_rgba(0,0,0,0.25)] transition-all active:scale-95 flex items-center justify-center cf-press"
          >
            <div className="w-7 h-7 sm:w-8 sm:h-8 rounded-full bg-[#eab308]" />
          </button>

          <button
            onClick={() => continueGame("tails")}
            disabled={isFlipping || gameState !== "playing"}
            aria-label="Tails"
            className="w-20 sm:w-24 h-12 sm:h-14 bg-[#2f4553] hover:bg-[#3e5666] disabled:opacity-50 disabled:cursor-not-allowed text-black rounded-xl shadow-[0_0_8px_rgba(0,0,0,0.25)] transition-all active:scale-95 flex items-center justify-center cf-press"
          >
            <div className="w-5 h-5 sm:w-6 sm:h-6 bg-[#3b82f6] transform rotate-45" />
          </button>
        </div>

        <div className="mt-12 flex gap-2 overflow-x-auto max-w-full p-2 w-full justify-start sm:justify-center">
          {history.map((side, i) => (
            <div
              key={i}
              className={`w-8 h-8 shrink-0 rounded-full flex items-center justify-center border-2 animate-scale-in ${
                side === "heads"
                  ? "bg-yellow-500 border-yellow-300"
                  : "bg-blue-500 border-blue-300"
              }`}
              style={{ animationDelay: `${i * 0.05}s` }}
            >
              {side === "heads" ? (
                <div className="w-3.5 h-3.5 rounded-full bg-[#2f4553]" />
              ) : (
                <div className="w-3 h-3 bg-[#2f4553] transform rotate-45" />
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
