"use client";

import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";

type AccessStatusState = {
  isMaintenance: boolean;
  isPaused: boolean;
  isSeasonBreak: boolean;
  games: Record<string, boolean>;
  isVerified: boolean | null;
};

type AccessStatusContextValue = {
  status: AccessStatusState;
  isLoaded: boolean;
  refresh: () => Promise<void>;
};

const DEFAULT_STATUS: AccessStatusState = {
  isMaintenance: false,
  isPaused: false,
  isSeasonBreak: false,
  games: {},
  isVerified: null,
};

const AccessStatusContext = createContext<AccessStatusContextValue | undefined>(undefined);

export function AccessStatusProvider({ children }: { children: React.ReactNode }) {
  const [status, setStatus] = useState<AccessStatusState>(DEFAULT_STATUS);
  const [isLoaded, setIsLoaded] = useState(false);

  const refresh = useCallback(async () => {
    try {
      const res = await fetch("/api/status", { cache: "no-store" });
      if (!res.ok) {
        setStatus((prev) => ({ ...prev, isMaintenance: false, isPaused: false, isSeasonBreak: false }));
        return;
      }

      const data = await res.json();
      setStatus({
        isMaintenance: !!data?.isMaintenance,
        isPaused: !!data?.isPaused,
        isSeasonBreak: !!data?.isSeasonBreak,
        games: data?.games && typeof data.games === "object" ? data.games : {},
        isVerified: typeof data?.isVerified === "boolean" ? data.isVerified : null,
      });
    } catch {
      setStatus((prev) => ({ ...prev, isMaintenance: false, isPaused: false, isSeasonBreak: false }));
    } finally {
      setIsLoaded(true);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const value = useMemo<AccessStatusContextValue>(
    () => ({ status, isLoaded, refresh }),
    [status, isLoaded, refresh]
  );

  return <AccessStatusContext.Provider value={value}>{children}</AccessStatusContext.Provider>;
}

export function useAccessStatus() {
  const context = useContext(AccessStatusContext);
  if (!context) throw new Error("useAccessStatus must be used within AccessStatusProvider");
  return context;
}
