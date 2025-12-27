"use client";

import React, { useMemo, useState, useCallback } from "react";
import { useWallet } from "@/components/WalletProvider";
import { Casino, Autorenew, Flag, PlayArrow, LocalFireDepartment } from "@mui/icons-material";

type RiskLevel = "low" | "medium" | "high" | "expert" | "master";
type GameState = "idle" | "playing" | "dead" | "cashed";

type TileValue = number | "dead" | "start";

type RollEntry = {
  die1: number;
  die2: number;
  steps: number;
  landing: number;
  value: TileValue;
  multiplierAfter: number;
};

const BOARD_BY_RISK: Record<RiskLevel, TileValue[]> = {
  low: [
    "start",
    2,
    1.3,
    1.2,
    1.1,
    1.01,
    "dead",
    1.01,
    1.1,
    1.2,
    1.3,
    2,
  ],
  medium: [
    "start",
    4,
    2.5,
    1.4,
    1.11,
    "dead",
    "dead",
    "dead",
    1.11,
    1.4,
    2.5,
    4,
  ],
  high: [
    "start",
    7.5,
    3,
    1.38,
    "dead",
    "dead",
    "dead",
    "dead",
    "dead",
    1.38,
    3,
    7.5,
  ],
  expert: [
    "start",
    10,
    3.82,
    "dead",
    "dead",
    "dead",
    "dead",
    "dead",
    "dead",
    "dead",
    3.82,
    10,
  ],
  master: [
    "start",
    17.64,
    "dead",
    "dead",
    "dead",
    "dead",
    "dead",
    "dead",
    "dead",
    "dead",
    "dead",
    17.64,
  ],
};

const GRID_TEMPLATE = `
"a b c d"
"l center center e"
"k center center f"
"j i h g"
`;

const BOARD_AREAS: Array<{ area: string; boardIndex: number }> = [
  { area: "a", boardIndex: 0 },
  { area: "b", boardIndex: 1 },
  { area: "c", boardIndex: 2 },
  { area: "d", boardIndex: 3 },
  { area: "e", boardIndex: 4 },
  { area: "f", boardIndex: 5 },
  { area: "g", boardIndex: 6 },
  { area: "h", boardIndex: 7 },
  { area: "i", boardIndex: 8 },
  { area: "j", boardIndex: 9 },
  { area: "k", boardIndex: 10 },
  { area: "l", boardIndex: 11 },
];

function formatMultiplier(mult: number) {
  if (mult >= 1000) return mult.toFixed(0);
  if (mult >= 100) return mult.toFixed(1);
  if (mult >= 10) return mult.toFixed(2);
  return mult.toFixed(3);
}

function formatMultiplierShort(mult: number) {
  const rounded = Number.parseFloat(mult.toFixed(6));
  return rounded.toString();
}

// probability helpers for two dice sums (2..12)
function waysForSum(s: number) {
  const map: Record<number, number> = {
    2: 1,
    3: 2,
    4: 3,
    5: 4,
    6: 5,
    7: 6,
    8: 5,
    9: 4,
    10: 3,
    11: 2,
    12: 1,
  };
  return map[s] || 0;
}

function probPercentForBoardIndex(index: number) {
  const sum = index + 1;
  if (sum < 2 || sum > 12) return "0%";
  const ways = waysForSum(sum);
  const pct = (ways / 36) * 100;
  return `${pct.toFixed(2)}%`;
}

function DiceFace({ value }: { value: number | null }) {
  const pipMap: Record<number, number[]> = {
    1: [4],
    2: [0, 8],
    3: [0, 4, 8],
    4: [0, 2, 6, 8],
    5: [0, 2, 4, 6, 8],
    6: [0, 2, 3, 5, 6, 8],
  };

  return (
    <div className="w-full aspect-square bg-white rounded-lg border border-[#d1d5db] shadow-sm flex items-center justify-center">
      {value ? (
        <div className="grid grid-cols-3 grid-rows-3 gap-[2px] w-14 h-14">
          {Array.from({ length: 9 }).map((_, i) => (
            <span
              key={i}
              className={`flex items-center justify-center ${
                pipMap[value]?.includes(i)
                  ? "bg-black rounded-full w-2.5 h-2.5"
                  : ""
              }`}
            />
          ))}
        </div>
      ) : (
        <div className="text-sm font-semibold text-[#4b5563]">-</div>
      )}
    </div>
  );
}

function cn(...parts: Array<string | false | null | undefined>) {
  return parts.filter(Boolean).join(" ");
}

function sleep(ms: number) {
  return new Promise<void>((resolve) => setTimeout(resolve, ms));
}

export default function SnakesPage() {
  const { balance, subtractFromBalance, addToBalance, finalizePendingLoss } = useWallet();

  const [betAmount, setBetAmount] = useState<number>(10);
  const [betInput, setBetInput] = useState<string>("10");
  const [risk, setRisk] = useState<RiskLevel>("low");
  const [gameState, setGameState] = useState<GameState>("idle");
  const [currentPos, setCurrentPos] = useState<number>(-1);
  const [totalMultiplier, setTotalMultiplier] = useState<number>(1);
  const [rolls, setRolls] = useState<RollEntry[]>([]);
  const [lastWin, setLastWin] = useState<number>(0);
  const [dice, setDice] = useState<[number | null, number | null]>([1, 1]);
  const [isAnimating, setIsAnimating] = useState<boolean>(false);

  const board = useMemo(() => BOARD_BY_RISK[risk], [risk]);

  const startNewRound = useCallback(() => {
    if (betAmount <= 0) return false;
    if (betAmount > balance) {
      return false;
    }
    subtractFromBalance(betAmount);
    setGameState("playing");
    setCurrentPos(-1);
    setTotalMultiplier(1);
    setRolls([]);
    setLastWin(0);
    setDice([1, 1]);
    return true;
  }, [balance, betAmount, subtractFromBalance]);

  const landOnTile = useCallback(
    (landingIndex: number, currentMult: number): { nextMult: number; newState: GameState } => {
      const value = board[landingIndex];
      if (value === "dead") {
        return { nextMult: currentMult, newState: "dead" };
      }
      if (typeof value === "number") {
        return { nextMult: parseFloat((currentMult * value).toFixed(4)), newState: "playing" };
      }
      return { nextMult: currentMult, newState: "playing" };
    },
    [board]
  );

  const handleCashout = useCallback(
    (mult: number, auto = false) => {
      const payout = betAmount * mult;
      if (payout > 0) {
        addToBalance(payout);
        setLastWin(payout);
      } else {
        finalizePendingLoss();
      }
      setGameState("cashed");
      if (auto) {
        setDice((prev) => prev);
      }
    },
    [addToBalance, finalizePendingLoss, betAmount]
  );

  const changeRisk = useCallback(
    (level: RiskLevel) => {
      if (level === risk) return;
      if (gameState === "playing") {
        handleCashout(totalMultiplier);
        setRisk(level);
        return;
      }

      if (gameState === "dead" || gameState === "cashed") {
        setRisk(level);
        setGameState("idle");
        setCurrentPos(-1);
        setTotalMultiplier(1);
        setRolls([]);
        setLastWin(0);
        setDice([1, 1]);
        return;
      }

      setRisk(level);
    },
    [risk, gameState, handleCashout, totalMultiplier]
  );

  const rollDice = useCallback(async () => {
    if (isAnimating) return;

    let wasPlaying = gameState === "playing";
    let baseMult = totalMultiplier;
    let baseRolls = rolls;

    if (!wasPlaying) {
      const ok = startNewRound();
      if (!ok) return;
      wasPlaying = false;
      baseMult = 1;
      baseRolls = [];
    }

    setIsAnimating(true);
    setCurrentPos(-1);

    const finalDie1 = Math.floor(Math.random() * 6) + 1;
    const finalDie2 = Math.floor(Math.random() * 6) + 1;

    for (let t = 0; t < 6; t++) {
      const d1 = t < 4 ? Math.floor(Math.random() * 6) + 1 : finalDie1;
      const d2 = t < 6 ? Math.floor(Math.random() * 6) + 1 : finalDie2;
      setDice([d1, d2]);
      await sleep(90);
    }
    setDice([finalDie1, finalDie2]);

    const steps = finalDie1 + finalDie2;
    const landing = (steps - 1) % board.length;

    for (let s = 1; s <= steps; s++) {
      const idx = (s - 1) % board.length;
      setCurrentPos(idx);
      await sleep(120);
    }

    const { nextMult, newState } = landOnTile(landing, baseMult);
    const entry: RollEntry = {
      die1: finalDie1,
      die2: finalDie2,
      steps,
      landing,
      value: board[landing],
      multiplierAfter: nextMult,
    };

    setRolls((prev) => (wasPlaying ? [...prev, entry] : [entry]));
    setCurrentPos(landing);
    setTotalMultiplier(nextMult);

    if (newState === "dead") {
      setGameState("dead");
      finalizePendingLoss();
      setIsAnimating(false);
      return;
    }

    setGameState("playing");
    setIsAnimating(false);
  }, [board, finalizePendingLoss, gameState, handleCashout, isAnimating, landOnTile, rolls, startNewRound, totalMultiplier]);

  const manualCashout = useCallback(() => {
    if (gameState !== "playing") return;
    if (rolls.length === 0) return;
    handleCashout(totalMultiplier);
  }, [gameState, handleCashout, rolls.length, totalMultiplier]);

  const canRoll = !isAnimating;
  const canCashout = gameState === "playing" && rolls.length > 0;

  const currentWin = gameState === "playing" ? betAmount * totalMultiplier : 0;

  const currentTileValue = currentPos >= 0 ? board[currentPos] : undefined;

  const tile3d =
    "shadow-[0_4px_0_#1a2c38] hover:-translate-y-1 active:translate-y-0 active:shadow-none transition-all duration-100";
  const tileTravelHighlight =
    "ring-4 ring-[#8b5cf6] shadow-[0_0_18px_rgba(139,92,246,0.35)] scale-110 z-10";
  const tileTravelHighlightDead =
    "ring-4 ring-[#ef4444] shadow-[0_0_18px_rgba(239,68,68,0.35)] scale-110 z-10";
  const tileLandedMulti =
    "bg-[#8b5cf6] text-white shadow-[0_0_18px_rgba(139,92,246,0.35)] z-10";
  const tileLandedDead =
    "bg-[#ef4444] text-black shadow-[0_0_18px_rgba(239,68,68,0.35)] z-10";

  return (
    <div className="p-2 sm:p-4 lg:p-6 max-w-[1400px] mx-auto flex flex-col lg:flex-row gap-4 lg:gap-8">
      <div className="w-full lg:w-[240px] flex flex-col gap-3 bg-[#0f212e] p-2 sm:p-3 rounded-xl h-fit text-xs">
        <div className="space-y-2">
          <label className="text-xs font-bold text-[#b1bad3] uppercase tracking-wider">Bet Amount</label>
          <div className="relative">
            <div className="absolute left-3 top-1/2 -translate-y-1/2 text-[#b1bad3]">$</div>
            <input
              type="number"
              value={betInput}
              onChange={(e) => setBetInput(e.target.value)}
              onBlur={() => {
                const raw = betInput.trim();
                const sanitized = raw.replace(/^0+(?=\d)/, "") || "0";
                const num = Number(sanitized);
                setBetAmount(num);
                setBetInput(sanitized);
              }}
              disabled={gameState === "playing"}
              className="w-full bg-[#0f212e] border border-[#2f4553] rounded-md py-2 pl-7 pr-4 text-white font-mono focus:outline-none focus:border-[#00e701] transition-colors disabled:opacity-50"
            />
          </div>
          <div className="grid grid-cols-2 gap-2">
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
          </div>
        </div>

        <div className="space-y-2">
          <label className="text-xs font-bold text-[#b1bad3] uppercase tracking-wider">Risk</label>
          <div className="bg-[#0f212e] p-1 rounded-md border border-[#2f4553] flex">
            {(["low", "medium", "high", "expert", "master"] as RiskLevel[]).map((level) => (
              <button
                key={level}
                onClick={() => changeRisk(level)}
                className={`flex-1 py-2 text-[10px] font-bold uppercase rounded transition-colors ${
                  risk === level ? "bg-[#213743] text-white shadow-sm" : "text-[#b1bad3] hover:text-white"
                }`}
              >
                {level}
              </button>
            ))}
          </div>
        </div>

        {gameState === "playing" && (
          <div className="bg-[#0f212e] p-4 rounded border border-[#2f4553] text-center">
            <div className="text-[#b1bad3] text-sm">Current Win</div>
            <div className="text-2xl font-bold text-[#00e701]">{currentWin.toFixed(2)}</div>
          </div>
        )}

        <div className="flex gap-2">
          <button
            onClick={rollDice}
            disabled={!canRoll}
            className="flex-1 bg-[#00e701] hover:bg-[#00c201] disabled:opacity-50 disabled:cursor-not-allowed text-black py-3 rounded-md font-bold text-lg shadow-[0_0_20px_rgba(0,231,1,0.2)] transition-all active:scale-95 flex items-center justify-center gap-2"
          >
            <Casino sx={{ fontSize: 22 }} /> Roll
          </button>

          {gameState === "playing" && (
            <button
              onClick={manualCashout}
              disabled={!canCashout || isAnimating}
              className="px-4 bg-[#2f4553] hover:bg-[#3e5666] text-white rounded-md font-semibold text-sm disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
            >
              <Flag sx={{ fontSize: 18 }} /> Cashout
            </button>
          )}
        </div>

        {gameState === "cashed" && lastWin > 0 && (
          <div className="p-3 rounded-md bg-[#213743] border border-[#00e701] text-center">
            <div className="text-xs uppercase text-[#b1bad3]">You Won</div>
            <div className="text-2xl font-bold text-[#00e701]">${lastWin.toFixed(2)}</div>
          </div>
        )}
      </div>

      <div className="flex-1 flex flex-col gap-4">
        <div className="bg-[#0f212e] rounded-xl p-4 sm:p-6">
          <div
            className="grid gap-2 sm:gap-2 max-w-[390px] w-full mx-auto aspect-square"
            style={{
              gridTemplateAreas: GRID_TEMPLATE,
              gridTemplateColumns: "repeat(4, minmax(0, 1fr))",
              gridTemplateRows: "repeat(4, minmax(0, 1fr))",
            }}
          >
            {[
              ...BOARD_AREAS.map((item) => ({ ...item, type: "board" as const })),
              { area: "center", type: "center" as const },
            ].map((item) => {
              if (item.type === "board") {
                const value = board[item.boardIndex];
                const isCurrent = currentPos === item.boardIndex;
                const isDead = value === "dead";
                const isStart = value === "start";
                const isVisited = rolls.some((r) => r.landing === item.boardIndex) || item.boardIndex === 0;

                const baseBg =
                  !isAnimating && isCurrent
                    ? ""
                    : "bg-[#213743]";
                const baseBorder = "border border-[#2f4553]";
                const active = isCurrent && !isAnimating && isStart ? "shadow-[0_0_0_2px_#8b5cf6]" : "";
                const visited = !isCurrent && isVisited ? "opacity-95" : "";
                const isTravel = isAnimating && isCurrent;
                const landed =
                  !isAnimating && isCurrent
                    ? isDead
                      ? tileLandedDead
                      : typeof value === "number"
                        ? tileLandedMulti
                        : ""
                    : "";
                const pulse = isTravel ? (isDead ? tileTravelHighlightDead : tileTravelHighlight) : "";

                return (
                  <div
                    key={item.area}
                    style={{ gridArea: item.area }}
                    className={cn(
                      "aspect-square rounded-lg flex items-center justify-center",
                      baseBg,
                      baseBorder,
                      tile3d,
                      pulse,
                      landed,
                      active,
                      visited
                    )}
                  >
                    {isStart ? (
                      <PlayArrow sx={{ fontSize: 34, color: "#8b5cf6" }} />
                    ) : isDead ? (
                      <div className="flex flex-col items-center">
                        <LocalFireDepartment
                          sx={{
                            fontSize: 30,
                            color: !isAnimating && isCurrent ? "#0f212e" : "#ef4444",
                          }}
                        />
                        <div className="text-[10px] text-[#b1bad3] mt-1">{probPercentForBoardIndex(item.boardIndex)}</div>
                      </div>
                    ) : (
                      <div className="flex flex-col items-center">
                        <span className="text-white font-bold text-lg">{typeof value === "number" ? `${value}x` : ""}</span>
                        {(typeof value === "number" || value === "dead") && (
                          <div className="text-[10px] text-[#b1bad3] mt-1">{probPercentForBoardIndex(item.boardIndex)}</div>
                        )}
                      </div>
                    )}
                  </div>
                );
              }

              return (
                <div
                  key={item.area}
                  style={{ gridArea: item.area }}
                  className={cn(
                    "rounded-lg bg-[#213743] border border-[#2f4553]",
                    tile3d,
                    "flex flex-col items-center justify-center p-3"
                  )}
                >
                  <div className="w-full flex items-center justify-center gap-3">
                    <div className="w-[42%]">
                      <DiceFace value={dice[0]} />
                    </div>
                    <div className="w-[42%]">
                      <DiceFace value={dice[1]} />
                    </div>
                  </div>
                  <div className="mt-3 bg-[#0f212e] border border-[#2f4553] rounded-md px-4 py-2">
                    <div className="text-lg font-bold text-white">{formatMultiplierShort(totalMultiplier)}x</div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
