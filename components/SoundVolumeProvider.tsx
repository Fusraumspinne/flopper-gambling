"use client";

import React, { createContext, useContext, useEffect, useMemo, useState } from "react";

type SoundVolumeContextValue = {
  volume: number; 
  setVolume: (next: number) => void;
};

const SoundVolumeContext = createContext<SoundVolumeContextValue | undefined>(undefined);

const STORAGE_KEY = "flopper_sound_volume_v1";
const DEFAULT_VOLUME = 1;

const clamp01 = (v: number) => Math.max(0, Math.min(1, v));

function readInitialVolume(): number {
  if (typeof window === "undefined") return DEFAULT_VOLUME;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_VOLUME;
    const n = Number(raw);
    return Number.isFinite(n) ? clamp01(n) : DEFAULT_VOLUME;
  } catch {
    return DEFAULT_VOLUME;
  }
}

function installGlobalPlayHook() {
  if (typeof window === "undefined") return;

  const w = window as unknown as {
    __flopper_sound_volume__?: number;
    __flopper_audio_play_patched__?: boolean;
  };

  if (w.__flopper_audio_play_patched__) return;
  w.__flopper_audio_play_patched__ = true;

  const originalPlay = HTMLMediaElement.prototype.play;

  HTMLMediaElement.prototype.play = function playPatched(...args: Parameters<HTMLMediaElement["play"]>) {
    try {
      const v = (window as any).__flopper_sound_volume__;
      if (typeof v === "number" && Number.isFinite(v)) {
        this.volume = clamp01(v);
      }
    } catch {
      // ignore
    }

    return originalPlay.apply(this, args as any);
  };
}

export function SoundVolumeProvider({ children }: { children: React.ReactNode }) {
  const [volume, setVolumeState] = useState<number>(() => readInitialVolume());

  const setVolume = (next: number) => {
    setVolumeState(clamp01(next));
  };

  useEffect(() => {
    installGlobalPlayHook();
  }, []);

  useEffect(() => {
    try {
      window.localStorage.setItem(STORAGE_KEY, String(volume));
    } catch {
      // ignore
    }

    (window as any).__flopper_sound_volume__ = volume;
  }, [volume]);

  const value = useMemo<SoundVolumeContextValue>(() => ({ volume, setVolume }), [volume]);

  return <SoundVolumeContext.Provider value={value}>{children}</SoundVolumeContext.Provider>;
}

export function useSoundVolume() {
  const ctx = useContext(SoundVolumeContext);
  if (!ctx) throw new Error("useSoundVolume must be used within SoundVolumeProvider");
  return ctx;
}
