"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

const HOUR_MS = 60 * 60 * 1000;

type StoredRewardState = {
  lastClaimAtMs: number;
};

function safeParseNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value !== "string") return null;

  // Supports JSON numeric strings, plain numeric strings, and ISO strings.
  const n = Number(value);
  if (Number.isFinite(n)) return n;

  const t = Date.parse(value);
  return Number.isFinite(t) ? t : null;
}

function readStoredMs(primaryKey: string): number | null {
  const raw = localStorage.getItem(primaryKey);
  if (!raw) return null;

  // Support JSON payloads from future versions.
  if (raw.trim().startsWith("{")) {
    try {
      const parsed = JSON.parse(raw) as Partial<StoredRewardState>;
      if (typeof parsed?.lastClaimAtMs === "number" && Number.isFinite(parsed.lastClaimAtMs)) {
        return parsed.lastClaimAtMs;
      }
    } catch {
      // ignore
    }
  }

  return safeParseNumber(raw);
}

function writeStoredState(primaryKey: string, lastClaimAtMs: number) {
  localStorage.setItem(primaryKey, new Date(lastClaimAtMs).toISOString());
}

function ensureInitialized(primaryKey: string, legacyKeys: string[]) {
  const nowMs = Date.now();

  const existing = readStoredMs(primaryKey);
  if (existing !== null) return;

  // Migrate: take the newest timestamp across all legacy keys.
  let bestMs: number | null = null;
  for (const key of legacyKeys) {
    const ms = readStoredMs(key);
    if (ms === null) continue;
    bestMs = bestMs === null ? ms : Math.max(bestMs, ms);
  }

  writeStoredState(primaryKey, bestMs ?? nowMs);
}

export type HourlyRewardState = {
  claimableAmount: number;
  lastClaimAtMs: number;
  lastClaimISO: string;
};

export function useHourlyReward(options?: { amountPerHour?: number; storageKeyPrefix?: string }) {
  const amountPerHour = options?.amountPerHour ?? 100;
  const prefix = options?.storageKeyPrefix ?? "flopper_hourly_reward";

  // Single, human-readable key.
  const primaryKey = useMemo(() => `${prefix}_last_claim_v1`, [prefix]);

  const legacyKeys = useMemo(
    () => [
      // Previous implementations used ISO strings in these keys.
      "flopper_free_last_claim_v2",
      "flopper_free_last_claim",
      // Earlier hourly reward versions stored ms/iso in these keys.
      `${prefix}_last_claim_ms_v1`,
      `${prefix}_last_claim_ms_max_v1`,
    ],
    [prefix]
  );

  const [state, setState] = useState<StoredRewardState>(() => ({ lastClaimAtMs: Date.now() }));
  const stateRef = useRef<StoredRewardState>(state);
  stateRef.current = state;

  const hydratedRef = useRef(false);

  const recomputeFromStorage = useCallback(() => {
    try {
      ensureInitialized(primaryKey, legacyKeys);
      const storedMs = readStoredMs(primaryKey);
      if (storedMs === null) return;

      // First hydration must trust storage (avoid overwriting it with the initial in-memory value).
      if (!hydratedRef.current) {
        hydratedRef.current = true;
        setState({ lastClaimAtMs: storedMs });
        return;
      }

      // After hydration, just reflect storage; do not write back here.
      setState({ lastClaimAtMs: storedMs });
    } catch {
      // If localStorage is unavailable, keep current in-memory state.
    }
  }, [primaryKey, legacyKeys]);

  useEffect(() => {
    recomputeFromStorage();

    const id = window.setInterval(recomputeFromStorage, 60_000);
    const onStorage = (e: StorageEvent) => {
      if (e.key === primaryKey) recomputeFromStorage();
    };

    window.addEventListener("storage", onStorage);
    return () => {
      window.clearInterval(id);
      window.removeEventListener("storage", onStorage);
    };
  }, [recomputeFromStorage, primaryKey]);

  const derived = useMemo<HourlyRewardState>(() => {
    const nowMs = Date.now();
    const diff = nowMs - state.lastClaimAtMs;
    const hours = Math.floor(diff / HOUR_MS);
    const claimableAmount = Math.max(0, hours * amountPerHour);

    return {
      claimableAmount,
      lastClaimAtMs: state.lastClaimAtMs,
      lastClaimISO: new Date(state.lastClaimAtMs).toISOString(),
    };
  }, [state.lastClaimAtMs, amountPerHour]);

  const claim = useCallback((): number => {
    const nowMs = Date.now();

    try {
      ensureInitialized(primaryKey, legacyKeys);
      const storedMs = readStoredMs(primaryKey);
      const baseMs = storedMs === null ? nowMs : storedMs;
      const diff = nowMs - baseMs;
      const hours = Math.floor(diff / HOUR_MS);
      const amount = Math.max(0, hours * amountPerHour);

      if (amount <= 0) {
        setState({ lastClaimAtMs: baseMs });
        return 0;
      }

      // Store the exact claim time so minutes/seconds update immediately.
      writeStoredState(primaryKey, nowMs);
      setState({ lastClaimAtMs: nowMs });
      return amount;
    } catch {
      // Fallback: use in-memory state (prevents multi-claim in same session).
      const baseMs = stateRef.current.lastClaimAtMs;
      const diff = nowMs - baseMs;
      const hours = Math.floor(diff / HOUR_MS);
      const amount = Math.max(0, hours * amountPerHour);
      if (amount <= 0) return 0;

      setState({ lastClaimAtMs: nowMs });
      return amount;
    }
  }, [amountPerHour, primaryKey, legacyKeys]);

  return {
    ...derived,
    claim,
    refresh: recomputeFromStorage,
  };
}
