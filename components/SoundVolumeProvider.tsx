"use client";

import React, { createContext, useContext, useEffect, useMemo, useState } from "react";
import { getItem, setItem } from "../lib/indexedDB";

type SoundVolumeContextValue = {
  volume: number; 
  setVolume: (next: number) => void;
};

const SoundVolumeContext = createContext<SoundVolumeContextValue | undefined>(undefined);

const STORAGE_KEY = "flopper_sound_volume_v1";
const DEFAULT_VOLUME = 1;

const clamp01 = (v: number) => Math.max(0, Math.min(1, v));

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
  const [volume, setVolumeState] = useState<number>(DEFAULT_VOLUME);
  const hydratedRef = React.useRef(false);

  const setVolume = (next: number) => {
    setVolumeState(clamp01(next));
  };

  useEffect(() => {
    getItem<string | number>(STORAGE_KEY).then((raw) => {
      if (raw != null) {
        const n = Number(raw);
        if (Number.isFinite(n)) {
          setVolumeState(clamp01(n));
        }
      }
      // mark hydrated even if no stored value — prevents initial write-over
      hydratedRef.current = true;
      (window as any).__flopper_sound_volume__ = clamp01(Number(raw ?? DEFAULT_VOLUME));
    });
  }, []);

  useEffect(() => {
    installGlobalPlayHook();
  }, []);

  useEffect(() => {
    if (!hydratedRef.current) return;
    setItem(STORAGE_KEY, String(volume));
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
