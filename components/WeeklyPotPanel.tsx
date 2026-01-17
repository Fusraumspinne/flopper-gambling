"use client";

import React, { useState, useEffect } from "react";
import { useWallet } from "@/components/WalletProvider";

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

export default function WeeklyPotPanel() {
  const { weeklyPot, lastClaim, claimWeeklyPot } = useWallet();
  const [now, setNow] = useState(Date.now());
  const [claiming, setClaiming] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 10000);
    return () => clearInterval(timer);
  }, []);

  const timeSinceLastClaim = now - lastClaim;
  const canClaim = weeklyPot > 0 && timeSinceLastClaim >= WEEK_MS;
  const nextClaimDate = new Date(lastClaim + WEEK_MS);

  const handleClaim = async () => {
    setClaiming(true);
    setError(null);
    try {
      const res = await claimWeeklyPot();
      if (!res.success) setError(res.error || "Fehler");
    } catch (e) {
      setError("Systemfehler beim Claim.");
    } finally {
      setClaiming(false);
    }
  };

  const getButtonText = () => {
    if (claiming) return "Processing...";
    if (canClaim) return "Claim Now";

    if (weeklyPot <= 0) return "No payback available";

    return `Available at ${nextClaimDate.toLocaleDateString()} ${nextClaimDate.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`;
  };

  return (
    <section className="mb-6 bg-[#213743] border border-[#2f4553]/60 rounded-xl p-5">
      <div className="flex items-start">
        <div>
          <h2 className="text-white font-semibold text-xl">Weekly payback</h2>
          <p className="text-sm text-[#b1bad3]">
            Claim your weekly payback, available once per week (10% off your losses)
          </p>
        </div>
      </div>

      <div className="mt-4 bg-[#0f212e] rounded-lg p-4 border border-[#2f4553]/60">
        <div className="text-xs text-[#557086]">Current payback</div>
        <div className="text-white font-semibold text-2xl">
          ${weeklyPot.toFixed(2)}
        </div>
      </div>

      <div className="mt-4 flex flex-col gap-2">
        <button
          className="px-4 py-2 rounded-lg bg-[#2f4553] text-white font-semibold disabled:opacity-50 disabled:cursor-not-allowed hover:bg-[#3a5363] transition-colors"
          disabled={!canClaim || claiming}
          onClick={handleClaim}
        >
          {getButtonText()}
        </button>
      </div>
    </section>
  );
}
