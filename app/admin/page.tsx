"use client";

import React, { useEffect, useMemo, useState } from "react";
import { DEFAULT_GAME_STATUS, GAME_LABELS, GAME_STATUS_KEYS } from "@/lib/gameStatus";

type UserRow = {
  _id: string;
  name: string;
  balance: number;
  invest: number;
  lastCheckedInvest: number;
  lastDailyReward: string | number;
  weeklyPayback: number;
  lastWeeklyPayback: string | number;
  btcHoldings: number;
  btcCostUsd: number;
  portfolioUsd?: number;
  createdAt?: string;
  updatedAt?: string;
};

type RecordRow = {
  _id?: string;
  game: string;
  username: string;
  profit?: number;
  multiplier?: number;
  loss?: number;
};

type GiftRow = {
  _id: string;
  sender: string;
  recipient: string;
  amount: number;
  createdAt?: string;
  updatedAt?: string;
};

type WebsiteStatus = {
  isMaintenance: boolean;
  isPaused: boolean;
  games: Record<string, boolean>;
};

const tabs = ["Users", "Records", "Gifts", "Website Status"] as const;

export default function AdminPage() {
  const [activeTab, setActiveTab] = useState<(typeof tabs)[number]>("Users");
  const [adminAuthorized, setAdminAuthorized] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [users, setUsers] = useState<UserRow[]>([]);
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null);
  const [userForm, setUserForm] = useState<Partial<UserRow>>({});

  const [records, setRecords] = useState<{
    profit: RecordRow[];
    multiplier: RecordRow[];
    loss: RecordRow[];
  }>({ profit: [], multiplier: [], loss: [] });
  const [recordForm, setRecordForm] = useState<{ type: "profit" | "multiplier" | "loss"; game: string; username: string; value: number } | null>(null);

  const [status, setStatus] = useState<WebsiteStatus>({
    isMaintenance: false,
    isPaused: false,
    games: DEFAULT_GAME_STATUS,
  });

  const headers = { "Content-Type": "application/json" };

  useEffect(() => {
    try {
      setAdminAuthorized(localStorage.getItem("flopper_admin_authorized") === "true");
    } catch (e) {}

    const onStorage = (e: StorageEvent) => {
      if (e.key === "flopper_admin_authorized") {
        setAdminAuthorized(e.newValue === "true");
      }
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  const fetchUsers = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/users", { cache: "no-store" });
      if (!res.ok) throw new Error("Failed to fetch users");
      const data = await res.json();
      setUsers(Array.isArray(data?.users) ? data.users : []);
    } catch (e: any) {
      setError(e?.message ?? "Failed to load users");
    } finally {
      setLoading(false);
    }
  };

    const saveGift = async () => {
      if (!giftForm || !selectedGiftId) return;
      setLoading(true);
      setError(null);
      try {
        const payload: any = { id: selectedGiftId };
        if (typeof giftForm.sender === "string") payload.sender = giftForm.sender;
        if (typeof giftForm.recipient === "string") payload.recipient = giftForm.recipient;
        if (typeof giftForm.amount === "number") payload.amount = giftForm.amount;

        const res = await fetch("/api/admin/gifts", {
          method: "PATCH",
          headers,
          credentials: "same-origin",
          body: JSON.stringify(payload),
        });
        if (!res.ok) throw new Error("Failed to save gift");
        await fetchGifts();
      } catch (e: any) {
        setError(e?.message ?? "Failed to save gift");
      } finally {
        setLoading(false);
      }
    };

    const deleteGift = async () => {
      if (!selectedGiftId) return;
      if (!confirm("Delete this gift?")) return;
      setLoading(true);
      setError(null);
      try {
        const res = await fetch("/api/admin/gifts", {
          method: "DELETE",
          headers,
          credentials: "same-origin",
          body: JSON.stringify({ id: selectedGiftId }),
        });
        if (!res.ok) throw new Error("Failed to delete gift");
        setSelectedGiftId(null);
        setGiftForm(null);
        await fetchGifts();
      } catch (e: any) {
        setError(e?.message ?? "Failed to delete gift");
      } finally {
        setLoading(false);
      }
    };

  const fetchRecords = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/records", { cache: "no-store" });
      if (!res.ok) throw new Error("Failed to fetch records");
      const data = await res.json();
      setRecords({
        profit: Array.isArray(data?.profit) ? data.profit : [],
        multiplier: Array.isArray(data?.multiplier) ? data.multiplier : [],
        loss: Array.isArray(data?.loss) ? data.loss : [],
      });
    } catch (e: any) {
      setError(e?.message ?? "Failed to load records");
    } finally {
      setLoading(false);
    }
  };

  const [gifts, setGifts] = useState<GiftRow[]>([]);
  const [selectedGiftId, setSelectedGiftId] = useState<string | null>(null);
  const [giftForm, setGiftForm] = useState<Partial<GiftRow> | null>(null);

  const fetchGifts = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/gifts", { cache: "no-store", credentials: "same-origin" });
      if (!res.ok) throw new Error("Failed to fetch gifts");
      const data = await res.json();
      setGifts(Array.isArray(data?.gifts) ? data.gifts : []);
    } catch (e: any) {
      setError(e?.message ?? "Failed to load gifts");
    } finally {
      setLoading(false);
    }
  };

  const fetchStatus = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/status", { cache: "no-store" });
      if (!res.ok) throw new Error("Failed to fetch status");
      const data = await res.json();
      setStatus({
        isMaintenance: !!data?.isMaintenance,
        isPaused: !!data?.isPaused,
        games: { ...DEFAULT_GAME_STATUS, ...(data?.games ?? {}) },
      });
    } catch (e: any) {
      setError(e?.message ?? "Failed to load status");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!adminAuthorized) return;
    if (activeTab === "Users") fetchUsers();
    if (activeTab === "Records") fetchRecords();
    if (activeTab === "Gifts") fetchGifts();
    if (activeTab === "Website Status") fetchStatus();
  }, [activeTab, adminAuthorized]);

  const selectUser = (user: UserRow) => {
    setSelectedUserId(user._id);
    setUserForm({
      name: user.name,
      balance: user.balance,
      invest: user.invest,
      lastCheckedInvest: user.lastCheckedInvest,
      weeklyPayback: user.weeklyPayback,
      lastDailyReward: typeof user.lastDailyReward === "string" ? new Date(user.lastDailyReward).getTime() : user.lastDailyReward,
      lastWeeklyPayback: typeof user.lastWeeklyPayback === "string" ? new Date(user.lastWeeklyPayback).getTime() : user.lastWeeklyPayback,
      btcHoldings: user.btcHoldings,
      btcCostUsd: user.btcCostUsd,
      portfolioUsd: user.portfolioUsd ?? 0,
    });
  };

  const saveUser = async () => {
    if (!selectedUserId) return;
    setLoading(true);
    setError(null);
    try {
      const payload = { id: selectedUserId, ...userForm };
      const res = await fetch("/api/admin/users", {
        method: "PATCH",
        headers,
        body: JSON.stringify(payload),
      });
      if (!res.ok) throw new Error("Failed to save user");
      await fetchUsers();
    } catch (e: any) {
      setError(e?.message ?? "Failed to save user");
    } finally {
      setLoading(false);
    }
  };

  const deleteUser = async () => {
    if (!selectedUserId) return;
    if (!confirm("Delete this user?")) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/users", {
        method: "DELETE",
        headers,
        body: JSON.stringify({ id: selectedUserId }),
      });
      if (!res.ok) throw new Error("Failed to delete user");
      setSelectedUserId(null);
      setUserForm({});
      await fetchUsers();
    } catch (e: any) {
      setError(e?.message ?? "Failed to delete user");
    } finally {
      setLoading(false);
    }
  };

  const saveRecord = async () => {
    if (!recordForm) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/records", {
        method: "PATCH",
        headers,
        body: JSON.stringify(recordForm),
      });
      if (!res.ok) throw new Error("Failed to save record");
      await fetchRecords();
    } catch (e: any) {
      setError(e?.message ?? "Failed to save record");
    } finally {
      setLoading(false);
    }
  };

  const deleteRecord = async () => {
    if (!recordForm) return;
    if (!confirm("Delete this record?")) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/records", {
        method: "DELETE",
        headers,
        body: JSON.stringify({ type: recordForm.type, game: recordForm.game }),
      });
      if (!res.ok) throw new Error("Failed to delete record");
      setRecordForm(null);
      await fetchRecords();
    } catch (e: any) {
      setError(e?.message ?? "Failed to delete record");
    } finally {
      setLoading(false);
    }
  };

  const saveStatus = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/status", {
        method: "PATCH",
        headers,
        body: JSON.stringify(status),
      });
      if (!res.ok) throw new Error("Failed to save status");
      await fetchStatus();
    } catch (e: any) {
      setError(e?.message ?? "Failed to save status");
    } finally {
      setLoading(false);
    }
  };

  const setAllGames = (value: boolean) => {
    const next: Record<string, boolean> = {};
    for (const key of GAME_STATUS_KEYS) next[key] = value;
    setStatus((prev) => ({ ...prev, games: next }));
  };

  if (!adminAuthorized) {
    return (
      <div className="p-8">
        <div className="bg-[#0f212e] border border-[#213743] rounded-xl p-6">
          <h1 className="text-3xl font-bold text-white mb-2">Admin Access Required</h1>
          <p className="text-[#b1bad3]">You need admin access to view this page</p>
        </div>
      </div>
    );
  }

  return (
    <div className="p-8">
      <div className="mb-6">
        <h1 className="text-4xl font-extrabold bg-linear-to-r from-indigo-400 via-pink-400 to-yellow-300 bg-clip-text text-transparent">
          Flopper Admin Console
        </h1>
        <p className="text-[#b1bad3] mt-2">Manage users, records and website status</p>
      </div>

      <div className="flex flex-wrap gap-2 mb-6">
        {tabs.map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`px-4 py-2 rounded-lg font-bold border transition-colors ${
              activeTab === tab
                ? "bg-[#213743] text-white border-[#2f4553]"
                : "bg-[#0f212e] text-[#b1bad3] border-[#213743] hover:text-white"
            }`}
          >
            {tab}
          </button>
        ))}
      </div>

      {activeTab === "Users" && (
        <div className="grid grid-cols-1 lg:grid-cols-3 items-start gap-6">
          <div className="lg:col-span-1 bg-[#0f212e] border border-[#213743] rounded-xl p-4">
            <div className="space-y-2 max-h-120 overflow-auto">
              {users.length === 0 && (
                <div className="text-[#8399aa]">No users found</div>
              )}
              {users.map((user) => (
                <button
                  key={user._id}
                  onClick={() => selectUser(user)}
                  className={`w-full text-left px-3 py-2 rounded-lg border ${
                    selectedUserId === user._id ? "border-indigo-400 bg-[#1a2c38]" : "border-[#2f4553] bg-[#101a22]"
                  }`}
                >
                  <div className="text-white font-semibold">{user.name}</div>
                  <div className="text-xs text-[#8399aa]">{
                    (() => {
                      const balance = typeof user.balance === 'number' ? user.balance : 0;
                      const invest = typeof user.invest === 'number' ? user.invest : 0;
                      const btcUsd = typeof user.portfolioUsd === 'number'
                        ? user.portfolioUsd
                        : (typeof user.btcHoldings === 'number' && typeof user.btcCostUsd === 'number')
                        ? user.btcHoldings * user.btcCostUsd
                        : 0;
                      const total = balance + invest + btcUsd;
                      return `Total: $${total.toFixed(2)}`;
                    })()
                  }</div>
                </button>
              ))}
            </div>
          </div>

          <div className="lg:col-span-2 bg-[#0f212e] border border-[#213743] rounded-xl p-4">
            <h2 className="text-xl text-white font-bold mb-3">User Details</h2>
            {!selectedUserId ? (
              <div className="text-[#8399aa]">Select a user to edit</div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <label className="text-sm text-[#b1bad3]">
                  Name
                  <input
                    value={String(userForm.name ?? "")}
                    onChange={(e) => setUserForm((prev) => ({ ...prev, name: e.target.value }))}
                    className="mt-1 w-full bg-[#213743] border border-[#2f4553] rounded-lg px-3 py-2 text-white"
                  />
                </label>
                <label className="text-sm text-[#b1bad3]">
                  Balance
                  <input
                    type="number"
                    value={Number(userForm.balance ?? 0)}
                    onChange={(e) => setUserForm((prev) => ({ ...prev, balance: Number(e.target.value) }))}
                    className="mt-1 w-full bg-[#213743] border border-[#2f4553] rounded-lg px-3 py-2 text-white"
                  />
                </label>
                <label className="text-sm text-[#b1bad3]">
                  Invest
                  <input
                    type="number"
                    value={Number(userForm.invest ?? 0)}
                    onChange={(e) => setUserForm((prev) => ({ ...prev, invest: Number(e.target.value) }))}
                    className="mt-1 w-full bg-[#213743] border border-[#2f4553] rounded-lg px-3 py-2 text-white"
                  />
                </label>
                <label className="text-sm text-[#b1bad3]">
                  Weekly Payback
                  <input
                    type="number"
                    value={Number(userForm.weeklyPayback ?? 0)}
                    onChange={(e) => setUserForm((prev) => ({ ...prev, weeklyPayback: Number(e.target.value) }))}
                    className="mt-1 w-full bg-[#213743] border border-[#2f4553] rounded-lg px-3 py-2 text-white"
                  />
                </label>
                <label className="text-sm text-[#b1bad3]">
                  Last Daily Reward (ms)
                  <input
                    type="number"
                    value={Number(userForm.lastDailyReward ?? 0)}
                    onChange={(e) => setUserForm((prev) => ({ ...prev, lastDailyReward: Number(e.target.value) }))}
                    className="mt-1 w-full bg-[#213743] border border-[#2f4553] rounded-lg px-3 py-2 text-white"
                  />
                </label>
                <label className="text-sm text-[#b1bad3]">
                  Last Weekly Payback (ms)
                  <input
                    type="number"
                    value={Number(userForm.lastWeeklyPayback ?? 0)}
                    onChange={(e) => setUserForm((prev) => ({ ...prev, lastWeeklyPayback: Number(e.target.value) }))}
                    className="mt-1 w-full bg-[#213743] border border-[#2f4553] rounded-lg px-3 py-2 text-white"
                  />
                </label>
                <label className="text-sm text-[#b1bad3]">
                  BTC Holdings
                  <input
                    type="number"
                    value={Number(userForm.btcHoldings ?? 0)}
                    onChange={(e) => setUserForm((prev) => ({ ...prev, btcHoldings: Number(e.target.value) }))}
                    className="mt-1 w-full bg-[#213743] border border-[#2f4553] rounded-lg px-3 py-2 text-white"
                  />
                </label>
                <label className="text-sm text-[#b1bad3]">
                  BTC Cost (USD)
                  <input
                    type="number"
                    value={Number(userForm.btcCostUsd ?? 0)}
                    onChange={(e) => setUserForm((prev) => ({ ...prev, btcCostUsd: Number(e.target.value) }))}
                    className="mt-1 w-full bg-[#213743] border border-[#2f4553] rounded-lg px-3 py-2 text-white"
                  />
                </label>
                <label className="text-sm text-[#b1bad3]">
                  Portfolio USD
                  <input
                    type="number"
                    value={Number(userForm.portfolioUsd ?? 0)}
                    onChange={(e) => setUserForm((prev) => ({ ...prev, portfolioUsd: Number(e.target.value) }))}
                    className="mt-1 w-full bg-[#213743] border border-[#2f4553] rounded-lg px-3 py-2 text-white"
                  />
                </label>
              </div>
            )}

            <div className="mt-4 flex gap-2">
              <button
                onClick={saveUser}
                disabled={!selectedUserId}
                className="bg-indigo-500 hover:bg-indigo-600 text-white font-bold px-4 py-2 rounded-lg disabled:opacity-50"
              >
                Save User
              </button>
              <button
                onClick={deleteUser}
                disabled={!selectedUserId}
                className="bg-[#c84b4b] hover:bg-[#d65a5a] text-white font-bold px-4 py-2 rounded-lg disabled:opacity-50"
              >
                Delete User
              </button>
            </div>
          </div>
        </div>
      )}

      {activeTab === "Records" && (
        <div className="grid grid-cols-1 lg:grid-cols-3 items-start gap-6">
          {(["profit", "multiplier", "loss"] as const).map((type) => (
            <div key={type} className="bg-[#0f212e] border border-[#213743] rounded-xl p-4">
              <h3 className="text-white font-bold mb-3 capitalize">{type} Records</h3>
              <div className="space-y-2 max-h-105 overflow-auto">
                {records[type].length === 0 && (
                  <div className="text-[#8399aa]">No records found</div>
                )}
                {records[type].map((rec) => {
                  const value = type === "profit" ? rec.profit : type === "multiplier" ? rec.multiplier : rec.loss;
                  return (
                    <button
                      key={`${type}-${rec.game}`}
                      onClick={() => setRecordForm({ type, game: rec.game, username: rec.username, value: Number(value ?? 0) })}
                      className={`w-full text-left px-3 py-2 rounded-lg border ${
                        recordForm?.type === type && recordForm?.game === rec.game ? "border-indigo-400 bg-[#1a2c38]" : "border-[#2f4553] bg-[#101a22]"
                      }`}
                    >
                      <div className="text-white font-semibold">{rec.game}</div>
                      <div className="text-xs text-[#8399aa]">{rec.username} • {value ?? 0}</div>
                    </button>
                  );
                })}
              </div>
            </div>
          ))}

          <div className="bg-[#0f212e] border border-[#213743] rounded-xl p-4 lg:col-span-3">
            <h3 className="text-white font-bold mb-3">Edit Record</h3>
            {!recordForm ? (
              <div className="text-[#8399aa]">Select a record to edit</div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <label className="text-sm text-[#b1bad3]">
                  Game
                  <input
                    value={recordForm.game}
                    onChange={(e) => setRecordForm((prev) => prev ? ({ ...prev, game: e.target.value }) : prev)}
                    className="mt-1 w-full bg-[#213743] border border-[#2f4553] rounded-lg px-3 py-2 text-white"
                  />
                </label>
                <label className="text-sm text-[#b1bad3]">
                  Username
                  <input
                    value={recordForm.username}
                    onChange={(e) => setRecordForm((prev) => prev ? ({ ...prev, username: e.target.value }) : prev)}
                    className="mt-1 w-full bg-[#213743] border border-[#2f4553] rounded-lg px-3 py-2 text-white"
                  />
                </label>
                <label className="text-sm text-[#b1bad3]">
                  Value
                  <input
                    type="number"
                    value={recordForm.value}
                    onChange={(e) => setRecordForm((prev) => prev ? ({ ...prev, value: Number(e.target.value) }) : prev)}
                    className="mt-1 w-full bg-[#213743] border border-[#2f4553] rounded-lg px-3 py-2 text-white"
                  />
                </label>
              </div>
            )}

            <div className="mt-4 flex gap-2">
              <button
                onClick={saveRecord}
                disabled={!recordForm}
                className="bg-indigo-500 hover:bg-indigo-600 text-white font-bold px-4 py-2 rounded-lg disabled:opacity-50"
              >
                Save Record
              </button>
              <button
                onClick={deleteRecord}
                disabled={!recordForm}
                className="bg-[#c84b4b] hover:bg-[#d65a5a] text-white font-bold px-4 py-2 rounded-lg disabled:opacity-50"
              >
                Delete Record
              </button>
            </div>
          </div>
        </div>
      )}

      {activeTab === "Gifts" && (
        <div className="grid grid-cols-1 lg:grid-cols-3 items-start gap-6">
          <div className="lg:col-span-1 bg-[#0f212e] border border-[#213743] rounded-xl p-4">
            <div className="space-y-2 max-h-120 overflow-auto">
              {gifts.length === 0 && (
                <div className="text-[#8399aa]">No gifts found</div>
              )}
              {gifts.map((g) => (
                <button
                  key={g._id}
                  onClick={() => { setSelectedGiftId(g._id); setGiftForm(g); }}
                  className={`w-full text-left px-3 py-2 rounded-lg border ${
                    selectedGiftId === g._id ? "border-indigo-400 bg-[#1a2c38]" : "border-[#2f4553] bg-[#101a22]"
                  }`}
                >
                  <div className="text-white font-semibold">{g.sender} → {g.recipient}</div>
                  <div className="text-xs text-[#8399aa]">Amount: ${g.amount?.toFixed?.(2) ?? g.amount}</div>
                </button>
              ))}
            </div>
          </div>

          <div className="lg:col-span-2 bg-[#0f212e] border border-[#213743] rounded-xl p-4">
            <h2 className="text-xl text-white font-bold mb-3">Gift Details</h2>
            {!selectedGiftId ? (
              <div className="text-[#8399aa]">Select a gift to edit</div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <label className="text-sm text-[#b1bad3]">
                  Sender
                  <input
                    value={String(giftForm?.sender ?? "")}
                    onChange={(e) => setGiftForm((prev) => ({ ...(prev ?? {}), sender: e.target.value }))}
                    className="mt-1 w-full bg-[#213743] border border-[#2f4553] rounded-lg px-3 py-2 text-white"
                  />
                </label>
                <label className="text-sm text-[#b1bad3]">
                  Recipient
                  <input
                    value={String(giftForm?.recipient ?? "")}
                    onChange={(e) => setGiftForm((prev) => ({ ...(prev ?? {}), recipient: e.target.value }))}
                    className="mt-1 w-full bg-[#213743] border border-[#2f4553] rounded-lg px-3 py-2 text-white"
                  />
                </label>
                <label className="text-sm text-[#b1bad3]">
                  Amount
                  <input
                    type="number"
                    value={Number(giftForm?.amount ?? 0)}
                    onChange={(e) => setGiftForm((prev) => ({ ...(prev ?? {}), amount: Number(e.target.value) }))}
                    className="mt-1 w-full bg-[#213743] border border-[#2f4553] rounded-lg px-3 py-2 text-white"
                  />
                </label>
              </div>
            )}

            <div className="mt-4 flex gap-2">
              <button
                onClick={saveGift}
                disabled={!selectedGiftId}
                className="bg-indigo-500 hover:bg-indigo-600 text-white font-bold px-4 py-2 rounded-lg disabled:opacity-50"
              >
                Save Gift
              </button>
              <button
                onClick={deleteGift}
                disabled={!selectedGiftId}
                className="bg-[#c84b4b] hover:bg-[#d65a5a] text-white font-bold px-4 py-2 rounded-lg disabled:opacity-50"
              >
                Delete Gift
              </button>
            </div>
          </div>
        </div>
      )}

      {activeTab === "Website Status" && (
        <div className="bg-[#0f212e] border border-[#213743] rounded-xl p-4">
          <div className="flex flex-col md:flex-row md:items-center gap-4 mb-6">
            <label className="flex items-center gap-2 text-white">
              <input
                type="checkbox"
                checked={status.isMaintenance}
                onChange={(e) => setStatus((prev) => ({ ...prev, isMaintenance: e.target.checked }))}
              />
              Maintenance Mode
            </label>
            <label className="flex items-center gap-2 text-white">
              <input
                type="checkbox"
                checked={status.isPaused}
                onChange={(e) => setStatus((prev) => ({ ...prev, isPaused: e.target.checked }))}
              />
              Pause Mode
            </label>
            <button
              onClick={() => setAllGames(true)}
              className="bg-[#213743] text-white px-3 py-2 rounded-lg"
            >
              Enable All Games
            </button>
            <button
              onClick={() => setAllGames(false)}
              className="bg-[#213743] text-white px-3 py-2 rounded-lg"
            >
              Disable All Games
            </button>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
            {GAME_STATUS_KEYS.map((key) => (
              <label key={key} className="flex items-center gap-2 bg-[#101a22] border border-[#2f4553] rounded-lg px-3 py-2 text-white">
                <input
                  type="checkbox"
                  checked={status.games[key] !== false}
                  onChange={(e) =>
                    setStatus((prev) => ({
                      ...prev,
                      games: { ...prev.games, [key]: e.target.checked },
                    }))
                  }
                />
                {GAME_LABELS[key] ?? key}
              </label>
            ))}
          </div>

          <div className="mt-6">
            <button
              onClick={saveStatus}
              className="bg-indigo-500 hover:bg-indigo-600 text-white font-bold px-4 py-2 rounded-lg"
            >
              Save Website Status
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
