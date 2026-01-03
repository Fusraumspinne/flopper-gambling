"use client";

import React, { createContext, useContext, useEffect, useMemo, useState } from "react";
import Navbar from "@/components/Navbar";
import { getItem, setItem } from "../lib/indexedDB";

type SidebarContextValue = {
  collapsed: boolean;
  setCollapsed: (v: boolean) => void;
  toggleCollapsed: () => void;
  sidebarWidth: string;
};

const SidebarContext = createContext<SidebarContextValue | undefined>(undefined);

const KEY = "flopper_sidebar_collapsed_v1";

export function SidebarProvider({ children }: { children: React.ReactNode }) {
  const [collapsed, setCollapsed] = useState(false);

  useEffect(() => {
    getItem<string>(KEY).then((raw) => {
      if (raw === "1") setCollapsed(true);
    });
  }, []);

  useEffect(() => {
    setItem(KEY, collapsed ? "1" : "0");
  }, [collapsed]);

  const sidebarWidth = useMemo(() => (collapsed ? "72px" : "20%"), [collapsed]);

  const value = useMemo<SidebarContextValue>(
    () => ({
      collapsed,
      setCollapsed,
      toggleCollapsed: () => setCollapsed((v) => !v),
      sidebarWidth,
    }),
    [collapsed, sidebarWidth]
  );

  return <SidebarContext.Provider value={value}>{children}</SidebarContext.Provider>;
}

export function useSidebar() {
  const ctx = useContext(SidebarContext);
  if (!ctx) throw new Error("useSidebar must be used within SidebarProvider");
  return ctx;
}

export default function Shell({ children }: { children: React.ReactNode }) {
  return (
    <SidebarProvider>
      <ShellInner>{children}</ShellInner>
    </SidebarProvider>
  );
}

function ShellInner({ children }: { children: React.ReactNode }) {
  const { sidebarWidth } = useSidebar();

  return (
    <div className="flex min-h-screen">
      <Navbar />
      <main
        className="min-h-screen"
        style={{
          marginLeft: sidebarWidth,
          width: `calc(100% - ${sidebarWidth})`,
        }}
      >
        {children}
      </main>
    </div>
  );
}
