"use client";

import React, { useEffect, useRef, useState } from "react";
import { useWallet } from "./WalletProvider";
import { getItem, setItem } from "../lib/indexedDB";

const PLAYTIME_KEY = "flopper_playtime_v1";
const INACTIVITY_MS = 10000;

function formatMs(ms: number) {
  const total = Math.floor(ms / 1000);
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const seconds = total % 60;
  if (hours > 0) return `${hours}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}

export default function PlayTimeTracker() {
  const { lastBetAt } = useWallet();

  const [totalMs, setTotalMs] = useState<number>(0);

  const totalMsRef = useRef<number>(totalMs);
  const hydratedRef = useRef(false);
  const runningRef = useRef(false);
  const intervalRef = useRef<number | null>(null);
  const pauseTimeoutRef = useRef<number | null>(null);
  const lastTickRef = useRef<number | null>(null);

  useEffect(() => {
    getItem<string | number>(PLAYTIME_KEY).then((raw) => {
      if (raw != null) {
        const n = typeof raw === "number" ? raw : parseInt(String(raw), 10);
        if (Number.isFinite(n)) {
          setTotalMs(n);
          totalMsRef.current = n;
        }
      }
      // mark hydrated to avoid overwriting stored value before load completes
      hydratedRef.current = true;
    });
  }, []);

  const startRunning = (now: number) => {
    if (runningRef.current) return;
    runningRef.current = true;
    lastTickRef.current = now;
    intervalRef.current = window.setInterval(() => {
      const t = Date.now();
      if (lastTickRef.current) {
        const delta = t - lastTickRef.current;
        setTotalMs((prev) => {
          const next = prev + delta;
          totalMsRef.current = next;
          return next;
        });
      }
      lastTickRef.current = t;
      // persist every tick to reduce lost time on reload
      if (hydratedRef.current) setItem(PLAYTIME_KEY, String(totalMsRef.current));
    }, 1000);
  };

  const pauseRunning = () => {
    if (!runningRef.current) return;
    runningRef.current = false;
    if (intervalRef.current) window.clearInterval(intervalRef.current);
    intervalRef.current = null;
    lastTickRef.current = null;
    // persist using ref to avoid stale state closure
    if (hydratedRef.current) setItem(PLAYTIME_KEY, String(totalMsRef.current));
  };

  useEffect(() => {
    // When lastBetAt updates, start or refresh the pause timer
    if (lastBetAt == null) return;

    const now = Date.now();
    startRunning(now);

    // always pause after INACTIVITY_MS from now (refresh on each bet)
    if (pauseTimeoutRef.current) {
      window.clearTimeout(pauseTimeoutRef.current);
      pauseTimeoutRef.current = null;
    }

    pauseTimeoutRef.current = window.setTimeout(() => {
      pauseRunning();
    }, INACTIVITY_MS);

    return () => {
      // no-op here; other effects handle cleanup
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lastBetAt]);

  useEffect(() => {
    return () => {
      if (intervalRef.current) window.clearInterval(intervalRef.current);
      if (pauseTimeoutRef.current) window.clearTimeout(pauseTimeoutRef.current);
      if (hydratedRef.current) setItem(PLAYTIME_KEY, String(totalMsRef.current));
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ensure ref stays in sync with state if loaded value changes
  useEffect(() => {
    totalMsRef.current = totalMs;
  }, [totalMs]);

  return (
    <div className="rounded-md border border-[#213743] bg-[#1a2c38] p-2">
      <div className="text-xs text-[#8399aa]">Active Play Time</div>
      <div className="mt-1 font-mono font-bold text-white">{formatMs(totalMs)}</div>
    </div>
  );
}
