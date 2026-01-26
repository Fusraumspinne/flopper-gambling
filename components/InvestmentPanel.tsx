"use client";

import { useEffect, useMemo, useState } from "react";
import { useSession } from "next-auth/react";
import { useWallet } from "@/components/WalletProvider";
import OutboxIcon from '@mui/icons-material/Outbox';

const HOUR_MS = 60 * 60 * 1000;
const RATE_PER_HOUR = 0.01 / 24;

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
  const totalValue = principal * (1 + RATE_PER_HOUR * hours);
  return normalizeMoney(totalValue);
}

export default function InvestmentPanel() {
  const { data: session } = useSession();
  const username = session?.user?.name ?? null;
  const { balance, investment, syncBalance, applyServerBalanceDelta, applyServerInvestment } = useWallet();

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

  const currentValue = useMemo(() => computeCurrentValue(principal, startedAtMs, nowMs), [principal, startedAtMs, nowMs]);
  const amount = useMemo(() => parseAmount(amountRaw), [amountRaw]);

  const normalizedBalance = normalizeMoney(balance ?? 0);
  const canDeposit = amount > 0 && amount <= normalizedBalance;
  const canWithdraw = amount > 0 && amount <= currentValue;

  const onDeposit = async () => {
    setError(null);
    if (!username) {
      setError("Not logged in.");
      return;
    }
    if (amount <= 0) return;
    if (amount > normalizedBalance) {
      setError("Not enough balance.");
      return;
    }

    await syncBalance();

    const res = await fetch("/api/invest", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: username, action: "deposit", amount }),
    });

    const data = await res.json().catch(() => null);
    if (!res.ok || !data?.success) {
      setError(data?.message || "Deposit failed.");
      return;
    }

    const delta = Number(data.balanceDelta) || 0;
    if (delta !== 0) applyServerBalanceDelta(delta);
    if (data.investment) applyServerInvestment(data.investment);
  };

  const onWithdraw = async () => {
    setError(null);
    if (!username) {
      setError("Not logged in.");
      return;
    }
    if (amount <= 0) return;

    const now = Date.now();
    const valueNow = computeCurrentValue(principal, startedAtMs, now);
    if (amount > valueNow) {
      setError("Not enough available to withdraw.");
      return;
    }

    await syncBalance();

    const res = await fetch("/api/invest", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: username, action: "withdraw", amount }),
    });

    const data = await res.json().catch(() => null);
    if (!res.ok || !data?.success) {
      setError(data?.message || "Withdraw failed.");
      return;
    }

    const delta = Number(data.balanceDelta) || 0;
    if (delta !== 0) applyServerBalanceDelta(delta);
    if (data.investment) applyServerInvestment(data.investment);
  };

  const setMaxDeposit = () => setAmountRaw(normalizeMoney(balance ?? 0).toFixed(2));
  const setMaxWithdraw = () => setAmountRaw(currentValue.toFixed(2));

  return (
    <section className="mb-6 bg-[#213743] border border-[#2f4553]/60 rounded-xl p-5">
      <div className="flex items-start">
        <div>
          <h2 className="text-white font-semibold text-xl">Invest</h2>
          <p className="text-sm text-[#b1bad3]">
            Deposit from your balance and earn <span className="text-white font-semibold">1% per day</span> — live, updated every
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
          className="flex-1 bg-[#0f212e] border border-[#2f4553]/60 rounded-lg px-3 py-2 text-white outline-none"
          placeholder="Amount"
          aria-label="Amount"
        />

        <div className="flex items-center gap-2">
          <button
            onClick={onDeposit}
            disabled={!canDeposit}
            className="px-4 py-2 rounded-lg bg-[#2b3f49] text-white font-semibold disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Deposit
          </button>
          <button
            type="button"
            onClick={setMaxDeposit}
            aria-label="All balance"
            title="All balance"
            disabled={(balance ?? 0) <= 0}
            className="w-10 h-10 flex items-center justify-center rounded-lg bg-[#2b3f49] text-white disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <OutboxIcon fontSize="small" />
          </button>

          <button
            onClick={onWithdraw}
            disabled={!canWithdraw}
            className="px-4 py-2 rounded-lg bg-[#2b3f49] text-white font-semibold disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Withdraw
          </button>
          <button
            type="button"
            onClick={setMaxWithdraw}
            aria-label="All invest"
            title="All invest"
            disabled={currentValue <= 0}
            className="w-10 h-10 flex items-center justify-center rounded-lg bg-[#2b3f49] text-white disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <OutboxIcon fontSize="small" />
          </button>
        </div>
      </div>

      {error ? <div className="mt-3 text-sm text-[#ffb4b4]">{error}</div> : null}
    </section>
  );
}