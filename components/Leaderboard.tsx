"use client";

import { useEffect, useRef, useState } from "react";
import { getItem, removeItem, setItem } from "@/lib/indexedDB";
import { useWallet, VERIFIED_VERSION } from "./WalletProvider";
import { fetchJsonCached, invalidateFetchCache } from "@/lib/fetchCache";
import { io, Socket } from "socket.io-client";

type LeaderboardUser = {
  _id: string;
  name: string;
  balance: number;
};

export default function Leaderboard() {
  const [users, setUsers] = useState<LeaderboardUser[]>([]);
  const [username, setUsername] = useState<string | null>(null);
  const [inputName, setInputName] = useState("");
  const [editName, setEditName] = useState("");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [onlineUsers, setOnlineUsers] = useState<string[]>([]);
  const { syncBalance } = useWallet();
  const [page, setPage] = useState<number>(1);
  const PAGE_SIZE = 5;
  const socketRef = useRef<Socket | null>(null);
  const roomName = "leaderboard";
  const socketUrl =
    process.env.NEXT_PUBLIC_SOCKET_URL || "http://localhost:3000";

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
      const isVerified = await getItem<string>(VERIFIED_VERSION);
      const storedName = await getItem<string>("username");
      if (storedName && isVerified === "true") {
        setUsername(storedName);
        setEditName(storedName);
        syncBalance().catch(console.error);
      }
      await fetchLeaderboard();
      setLoading(false);
    };
    init();
  }, []);

  useEffect(() => {
    setEditName(username ?? "");
  }, [username]);

  useEffect(() => {
    if (typeof window === "undefined") return;

    if (!socketRef.current) {
      socketRef.current = io(socketUrl, {
        transports: ["websocket"],
      });

      socketRef.current.on("room-users", (list: string[]) => {
        setOnlineUsers(Array.isArray(list) ? list : []);
      });
    }

    socketRef.current.emit("join-room", { room: roomName, username: null });

    return () => {
      if (socketRef.current) {
        socketRef.current.disconnect();
        socketRef.current = null;
      }
    };
  }, [roomName, socketUrl]);

  useEffect(() => {
    if (!socketRef.current) return;
    socketRef.current.emit("join-room", { room: roomName, username });
  }, [roomName, username]);

  const handleRegister = async () => {
    if (!inputName.trim()) return;
    setErrorMsg(null);
    try {
      const res = await fetch("/api/user", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: inputName.trim(),
          createOnly: true,
          balance: 0,
        }),
      });

      if (res.status === 409) {
        setErrorMsg("This name is already taken. Please choose another.");
        return;
      }
      if (!res.ok) {
        setErrorMsg("Registration failed. Please try again later.");
        return;
      }

      await setItem("username", inputName.trim());
      setUsername(inputName.trim());
      await syncBalance();
      await fetchLeaderboard({ force: true });
    } catch (error) {
      console.error("Failed to register", error);
      setErrorMsg("Registration failed. Check the console.");
    }
  };

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

      await setItem("username", nextName);
      setUsername(nextName);
      await syncBalance();
      await fetchLeaderboard({ force: true });
    } catch (error) {
      console.error("Failed to change username", error);
      setErrorMsg("Could not change username. Check the console.");
    }
  };

  const handleRemoveUser = async () => {
    if (!username) return;
    setErrorMsg(null);
    try {
      const res = await fetch("/api/user", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: username }),
      });

      if (!res.ok) {
        setErrorMsg("Could not remove user. Please try again later.");
        return;
      }

      await removeItem("username");
      setUsername(null);
      setInputName("");
      await fetchLeaderboard({ force: true });
    } catch (error) {
      console.error("Failed to remove user", error);
      setErrorMsg("Could not remove user. Check the console.");
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

      {!username && (
        <div className="mb-6 p-4 bg-[#0f212e] rounded-lg">
          {errorMsg && (
            <div className="text-sm text-rose-400 mb-2">{errorMsg}</div>
          )}
          <div className="flex gap-2">
            <input
              type="text"
              value={inputName}
              onChange={(e) => setInputName(e.target.value)}
              className="bg-[#0f212e] border border-[#2f4553] text-white px-3 py-2 rounded flex-1 focus:outline-none focus:border-[#00e701]"
              placeholder="Username"
            />
            <button
              onClick={handleRegister}
              className="bg-[#00e701] hover:bg-[#00c701] text-black font-bold px-4 py-2 rounded transition-colors"
            >
              Join
            </button>
          </div>
          <div className="mt-1 text-xs text-[#557086]">Only join the leaderboard with your main account, please don&apos;t spam accounts you won&apos;t use in the future, you can still use the website normally without appearing on the leaderboard</div>
        </div>
      )}

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
            <button
              onClick={handleRemoveUser}
              className="bg-[#0f212e] border border-[#2f4553] text-white font-bold px-4 py-2 rounded transition-colors whitespace-nowrap"
            >
              Remove
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
                <span className="text-white font-medium flex items-center gap-2">
                  <span
                    className={`inline-block w-2.5 h-2.5 rounded-full ${
                      onlineUsers.includes(user.name)
                        ? "bg-[#00e701] shadow-[0_0_6px_rgba(0,231,1,0.8)] animate-pulse"
                        : "bg-[#2f4553]"
                    }`}
                  />
                  {user.name}
                </span>
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
    </div>
  );
}
