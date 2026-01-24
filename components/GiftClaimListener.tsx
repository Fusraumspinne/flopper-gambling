"use client";

import { useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import { useWallet } from "@/components/WalletProvider";

function normalizeMoney(value: number): number {
  if (!Number.isFinite(value)) return 0;
  const rounded = Math.round((value + Number.EPSILON) * 100) / 100;
  return Object.is(rounded, -0) ? 0 : rounded;
}

function formatSenderList(senders: string[]): string {
  const unique = Array.from(new Set(senders.map((s) => s.trim()).filter(Boolean)));
  if (!unique.length) return "Spieler";
  if (unique.length === 1) return unique[0];
  if (unique.length === 2) return `${unique[0]} und ${unique[1]}`;
  const first = unique.slice(0, 3);
  const remaining = unique.length - first.length;
  return remaining > 0 ? `${first.join(", ")} (+${remaining})` : first.join(", ");
}

export default function GiftClaimListener() {
  const { creditBalance, syncBalance } = useWallet();
  const { data: session, status } = useSession();

  const [open, setOpen] = useState(false);
  const [total, setTotal] = useState(0);
  const [senders, setSenders] = useState<string[]>([]);

  useEffect(() => {
    if (status === "loading") return;
    let cancelled = false;

    (async () => {
      const username = session?.user?.name;
      if (!username) return;

      try {
        const res = await fetch("/api/claimGift", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ recipient: username }),
        });

        if (!res.ok) return;
        const data = await res.json();
        const claimed = normalizeMoney(Number(data?.total));
        const claimedSenders = Array.isArray(data?.senders) ? (data.senders as string[]) : [];

        if (cancelled) return;
        if (claimed > 0) {
          creditBalance(claimed);
          await syncBalance();
          setTotal(claimed);
          setSenders(claimedSenders);
          setOpen(true);
        }
      } catch (e) {
        console.error("Failed to claim gifts", e);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [session?.user?.name, status]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
      <div className="w-full max-w-md bg-[#0f212e] border border-[#2f4553]/60 rounded-xl p-5">
        <div className="text-white font-semibold text-lg">Gift received</div>
        <div className="mt-2 text-sm text-[#b1bad3]">
          {formatSenderList(senders)} sent you a total of <span className="text-white font-semibold">${total.toFixed(2)}</span>.
        </div>
        <div className="mt-4 flex justify-end">
          <button
            onClick={() => setOpen(false)}
            className="bg-[#00e701] hover:bg-[#00c701] text-black font-bold px-4 py-2 rounded transition-colors"
          >
            OK
          </button>
        </div>
      </div>
    </div>
  );
}
