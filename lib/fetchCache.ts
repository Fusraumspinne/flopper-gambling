type CacheEntry<T> = {
  expiresAt: number;
  value?: T;
  inFlight?: Promise<T>;
};

const cache = new Map<string, CacheEntry<any>>();

export async function fetchJsonCached<T>(
  key: string,
  fetcher: () => Promise<T>,
  ttlMs: number
): Promise<T> {
  const now = Date.now();
  const existing = cache.get(key) as CacheEntry<T> | undefined;

  if (existing?.value !== undefined && existing.expiresAt > now) {
    return existing.value;
  }

  if (existing?.inFlight) {
    return existing.inFlight;
  }

  const inFlight = (async () => {
    const value = await fetcher();
    cache.set(key, { value, expiresAt: now + Math.max(0, ttlMs) });
    return value;
  })();

  cache.set(key, { expiresAt: now + Math.max(0, ttlMs), inFlight });

  try {
    return await inFlight;
  } finally {
    const latest = cache.get(key) as CacheEntry<T> | undefined;
    if (latest?.inFlight === inFlight) {
      delete latest.inFlight;
      cache.set(key, latest);
    }
  }
}

export function invalidateFetchCache(prefix?: string) {
  if (!prefix) {
    cache.clear();
    return;
  }

  for (const k of cache.keys()) {
    if (k.startsWith(prefix)) cache.delete(k);
  }
}
