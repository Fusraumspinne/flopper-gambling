"use client";

import { useCallback, useEffect, useMemo, useRef } from "react";
import { useSession } from "next-auth/react";
import { useWallet } from "./WalletProvider";

const HOUR_MS = 60 * 60 * 1000;

export type HourlyRewardState = {
  claimableAmount: number;
  lastClaimAtMs: number;
  lastClaimISO: string;
};

export function useHourlyReward(options?: { amountPerHour?: number }) {
  const amountPerHour = options?.amountPerHour ?? 100;
  const { lastDailyReward, syncBalance, applyServerBalanceDelta, applyServerLastDailyReward } = useWallet();
  const { data: session } = useSession();
  const username = session?.user?.name ?? null;
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
    if (!username) return 0;

    await syncBalance();

    const res = await fetch("/api/rewards/daily", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: username }),
    });

    const data = await res.json().catch(() => null);
    if (!res.ok || !data?.success) return 0;

    const amount = Number(data.amount) || 0;
    if (amount > 0) applyServerBalanceDelta(amount);

    const nextLast = Number(data.lastDailyReward ?? Date.now());
    applyServerLastDailyReward(nextLast);
    return amount;
  }, [username, syncBalance, applyServerBalanceDelta, applyServerLastDailyReward]);

  return {
    ...derived,
    claim,
    refresh: () => {},
  };
}
