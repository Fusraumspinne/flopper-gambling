"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useSession } from "next-auth/react";
import { useWallet } from "@/components/WalletProvider";
import { signOut } from "next-auth/react";

export default function AccountMissingBanner() {
  const { data: session, status } = useSession();
  const { accountMissing } = useWallet();
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (status === "loading") return;
    const loggedIn = !!session?.user?.name;
    setVisible(loggedIn && accountMissing);
  }, [accountMissing, session?.user?.name, status]);

  if (!visible) return null;

return (
    <div className="mb-6 rounded-2xl border border-red-500/60 bg-red-600/20 p-6">
        <h2 className="text-2xl sm:text-3xl font-extrabold text-red-200 mb-2">
            Your account no longer exists
        </h2>
        <p className="text-red-100 text-base sm:text-lg">
            This user was not found, please create a new account to continue playing
        </p>
        <div className="mt-4">
            <Link
            href={"/login"}
                onClick={async () => {
                    try {
                        await signOut();

                        try {
                            localStorage.clear();
                        } catch (e) {}
                    } catch (e) {
                        console.error("Logout error:", e);
                    }
                }}
                className="inline-flex items-center justify-center rounded-lg bg-red-500 hover:bg-red-400 text-white font-bold px-5 py-2.5 transition"
            >
                Create a new account
            </Link>
        </div>
    </div>
);
}
