"use client";

import { useEffect, useState } from "react";
import { getItem, setItem } from "@/lib/indexedDB";
import { useWallet } from "./WalletProvider";

type LeaderboardUser = {
  _id: string;
  name: string;
  balance: number;
};

export default function Leaderboard() {
  const [users, setUsers] = useState<LeaderboardUser[]>([]);
  const [username, setUsername] = useState<string | null>(null);
  const [inputName, setInputName] = useState("");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const { syncBalance } = useWallet();
  const [page, setPage] = useState<number>(1);
  const PAGE_SIZE = 5;

  const fetchLeaderboard = async () => {
    try {
      const res = await fetch("/api/leaderboard");
      if (res.ok) {
        const data = await res.json();
        setUsers(data);
        setPage(1);
      }
    } catch (error) {
      console.error("Failed to fetch leaderboard", error);
    }
  };

  useEffect(() => {
    const init = async () => {
      const storedName = await getItem<string>("username");
      if (storedName) {
        setUsername(storedName);
        syncBalance().catch(console.error);
      }
      await fetchLeaderboard();
      setLoading(false);
    };
    init();
  }, []);

const handleRegister = async () => {
    if (!inputName.trim()) return;
    setErrorMsg(null);
    try {
        const res = await fetch("/api/user", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ name: inputName.trim(), createOnly: true, balance: 0 }),
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
        await fetchLeaderboard();
    } catch (error) {
        console.error("Failed to register", error);
        setErrorMsg("Registration failed. Check the console.");
    }
};

  if (loading) return <div className="text-white/50">Loading leaderboard...</div>;
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
                <p className="text-[#b1bad3] mb-2 text-sm">Enter your name to join the leaderboard:</p>
                {errorMsg && <div className="text-sm text-rose-400 mb-2">{errorMsg}</div>}
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
            </div>
        )}

        <div className="space-y-2 flex-1">
            {pageUsers.map((user, idx) => {
                const absoluteIndex = start + idx;
                return (
                    <div
                        key={user._id}
                        className={`flex justify-between items-center p-3 rounded ${
                            user.name === username ? "bg-[#00e701]/10 border border-[#00e701]/30" : "bg-[#0f212e]"
                        }`}
                    >
                        <div className="flex items-center gap-3">
                            <span className={`font-mono font-bold w-6 text-center ${
                                absoluteIndex === 0 ? "text-yellow-400" : 
                                absoluteIndex === 1 ? "text-gray-300" : 
                                absoluteIndex === 2 ? "text-amber-600" : "text-[#557086]"
                            }`}>
                                {absoluteIndex + 1}
                            </span>
                            <span className="text-white font-medium">{user.name}</span>
                        </div>
                        <span className="text-[#00e701] font-mono">
                            ${user.balance.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
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
                <button onClick={goFirst} disabled={page === 1} className={`px-3 py-1 rounded ${page === 1 ? 'bg-[#0f212e] text-[#557086]' : 'bg-[#00e701] text-black font-bold'}`}>
                    « First
                </button>
                <button onClick={goPrev} disabled={page === 1} className={`px-3 py-1 rounded ${page === 1 ? 'bg-[#0f212e] text-[#557086]' : 'bg-[#00e701] text-black font-bold'}`}>
                    ‹ Back
                </button>
            </div>

            <div className="text-sm text-[#b1bad3]">Page {page}/{totalPages} • {users.length} players</div>

            <div className="flex items-center gap-2">
                <button onClick={goNext} disabled={page === totalPages} className={`px-3 py-1 rounded ${page === totalPages ? 'bg-[#0f212e] text-[#557086]' : 'bg-[#00e701] text-black font-bold'}`}>
                    Next ›
                </button>
                <button onClick={goLast} disabled={page === totalPages} className={`px-3 py-1 rounded ${page === totalPages ? 'bg-[#0f212e] text-[#557086]' : 'bg-[#00e701] text-black font-bold'}`}>
                    Last »
                </button>
            </div>
        </div>
    </div>
);
}
