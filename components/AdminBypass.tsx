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
import { AccessStatusProvider, useAccessStatus } from "@/components/AccessStatusProvider";

interface AdminBypassProps {
  children: React.ReactNode;
}

export default function AdminBypass({ children }: AdminBypassProps) {
  return (
    <AccessStatusProvider>
      <AdminBypassInner>{children}</AdminBypassInner>
    </AccessStatusProvider>
  );
}

function AdminBypassInner({ children }: { children: React.ReactNode }) {
  const [isAdmin, setIsAdmin] = useState<boolean | null>(null);
  const { status, isLoaded, refresh } = useAccessStatus();

  useEffect(() => {
    try {
      const admin = typeof window !== "undefined" && localStorage.getItem("flopper_admin_authorized");
      setIsAdmin(admin === "true");
    } catch (e) {
      setIsAdmin(false);
    }
  }, []);

  const pathname = usePathname();
  const router = useRouter();

  useEffect(() => {
    if (!pathname) return;

    if (status.isVerified === false && pathname !== "/not-verified") {
      router.replace("/not-verified");
      return;
    }

    if (status.isVerified === true && pathname === "/not-verified") {
      router.replace("/");
      return;
    }

    const cleaned = pathname.replace(/\/+$/, "");
    const parts = cleaned.split("/").filter(Boolean);
    const baseRoute = parts.length ? `/${parts[0]}` : "/";
    const gameKey = GAME_ROUTE_TO_KEY[baseRoute];
    if (!gameKey) return;

    if (status.games && status.games[gameKey] === false && isAdmin === false) {
      router.replace("/");
    }
  }, [pathname, isAdmin, router, status]);

  useEffect(() => {
    void refresh();
  }, [pathname, refresh]);

  if (isAdmin === null || !isLoaded) {
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
