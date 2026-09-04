import assert from 'node:assert/strict';
import test from 'node:test';
import {
  classifyWishlistFreshness,
  normalizeSteamWishlistResponse,
  storedWishlistTotal,
  type WishlistDay,
} from './wishlist-contract.ts';

const now = Date.parse('2026-09-03T12:00:00.000Z');

test('classifies freshness at the documented boundaries', () => {
  assert.equal(classifyWishlistFreshness('2026-09-02T12:00:00.000Z', null, now), 'fresh');
  assert.equal(classifyWishlistFreshness('2026-09-02T11:59:59.000Z', null, now), 'delayed');
  assert.equal(classifyWishlistFreshness('2026-09-01T12:00:00.000Z', null, now), 'delayed');
  assert.equal(classifyWishlistFreshness('2026-09-01T11:59:59.000Z', null, now), 'stale');
  assert.equal(classifyWishlistFreshness(null, null, now), 'unknown');
});

test('falls back to fetch time when Steam generation time is absent', () => {
  assert.equal(classifyWishlistFreshness(null, '2026-09-03T11:00:00.000Z', now), 'fresh');
});

test('normalizes net movement as additions minus deletions', () => {
  const day = normalizeSteamWishlistResponse({
    response: {
      appid: 1,
      date: '2026-09-03',
      wishlist_summary: { wishlist_adds: 12, wishlist_deletes: 5 },
    },
  });
  assert.equal(day?.net, 7);
});

test('calculates a stored total only when history exists', () => {
  const days = [
    { net: 7 },
    { net: -2 },
    { net: 10 },
  ] as WishlistDay[];
  assert.equal(storedWishlistTotal(days), 15);
  assert.equal(storedWishlistTotal([]), null);
});
