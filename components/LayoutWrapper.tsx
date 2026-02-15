"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";
import { WalletProvider } from "@/components/WalletProvider";
import Shell from "@/components/Shell";
import { SoundVolumeProvider } from "@/components/SoundVolumeProvider";
import GiftClaimListener from "@/components/GiftClaimListener";
import { Analytics } from "@vercel/analytics/next";
import { incrementGameOpenCountFromPathname } from "@/lib/gameOpenStats";

export default function LayoutWrapper({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  
  const isAuthPage = pathname === "/login" || pathname === "/signup";

  useEffect(() => {
    if (!pathname) return;
    incrementGameOpenCountFromPathname(pathname);
  }, [pathname]);

  if (isAuthPage) {
    return <main className="min-h-screen bg-[#0f212e]">{children}</main>;
  }

  return (
    <WalletProvider>
      <SoundVolumeProvider>
        <Shell>
          <GiftClaimListener />
          {children}
          <Analytics />
        </Shell>
      </SoundVolumeProvider>
    </WalletProvider>
  );
}