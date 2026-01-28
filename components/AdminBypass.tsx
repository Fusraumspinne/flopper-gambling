"use client";

import React, { useEffect, useState } from "react";
import AccessGate from "@/components/AccessGate";
import LayoutWrapper from "@/components/LayoutWrapper";
import { AuthProvider } from "@/app/providers";
import Wartungspause from "@/components/Wartungspause";
import Pause from "@/components/Pause";

interface AdminBypassProps {
  isMaintenance?: boolean;
  isPause?: boolean;
  children: React.ReactNode;
}

export default function AdminBypass({ isMaintenance, isPause, children }: AdminBypassProps) {
  const [isAdmin, setIsAdmin] = useState<boolean | null>(null);

  useEffect(() => {
    try {
      const admin = typeof window !== "undefined" && localStorage.getItem("flopper_admin_authorized");
      setIsAdmin(admin === "true");
    } catch (e) {
      setIsAdmin(false);
    }
  }, []);

  if (isAdmin === null) {
    return (
      <div className="min-h-screen bg-[#0f212e] flex items-center justify-center p-8 text-center">
        <div className="w-20 h-20 border-4 border-[#2f4553] border-t-indigo-400 rounded-full animate-spin" />
      </div>
    );
  }

  if (isAdmin) {
    return (
      <AccessGate>
        <AuthProvider>
          <LayoutWrapper>{children}</LayoutWrapper>
        </AuthProvider>
      </AccessGate>
    );
  }

  // not an admin — show maintenance or pause
  if (isMaintenance) return <Wartungspause />;
  if (isPause) return <Pause />;

  return null;
}
