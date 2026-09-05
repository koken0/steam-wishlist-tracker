import assert from 'node:assert/strict';
import test from 'node:test';
import { connectionValidationDates, currentAndPreviousUtcDates, recentBaselineAdds } from './wishlist-polling.ts';
import type { WishlistDay } from './wishlist-contract.ts';

function day(date: string, adds: number): WishlistDay {
  return {
    date,
    adds,
    deletes: 0,
    purchases: 0,
    gifts: 0,
    addsWindows: adds,
    addsMac: 0,
    addsLinux: 0,
    net: adds,
    generatedAt: null,
  };
}

test('incremental refresh targets yesterday and today in GMT', () => {
  assert.deepEqual(
    currentAndPreviousUtcDates(new Date('2026-01-01T00:30:00.000Z')),
    ['2025-12-31', '2026-01-01'],
  );
});

test('spike baseline uses up to seven completed days before today', () => {
  const days = [
    day('2026-08-27', 10), day('2026-08-28', 20), day('2026-08-29', 30),
    day('2026-08-30', 40), day('2026-08-31', 50), day('2026-09-01', 60),
    day('2026-09-02', 70), day('2026-09-03', 999),
  ];
  assert.equal(recentBaselineAdds(days, '2026-09-03'), 40);
  assert.equal(recentBaselineAdds(days.slice(0, 4), '2026-09-03'), null);
});

test('connection validation targets exactly the current GMT date', () => {
  assert.deepEqual(
    connectionValidationDates(new Date('2026-09-05T23:59:59.000Z')),
    ['2026-09-05'],
  );
});
