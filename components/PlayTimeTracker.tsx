"use client";

import React, { useEffect, useRef, useState } from "react";
import { useWallet } from "./WalletProvider";
import { getItem, setItem } from "../lib/indexedDB";

const PLAYTIME_KEY = "flopper_playtime_v1";
// Count only while the user is actively playing.
// IMPORTANT: This should not reward "just leaving the tab open".
const INACTIVITY_MS = 10_000;
const PERSIST_EVERY_MS = 10_000;

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
  const lastTickPerfRef = useRef<number | null>(null);
  const persistTimerRef = useRef<number | null>(null);
  const hasInteractedRef = useRef(false);
  const lastBetAtRef = useRef<number | null>(null);

  useEffect(() => {
    lastBetAtRef.current = lastBetAt;
  }, [lastBetAt]);

  const isPageVisible = () => typeof document !== "undefined" && document.visibilityState === "visible";

  const persistNow = () => {
    if (!hydratedRef.current) return;
    void setItem(PLAYTIME_KEY, totalMsRef.current);
  };

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

  const canCountNow = () => {
    // Only start/resume after *real interaction* OR after a bet happened.
    return hasInteractedRef.current || lastBetAtRef.current != null;
  };

  const startRunning = () => {
    if (runningRef.current) return;
    if (!isPageVisible()) return;
    if (!canCountNow()) return;
    runningRef.current = true;
    lastTickPerfRef.current = performance.now();
    intervalRef.current = window.setInterval(() => {
      const nowPerf = performance.now();
      const prevPerf = lastTickPerfRef.current;

      if (typeof prevPerf === "number") {
        // Clamp to avoid negative deltas and absurd jumps.
        const rawDelta = nowPerf - prevPerf;
        const delta = Math.min(Math.max(0, rawDelta), 10_000);
        if (delta > 0) {
          setTotalMs((prev) => {
            const next = prev + delta;
            totalMsRef.current = next;
            return next;
          });
        }
      }

      lastTickPerfRef.current = nowPerf;
    }, 1000);

    if (!persistTimerRef.current) {
      persistTimerRef.current = window.setInterval(() => {
        persistNow();
      }, PERSIST_EVERY_MS);
    }
  };

  const pauseRunning = () => {
    if (!runningRef.current) return;
    runningRef.current = false;
    if (intervalRef.current) window.clearInterval(intervalRef.current);
    intervalRef.current = null;
    lastTickPerfRef.current = null;
    if (persistTimerRef.current) window.clearInterval(persistTimerRef.current);
    persistTimerRef.current = null;
    persistNow();
  };

  const refreshInactivityTimer = () => {
    if (pauseTimeoutRef.current) {
      window.clearTimeout(pauseTimeoutRef.current);
      pauseTimeoutRef.current = null;
    }

    // If the tab is hidden, do not keep counting.
    if (!isPageVisible()) {
      pauseRunning();
      return;
    }

    if (!canCountNow()) {
      pauseRunning();
      return;
    }

    startRunning();

    pauseTimeoutRef.current = window.setTimeout(() => {
      pauseRunning();
    }, INACTIVITY_MS);
  };

  useEffect(() => {
    if (lastBetAt == null) return;
    // A bet is definitely "activity".
    refreshInactivityTimer();
  }, [lastBetAt]);

  useEffect(() => {
    const onActivity = () => {
      hasInteractedRef.current = true;
      refreshInactivityTimer();
    };
    const onVisibility = () => {
      if (isPageVisible()) {
        // Do NOT start counting just because the tab became visible.
        // Only resume if we already have real interaction or a bet.
        if (canCountNow()) refreshInactivityTimer();
      } else {
        pauseRunning();
      }
    };

    // Start counting once the user interacts (avoids counting idle tab time).
    window.addEventListener("pointerdown", onActivity, { passive: true });
    window.addEventListener("keydown", onActivity);
    window.addEventListener("wheel", onActivity, { passive: true });
    window.addEventListener("touchstart", onActivity, { passive: true });
    document.addEventListener("visibilitychange", onVisibility);

    return () => {
      window.removeEventListener("pointerdown", onActivity);
      window.removeEventListener("keydown", onActivity);
      window.removeEventListener("wheel", onActivity);
      window.removeEventListener("touchstart", onActivity);
      document.removeEventListener("visibilitychange", onVisibility);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    return () => {
      if (intervalRef.current) window.clearInterval(intervalRef.current);
      if (pauseTimeoutRef.current) window.clearTimeout(pauseTimeoutRef.current);
      if (persistTimerRef.current) window.clearInterval(persistTimerRef.current);
      persistNow();
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
