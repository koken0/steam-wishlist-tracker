import assert from 'node:assert/strict';
import test from 'node:test';
import {
  HISTORY_REPAIR_MAX_ATTEMPTS,
  initialHistoryRepairAt,
  missingRequestedHistoryDates,
  nextHistoryRepairOutcome,
  recentMissingHistoryDates,
} from './wishlist-history-repair.ts';

test('history repair starts after a six-hour quiet period', () => {
  assert.equal(
    initialHistoryRepairAt(new Date('2026-09-08T00:00:00.000Z')),
    '2026-09-08T06:00:00.000Z',
  );
});

test('initial backfill queues only missing closed dates', () => {
  assert.deepEqual(missingRequestedHistoryDates(
    ['2026-09-04', '2026-09-05', '2026-09-06', '2026-09-07', '2026-09-08'],
    ['2026-09-04', '2026-09-06', '2026-09-08'],
    new Date('2026-09-08T20:00:00.000Z'),
  ), ['2026-09-05']);
});

test('history repair backs off and stops after three unsuccessful attempts', () => {
  const now = new Date('2026-09-08T00:00:00.000Z');
  assert.deepEqual(nextHistoryRepairOutcome(0, false, now), {
    status: 'empty', attempts: 1, nextAttemptAt: '2026-09-09T00:00:00.000Z',
  });
  assert.deepEqual(nextHistoryRepairOutcome(1, false, now), {
    status: 'empty', attempts: 2, nextAttemptAt: '2026-09-11T00:00:00.000Z',
  });
  assert.deepEqual(nextHistoryRepairOutcome(HISTORY_REPAIR_MAX_ATTEMPTS - 1, false, now), {
    status: 'exhausted', attempts: 3, nextAttemptAt: null,
  });
});

test('a recovered date becomes terminal immediately', () => {
  assert.deepEqual(nextHistoryRepairOutcome(1, true, new Date('2026-09-08T00:00:00.000Z')), {
    status: 'recovered', attempts: 2, nextAttemptAt: null,
  });
});

test('temporary connector failures remain distinguishable while they back off', () => {
  assert.deepEqual(nextHistoryRepairOutcome(0, false, new Date('2026-09-08T00:00:00.000Z'), true), {
    status: 'error', attempts: 1, nextAttemptAt: '2026-09-09T00:00:00.000Z',
  });
});

test('only closed gaps inside the bounded recent window are repair candidates', () => {
  assert.deepEqual(recentMissingHistoryDates([
    '2026-08-11', '2026-08-12', '2026-09-04', '2026-09-06', '2026-09-07', '2026-09-08',
  ], new Date('2026-09-08T20:00:00.000Z')), [
    '2026-08-13', '2026-08-14', '2026-08-15', '2026-08-16', '2026-08-17',
    '2026-08-18', '2026-08-19', '2026-08-20', '2026-08-21', '2026-08-22',
    '2026-08-23', '2026-08-24', '2026-08-25', '2026-08-26', '2026-08-27',
    '2026-08-28', '2026-08-29', '2026-08-30', '2026-08-31', '2026-09-01',
    '2026-09-02', '2026-09-03', '2026-09-05',
  ]);
});
