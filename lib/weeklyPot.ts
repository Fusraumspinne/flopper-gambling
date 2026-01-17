// Helper for weekly pot in IndexedDB
import { getItem, setItem } from "@/lib/indexedDB";

const POT_KEY = "flopper_weekly_pot_v1";
const CLAIM_KEY = "flopper_weekly_pot_last_claim_v1";

export async function getWeeklyPot(): Promise<number> {
  const raw = await getItem<string>(POT_KEY);
  if (!raw) return 0;
  return Number.isFinite(Number(raw)) ? Number(raw) : 0;
}

export async function setWeeklyPot(amount: number): Promise<void> {
  await setItem(POT_KEY, amount.toFixed(2));
}

export async function getLastClaim(): Promise<number> {
  const raw = await getItem<string>(CLAIM_KEY);
  if (!raw) return 0;
  return Number.isFinite(Number(raw)) ? Number(raw) : 0;
}

export async function setLastClaim(ts: number): Promise<void> {
  await setItem(CLAIM_KEY, String(ts));
}
