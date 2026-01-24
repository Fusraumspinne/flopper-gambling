"use client";

import { useCallback, useEffect, useMemo, useRef } from "react";
import { useWallet } from "./WalletProvider";

const HOUR_MS = 60 * 60 * 1000;

export type HourlyRewardState = {
  claimableAmount: number;
  lastClaimAtMs: number;
  lastClaimISO: string;
};

export function useHourlyReward(options?: { amountPerHour?: number }) {
  const amountPerHour = options?.amountPerHour ?? 100;
  const { lastDailyReward, setLastDailyReward } = useWallet();
  const lastClaimRef = useRef(lastDailyReward);

  useEffect(() => {
    lastClaimRef.current = lastDailyReward;
  }, [lastDailyReward]);

  const derived = useMemo<HourlyRewardState>(() => {
    const nowMs = Date.now();
    const diff = nowMs - lastDailyReward;
    const hours = Math.floor(diff / HOUR_MS);
    const claimableAmount = Math.max(0, hours * amountPerHour);

    return {
      claimableAmount,
      lastClaimAtMs: lastDailyReward,
      lastClaimISO: new Date(lastDailyReward).toISOString(),
    };
  }, [lastDailyReward, amountPerHour]);

  const claim = useCallback(async (): Promise<number> => {
    const nowMs = Date.now();
    const diff = nowMs - lastClaimRef.current;
    const hours = Math.floor(diff / HOUR_MS);
    const amount = Math.max(0, hours * amountPerHour);

    if (amount <= 0) return 0;
    setLastDailyReward(nowMs);
    return amount;
  }, [amountPerHour]);

  return {
    ...derived,
    claim,
    refresh: () => {},
  };
}
