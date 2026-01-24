"use client";

import { useEffect, useMemo, useState } from "react";
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
  const cappedPrincipal = Math.min(principal, 100000);
  const nonInterestPrincipal = principal - cappedPrincipal;
  const elapsedMs = Math.max(0, nowMs - startedAtMs);
  const hours = elapsedMs / HOUR_MS;
  const interestValue = cappedPrincipal * (1 + RATE_PER_HOUR * hours);
  const totalValue = interestValue + nonInterestPrincipal;
  return normalizeMoney(totalValue);
}

export default function InvestmentPanel() {
  const { balance, creditBalance, debitBalance, investment, updateInvestment } = useWallet();

  const [principal, setPrincipal] = useState(investment.principal);
  const [startedAtMs, setStartedAtMs] = useState<number>(() => investment.startedAtMs || Date.now());
  const [amountRaw, setAmountRaw] = useState("100");
  const [nowMs, setNowMs] = useState(() => Date.now());
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setPrincipal(investment.principal);
    setStartedAtMs(investment.startedAtMs || Date.now());
  }, [investment.principal, investment.startedAtMs]);

  useEffect(() => {
    const id = window.setInterval(() => setNowMs(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, []);

  // Investment value is computed on the fly; we only persist on deposit/withdraw.

  const currentValue = useMemo(() => computeCurrentValue(principal, startedAtMs, nowMs), [principal, startedAtMs, nowMs]);
  const amount = useMemo(() => parseAmount(amountRaw), [amountRaw]);

  const canDeposit = amount > 0 && amount <= balance;
  const canWithdraw = amount > 0 && amount <= currentValue;

  const onDeposit = () => {
    setError(null);
    if (amount <= 0) return;
    if (amount > balance) {
      setError("Not enough balance.");
      return;
    }

    const now = Date.now();
    const valueNow = computeCurrentValue(principal, startedAtMs, now);

    const accepted = debitBalance(amount);
    if (!accepted) {
      setError("Not enough balance.");
      return;
    }

    const nextPrincipal = normalizeMoney(valueNow + amount);
    setPrincipal(nextPrincipal);
    setStartedAtMs(now);
    updateInvestment({ principal: nextPrincipal, startedAtMs: now });
  };

  const onWithdraw = () => {
    setError(null);
    if (amount <= 0) return;

    const now = Date.now();
    const valueNow = computeCurrentValue(principal, startedAtMs, now);
    if (amount > valueNow) {
      setError("Not enough available to withdraw.");
      return;
    }

    creditBalance(amount);
    const remaining = normalizeMoney(valueNow - amount);
    setPrincipal(remaining);
    setStartedAtMs(now);
    updateInvestment({ principal: remaining, startedAtMs: now });
  };

  return (
    <section className="mb-6 bg-[#213743] border border-[#2f4553]/60 rounded-xl p-5">
      <div className="flex items-start">
        <div>
          <h2 className="text-white font-semibold text-xl">Invest</h2>
          <p className="text-sm text-[#b1bad3]">
            Deposit from your balance and earn <span className="text-white font-semibold">1% per hour</span> (max on $100,000) — live, updated every
            second
          </p>
        </div>
      </div>

      <div className="mt-4 bg-[#0f212e] rounded-lg p-4 border border-[#2f4553]/60">
        <div className="text-xs text-[#557086]">Currently in investment</div>
        <div className="text-white font-semibold text-2xl">${currentValue.toFixed(2)}</div>
      </div>

      <div className="mt-4 flex flex-col sm:flex-row gap-2 sm:items-center">
        <input
          value={amountRaw}
          onChange={(e) => setAmountRaw(e.target.value)}
          inputMode="decimal"
          className="w-full bg-[#0f212e] border border-[#2f4553]/60 rounded-lg px-3 py-2 text-white outline-none"
          placeholder="Amount"
          aria-label="Amount"
        />

        <button
          onClick={onDeposit}
          disabled={!canDeposit}
          className="px-4 py-2 rounded-lg bg-[#2f4553] text-white font-semibold disabled:opacity-50 disabled:cursor-not-allowed"
        >
          Deposit
        </button>

        <button
          onClick={onWithdraw}
          disabled={!canWithdraw}
          className="px-4 py-2 rounded-lg bg-[#1a2c38] border border-[#2f4553]/60 text-white font-semibold disabled:opacity-50 disabled:cursor-not-allowed"
        >
          Withdraw
        </button>
      </div>

      {error ? <div className="mt-3 text-sm text-[#ffb4b4]">{error}</div> : null}
    </section>
  );
}
