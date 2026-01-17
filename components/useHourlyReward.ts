"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { getItem, setItem } from "../lib/indexedDB";

const HOUR_MS = 60 * 60 * 1000;

type StoredRewardState = {
  lastClaimAtMs: number;
};

function safeParseNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value !== "string") return null;

  const n = Number(value);
  if (Number.isFinite(n)) return n;

  const t = Date.parse(value);
  return Number.isFinite(t) ? t : null;
}

async function readStoredMs(primaryKey: string): Promise<number | null> {
  const raw = await getItem<string>(primaryKey);
  if (!raw) return null;

  if (raw.trim().startsWith("{")) {
    try {
      const parsed = JSON.parse(raw) as Partial<StoredRewardState>;
      if (typeof parsed?.lastClaimAtMs === "number" && Number.isFinite(parsed.lastClaimAtMs)) {
        return parsed.lastClaimAtMs;
      }
    } catch {
    }
  }

  return safeParseNumber(raw);
}

async function writeStoredState(primaryKey: string, lastClaimAtMs: number) {
  await setItem(primaryKey, new Date(lastClaimAtMs).toISOString());
}

async function ensureInitialized(primaryKey: string, legacyKeys: string[]) {
  const nowMs = Date.now();

  const existing = await readStoredMs(primaryKey);
  if (existing !== null) return;

  let bestMs: number | null = null;
  for (const key of legacyKeys) {
    const ms = await readStoredMs(key);
    if (ms === null) continue;
    bestMs = bestMs === null ? ms : Math.max(bestMs, ms);
  }

  await writeStoredState(primaryKey, bestMs ?? nowMs);
}

export type HourlyRewardState = {
  claimableAmount: number;
  lastClaimAtMs: number;
  lastClaimISO: string;
};

export function useHourlyReward(options?: { amountPerHour?: number; storageKeyPrefix?: string }) {
  const amountPerHour = options?.amountPerHour ?? 100;
  const prefix = options?.storageKeyPrefix ?? "flopper_hourly_reward";

  const primaryKey = useMemo(() => `${prefix}_last_claim_v1`, [prefix]);

  const legacyKeys = useMemo(
    () => [
      "flopper_free_last_claim_v2",
      "flopper_free_last_claim",
      `${prefix}_last_claim_ms_v1`,
      `${prefix}_last_claim_ms_max_v1`,
    ],
    [prefix]
  );

  const [state, setState] = useState<StoredRewardState>(() => ({ lastClaimAtMs: Date.now() }));
  const stateRef = useRef<StoredRewardState>(state);
  stateRef.current = state;

  const hydratedRef = useRef(false);

  const recomputeFromStorage = useCallback(async () => {
    try {
      await ensureInitialized(primaryKey, legacyKeys);
      const storedMs = await readStoredMs(primaryKey);
      if (storedMs === null) return;

      if (!hydratedRef.current) {
        hydratedRef.current = true;
        setState({ lastClaimAtMs: storedMs });
        return;
      }

      setState({ lastClaimAtMs: storedMs });
    } catch {
    }
  }, [primaryKey, legacyKeys]);

  useEffect(() => {
    recomputeFromStorage();

    const id = window.setInterval(recomputeFromStorage, 60_000);
    
    return () => {
      window.clearInterval(id);
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

  const claim = useCallback(async (): Promise<number> => {
    const nowMs = Date.now();

    try {
      await ensureInitialized(primaryKey, legacyKeys);
      const storedMs = await readStoredMs(primaryKey);
      const baseMs = storedMs === null ? nowMs : storedMs;
      const diff = nowMs - baseMs;
      const hours = Math.floor(diff / HOUR_MS);
      const amount = Math.max(0, hours * amountPerHour);

      if (amount <= 0) {
        setState({ lastClaimAtMs: baseMs });
        return 0;
      }

      await writeStoredState(primaryKey, nowMs);
      setState({ lastClaimAtMs: nowMs });
      return amount;
    } catch {
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
