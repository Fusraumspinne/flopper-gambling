"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import Draggable, { type DraggableData, type DraggableEvent } from "react-draggable";
import {
  Line,
  LineChart,
  ResponsiveContainer,
  ReferenceLine,
  XAxis,
  YAxis,
} from "recharts";
import PlayTimeTracker from "./PlayTimeTracker";
import { Close, RestartAlt, QueryStats } from "@mui/icons-material";
import { DROPDOWN_GAME_OPTIONS, useWallet } from "./WalletProvider";

type LiveStatsPanelProps = {
  open: boolean;
  onClose: () => void;
};

type StoredPos = { x: number; y: number };

const POS_KEY = "flopper_livestats_panel_pos_v1";
const SELECTED_GAME_KEY = "flopper_livestats_panel_selected_game_v1";

function safeParsePos(raw: string | null): StoredPos | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as Partial<StoredPos>;
    if (typeof parsed.x !== "number" || typeof parsed.y !== "number") return null;
    if (!Number.isFinite(parsed.x) || !Number.isFinite(parsed.y)) return null;
    return { x: parsed.x, y: parsed.y };
  } catch {
    return null;
  }
}

function formatMoney(n: number) {
  const sign = n < 0 ? "-" : "";
  const abs = Math.abs(n);
  return `${sign}$${abs.toFixed(2)}`;
}

function createEmptyStats() {
  const now = Date.now();
  return {
    startedAt: now,
    net: 0,
    wagered: 0,
    wins: 0,
    losses: 0,
    history: [],
  };
}

export default function LiveStatsPanel({ open, onClose }: LiveStatsPanelProps) {
  const { liveStatsByGame, currentGameId, resetLiveStats } = useWallet();
  const [mounted, setMounted] = useState(false);

  const nodeRef = useRef<HTMLElement | null>(null);

  const [pos, setPos] = useState<StoredPos>({ x: 360, y: 80 });
  const [selectedGameId, setSelectedGameId] = useState<(typeof DROPDOWN_GAME_OPTIONS)[number]["id"]>("all");
  const emptyStatsRef = useRef(createEmptyStats());

  useEffect(() => {
    setMounted(true);
    const stored = safeParsePos(localStorage.getItem(POS_KEY));
    if (stored) {
      setPos(stored);
      return;
    }

    const x = Math.max(24, Math.floor(window.innerWidth * 0.22));
    const y = 80;
    setPos({ x, y });
  }, []);

  useEffect(() => {
    const stored = localStorage.getItem(SELECTED_GAME_KEY);
    const validIds = new Set<string>(DROPDOWN_GAME_OPTIONS.map((g) => g.id));
    if (stored && validIds.has(stored)) {
      setSelectedGameId(stored as (typeof DROPDOWN_GAME_OPTIONS)[number]["id"]);
      return;
    }

    if (validIds.has(currentGameId)) {
      setSelectedGameId(currentGameId as (typeof DROPDOWN_GAME_OPTIONS)[number]["id"]);
      return;
    }

    setSelectedGameId("all");
  }, [currentGameId]);

  const handleGameChange = (value: (typeof DROPDOWN_GAME_OPTIONS)[number]["id"]) => {
    setSelectedGameId(value);
    localStorage.setItem(SELECTED_GAME_KEY, value);
  };

  const selectedStats = liveStatsByGame[selectedGameId] ?? liveStatsByGame.all ?? emptyStatsRef.current;

  const chartData = useMemo(() => {
    const points = selectedStats.history;
    if (points.length === 0) return [] as Array<{ x: number; net: number; pos: number | null; neg: number | null }>;

    // Use bet index as the X axis to avoid long flat segments when time passes between bets.
    // Each history point represents the net after a settled round.
    const out: Array<{ x: number; net: number }> = [{ x: 1, net: points[0].net }];

    for (let i = 1; i < points.length; i++) {
      const prev = points[i - 1];
      const curr = points[i];

      const prevNet = prev.net;
      const currNet = curr.net;

      const prevSign = prevNet === 0 ? 0 : prevNet > 0 ? 1 : -1;
      const currSign = currNet === 0 ? 0 : currNet > 0 ? 1 : -1;

      const prevX = i;
      const currX = i + 1;

      if (prevSign !== 0 && currSign !== 0 && prevSign !== currSign) {
        const denom = currNet - prevNet;
        if (denom !== 0) {
          const ratio = (0 - prevNet) / denom; // 0..1
          const xCross = prevX + (currX - prevX) * ratio;
          out.push({ x: xCross, net: 0 });
        }
      }

      out.push({ x: currX, net: currNet });
    }

    return out.map((p) => {
      const net = p.net;
      return {
        x: p.x,
        net,
        pos: net >= 0 ? net : null,
        neg: net <= 0 ? net : null,
      };
    });
  }, [selectedStats.history]);

  const yDomain = useMemo(() => {
    if (selectedStats.history.length === 0) return { min: 0, max: 0 };
    let min = 0;
    let max = 0;
    for (const p of selectedStats.history) {
      if (p.net < min) min = p.net;
      if (p.net > max) max = p.net;
    }
    return { min, max };
  }, [selectedStats.history]);

  const netClass = selectedStats.net >= 0 ? "text-[#00e701]" : "text-red-500";

  const onDrag = (_e: DraggableEvent, data: DraggableData) => {
    // no-op: avoid updating controlled position during drag to prevent cursor drift
  };

  const onStop = (_e: DraggableEvent, data: DraggableData) => {
    const nextPos = { x: data.x, y: data.y };
    setPos(nextPos);
    localStorage.setItem(POS_KEY, JSON.stringify(nextPos));
  };

  if (!open || !mounted) return null;

  return createPortal(
    <div className="fixed inset-0 pointer-events-none" style={{ zIndex: 1000 }}>
      <Draggable
        nodeRef={nodeRef}
        handle=".livestats-handle"
        cancel=".livestats-cancel"
        defaultPosition={pos}
        onStop={onStop}
      >
        <section
          ref={nodeRef as React.RefObject<HTMLElement>}
          className="pointer-events-auto rounded-lg border border-[#2f4553] bg-[#0f212e] shadow-lg w-48 xl:w-80"
        >
          <header className="livestats-handle cursor-move flex items-center justify-between gap-3 rounded-t-lg border-b border-[#213743] bg-[#1a2c38] px-2 py-1 xl:py-2">
            <div className="flex items-center gap-2 text-white font-bold text-sm xl:text-base">
              <QueryStats sx={{ fontSize: 20 }} />
              <span>Live Stats</span>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={onClose}
                className="livestats-cancel rounded-md px-2 py-1 xl:py-1 text-[#b1bad3] hover:bg-[#213743] hover:text-white"
                aria-label="Close live stats"
              >
                <Close sx={{ fontSize: 18 }} />
              </button>
            </div>
          </header>

          <div className="p-3 space-y-2">
            <div className="w-full">
              <select
                value={selectedGameId}
                onChange={(e) => handleGameChange(e.target.value as (typeof DROPDOWN_GAME_OPTIONS)[number]["id"])}
                className="w-full rounded-md bg-[#0f212e] border border-[#2f4553] px-1 py-0.5 text-xs xl:text-sm text-white focus:outline-none focus:border-[#00e701]"
              >
                {DROPDOWN_GAME_OPTIONS.map((game) => (
                  <option key={game.id} value={game.id}>
                    {game.label}
                  </option>
                ))}
              </select>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div className="flex flex-col gap-2">
                <div className="rounded-md border border-[#213743] bg-[#1a2c38] p-1">
                  <div className="text-xs text-[#8399aa]">Profit</div>
                  <div className={`mt-0.5 font-mono font-bold ${netClass} text-sm xl:text-base`}>{formatMoney(selectedStats.net)}</div>
                </div>
                <div className="rounded-md border border-[#213743] bg-[#1a2c38] p-1">
                  <div className="text-xs text-[#8399aa]">Wagered</div>
                  <div className="mt-0.5 font-mono font-bold text-white text-sm xl:text-base">{formatMoney(selectedStats.wagered)}</div>
                </div>
              </div>

              <div className="flex flex-col gap-2">
                <div className="rounded-md border border-[#213743] bg-[#1a2c38] p-1">
                  <div className="text-xs text-[#8399aa]">Wins</div>
                  <div className="mt-0.5 font-mono font-bold text-white text-sm xl:text-base">{selectedStats.wins}</div>
                </div>
                <div className="rounded-md border border-[#213743] bg-[#1a2c38] p-1">
                  <div className="text-xs text-[#8399aa]">Losses</div>
                  <div className="mt-0.5 font-mono font-bold text-white text-sm xl:text-base">{selectedStats.losses}</div>
                </div>
              </div>
            </div>

            <div className="rounded-md border border-[#213743] bg-[#1a2c38] p-0.5">
              <div className="text-xs text-[#8399aa] mb-0.5">History</div>
              <div className="h-12 xl:h-32">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={chartData} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
                    <XAxis dataKey="x" hide />
                    <YAxis
                      hide
                      domain={[(dMin: number) => Math.min(dMin, yDomain.min, 0), (dMax: number) => Math.max(dMax, yDomain.max, 0)]}
                    />
                    <ReferenceLine y={0} stroke="#2f4553" strokeDasharray="4 4" />
                    <Line
                      type="monotone"
                      dataKey="pos"
                      stroke="#00e701"
                      strokeWidth={2}
                      dot={false}
                      isAnimationActive={false}
                    />
                    <Line
                      type="monotone"
                      dataKey="neg"
                      stroke="#ef4444"
                      strokeWidth={2}
                      dot={false}
                      isAnimationActive={false}
                    />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </div>

            <PlayTimeTracker />

            <div className="flex items-center justify-between gap-2">
              <div className="text-xs text-[#557086]">Start: {new Date(selectedStats.startedAt).toLocaleString()}</div>
              <button
                onClick={() => resetLiveStats("all")}
                className="inline-flex items-center gap-2 rounded-md bg-[#213743] px-2 py-2 text-sm font-bold text-white hover:bg-[#2f4553]"
              >
                <RestartAlt sx={{ fontSize: 18 }} />
                Reset
              </button>
            </div>
          </div>
        </section>
      </Draggable>
    </div>,
    document.body
  );
}
