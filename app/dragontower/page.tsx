"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import { useWallet } from "@/components/WalletProvider";
import {
  PlayArrow,
  Refresh,
  ExitToApp,
  Diamond,
  LocalFireDepartment,
} from "@mui/icons-material";

type RiskLevel = "low" | "medium" | "high" | "expert" | "master";

type RoundState = "idle" | "active" | "busted" | "cashed";

type Reveal = {
  level: number;
  pickedIndex: number;
  trapIndices: number[];
  outcome: "safe" | "trap";
};

const TOWER_LEVELS = 9;

const MULTIPLIERS: Record<RiskLevel, number[]> = {
  low: [1.31, 1.74, 2.32, 3.1, 4.13, 5.51, 7.34, 9.79, 13.05],
  medium: [1.47, 2.21, 3.31, 4.96, 7.44, 11.16, 16.74, 25.11, 37.67],
  high: [1.96, 3.92, 7.84, 15.68, 31.36, 62.72, 125.44, 250.88, 501.76],
  expert: [
    2.94, 8.82, 26.46, 79.38, 238.14, 714.42, 2143.26, 6429.78, 19289.34,
  ],
  master: [
    3.92, 15.68, 62.72, 250.88, 1003.52, 4014.08, 16056.32, 64225.28, 256901.12,
  ],
};

const FIELDS_PER_LEVEL: Record<RiskLevel, number> = {
  low: 4,
  medium: 3,
  high: 2,
  expert: 3,
  master: 4,
};

const TRAPS_PER_LEVEL: Record<RiskLevel, number> = {
  low: 1,
  medium: 1,
  high: 1,
  expert: 2,
  master: 3,
};

export default function DragonTowerPage() {
  const blendHexColors = (hex1: string, hex2: string, weight = 0.5) => {
    const h1 = hex1.replace("#", "");
    const h2 = hex2.replace("#", "");
    const r1 = parseInt(h1.substring(0, 2), 16);
    const g1 = parseInt(h1.substring(2, 4), 16);
    const b1 = parseInt(h1.substring(4, 6), 16);
    const r2 = parseInt(h2.substring(0, 2), 16);
    const g2 = parseInt(h2.substring(2, 4), 16);
    const b2 = parseInt(h2.substring(4, 6), 16);
    const r = Math.round(r1 * (1 - weight) + r2 * weight);
    const g = Math.round(g1 * (1 - weight) + g2 * weight);
    const b = Math.round(b1 * (1 - weight) + b2 * weight);
    const hex = (n: number) => n.toString(16).padStart(2, "0");
    return `#${hex(r)}${hex(g)}${hex(b)}`;
  };

  const { balance, subtractFromBalance, addToBalance, finalizePendingLoss } =
    useWallet();

  const [riskLevel, setRiskLevel] = useState<RiskLevel>("low");
  const [betAmount, setBetAmount] = useState<number>(100);
  const [betInput, setBetInput] = useState<string>("100");

  const [roundState, setRoundState] = useState<RoundState>("idle");
  const [isBusy, setIsBusy] = useState(false);

  const [level, setLevel] = useState<number>(0);
  const [trapByLevel, setTrapByLevel] = useState<number[][]>([]);
  const [reveals, setReveals] = useState<Reveal[]>([]);
  const [lastWin, setLastWin] = useState<number>(0);

  const [resultFx, setResultFx] = useState<"rolling" | "win" | "lose" | null>(null);
  const resultTimeoutRef = useRef<number | null>(null);

  const stepsScrollRef = useRef<HTMLDivElement | null>(null);
  const stepRefs = useRef<Array<HTMLDivElement | null>>([]);

  const revealByLevel = useMemo(() => {
    const map = new Map<number, Reveal>();
    for (const r of reveals) map.set(r.level, r);
    return map;
  }, [reveals]);

  const fieldsCount = FIELDS_PER_LEVEL[riskLevel];
  const multipliers = MULTIPLIERS[riskLevel];

  const formatProb = (p: number) => {
    if (p >= 1) {
      return `${Number(p.toFixed(p % 1 ? 2 : 0))}%`;
    }
    if (p === 0) return "0%";
    return `${Number(p.toPrecision(3))}%`;
  };

  const trapsPerLevel = TRAPS_PER_LEVEL[riskLevel] ?? 1;

  const survivalPerPick = useMemo(() => {
    return Math.max(0, (fieldsCount - trapsPerLevel) / fieldsCount);
  }, [fieldsCount, trapsPerLevel]);

  const levelProbabilities = useMemo(() => {
    return multipliers.map((_, idx) => {
      const picks = idx + 1;
      return Math.pow(survivalPerPick, picks) * 100;
    });
  }, [multipliers, survivalPerPick]);

  const displayStepIndex = useMemo(() => {
    const max = multipliers.length - 1;
    if (max < 0) return 0;
    const idx = Math.max(0, level - 1);
    return Math.min(idx, max);
  }, [level, multipliers.length]);

  useEffect(() => {
    if (roundState === "idle") return;
    const el = stepRefs.current[displayStepIndex];
    if (el && stepsScrollRef.current) {
      try {
        el.scrollIntoView({
          behavior: "smooth",
          block: "nearest",
          inline: "center",
        });
      } catch (e) {
        const container = stepsScrollRef.current;
        const left =
          el.offsetLeft - container.clientWidth / 2 + el.clientWidth / 2;
        container.scrollTo({ left, behavior: "smooth" });
      }
    }
  }, [displayStepIndex, roundState]);

  useEffect(() => {
    return () => {
      if (resultTimeoutRef.current) {
        clearTimeout(resultTimeoutRef.current);
        resultTimeoutRef.current = null;
      }
    };
  }, []);

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
        const trapIndices = trapByLevel[lvl];
        if (!Array.isArray(trapIndices)) continue;
        byLevel.set(lvl, {
          level: lvl,
          pickedIndex: -1,
          trapIndices,
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

    const traps: number[][] = [];
    const trapsPerLevel = TRAPS_PER_LEVEL[riskLevel] ?? 1;
    for (let i = 0; i < TOWER_LEVELS; i++) {
      const levelTraps: number[] = [];
      while (levelTraps.length < trapsPerLevel) {
        const idx = Math.floor(Math.random() * fieldsCount);
        if (!levelTraps.includes(idx)) levelTraps.push(idx);
      }
      traps.push(levelTraps);
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
    // show green cashout flash
    if (resultTimeoutRef.current) {
      clearTimeout(resultTimeoutRef.current);
      resultTimeoutRef.current = null;
    }
    setResultFx("win");
    resultTimeoutRef.current = window.setTimeout(() => setResultFx(null), 900);
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
    if (resultTimeoutRef.current) {
      clearTimeout(resultTimeoutRef.current);
      resultTimeoutRef.current = null;
    }
    setResultFx(null);
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
    if (resultTimeoutRef.current) {
      clearTimeout(resultTimeoutRef.current);
      resultTimeoutRef.current = null;
    }
    setResultFx("rolling");

    const trapIndices = trapByLevel[level] ?? [];
    const outcome: Reveal["outcome"] = trapIndices.includes(idx)
      ? "trap"
      : "safe";

    const reveal: Reveal = {
      level,
      pickedIndex: idx,
      trapIndices,
      outcome,
    };

    setReveals((prev) => [...prev, reveal]);

    await new Promise((r) => setTimeout(r, 180));

    if (outcome === "trap") {
      revealAllRemainingRows();
      // show red flash for trap
      if (resultTimeoutRef.current) {
        clearTimeout(resultTimeoutRef.current);
        resultTimeoutRef.current = null;
      }
      setResultFx("lose");
      resultTimeoutRef.current = window.setTimeout(() => setResultFx(null), 900);
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
      // final win -> green flash
      if (resultTimeoutRef.current) {
        clearTimeout(resultTimeoutRef.current);
        resultTimeoutRef.current = null;
      }
      setResultFx("win");
      resultTimeoutRef.current = window.setTimeout(() => setResultFx(null), 900);
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
    return revealByLevel.get(level) ?? null;
  }, [level, revealByLevel, roundState]);

  const getCellStyle = (rowLevel: number, idx: number) => {
    const rowReveal = revealByLevel.get(rowLevel);
    const isClickable =
      roundState === "active" && rowLevel === level && !isBusy && !rowReveal;

    if (!rowReveal) {
      return isClickable
        ? "bg-[#2f4553] hover:bg-[#3c5566] hover:-translate-y-1 cursor-pointer shadow-[0_4px_0_0_#1a2c38] transition-all duration-200"
        : "bg-[#2f4553] opacity-50 cursor-default transition-all duration-200";
    }

    const pickedByPlayer = rowReveal.pickedIndex === idx && rowReveal.pickedIndex !== -1;
    const isTrap = rowReveal.trapIndices?.includes(idx);

    if (!pickedByPlayer) {
      return "transition-all duration-200";
    }

    return isTrap
      ? "animate-mines-mine transition-all duration-200"
      : "animate-mines-gem transition-all duration-200";
  };

  const renderCellContent = (rowLevel: number, idx: number) => {
    const rowReveal = revealByLevel.get(rowLevel);
    if (!rowReveal) {
      return <Diamond sx={{ fontSize: 18, color: "#557086" }} />;
    }

    const isTrap = rowReveal.trapIndices?.includes(idx);

    const pickedByPlayer = rowReveal.pickedIndex === idx && rowReveal.pickedIndex !== -1;

    if (pickedByPlayer && !isTrap) {
      const wrapper: React.CSSProperties = {
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        width: "75%",
        height: "75%",
      };

      return (
        <>
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
            <div
              className="mines-gem-flash absolute inset-0"
              style={{
                background:
                  "radial-gradient(circle at 50% 45%, rgba(255,255,255,0.85) 0%, rgba(0,231,1,0.35) 38%, rgba(0,231,1,0.0) 70%)",
              }}
            />
            <div
              className="mines-gem-glow absolute inset-0 rounded-md"
              style={{
                boxShadow: "0 0 0 0 rgba(0,231,1,0.0)",
                border: "2px solid rgba(0,231,1,0.35)",
              }}
            />
          </div>
          <div
            className="animate-mines-icon-pop"
            style={{
              ...wrapper,
              animation:
                "mines-gem-reveal 520ms cubic-bezier(0.12, 0.9, 0.2, 1) both, mines-icon-pop 360ms cubic-bezier(0.12, 0.9, 0.2, 1) both",
              willChange: "transform, filter",
            }}
          >
            <Diamond
              sx={{
                width: "100%",
                height: "100%",
                color: "#00ff17",
                filter: "drop-shadow(0 0 16px rgba(0,231,1,0.85))",
              }}
            />
          </div>
        </>
      );
    }

    if (pickedByPlayer && isTrap) {
      const wrapper: React.CSSProperties = {
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        width: "75%",
        height: "75%",
      };

      return (
        <>
          <div
            className="pointer-events-none absolute inset-0 mines-mine-flash"
            style={{
              background:
                "radial-gradient(circle at 50% 45%, rgba(255,255,255,0.75) 0%, rgba(239,68,68,0.35) 45%, rgba(239,68,68,0.0) 70%)",
            }}
          />
          <div
            className="animate-mines-icon-pop"
            style={{
              ...wrapper,
              animation:
                "mines-mine-hit 480ms cubic-bezier(0.16, 0.9, 0.2, 1) both, mines-icon-pop 360ms cubic-bezier(0.12, 0.9, 0.2, 1) both",
              willChange: "transform, filter",
            }}
          >
            <LocalFireDepartment
              sx={{
                width: "100%",
                height: "100%",
                color: "#ef4444",
                filter: "drop-shadow(0 0 14px rgba(239,68,68,0.55))",
              }}
            />
          </div>
        </>
      );
    }

    if (isTrap) {
      const wrapper: React.CSSProperties = {
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        width: "70%",
        height: "70%",
      };
      return (
        <div style={wrapper}>
          <LocalFireDepartment
            sx={{
              width: "75%",
              height: "75%",
              color: "#ef4444",
              filter: "brightness(0.75)",
            }}
          />
        </div>
      );
    }

    const wrapper: React.CSSProperties = {
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      width: "70%",
      height: "70%",
    };
    return (
      <div style={wrapper}>
        <Diamond
          sx={{
            width: "75%",
            height: "75%",
            color: "#0b6623",
            filter: "brightness(1.25)",
          }}
        />
      </div>
    );
  };

  return (
    <div className="p-2 sm:p-4 lg:p-6 max-w-[1400px] mx-auto flex flex-col lg:flex-row gap-4 lg:gap-8">
      <div className="w-full lg:w-[240px] flex flex-col gap-3 bg-[#0f212e] p-2 sm:p-3 rounded-xl h-fit text-xs">
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
                setBetAmount(num);
                setBetInput(sanitized);
              }}
              disabled={roundState === "active" || isBusy}
              className="w-full bg-[#0f212e] border border-[#2f4553] rounded-md py-2 pl-7 pr-4 text-white font-mono focus:outline-none focus:border-[#00e701] transition-colors disabled:opacity-60"
            />
          </div>
          <div className="grid grid-cols-3 gap-2">
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
            <button
              onClick={() => {
                const newBet = Number(balance.toFixed(2));
                setBetAmount(newBet);
                setBetInput(String(newBet));
              }}
              disabled={roundState === "active" || isBusy}
              className="bg-[#2f4553] hover:bg-[#3e5666] text-xs py-1 rounded text-[#b1bad3] disabled:opacity-50"
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
            {(["low", "medium", "high", "expert", "master"] as RiskLevel[]).map(
              (lvl) => (
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
              )
            )}
          </div>
        </div>

        {roundState === "active" ? (
          <div className="flex flex-col gap-3">
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

        {roundState === "active" && (
          <div className="bg-[#0f212e] p-4 rounded border border-[#2f4553] text-center">
            <div className="text-[#b1bad3] text-sm">Current Win</div>
            <div className="text-2xl font-bold text-[#00e701]">
              ${cashoutAmount.toFixed(2)}
            </div>
            <div className="text-sm text-[#b1bad3] mt-1">
              Next: {nextMultiplier ? `${nextMultiplier}x` : "Max"}
            </div>
          </div>
        )}

        {lastWin > 0 && roundState !== "active" && (
          <div className="mt-2 p-4 bg-[#213743] border border-[#00e701] rounded-md text-center animate-pulse">
            <div className="text-xs text-[#b1bad3] uppercase">You Won</div>
            <div className="text-2xl font-bold text-[#00e701]">
              ${lastWin.toFixed(2)}
            </div>
          </div>
        )}
      </div>

      <div className="flex-1 flex flex-col gap-4">
        <div className="bg-[#0f212e] p-4 rounded-xl relative overflow-hidden">
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

          <div className="flex flex-col gap-2">
            {Array.from(
              { length: TOWER_LEVELS },
              (_, i) => TOWER_LEVELS - 1 - i
            ).map((rowLevel) => {
              const rowReveal = revealByLevel.get(rowLevel);
              const isHighlightedRow =
                rowLevel === level && roundState !== "idle";
              const isActiveRow = roundState === "active" && rowLevel === level;

              return (
                <div
                  key={rowLevel}
                  className={`${
                    isHighlightedRow
                      ? "bg-[#123f47] p-2 rounded-md"
                      : "rounded-md"
                  }`}
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

                      const baseSafe = "#213743";
                      const target = "#0f212e";
                      const pickedByPlayer =
                        rowReveal?.pickedIndex === idx &&
                        rowReveal?.pickedIndex !== -1;
                      const isAutoRevealed = !!rowReveal && !pickedByPlayer;
                      const blendedBg = rowReveal
                        ? pickedByPlayer
                          ? baseSafe
                          : isAutoRevealed
                          ? blendHexColors(baseSafe, target, 0.5)
                          : baseSafe
                        : undefined;

                      return (
                        <button
                          key={idx}
                          onClick={() => pickField(idx)}
                          disabled={!canClick}
                          className={`h-10 sm:h-11 rounded-md p-0 border-0 relative overflow-hidden flex items-center justify-center ${getCellStyle(
                            rowLevel,
                            idx
                          )}`}
                          style={
                            blendedBg ? { backgroundColor: blendedBg } : undefined
                          }
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
          
          <div className="w-full mt-4">
            <div ref={stepsScrollRef} className="w-full overflow-x-auto">
              <div className="flex items-stretch gap-2 px-4 py-2">
                {multipliers.map((m, idx) => (
                  <div
                    key={idx}
                    ref={(el) => {
                      stepRefs.current[idx] = el;
                    }}
                    className={`flex-1 min-w-0 bg-[#213743] p-2 rounded-md border transition-transform ${
                      idx === displayStepIndex
                        ? "border-[#00e701] scale-105"
                        : "border-[#2f4553]"
                    }`}
                  >
                    <div className="text-sm text-white font-bold text-center">
                      {m}x
                    </div>
                    <div className="text-xs text-[#9fb0c6] mt-1 text-center">
                      {formatProb(levelProbabilities[idx] ?? 0)}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
