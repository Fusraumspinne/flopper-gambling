"use client";

import React, { useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { GAME_ROUTE_TO_KEY } from "@/lib/gameStatus";
import AccessGate from "@/components/AccessGate";
import LayoutWrapper from "@/components/LayoutWrapper";
import { AuthProvider } from "@/app/providers";
import Wartungspause from "@/components/Wartungspause";
import Pause from "@/components/Pause";
import NewSeason from "@/components/NewSeason";

interface AdminBypassProps {
  isMaintenance?: boolean;
  isPause?: boolean;
  isSeasonBreak?: boolean;
  children: React.ReactNode;
}

export default function AdminBypass({ isMaintenance, isPause, isSeasonBreak, children }: AdminBypassProps) {
  const [isAdmin, setIsAdmin] = useState<boolean | null>(null);
  const [status, setStatus] = useState<{ isMaintenance: boolean; isPaused: boolean; isSeasonBreak: boolean } | null>(
    isMaintenance !== undefined || isPause !== undefined || isSeasonBreak !== undefined
      ? { isMaintenance: !!isMaintenance, isPaused: !!isPause, isSeasonBreak: !!isSeasonBreak }
      : null
  );

  useEffect(() => {
    try {
      const admin = typeof window !== "undefined" && localStorage.getItem("flopper_admin_authorized");
      setIsAdmin(admin === "true");
    } catch (e) {
      setIsAdmin(false);
    }
  }, []);

  useEffect(() => {
    if (status !== null) return;
    let mounted = true;
    (async () => {
      try {
        const res = await fetch('/api/status', { cache: 'no-store' });
        if (!mounted) return;
        if (!res.ok) {
          setStatus({ isMaintenance: false, isPaused: false, isSeasonBreak: false });
          return;
        }
        const data = await res.json();
        if (!mounted) return;
        setStatus({
          isMaintenance: !!data?.isMaintenance,
          isPaused: !!data?.isPaused,
          isSeasonBreak: !!data?.isSeasonBreak,
        });
      } catch (e) {
        if (!mounted) return;
        setStatus({ isMaintenance: false, isPaused: false, isSeasonBreak: false });
      }
    })();
    return () => {
      mounted = false;
    };
  }, [status]);

  const pathname = usePathname();
  const router = useRouter();

  useEffect(() => {
    if (!pathname) return;
    const cleaned = pathname.replace(/\/+$/, "");
    const parts = cleaned.split("/").filter(Boolean);
    const baseRoute = parts.length ? `/${parts[0]}` : "/";
    const gameKey = GAME_ROUTE_TO_KEY[baseRoute];
    if (!gameKey) return;

    let mounted = true;
    (async () => {
      try {
        const res = await fetch('/api/status', { cache: 'no-store' });
        if (!mounted) return;
        if (!res.ok) return;
        const data = await res.json();
        if (!mounted) return;
        setStatus({
          isMaintenance: !!data?.isMaintenance,
          isPaused: !!data?.isPaused,
          isSeasonBreak: !!data?.isSeasonBreak,
        });

        if (data?.games && data.games[gameKey] === false) {
          if (isAdmin === false) {
            router.replace('/');
          }
        }
      } catch (e) {
      }
    })();

    return () => {
      mounted = false;
    };
  }, [pathname, isAdmin, router]);

  if (isAdmin === null || status === null) {
    return (
      <div className="min-h-screen bg-[#0f212e] flex items-center justify-center p-8 text-center">
        <div className="w-20 h-20 border-4 border-[#2f4553] border-t-indigo-400 rounded-full animate-spin" />
      </div>
    );
  }

  const { isMaintenance: sm, isPaused: sp, isSeasonBreak: ss } = status;

  if (sm || sp || ss) {
    if (isAdmin) {
      return (
        <AccessGate>
          <AuthProvider>
            <LayoutWrapper>{children}</LayoutWrapper>
          </AuthProvider>
        </AccessGate>
      );
    }

    if (sm) return <Wartungspause />;
    if (sp) return <Pause />;
    if (ss) return <NewSeason />;
  }

  return (
    <AccessGate>
      <AuthProvider>
        <LayoutWrapper>{children}</LayoutWrapper>
      </AuthProvider>
    </AccessGate>
  );
}
