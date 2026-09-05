import assert from 'node:assert/strict';
import test from 'node:test';
import { WishlistConnectorError } from './wishlist-errors.ts';
import { fetchSteamWishlistDate, requireUsableWishlistDays } from './wishlist-steam-client.ts';

function errorCode(error: unknown): string | null {
  return error instanceof WishlistConnectorError ? error.code : null;
}

test('sends the key only in the request header and accepts the expected App ID', async () => {
  let capturedUrl = '';
  let capturedKey = '';
  const fetchImpl = (async (input: URL | RequestInfo, init?: RequestInit) => {
    capturedUrl = String(input);
    capturedKey = new Headers(init?.headers).get('x-webapi-key') || '';
    return Response.json({
      response: {
        appid: 123,
        date: '2026-09-03',
        wishlist_summary: { wishlist_adds: 9, wishlist_deletes: 2 },
      },
    });
  }) as typeof fetch;

  const payload = await fetchSteamWishlistDate('secret-value', 123, '2026-09-03', fetchImpl);
  assert.equal(payload.response?.appid, 123);
  assert.equal(capturedKey, 'secret-value');
  assert.equal(capturedUrl.includes('secret-value'), false);
});

test('maps authorization and rate-limit responses to safe errors', async () => {
  for (const [status, code] of [[401, 'STEAM_ACCESS_DENIED'], [403, 'STEAM_ACCESS_DENIED'], [429, 'STEAM_RATE_LIMITED']] as const) {
    const fetchImpl = (async () => new Response('', { status })) as typeof fetch;
    await assert.rejects(
      fetchSteamWishlistDate('secret', 123, '2026-09-03', fetchImpl, async () => undefined),
      (error) => errorCode(error) === code && !String((error as Error).message).includes('secret'),
    );
  }
});

test('retries rate limits with bounded Retry-After delays', async () => {
  let calls = 0;
  const delays: number[] = [];
  const fetchImpl = (async () => {
    calls += 1;
    if (calls < 3) return new Response('', { status: 429, headers: { 'Retry-After': '60' } });
    return Response.json({
      response: {
        appid: 123,
        date: '2026-09-03',
        wishlist_summary: { wishlist_adds: 9, wishlist_deletes: 2 },
      },
    });
  }) as typeof fetch;

  const payload = await fetchSteamWishlistDate(
    'secret',
    123,
    '2026-09-03',
    fetchImpl,
    async (delayMs) => { delays.push(delayMs); },
  );
  assert.equal(payload.response?.appid, 123);
  assert.equal(calls, 3);
  assert.deepEqual(delays, [5_000, 5_000]);
});

test('maps an upstream server failure without exposing the response body', async () => {
  const fetchImpl = (async () => new Response('sensitive upstream body', { status: 500 })) as typeof fetch;
  await assert.rejects(
    fetchSteamWishlistDate('secret', 123, '2026-09-03', fetchImpl),
    (error) => errorCode(error) === 'STEAM_ERROR'
      && !String((error as Error).message).includes('sensitive upstream body'),
  );
});

test('rejects malformed JSON and an unexpected App ID', async () => {
  const malformed = (async () => new Response('not-json', { status: 200 })) as typeof fetch;
  await assert.rejects(
    fetchSteamWishlistDate('secret', 123, '2026-09-03', malformed),
    (error) => errorCode(error) === 'INVALID_STEAM_RESPONSE',
  );

  const mismatch = (async () => Response.json({
    response: {
      appid: 999,
      date: '2026-09-03',
      wishlist_summary: { wishlist_adds: 1, wishlist_deletes: 0 },
    },
  })) as typeof fetch;
  await assert.rejects(
    fetchSteamWishlistDate('secret', 123, '2026-09-03', mismatch),
    (error) => errorCode(error) === 'STEAM_APP_MISMATCH',
  );
});

test('maps network failures and rejects an empty normalized period', async () => {
  const unavailable = (async () => { throw new Error('network detail'); }) as typeof fetch;
  await assert.rejects(
    fetchSteamWishlistDate('secret', 123, '2026-09-03', unavailable),
    (error) => errorCode(error) === 'STEAM_UNREACHABLE',
  );
  assert.throws(
    () => requireUsableWishlistDays([{ response: { appid: 123, date: '2026-09-03' } }]),
    (error) => errorCode(error) === 'NO_WISHLIST_DATA',
  );
});
