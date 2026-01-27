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
  const [amountRaw, setAmountRaw] = useState("0");
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

  const performDepositAll = async () => {
    setError(null);
    if (!username) { setError("Not logged in."); return; }
    await syncBalance();
    const amountAll = normalizeMoney(balance ?? 0);
    if (amountAll <= 0) return;

    const res = await fetch("/api/invest", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: username, action: "deposit", amount: amountAll }),
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

  const performWithdrawAll = async () => {
    setError(null);
    if (!username) { setError("Not logged in."); return; }
    const now = Date.now();
    const valueNow = computeCurrentValue(principal, startedAtMs, now);
    if (valueNow <= 0) return;
    await syncBalance();

    const res = await fetch("/api/invest", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: username, action: "withdraw", amount: valueNow }),
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

  const setAmountBoth = (next: number) => {
    const v = normalizeMoney(next);
    setPrincipal((p) => p);
    setAmountRaw(String(v));
  };

  return (
    <section className="mb-6 bg-[#213743] border border-[#2f4553]/60 rounded-xl p-5">
      <div className="flex items-start">
        <div>
          <h2 className="text-white font-semibold text-xl">Invest</h2>
          <p className="text-sm text-[#b1bad3]">
            Deposit from your balance and earn 1% per day
          </p>
        </div>
      </div>

      <div className="mt-4 bg-[#0f212e] rounded-lg p-4 border border-[#2f4553]/60">
        <div className="text-xs text-[#557086]">Currently in investment</div>
        <div className="text-white font-semibold text-2xl">${currentValue.toFixed(2)}</div>
      </div>

      <div className="mt-4">
        <div className="relative">
          <div className="absolute left-3 top-1/2 -translate-y-1/2 text-[#b1bad3]">$</div>
          <input
            type="number"
            step="0.01"
            min="0"
            value={amountRaw}
            onChange={(e) => {
              let v = e.target.value;
              if (v === "") { setAmountRaw(""); return; }
              if (parseFloat(v) < 0) v = "0";
              setAmountRaw(v);
            }}
            onBlur={() => {
              const raw = (amountRaw ?? "").toString();
              const sanitized = raw.replace(/^0+(?=\d)/, "") || "0";
              const num = Number(sanitized);
              setAmountBoth(num);
            }}
            inputMode="decimal"
            className="w-full bg-[#0f212e] border border-[#2f4553]/60 rounded-lg pl-10 pr-3 py-2 text-white font-mono focus:outline-none focus:border-[#00e701] transition-colors"
            placeholder="Amount"
            aria-label="Amount"
          />
        </div>

        <div className="grid grid-cols-4 gap-2 w-full mt-4">
          <button
            onClick={onDeposit}
            disabled={!canDeposit}
            className="w-full h-10 flex items-center justify-center rounded-lg bg-[#2b3f49] hover:bg-[#3e5666] text-white font-semibold disabled:opacity-50 disabled:cursor-not-allowed transition-colors focus-visible:ring-2 focus-visible:ring-[#00e701]"
          >
            Deposit
          </button>
          <button
            type="button"
            onClick={performDepositAll}
            aria-label="Deposit all"
            title="Deposit all"
            disabled={(balance ?? 0) <= 0}
            className="w-full h-10 flex items-center justify-center rounded-lg bg-[#2b3f49] hover:bg-[#3e5666] text-white font-semibold disabled:opacity-50 disabled:cursor-not-allowed transition-colors focus-visible:ring-2 focus-visible:ring-[#00e701]"
          >
            Deposit all
          </button>

          <button
            onClick={onWithdraw}
            disabled={!canWithdraw}
            className="w-full h-10 flex items-center justify-center rounded-lg bg-[#2b3f49] hover:bg-[#3e5666] text-white font-semibold disabled:opacity-50 disabled:cursor-not-allowed transition-colors focus-visible:ring-2 focus-visible:ring-[#00e701]"
          >
            Withdraw
          </button>
          <button
            type="button"
            onClick={performWithdrawAll}
            aria-label="Withdraw all"
            title="Withdraw all"
            disabled={currentValue <= 0}
            className="w-full h-10 flex items-center justify-center rounded-lg bg-[#2b3f49] hover:bg-[#3e5666] text-white font-semibold disabled:opacity-50 disabled:cursor-not-allowed transition-colors focus-visible:ring-2 focus-visible:ring-[#00e701]"
          >
            Withdraw all
          </button>
        </div>
      </div>

      {error ? <div className="mt-3 text-sm text-[#ffb4b4]">{error}</div> : null}
    </section>
  );
}