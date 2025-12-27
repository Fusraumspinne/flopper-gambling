"use client";

import React, { useMemo, useState } from "react";
import { useWallet } from "@/components/WalletProvider";
import { PlayArrow, Refresh, ExitToApp, Diamond, Close } from "@mui/icons-material";

type RiskLevel = "low" | "medium" | "high";

type RoundState = "idle" | "active" | "busted" | "cashed";

type Reveal = {
  level: number;
  pickedIndex: number;
  trapIndex: number;
  outcome: "safe" | "trap";
};

const TOWER_LEVELS = 9;

const MULTIPLIERS: Record<RiskLevel, number[]> = {
  low: [1.31, 1.74, 2.32, 3.1, 4.13, 5.51, 7.34, 9.79, 13.05],
  medium: [1.47, 2.21, 3.31, 4.96, 7.44, 11.16, 16.74, 25.11, 37.67],
  high: [1.96, 3.92, 7.84, 15.68, 31.36, 62.72, 125.44, 250.88, 501.76],
};

const FIELDS_PER_LEVEL: Record<RiskLevel, number> = {
  low: 4,
  medium: 3,
  high: 2,
};

export default function DragonTowerPage() {
  const { balance, subtractFromBalance, addToBalance, finalizePendingLoss } = useWallet();

  const [riskLevel, setRiskLevel] = useState<RiskLevel>("medium");
  const [betAmount, setBetAmount] = useState<number>(10);
  const [betInput, setBetInput] = useState<string>("10");

  const [roundState, setRoundState] = useState<RoundState>("idle");
  const [isBusy, setIsBusy] = useState(false);

  const [level, setLevel] = useState<number>(0);
  const [trapByLevel, setTrapByLevel] = useState<number[]>([]);
  const [reveals, setReveals] = useState<Reveal[]>([]);
  const [lastWin, setLastWin] = useState<number>(0);

  const fieldsCount = FIELDS_PER_LEVEL[riskLevel];
  const multipliers = MULTIPLIERS[riskLevel];

  const canStart =
    roundState !== "active" && !isBusy && betAmount > 0 && betAmount <= balance;

  const cashoutMultiplier = useMemo(() => {
    if (roundState !== "active") return 0;
    if (level <= 0) return 1;
    return multipliers[level - 1] ?? 1;
  }, [level, multipliers, roundState]);

  const cashoutAmount = useMemo(() => {
    if (roundState !== "active") return 0;
    return betAmount * cashoutMultiplier;
  }, [betAmount, cashoutMultiplier, roundState]);

  const nextMultiplier = useMemo(() => {
    if (roundState !== "active") return 0;
    return multipliers[level] ?? 0;
  }, [level, multipliers, roundState]);

  const canCashout = useMemo(() => {
    if (roundState !== "active") return false;
    if (isBusy) return false;
    return level > 0;
  }, [isBusy, level, roundState]);

  const revealAllRemainingRows = () => {
    setReveals((prev) => {
      const byLevel = new Map<number, Reveal>();
      for (const r of prev) byLevel.set(r.level, r);

      for (let lvl = 0; lvl < TOWER_LEVELS; lvl++) {
        if (byLevel.has(lvl)) continue;
        const trapIndex = trapByLevel[lvl];
        if (typeof trapIndex !== "number") continue;
        byLevel.set(lvl, {
          level: lvl,
          pickedIndex: -1,
          trapIndex,
          outcome: "safe",
        });
      }

      return Array.from(byLevel.values()).sort((a, b) => a.level - b.level);
    });
  };

  const startRound = async () => {
    if (!canStart) return;

    setIsBusy(true);
    setLastWin(0);

    subtractFromBalance(betAmount);

    const traps: number[] = [];
    for (let i = 0; i < TOWER_LEVELS; i++) {
      traps.push(Math.floor(Math.random() * fieldsCount));
    }

    setTrapByLevel(traps);
    setReveals([]);
    setLevel(0);
    setRoundState("active");

    await new Promise((r) => setTimeout(r, 120));
    setIsBusy(false);
  };

  const endRoundCashout = async () => {
    if (!canCashout) return;

    setIsBusy(true);
    const win = cashoutAmount;

    revealAllRemainingRows();

    await new Promise((r) => setTimeout(r, 150));
    addToBalance(win);
    setLastWin(win);
    setRoundState("cashed");

    await new Promise((r) => setTimeout(r, 150));
    setIsBusy(false);
  };

  const resetRound = () => {
    if (roundState === "active" || isBusy) return;
    setTrapByLevel([]);
    setReveals([]);
    setLevel(0);
    setLastWin(0);
    setRoundState("idle");
  };

  const changeRiskLevel = (lvl: RiskLevel) => {
    if (roundState === "active" || isBusy) return;
    if (lvl === riskLevel) return;
    setRiskLevel(lvl);
    resetRound();
  };

  const pickField = async (idx: number) => {
    if (roundState !== "active" || isBusy) return;
    if (level < 0 || level >= TOWER_LEVELS) return;

    setIsBusy(true);

    const trapIndex = trapByLevel[level];
    const outcome: Reveal["outcome"] = idx === trapIndex ? "trap" : "safe";

    const reveal: Reveal = {
      level,
      pickedIndex: idx,
      trapIndex,
      outcome,
    };

    setReveals((prev) => [...prev, reveal]);

    await new Promise((r) => setTimeout(r, 180));

    if (outcome === "trap") {
      revealAllRemainingRows();
      finalizePendingLoss();
      setRoundState("busted");
      setIsBusy(false);
      return;
    }

    const nextLevel = level + 1;

    if (nextLevel >= TOWER_LEVELS) {
      const winMult = multipliers[TOWER_LEVELS - 1] ?? 0;
      const win = betAmount * winMult;

      await new Promise((r) => setTimeout(r, 200));
      addToBalance(win);
      setLastWin(win);
      revealAllRemainingRows();
      setLevel(nextLevel);
      setRoundState("cashed");
      setIsBusy(false);
      return;
    }

    setLevel(nextLevel);
    setIsBusy(false);
  };

  const currentReveal = useMemo(() => {
    if (roundState !== "active") return null;
    return reveals.find((r) => r.level === level) ?? null;
  }, [level, reveals, roundState]);

  const getCellStyle = (rowLevel: number, idx: number) => {
    const rowReveal = reveals.find((r) => r.level === rowLevel);
    const isHighlightedRow = rowLevel === level && roundState !== "idle"; // keep highlight until reset
    const isClickable = roundState === "active" && rowLevel === level && !isBusy && !rowReveal;

    if (!rowReveal) {
      if (isClickable) {
        return "bg-[#213743] text-[#b1bad3] shadow-[0_4px_0_#1a2c38] hover:-translate-y-1 hover:bg-[#2f4553] active:translate-y-0 active:shadow-none transition-all duration-100";
      }
      if (isHighlightedRow) {
        // visually highlighted row after round end (not clickable)
        return "bg-[#213743] text-[#b1bad3] shadow-[0_4px_0_#1a2c38] opacity-100";
      }
      return "bg-[#2f4553] text-[#b1bad3] opacity-60";
    }

    // treat "future" reveals (pickedIndex === -1) as future only while round is active
    const isFutureReveal = rowReveal.pickedIndex === -1 && roundState === "active";
    const futureClasses = isFutureReveal ? " opacity-70 saturate-50" : "";

    const isTrap = idx === rowReveal.trapIndex;
    const isPicked = idx === rowReveal.pickedIndex;
    const isSafePicked = isPicked && rowReveal.outcome === "safe";
    const isTrapPicked = isPicked && rowReveal.outcome === "trap";

    if (isSafePicked) {
      return "bg-[#00e701] text-black shadow-[0_0_20px_rgba(0,231,1,0.5)] scale-105 z-10 border border-[#ccffcc]";
    }

    if (isTrapPicked) {
      return "bg-[#0b1720] text-[#ef4444] scale-95 shadow-inner border border-[#ef4444]/20";
    }

    if (isTrap) {
      return `bg-[#0b1720] text-[#ef4444] shadow-inner border border-[#ef4444]/20${futureClasses}`;
    }

    return `bg-[#2f4553] text-[#b1bad3] opacity-80 scale-95${futureClasses}`;
  };

  const renderCellContent = (rowLevel: number, idx: number) => {
    const rowReveal = reveals.find((r) => r.level === rowLevel);
    if (!rowReveal) {
      return <Diamond sx={{ fontSize: 18, color: "#557086" }} />;
    }

    const isPicked = idx === rowReveal.pickedIndex;
    const isTrap = idx === rowReveal.trapIndex;

    if (isTrap) {
      return <Close sx={{ fontSize: 18, color: isPicked ? "#ef4444" : "#ef4444" }} />;
    }

    return <Diamond sx={{ fontSize: 18, color: isPicked ? "#000" : "#00e701" }} />;
  };

  return (
    <div className="p-2 sm:p-4 lg:p-6 max-w-[1400px] mx-auto flex flex-col lg:flex-row gap-4 lg:gap-8">
      <div className="w-full lg:w-[240px] flex flex-col gap-3 bg-[#0f212e] p-2 sm:p-3 rounded-xl h-fit text-xs">
        <div className="space-y-2">
          <label className="text-xs font-bold text-[#b1bad3] uppercase tracking-wider">
            Bet Amount
          </label>
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
              disabled={roundState === "active" || isBusy}
              className="w-full bg-[#0f212e] border border-[#2f4553] rounded-md py-2 pl-7 pr-4 text-white font-mono focus:outline-none focus:border-[#00e701] transition-colors disabled:opacity-60"
            />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <button
              onClick={() => {
                const newBet = Number((betAmount / 2).toFixed(2));
                setBetAmount(newBet);
                setBetInput(String(newBet));
              }}
              disabled={roundState === "active" || isBusy}
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
              disabled={roundState === "active" || isBusy}
              className="bg-[#2f4553] hover:bg-[#3e5666] text-xs py-1 rounded text-[#b1bad3] disabled:opacity-50"
            >
              2×
            </button>
          </div>
        </div>

        <div className="space-y-2">
          <label className="text-xs font-bold text-[#b1bad3] uppercase tracking-wider">Risk</label>
          <div className="bg-[#0f212e] p-1 rounded-md border border-[#2f4553] flex">
            {(["low", "medium", "high"] as RiskLevel[]).map((lvl) => (
              <button
                key={lvl}
                onClick={() => changeRiskLevel(lvl)}
                disabled={roundState === "active" || isBusy}
                className={`flex-1 py-2 text-[10px] font-bold uppercase rounded transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${
                  riskLevel === lvl
                    ? "bg-[#213743] text-white shadow-sm"
                    : "text-[#b1bad3] hover:text-white"
                }`}
              >
                {lvl}
              </button>
            ))}
          </div>
        </div>

        {roundState === "active" ? (
          <div className="flex flex-col gap-3">
            <div className="bg-[#0f212e] p-4 rounded border border-[#2f4553] text-center">
              <div className="text-[#b1bad3] text-sm">Current Win</div>
              <div className="text-2xl font-bold text-[#00e701]">${cashoutAmount.toFixed(2)}</div>
              <div className="text-sm text-[#b1bad3] mt-1">
                Next: {nextMultiplier ? `${nextMultiplier}x` : "Max"}
              </div>
            </div>
            <button
              onClick={endRoundCashout}
              disabled={!canCashout}
              className="w-full bg-[#00e701] hover:bg-[#00c201] text-black py-3 rounded-md font-bold text-lg shadow-[0_0_20px_rgba(0,231,1,0.2)] transition-all active:scale-95 flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <ExitToApp /> Cashout
            </button>
          </div>
        ) : (
          <button
            onClick={startRound}
            disabled={!canStart}
            className="w-full bg-[#00e701] hover:bg-[#00c201] disabled:opacity-50 disabled:cursor-not-allowed text-black py-3 rounded-md font-bold text-lg shadow-[0_0_20px_rgba(0,231,1,0.2)] transition-all active:scale-95 flex items-center justify-center gap-2"
          >
            {isBusy ? <Refresh className="animate-spin" /> : <PlayArrow />}
            Bet
          </button>
        )}

        {lastWin > 0 && roundState !== "active" && (
          <div className="mt-2 p-4 bg-[#213743] border border-[#00e701] rounded-md text-center animate-pulse">
            <div className="text-xs text-[#b1bad3] uppercase">You Won</div>
            <div className="text-2xl font-bold text-[#00e701]">${lastWin.toFixed(2)}</div>
          </div>
        )}
      </div>

      <div className="flex-1 flex flex-col gap-4">
        <div className="bg-[#0f212e] p-4 rounded-xl relative overflow-hidden">
            <div className="flex flex-col gap-2">
              {Array.from({ length: TOWER_LEVELS }, (_, i) => TOWER_LEVELS - 1 - i).map((rowLevel) => {
                const rowReveal = reveals.find((r) => r.level === rowLevel);
                const isHighlightedRow = rowLevel === level && roundState !== "idle";
                const isActiveRow = roundState === "active" && rowLevel === level;

                return (
                  <div
                    key={rowLevel}
                    className={`${isHighlightedRow ? "bg-[#123f47] p-2 rounded-md" : "rounded-md"}`}
                  >
                    <div
                      className={`grid gap-2 sm:gap-3 w-full ${
                        fieldsCount === 4
                          ? "grid-cols-4"
                          : fieldsCount === 3
                            ? "grid-cols-3"
                            : "grid-cols-2"
                      }`}
                    >
                      {Array.from({ length: fieldsCount }, (_, idx) => {
                        const canClick =
                          roundState === "active" &&
                          isActiveRow &&
                          !isBusy &&
                          !rowReveal &&
                          !currentReveal;

                        return (
                          <button
                            key={idx}
                            onClick={() => pickField(idx)}
                            disabled={!canClick}
                            className={`h-10 sm:h-11 rounded-md p-0 border-0 relative flex items-center justify-center ${getCellStyle(
                              rowLevel,
                              idx
                            )}`}
                          >
                            {renderCellContent(rowLevel, idx)}
                          </button>
                        );
                      })}
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
