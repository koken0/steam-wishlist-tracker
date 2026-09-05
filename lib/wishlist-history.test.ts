import assert from 'node:assert/strict';
import test from 'node:test';
import { buildWishlistHistory, calendarDatesInclusive, summarizeWishlistRange } from './wishlist-history.ts';
import type { WishlistDay } from './wishlist-contract.ts';

test('selected history includes both endpoints and reports missing calendar dates', () => {
  const history = buildWishlistHistory([
    day('2026-09-01', 3, 1),
    day('2026-09-03', 0, 0),
  ], 2);
  const summary = summarizeWishlistRange(history, '2026-09-01', '2026-09-03');

  assert.deepEqual(summary.entries.map((entry) => [entry.date, entry.status]), [
    ['2026-09-01', 'recorded'],
    ['2026-09-02', 'missing'],
    ['2026-09-03', 'recorded'],
  ]);
  assert.equal(summary.expectedDays, 3);
  assert.equal(summary.recordedDays, 2);
  assert.deepEqual(summary.missingDates, ['2026-09-02']);
  assert.equal(summary.complete, false);
  assert.equal(summary.net, 2);
});

test('a recorded zero-activity day remains distinct from a missing day', () => {
  const history = buildWishlistHistory([day('2026-09-03', 0, 0)], 0);
  const summary = summarizeWishlistRange(history, '2026-09-02', '2026-09-03');

  assert.equal(summary.entries[0].status, 'missing');
  assert.equal(summary.entries[1].status, 'recorded');
  assert.equal(summary.entries[1].day?.net, 0);
  assert.equal(summary.recordedDays, 1);
});

test('corrected dates recalculate running totals and every range aggregate', () => {
  const original = [day('2026-09-01', 5, 1), day('2026-09-02', 4, 1)];
  const corrected = [day('2026-09-01', 8, 1), day('2026-09-02', 4, 1)];
  const originalHistory = buildWishlistHistory(original, 7);
  const correctedHistory = buildWishlistHistory(corrected, 10);

  assert.deepEqual(originalHistory.map((item) => item.total), [4, 7]);
  assert.deepEqual(correctedHistory.map((item) => item.total), [7, 10]);
  assert.equal(summarizeWishlistRange(originalHistory, '2026-09-01', '2026-09-02').net, 7);
  assert.equal(summarizeWishlistRange(correctedHistory, '2026-09-01', '2026-09-02').net, 10);
});

test('calendar range rejects invalid or reversed dates', () => {
  assert.deepEqual(calendarDatesInclusive('2026-02-28', '2026-03-01'), ['2026-02-28', '2026-03-01']);
  assert.deepEqual(calendarDatesInclusive('2026-02-30', '2026-03-01'), []);
  assert.deepEqual(calendarDatesInclusive('2026-03-02', '2026-03-01'), []);
});

function day(date: string, adds: number, deletes: number): WishlistDay {
  return {
    date,
    adds,
    deletes,
    purchases: 0,
    gifts: 0,
    addsWindows: adds,
    addsMac: 0,
    addsLinux: 0,
    net: adds - deletes,
    generatedAt: null,
  };
}
