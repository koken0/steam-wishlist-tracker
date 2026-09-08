export const HISTORY_REPAIR_LIMIT = 2;
export const HISTORY_REPAIR_MAX_ATTEMPTS = 3;
export const HISTORY_REPAIR_LOOKBACK_DAYS = 30;

const INITIAL_DELAY_MS = 6 * 60 * 60 * 1_000;
const RETRY_DELAYS_MS = [24 * 60 * 60 * 1_000, 72 * 60 * 60 * 1_000];

export type WishlistHistoryRepairStatus =
  | 'pending' | 'processing' | 'empty' | 'error' | 'recovered' | 'exhausted';

export type WishlistHistoryRepair = {
  reportDate: string;
  attempts: number;
};

export type WishlistHistoryRepairOutcome = {
  status: WishlistHistoryRepairStatus;
  attempts: number;
  nextAttemptAt: string | null;
};

export function initialHistoryRepairAt(now: Date): string {
  return new Date(now.getTime() + INITIAL_DELAY_MS).toISOString();
}

export function nextHistoryRepairOutcome(
  previousAttempts: number,
  recovered: boolean,
  now: Date,
  failed = false,
): WishlistHistoryRepairOutcome {
  const attempts = previousAttempts + 1;
  if (recovered) return { status: 'recovered', attempts, nextAttemptAt: null };
  if (attempts >= HISTORY_REPAIR_MAX_ATTEMPTS) {
    return { status: 'exhausted', attempts, nextAttemptAt: null };
  }
  const delay = RETRY_DELAYS_MS[Math.max(0, attempts - 1)];
  return {
    status: failed ? 'error' : 'empty',
    attempts,
    nextAttemptAt: new Date(now.getTime() + delay).toISOString(),
  };
}

export function missingRequestedHistoryDates(
  requestedDates: readonly string[],
  receivedDates: readonly string[],
  today: Date,
): string[] {
  const received = new Set(receivedDates);
  const utcToday = Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate());
  const latestRepairable = new Date(utcToday - 2 * 86_400_000).toISOString().slice(0, 10);
  return requestedDates.filter((date) => date <= latestRepairable && !received.has(date));
}

export function recentMissingHistoryDates(
  storedDates: readonly string[],
  today: Date,
  lookbackDays = HISTORY_REPAIR_LOOKBACK_DAYS,
): string[] {
  if (!storedDates.length) return [];
  const stored = new Set(storedDates);
  const utcToday = Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate());
  const earliestAllowed = utcToday - (lookbackDays - 1) * 86_400_000;
  const firstStored = Date.parse(`${storedDates.slice().sort()[0]}T00:00:00.000Z`);
  const start = Math.max(earliestAllowed, firstStored);
  const end = utcToday - 2 * 86_400_000;
  const missing: string[] = [];
  for (let value = start; value <= end; value += 86_400_000) {
    const date = new Date(value).toISOString().slice(0, 10);
    if (!stored.has(date)) missing.push(date);
  }
  return missing;
}
