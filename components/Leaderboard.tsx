"use client";

import { useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import { useWallet } from "./WalletProvider";
import { fetchJsonCached, invalidateFetchCache } from "@/lib/fetchCache";

type LeaderboardUser = {
  _id: string;
  name: string;
  balance: number;
  seasons?: string[];
};

const Badge = ({ rank, index }: { rank: string; index: number }) => {
  const label: Record<string, string> = {
    first: "🥇",
    second: "🥈",
    third: "🥉",
    last: "💩",
  };

  return (
    <div
      title={rank.charAt(0).toUpperCase() + rank.slice(1)}
      className="relative flex items-center justify-center w-5 h-5 text-xl transition-transform hover:scale-120 hover:z-50 cursor-help"
      style={{ marginLeft: index === 0 ? 0 : "-10px", zIndex: 50 - index }}
    >
      {label[rank.toLowerCase()] || "🏅"}
    </div>
  );
};

export default function Leaderboard() {
  const [users, setUsers] = useState<LeaderboardUser[]>([]);
  const [username, setUsername] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const { syncBalance } = useWallet();
  const { data: session, status, update } = useSession();
  const [page, setPage] = useState<number>(1);
  const PAGE_SIZE = 5;

  const fetchLeaderboard = async (opts?: { force?: boolean }) => {
    try {
      const force = Boolean(opts?.force);
      if (force) invalidateFetchCache("leaderboard");

      const data = await fetchJsonCached<LeaderboardUser[]>(
        "leaderboard",
        async () => {
          const res = await fetch("/api/leaderboard");
          if (!res.ok) throw new Error(`HTTP ${res.status}`);
          return (await res.json()) as LeaderboardUser[];
        },
        0
      );

      setUsers(Array.isArray(data) ? data : []);
      setPage(1);
    } catch (error) {
      console.error("Failed to fetch leaderboard", error);
    }
  };

  useEffect(() => {
    const init = async () => {
      if (status !== "loading") {
        const sessionName = session?.user?.name ?? null;
        if (sessionName) {
          setUsername(sessionName);
          setEditName(sessionName);
          syncBalance().catch(console.error);
        } else {
          setUsername(null);
          setEditName("");
        }
      }
      await fetchLeaderboard();
      setLoading(false);
    };
    init();
  }, [session?.user?.name, status]);

  useEffect(() => {
    setEditName(username ?? "");
  }, [username]);

  const handleChangeUsername = async () => {
    if (!username) return;
    const nextName = editName.trim();
    if (!nextName) return;
    if (nextName === username) return;

    setErrorMsg(null);
    try {
      const res = await fetch("/api/user", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ oldName: username, newName: nextName }),
      });

      if (res.status === 409) {
        setErrorMsg("This name is already taken. Please choose another.");
        return;
      }
      if (res.status === 404) {
        setErrorMsg("User not found. Please re-join.");
        return;
      }
      if (!res.ok) {
        setErrorMsg("Could not change username. Please try again later.");
        return;
      }

      setUsername(nextName);
      await update({ name: nextName });
      await syncBalance();
      await fetchLeaderboard({ force: true });
    } catch (error) {
      console.error("Failed to change username", error);
      setErrorMsg("Could not change username. Check the console.");
    }
  };

  if (loading)
    return <div className="text-white/50">Loading leaderboard...</div>;
  const totalPages = Math.max(1, Math.ceil(users.length / PAGE_SIZE));
  const start = (page - 1) * PAGE_SIZE;
  const pageUsers = users.slice(start, start + PAGE_SIZE);

  const goFirst = () => setPage(1);
  const goPrev = () => setPage((p) => Math.max(1, p - 1));
  const goNext = () => setPage((p) => Math.min(totalPages, p + 1));
  const goLast = () => setPage(totalPages);

  return (
    <div className="bg-[#213743] p-6 rounded-xl border border-[#2f4553]/60 w-full h-full mb-6 flex flex-col">
      <h2 className="text-2xl font-bold text-white mb-4">Leaderboard</h2>

      {username && (
        <div className="mb-6 p-4 bg-[#0f212e] rounded-lg">
          {errorMsg && (
            <div className="text-sm text-rose-400 mb-2">{errorMsg}</div>
          )}
          <div className="flex gap-2">
            <input
              type="text"
              value={editName}
              onChange={(e) => setEditName(e.target.value)}
              className="bg-[#0f212e] border border-[#2f4553] text-white px-3 py-2 rounded flex-1 focus:outline-none focus:border-[#00e701]"
              placeholder="Username"
            />
            <button
              onClick={handleChangeUsername}
              className="bg-[#00e701] hover:bg-[#00c701] text-black font-bold px-4 py-2 rounded transition-colors whitespace-nowrap"
            >
              Change username
            </button>
          </div>
        </div>
      )}

      <div className="space-y-2 flex-1">
        {pageUsers.map((user, idx) => {
          const absoluteIndex = start + idx;
          return (
            <div
              key={user._id}
              className={`flex justify-between items-center p-3 rounded ${
                user.name === username
                  ? "bg-[#00e701]/10 border border-[#00e701]/30"
                  : "bg-[#0f212e]"
              }`}
            >
              <div className="flex items-center gap-3">
                <span
                  className={`font-mono font-bold w-6 text-center ${
                    absoluteIndex === 0
                      ? "text-yellow-400"
                      : absoluteIndex === 1
                      ? "text-gray-300"
                      : absoluteIndex === 2
                      ? "text-amber-600"
                      : "text-[#557086]"
                  }`}
                >
                  {absoluteIndex + 1}
                </span>
                <div className="flex items-center gap-2">
                  <span className="text-white font-medium">{user.name}</span>
                  <div className="flex items-center">
                    {(() => {
                      const rankOrder: Record<string, number> = { first: 1, second: 2, third: 3, last: 4 };
                      const sortedSeasons = [...(user.seasons || [])].sort(
                        (a, b) => (rankOrder[a.toLowerCase()] || 99) - (rankOrder[b.toLowerCase()] || 99)
                      );
                      return sortedSeasons.map((rank, i) => <Badge key={i} rank={rank} index={i} />);
                    })()}
                  </div>
                </div>
              </div>
              <span className="text-[#00e701] font-mono">
                $
                {user.balance.toLocaleString(undefined, {
                  minimumFractionDigits: 2,
                  maximumFractionDigits: 2,
                })}
              </span>
            </div>
          );
        })}
        {users.length === 0 && (
          <div className="text-center text-[#557086] py-4">No players yet</div>
        )}
      </div>

      <div className="mt-4 flex items-center justify-between gap-4">
        <div className="flex items-center gap-2">
          <button
            onClick={goFirst}
            disabled={page === 1}
            className={`px-3 py-1 rounded ${
              page === 1
                ? "bg-[#0f212e] text-[#557086]"
                : "bg-[#00e701] text-black font-bold"
            }`}
          >
            « First
          </button>
          <button
            onClick={goPrev}
            disabled={page === 1}
            className={`px-3 py-1 rounded ${
              page === 1
                ? "bg-[#0f212e] text-[#557086]"
                : "bg-[#00e701] text-black font-bold"
            }`}
          >
            ‹ Back
          </button>
        </div>

        <div className="text-sm text-[#b1bad3]">
          Page {page}/{totalPages} • {users.length} players
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={goNext}
            disabled={page === totalPages}
            className={`px-3 py-1 rounded ${
              page === totalPages
                ? "bg-[#0f212e] text-[#557086]"
                : "bg-[#00e701] text-black font-bold"
            }`}
          >
            Next ›
          </button>
          <button
            onClick={goLast}
            disabled={page === totalPages}
            className={`px-3 py-1 rounded ${
              page === totalPages
                ? "bg-[#0f212e] text-[#557086]"
                : "bg-[#00e701] text-black font-bold"
            }`}
          >
            Last »
          </button>
        </div>
      </div>
      <div className="mt-3 text-sm text-[#b1bad3]">
        Note: Each season will restart on the first server restart, after the restart, all accounts will be reset to $10,000 and the top 3 and last place will receive season badges
      </div>
    </div>
  );
}
