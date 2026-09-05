import type { WishlistDay } from './wishlist-contract.ts';

export type WishlistHistoryPoint = WishlistDay & { total: number | null };

export type WishlistRangeEntry =
  | { date: string; status: 'recorded'; day: WishlistHistoryPoint }
  | { date: string; status: 'missing'; day: null };

export type WishlistRangeSummary = {
  entries: WishlistRangeEntry[];
  recordedDays: number;
  expectedDays: number;
  missingDates: string[];
  complete: boolean;
  adds: number;
  deletes: number;
  net: number;
};

export function buildWishlistHistory(days: WishlistDay[], currentTotal: number | null): WishlistHistoryPoint[] {
  const ordered = days.slice().sort((left, right) => left.date.localeCompare(right.date));
  let runningTotal = currentTotal;
  const totals = new Map<string, number>();
  for (let index = ordered.length - 1; index >= 0; index -= 1) {
    const day = ordered[index];
    if (runningTotal != null) {
      totals.set(day.date, runningTotal);
      runningTotal -= day.net;
    }
  }
  return ordered.map((day) => ({ ...day, total: totals.get(day.date) ?? null }));
}

export function summarizeWishlistRange(
  history: WishlistHistoryPoint[],
  fromDate: string,
  toDate: string,
): WishlistRangeSummary {
  const dates = calendarDatesInclusive(fromDate, toDate);
  const byDate = new Map(history.map((day) => [day.date, day]));
  const entries: WishlistRangeEntry[] = dates.map((date) => {
    const day = byDate.get(date);
    return day ? { date, status: 'recorded', day } : { date, status: 'missing', day: null };
  });
  const recorded = entries.flatMap((entry) => entry.day ? [entry.day] : []);
  const missingDates = entries.filter((entry) => entry.status === 'missing').map((entry) => entry.date);

  return {
    entries,
    recordedDays: recorded.length,
    expectedDays: dates.length,
    missingDates,
    complete: dates.length > 0 && missingDates.length === 0,
    adds: recorded.reduce((sum, day) => sum + day.adds, 0),
    deletes: recorded.reduce((sum, day) => sum + day.deletes, 0),
    net: recorded.reduce((sum, day) => sum + day.net, 0),
  };
}

export function calendarDatesInclusive(fromDate: string, toDate: string): string[] {
  const from = utcDateValue(fromDate);
  const to = utcDateValue(toDate);
  if (from == null || to == null || from > to) return [];

  const dates: string[] = [];
  for (let value = from; value <= to; value += 86_400_000) {
    dates.push(new Date(value).toISOString().slice(0, 10));
  }
  return dates;
}

function utcDateValue(value: string): number | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const timestamp = Date.parse(`${value}T00:00:00.000Z`);
  return Number.isFinite(timestamp) && new Date(timestamp).toISOString().slice(0, 10) === value
    ? timestamp
    : null;
}
