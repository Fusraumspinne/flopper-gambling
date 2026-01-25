"use client";

import { useEffect, useMemo, useState } from "react";
import { useSession } from "next-auth/react";
import { useWallet } from "@/components/WalletProvider";

const HOUR_MS = 60 * 60 * 1000;
const RATE_PER_HOUR = 0.01;

function normalizeMoney(value: number): number {
  if (!Number.isFinite(value)) return 0;
  const rounded = Math.round((value + Number.EPSILON) * 100) / 100;
  return Object.is(rounded, -0) ? 0 : rounded;
}

function parseAmount(raw: string): number {
  const cleaned = raw.replace(",", ".").replace(/[^0-9.]/g, "");
  const n = Number(cleaned);
  return Number.isFinite(n) ? normalizeMoney(n) : 0;
}

function computeCurrentValue(principal: number, startedAtMs: number, nowMs: number): number {
  if (principal <= 0) return 0;
  const elapsedMs = Math.max(0, nowMs - startedAtMs);
  const hours = elapsedMs / HOUR_MS;
  const value = principal * (1 + RATE_PER_HOUR * hours);
  return normalizeMoney(value);
}

export default function GiftPanel() {
  const { balance, debitBalance, investment } = useWallet();
  const { data: session } = useSession();

  const [username, setUsername] = useState<string | null>(null);
  const [recipient, setRecipient] = useState("");
  const [amountRaw, setAmountRaw] = useState("100");
  const [error, setError] = useState<string | null>(null);

  const [investmentValue, setInvestmentValue] = useState(0);
  const [nowMs, setNowMs] = useState(() => Date.now());

  useEffect(() => {
    setUsername(session?.user?.name ?? null);
  }, [session?.user?.name]);

  useEffect(() => {
    const id = window.setInterval(() => setNowMs(Date.now()), 1500);
    return () => window.clearInterval(id);
  }, []);

  useEffect(() => {
    let cancelled = false;
    const value = computeCurrentValue(investment.principal, investment.startedAtMs, nowMs);
    if (!cancelled) setInvestmentValue(value);
    return () => {
      cancelled = true;
    };
  }, [nowMs, balance, investment.principal, investment.startedAtMs]);

  const totalAssets = useMemo(() => normalizeMoney(balance + investmentValue), [balance, investmentValue]);
  const showPanel = totalAssets > 0;

  const maxGift = useMemo(() => Math.max(0, balance), [balance]);

  const amount = useMemo(() => parseAmount(amountRaw), [amountRaw]);

  const onSendGift = async () => {
    setError(null);

    const to = recipient;
    if (!to.trim()) {
      setError("Please enter a recipient name.");
      return;
    }

    if (amount <= 0) {
      setError("Please enter an amount.");
      return;
    }

    if (amount > maxGift) {
      setError(`Max gift is ${maxGift.toFixed(2)}.`);
      return;
    }

    try {
      const sender = username;
      const res = await fetch("/api/gifts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sender, recipient: to, amount }),
      });

      if (res.status === 404) {
        setError("Recipient not found (must be an exact match).");
        return;
      }

      if (!res.ok) {
        const data = await res.json().catch(() => null);
        setError(data?.message ?? "Could not send gift.");
        return;
      }

      const debited = debitBalance(amount);
      if (!debited) {
        setError("Not enough wallet balance.");
        return;
      }

      setRecipient("");
      setAmountRaw("100");
    } catch (e) {
      console.error("Failed to send gift", e);
      setError("Could not send gift. Check console.");
    }
  };

  if (!showPanel) {
    return null;
  }

  return (
    <section className="mb-6 bg-[#213743] border border-[#2f4553]/60 rounded-xl p-5">
      <div>
        <h2 className="text-white font-semibold text-xl">Gifts</h2>
        <p className="text-sm text-[#b1bad3]">
          You can gift money to leaderboard players, gifts are taken from your balance
        </p>
      </div>

      <div className="mt-4 bg-[#0f212e] rounded-lg p-4 border border-[#2f4553]/60">
        <div className="text-xs text-[#557086]">You can only gift money from your balance</div>
        <div className="text-white font-semibold text-2xl">${balance.toFixed(2)}</div>
        <div className="mt-1 text-xs text-[#557086]">Max gift right now: ${maxGift.toFixed(2)}</div>
      </div>

      <div className="mt-4 flex flex-col sm:flex-row gap-2 sm:items-center">
        <input
          value={recipient}
          onChange={(e) => setRecipient(e.target.value)}
          className="flex-1 bg-[#0f212e] border border-[#2f4553]/60 rounded-lg px-3 py-2 text-white outline-none"
          placeholder="Recipient name"
          aria-label="Recipient name"
        />
        <input
          value={amountRaw}
          onChange={(e) => setAmountRaw(e.target.value)}
          inputMode="decimal"
          className="flex-1 bg-[#0f212e] border border-[#2f4553]/60 rounded-lg px-3 py-2 text-white outline-none"
          placeholder="Amount"
          aria-label="Amount"
        />
        <button
          onClick={onSendGift}
          className="flex-none w-auto px-4 py-2 rounded-lg bg-[#00e701] hover:bg-[#00c701] text-black font-bold whitespace-nowrap disabled:opacity-50 disabled:cursor-not-allowed"
          disabled={amount <= 0 || amount > maxGift || !recipient.trim()}
        >
          Send gift
        </button>
      </div>

      {error ? <div className="mt-3 text-sm text-[#ffb4b4]">{error}</div> : null}
    </section>
  );
}
