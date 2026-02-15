import { GAME_ROUTE_TO_KEY, getGameKeyFromHref } from "@/lib/gameStatus";

export const GAME_OPEN_COUNTS_KEY = "flopper_game_open_counts_v1";
const GAME_OPEN_COUNTS_UPDATED = "flopper:game-open-counts-updated";

type OpenCounts = Record<string, number>;

declare global {
  interface Window {
    __flopperLastTrackedGamePath?: string;
    __flopperLastTrackedGameAt?: number;
  }
}

export function readGameOpenCounts(): OpenCounts {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.localStorage.getItem(GAME_OPEN_COUNTS_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    if (!parsed || typeof parsed !== "object") return {};

    const out: OpenCounts = {};
    for (const [key, value] of Object.entries(parsed)) {
      if (typeof value === "number" && Number.isFinite(value) && value > 0) {
        out[key] = Math.floor(value);
      }
    }
    return out;
  } catch {
    return {};
  }
}

function writeGameOpenCounts(counts: OpenCounts) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(GAME_OPEN_COUNTS_KEY, JSON.stringify(counts));
}

function dispatchGameOpenCountsUpdated() {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new Event(GAME_OPEN_COUNTS_UPDATED));
}

export function getGameKeyFromPathname(pathname: string): string | null {
  if (!pathname) return null;
  const normalizedPath = pathname.replace(/\/+$/, "") || "/";
  const segment = normalizedPath.split("/").filter(Boolean)[0];
  const baseRoute = segment ? `/${segment}` : "/";
  return GAME_ROUTE_TO_KEY[baseRoute] ?? null;
}

export function incrementGameOpenCountFromPathname(pathname: string): void {
  if (typeof window === "undefined") return;

  const gameKey = getGameKeyFromPathname(pathname);
  if (!gameKey) return;

  const now = Date.now();
  const normalizedPath = pathname.replace(/\/+$/, "") || "/";
  const lastPath = window.__flopperLastTrackedGamePath;
  const lastAt = window.__flopperLastTrackedGameAt ?? 0;

  if (lastPath === normalizedPath && now - lastAt < 1200) {
    return;
  }

  window.__flopperLastTrackedGamePath = normalizedPath;
  window.__flopperLastTrackedGameAt = now;

  const counts = readGameOpenCounts();
  counts[gameKey] = (counts[gameKey] ?? 0) + 1;
  writeGameOpenCounts(counts);
  dispatchGameOpenCountsUpdated();
}

export function getOpenCountForHref(href: string, counts?: OpenCounts): number {
  const source = counts ?? readGameOpenCounts();
  const gameKey = getGameKeyFromHref(href);
  return source[gameKey] ?? 0;
}

export function sortByOpenCountThenName<T>(
  items: readonly T[],
  getName: (item: T) => string,
  getHref: (item: T) => string,
  counts?: OpenCounts
): T[] {
  const source = counts ?? readGameOpenCounts();
  return [...items].sort((a, b) => {
    const countDiff = getOpenCountForHref(getHref(b), source) - getOpenCountForHref(getHref(a), source);
    if (countDiff !== 0) return countDiff;
    return getName(a).localeCompare(getName(b), undefined, { sensitivity: "base" });
  });
}

export function subscribeToGameOpenCountUpdates(callback: () => void): () => void {
  if (typeof window === "undefined") return () => {};

  const onStorage = (e: StorageEvent) => {
    if (e.key === GAME_OPEN_COUNTS_KEY) callback();
  };

  const onCustom = () => callback();

  window.addEventListener("storage", onStorage);
  window.addEventListener(GAME_OPEN_COUNTS_UPDATED, onCustom);

  return () => {
    window.removeEventListener("storage", onStorage);
    window.removeEventListener(GAME_OPEN_COUNTS_UPDATED, onCustom);
  };
}
