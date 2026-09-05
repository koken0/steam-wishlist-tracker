import type { WishlistDay } from './wishlist-contract.ts';

export function currentAndPreviousUtcDates(now = new Date()): string[] {
  const start = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  return [-1, 0].map((offset) => new Date(start + offset * 86_400_000).toISOString().slice(0, 10));
}

export function recentBaselineAdds(days: WishlistDay[], beforeDate: string): number | null {
  const values = days
    .filter((day) => day.date < beforeDate)
    .slice(-7)
    .map((day) => day.adds);
  if (values.length < 5) return null;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}
