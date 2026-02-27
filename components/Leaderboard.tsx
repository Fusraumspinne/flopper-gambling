"use client";

import { useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import { useWallet } from "./WalletProvider";
import { fetchJsonCached, invalidateFetchCache } from "@/lib/fetchCache";
import { PlayArrow } from "@mui/icons-material";

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
  const [seasonStartedAtMs, setSeasonStartedAtMs] = useState<number | null>(null);
  const [nowMs, setNowMs] = useState<number>(Date.now());
  const [username, setUsername] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [showSettings, setShowSettings] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const { syncBalance } = useWallet();
  const { data: session, status, update } = useSession();
  const [page, setPage] = useState<number>(1);
  const PAGE_SIZE = 5;
  const SEASON_LENGTH_DAYS = 20;
  const DAY_MS = 24 * 60 * 60 * 1000;

  const fetchSeasonStatus = async () => {
    try {
      const res = await fetch("/api/status", { cache: "no-store" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      const parsed = Date.parse(String(data?.seasonStartedAt ?? ""));
      setSeasonStartedAtMs(Number.isFinite(parsed) ? parsed : Date.now());
    } catch (error) {
      console.error("Failed to fetch season status", error);
    }
  };

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
      await fetchSeasonStatus();
      setLoading(false);
    };
    init();
  }, [session?.user?.name, status]);

  useEffect(() => {
    const interval = setInterval(() => {
      setNowMs(Date.now());
    }, 60_000);

    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    const interval = setInterval(() => {
      fetchSeasonStatus().catch(console.error);
    }, 60_000);

    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    setEditName(username ?? "");
  }, [username]);

  const handleChangeUsername = async () => {
    if (!username) return;
    const nextName = editName.trim();
    if (!nextName) return;
    if (nextName === username) return;

    setErrorMsg(null);
    setSuccessMsg(null);
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
      setSuccessMsg("Username updated successfully!");
      await syncBalance();
      await fetchLeaderboard({ force: true });
    } catch (error) {
      console.error("Failed to change username", error);
      setErrorMsg("Could not change username. Check the console.");
    }
  };

  const handleChangePassword = async () => {
    if (!username) return;
    const nextPassword = newPassword.trim();
    if (!nextPassword) {
      setErrorMsg("Please enter a new password.");
      return;
    }

    setErrorMsg(null);
    setSuccessMsg(null);
    try {
      const res = await fetch("/api/user", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ oldName: username, newPassword: nextPassword }),
      });

      if (res.status === 404) {
        setErrorMsg("User not found. Please re-join.");
        return;
      }
      if (!res.ok) {
        setErrorMsg("Could not change password. Please try again later.");
        return;
      }

      setNewPassword("");
      setSuccessMsg("Password updated successfully!");
    } catch (error) {
      console.error("Failed to change password", error);
      setErrorMsg("Could not change password. Check the console.");
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
  const seasonEndMs = (seasonStartedAtMs ?? nowMs) + SEASON_LENGTH_DAYS * DAY_MS;
  const daysUntilNextSeason = Math.max(0, Math.ceil((seasonEndMs - nowMs) / DAY_MS));

  return (
    <div className="bg-[#213743] p-6 rounded-xl border border-[#2f4553]/60 w-full h-full mb-6 flex flex-col">
      <h2 className="text-2xl font-bold text-white mb-4">Leaderboard</h2>
      {username && (
        <div className="mb-3">
          <button
            onClick={() => setShowSettings(!showSettings)}
            className="flex items-center gap-2 text-[#b1bad3] hover:text-white transition-colors mb-2 text-sm font-medium cursor-pointer"
          >
            <span className={`transition-transform duration-200 ${showSettings ? "rotate-90" : ""}`}>
              <PlayArrow sx={{ fontSize: 18 }} />
            </span>
            {showSettings ? "Hide Account Settings" : "Show Account Settings"}
          </button>

          {showSettings && (
            <div className="p-4 bg-[#0f212e] rounded-lg space-y-3 border border-[#2f4553]/50">
              {errorMsg && (
                <div className="text-sm text-rose-400">{errorMsg}</div>
              )}
              {successMsg && (
                <div className="text-sm text-[#00e701]">{successMsg}</div>
              )}
              <div className="flex flex-col sm:flex-row gap-2">
                <input
                  type="text"
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  className="bg-[#0f212e] border border-[#2f4553] text-white px-3 py-2 rounded flex-1 focus:outline-none focus:border-[#00e701] text-sm"
                  placeholder="Username"
                />
                <button
                  onClick={handleChangeUsername}
                  className="bg-[#00e701] hover:bg-[#00c701] text-black font-bold px-4 py-2 rounded transition-colors whitespace-nowrap text-sm"
                >
                  Change username
                </button>
              </div>
              <div className="flex flex-col sm:flex-row gap-2 border-t border-[#2f4553] pt-3">
                <input
                  type="password"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  className="bg-[#0f212e] border border-[#2f4553] text-white px-3 py-2 rounded flex-1 focus:outline-none focus:border-[#00e701] text-sm"
                  placeholder="New Password"
                />
                <button
                  onClick={handleChangePassword}
                  className="bg-[#00e701] hover:bg-[#00c701] text-black font-bold px-4 py-2 rounded transition-colors whitespace-nowrap text-sm"
                >
                  Change password
                </button>
              </div>
            </div>
          )}
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
        The next season starts in <span className="text-white font-semibold">{daysUntilNextSeason}</span> Day{daysUntilNextSeason === 1 ? "" : "s"}
      </div>
      <div className="text-sm text-[#b1bad3]">
        Each season will restart on the first day of a month, after the restart, all accounts will be reset to $10,000 and the top 3 and last place will receive season badges
      </div>
    </div>
  );
}
