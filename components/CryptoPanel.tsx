"use client";

import { useEffect, useMemo, useState } from "react";
import { useRef } from "react";
import { useSession } from "next-auth/react";
import { useWallet } from "@/components/WalletProvider";

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

function Sparkline({ points }: { points: number[] }) {
  if (!points || points.length === 0) return <div className="text-sm text-[#b1bad3]">No data</div>;
  const w = 360;
  const h = 80;
  const min = Math.min(...points);
  const max = Math.max(...points);
  const range = max - min || 1;
  const step = w / Math.max(1, points.length - 1);
  const path = points.map((p, i) => `${i === 0 ? "M" : "L"}${i * step},${h - ((p - min) / range) * h}`).join(" ");
  return (
    <svg viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" width="100%" height={h} className="w-full h-20" style={{ display: 'block' }}>
      <defs>
        <linearGradient id="g" x1="0" x2="0" y1="0" y2="1">
          <stop offset="0%" stopColor="#60a5fa" stopOpacity="0.18" />
          <stop offset="100%" stopColor="#60a5fa" stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={path} fill="none" stroke="#60a5fa" strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
      <path d={`${path} L ${w}, ${h} L 0, ${h} Z`} fill="url(#g)" opacity={0.9} />
    </svg>
  );
}

export default function CryptoPanel() {
  const { data: session } = useSession();
  const username = session?.user?.name ?? null;
  const { balance, btcHoldings, btcCostUsd, applyServerBalanceDelta, applyServerBtcHoldings, applyServerBtcCostUsd, syncBalance } = useWallet();

  const [klines, setKlines] = useState<number[]>([]);
  const [price, setPrice] = useState<number>(0);
  const [amountRaw, setAmountRaw] = useState("0");
  
  const [error, setError] = useState<string | null>(null);

  const _loadedRef = useRef(false);
  const portfolioSyncedRef = useRef(false);
  useEffect(() => {
    if (_loadedRef.current) return;
    _loadedRef.current = true;

    let ws: WebSocket | null = null;
    try {
      ws = new WebSocket('wss://stream.binance.com:9443/ws/btcusdt@trade');
      ws.addEventListener('message', (ev) => {
        try {
          const data = JSON.parse(ev.data as string);
          const p = data.p ?? data.price ?? null;
          const live = Number(p);
          if (!Number.isFinite(live) || live <= 0) return;
          setPrice(live);

          // one-shot portfolio sync: set the flag immediately to prevent races
          if (!portfolioSyncedRef.current && username) {
            portfolioSyncedRef.current = true;
            void (async () => {
              try {
                await fetch('/api/crypto/portfolio', {
                  method: 'POST', headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ name: username, clientPrice: live })
                });
              } catch (e) {
                console.debug('portfolio sync failed on ws message', e);
              }
            })();
          }
        } catch (e) {
          // ignore
        }
      });
      ws.addEventListener('error', (e) => {
        console.debug('Binance WS error', e);
      });
    } catch (e) {
      console.debug('Failed to open Binance WS', e);
    }

    const seed = (price && price > 0) ? price : 40000;
    setKlines((prev) => {
      if (prev.length > 0) return prev;
      const pts = 96;
      const arr: number[] = [];
      let cur = seed;
      for (let i = 0; i < pts; i++) {
        const change = (Math.random() - 0.5) * 0.002;
        cur = Math.max(1, cur * (1 + change));
        arr.push(Math.round(cur * 100) / 100);
      }
      return arr;
    });

    return () => {
      try {
        if (ws && ws.readyState === WebSocket.OPEN) ws.close();
      } catch (e) {}
      ws = null;
    };
  }, []);

  // fallback: if username becomes available after first price, ensure one-time sync
  useEffect(() => {
    if (portfolioSyncedRef.current) return;
    if (!username) return;
    if (!price || price <= 0) return;
    void (async () => {
      try {
        const res = await fetch('/api/crypto/portfolio', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name: username, clientPrice: price })
        });
        if (res.ok) portfolioSyncedRef.current = true;
      } catch (e) {
        console.debug('portfolio sync failed on effect', e);
      }
    })();
  }, [username, price]);

  const amount = useMemo(() => parseAmount(amountRaw), [amountRaw]);
  const normalizedBalance = normalizeMoney(balance ?? 0);
  const canBuy = amount > 0 && amount <= normalizedBalance;
  const canSell = amount > 0 && price > 0 && (amount / price) <= (btcHoldings ?? 0);

  const btcUsd = useMemo(() => {
    const b = Number(btcHoldings ?? 0);
    if (!Number.isFinite(b) || !Number.isFinite(price)) return 0;
    return normalizeMoney(b * (price || 0));
  }, [btcHoldings, price]);

  const profitPct = useMemo(() => {
    if (!btcCostUsd || btcCostUsd <= 0) return null;
    const cost = Number(btcCostUsd || 0);
    const current = btcUsd;
    if (cost === 0) return null;
    return ((current - cost) / cost) * 100;
  }, [btcUsd, btcCostUsd]);

  const profitUsd = useMemo(() => {
    if (!btcCostUsd || btcCostUsd <= 0) return null;
    const cost = Number(btcCostUsd || 0);
    const current = btcUsd;
    return normalizeMoney(current - cost);
  }, [btcUsd, btcCostUsd]);

  const pctClass = profitPct == null ? 'text-[#b1bad3]' : profitPct > 0 ? 'text-[#57d28b]' : profitPct < 0 ? 'text-[#ff7b7b]' : 'text-[#b1bad3]';

  const onBuy = async () => {
    setError(null);
    if (!username) { setError("Not logged in."); return; }
    if (amount <= 0) return;

    await syncBalance();

    const res = await fetch('/api/crypto/trade', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: username, action: 'buy', amount, clientPrice: price })
    });
    const data = await res.json().catch(() => null);
    if (!res.ok || !data?.success) {
      setError(data?.message || 'Buy failed.');
      return;
    }
    const delta = Number(data.balanceDelta) || 0;
    if (delta !== 0) applyServerBalanceDelta(delta);
    if (typeof data.btcHoldings === 'number') applyServerBtcHoldings(Number(data.btcHoldings));
    if (typeof data.btcCostUsd === 'number') applyServerBtcCostUsd(Number(data.btcCostUsd));
  };

  const onSell = async () => {
    setError(null);
    if (!username) { setError("Not logged in."); return; }
    if (amount <= 0) return;

    await syncBalance();

    const res = await fetch('/api/crypto/trade', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: username, action: 'sell', amount, clientPrice: price })
    });
    const data = await res.json().catch(() => null);
    if (!res.ok || !data?.success) {
      setError(data?.message || 'Sell failed.');
      return;
    }
    const delta = Number(data.balanceDelta) || 0;
    if (delta !== 0) applyServerBalanceDelta(delta);
    if (typeof data.btcHoldings === 'number') applyServerBtcHoldings(Number(data.btcHoldings));
    if (typeof data.btcCostUsd === 'number') applyServerBtcCostUsd(Number(data.btcCostUsd));
  };
  const performBuyAll = async () => {
    if (!username) { setError("Not logged in."); return; }
    setError(null);
    try {
      const res = await fetch('/api/crypto/trade', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: username, action: 'buy_all', clientPrice: price })
      });
      const data = await res.json().catch(() => null);
      if (!res.ok || !data?.success) {
        setError(data?.message || 'Buy all failed.');
        return;
      }
      const delta = Number(data.balanceDelta) || 0;
      if (delta !== 0) applyServerBalanceDelta(delta);
      if (typeof data.btcHoldings === 'number') applyServerBtcHoldings(Number(data.btcHoldings));
      if (typeof data.btcCostUsd === 'number') applyServerBtcCostUsd(Number(data.btcCostUsd));
    } catch (e) {
      setError('Buy all failed.');
    }
  };

  const performSellAll = async () => {
    if (!username) { setError("Not logged in."); return; }
    setError(null);
    try {
      const res = await fetch('/api/crypto/trade', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: username, action: 'sell_all', clientPrice: price })
      });
      const data = await res.json().catch(() => null);
      if (!res.ok || !data?.success) {
        setError(data?.message || 'Sell all failed.');
        return;
      }
      const delta = Number(data.balanceDelta) || 0;
      if (delta !== 0) applyServerBalanceDelta(delta);
      if (typeof data.btcHoldings === 'number') applyServerBtcHoldings(Number(data.btcHoldings));
      if (typeof data.btcCostUsd === 'number') applyServerBtcCostUsd(Number(data.btcCostUsd));
    } catch (e) {
      setError('Sell all failed.');
    }
  };

  const setAmountBoth = (next: number) => {
    const v = normalizeMoney(next);
    setAmountRaw(String(v));
  };

  return (
    <section className="mb-6 bg-[#213743] border border-[#2f4553]/60 rounded-xl p-5">
      <div className="flex items-start">
        <div>
          <h2 className="text-white font-semibold text-xl">Crypto</h2>
          <p className="text-sm text-[#b1bad3]">
            Trade Bitcoin and beat the market
          </p>
        </div>
      </div>

      <div className="mt-4 bg-[#0f212e] rounded-lg p-4 border border-[#2f4553]/60">
        <div className="flex justify-between items-center">
          <div>
            <div className="text-xs text-[#557086]">BTC Price</div>
            <div className="text-white font-semibold text-2xl">${price ? price.toFixed(2) : "--"}</div>
          </div>
          <div className="text-right">
            <div className="text-xs text-[#557086]">Your BTC</div>
            <div className="text-white font-semibold text-2xl">{(btcHoldings ?? 0).toFixed(8)} BTC</div>
            <div className="text-sm mt-1">
              <span className="text-[#b1bad3]">${btcUsd.toFixed(2)}</span>
              {profitPct != null && profitUsd != null ? (
                <>
                  <span className={`ml-2 ${pctClass}`}>{profitPct > 0 ? '+' : ''}{profitPct.toFixed(2)}%</span>
                  <span className={`ml-2 ${pctClass}`}>({profitUsd > 0 ? '+' : ''}${profitUsd.toFixed(2)})</span>
                </>
              ) : (
                <span className="ml-2 text-[#b1bad3]">--</span>
              )}
            </div>
          </div>
        </div>
        <div className="mt-3">
          <Sparkline points={klines} />
        </div>
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
              if (!Number.isFinite(num)) { setAmountBoth(0); return; }
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
            onClick={onBuy}
            disabled={!canBuy}
            className="w-full h-10 flex items-center justify-center rounded-lg bg-[#2b3f49] hover:bg-[#3e5666] text-white font-semibold disabled:opacity-50 disabled:cursor-not-allowed transition-colors focus-visible:ring-2 focus-visible:ring-[#00e701]"
          >
            Buy
          </button>
          <button
            type="button"
            onClick={performBuyAll}
            aria-label="Buy all"
            title="Buy all"
            disabled={(balance ?? 0) <= 0}
            className="w-full h-10 flex items-center justify-center rounded-lg bg-[#2b3f49] hover:bg-[#3e5666] text-white font-semibold disabled:opacity-50 disabled:cursor-not-allowed transition-colors focus-visible:ring-2 focus-visible:ring-[#00e701]"
          >
            Buy all
          </button>
          <button
            onClick={onSell}
            disabled={!canSell}
            className="w-full h-10 flex items-center justify-center rounded-lg bg-[#2b3f49] hover:bg-[#3e5666] text-white font-semibold disabled:opacity-50 disabled:cursor-not-allowed transition-colors focus-visible:ring-2 focus-visible:ring-[#00e701]"
          >
            Sell
          </button>
          <button
            type="button"
            onClick={performSellAll}
            aria-label="Sell all"
            title="Sell all"
            disabled={(btcHoldings ?? 0) <= 0}
            className="w-full h-10 flex items-center justify-center rounded-lg bg-[#2b3f49] hover:bg-[#3e5666] text-white font-semibold disabled:opacity-50 disabled:cursor-not-allowed transition-colors focus-visible:ring-2 focus-visible:ring-[#00e701]"
          >
            Sell all
          </button>
        </div>
      </div>

      {error ? <div className="mt-3 text-sm text-[#ffb4b4]">{error}</div> : null}
    </section>
  );
}