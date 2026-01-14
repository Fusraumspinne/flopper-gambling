"use client";

import { useEffect, useState } from "react";
import { fetchJsonCached } from "@/lib/fetchCache";

type HighscoreResponse = {
  game: string;
  highestProfit?: { username: string; profit: number } | null;
  highestMultiplier: { username: string; multiplier: number } | null;
  highestLoss?: { username: string; loss: number } | null;
};

function toTitleCaseFromId(gameId: string): string {
  const raw = gameId.trim();
  if (!raw) return "Game";

  const spaced = raw
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/[-_]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  return spaced
    .split(" ")
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(" ");
}

function formatName(name: string | undefined | null): string {
  const n = (name ?? "").trim();
  return n || "—";
}

function formatNumber(value: number | undefined | null, digits = 2): string {
  const v = typeof value === "number" && Number.isFinite(value) ? value : null;
  if (v === null) return "—";
  return v.toLocaleString(undefined, { minimumFractionDigits: digits, maximumFractionDigits: digits });
}

export default function GameRecordsPanel({ gameId, refreshSignal }: { gameId: string; refreshSignal?: number }) {
  const [data, setData] = useState<HighscoreResponse | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);

    const cacheKey = `highscores:${gameId}:${typeof refreshSignal === "number" ? refreshSignal : ""}`;

    (async () => {
      try {
        const json = await fetchJsonCached<HighscoreResponse>(
          cacheKey,
          async () => {
            const res = await fetch(`/api/highscores?game=${encodeURIComponent(gameId)}`);
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            return (await res.json()) as HighscoreResponse;
          },
          60_000
        );
        if (!cancelled) setData(json);
      } catch (e) {
        console.error("Failed to fetch highscores", e);
        if (!cancelled) setData(null);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [gameId, refreshSignal]);

  if (loading) {
    return <div className="text-white/50">Loading records…</div>;
  }

  const profit = data?.highestProfit ?? null;
  const profitUser = formatName(profit?.username);
  const profitValue = formatNumber(profit?.profit, 2);
  const multiUser = formatName(data?.highestMultiplier?.username);
  const multiValue = formatNumber(data?.highestMultiplier?.multiplier, 2);
  const lossUser = formatName(data?.highestLoss?.username);
  const lossValue = formatNumber(data?.highestLoss?.loss, 2);
  const title = toTitleCaseFromId(gameId);

  return (
    <section className="bg-[#213743] border border-[#2f4553]/60 rounded-xl p-3">
      <h3 className="text-white font-semibold text-lg">{title} Records</h3>

      <div className="mt-3 grid grid-cols-1 gap-3">
        <div className="bg-[#0f212e] border border-[#2f4553]/60 rounded-lg p-2">
          <div className="text-xs text-[#557086]">Highest multiplier</div>
          <div className="mt-1 flex items-baseline justify-between gap-3">
            <div className="text-white font-semibold truncate">{multiUser}</div>
            <div className="text-[#00e701] font-mono">x{multiValue}</div>
          </div>
        </div>

        <div className="bg-[#0f212e] border border-[#2f4553]/60 rounded-lg p-2">
          <div className="text-xs text-[#557086]">Highest profit</div>
          <div className="mt-1 flex items-baseline justify-between gap-3">
            <div className="text-white font-semibold truncate">{profitUser}</div>
            <div className="text-[#00e701] font-mono">${profitValue}</div>
          </div>
        </div>

        <div className="bg-[#0f212e] border border-[#2f4553]/60 rounded-lg p-2">
          <div className="text-xs text-[#557086]">Highest loss</div>
          <div className="mt-1 flex items-baseline justify-between gap-3">
            <div className="text-white font-semibold truncate">{lossUser}</div>
            <div className="text-[#00e701] font-mono">-${lossValue}</div>
          </div>
        </div>
      </div>
    </section>
  );
}
