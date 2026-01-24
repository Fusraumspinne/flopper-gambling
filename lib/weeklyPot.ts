// Deprecated: weekly pot is computed in-memory; no persistence layer.
export async function getWeeklyPot(): Promise<number> {
  return 0;
}

export async function setWeeklyPot(_amount: number): Promise<void> {
}

export async function getLastClaim(): Promise<number> {
  return 0;
}

export async function setLastClaim(_ts: number): Promise<void> {
}
