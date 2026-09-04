import assert from 'node:assert/strict';
import test from 'node:test';
import { decryptSecret, encryptSecret } from './secret-crypto.ts';

const originalKey = process.env.WISHLIST_ENCRYPTION_KEY;
const testKey = Buffer.alloc(32, 7).toString('base64');

test.after(() => {
  if (originalKey === undefined) delete process.env.WISHLIST_ENCRYPTION_KEY;
  else process.env.WISHLIST_ENCRYPTION_KEY = originalKey;
});

test('encrypted connection values are randomized and recoverable', async () => {
  process.env.WISHLIST_ENCRYPTION_KEY = testKey;
  const first = await encryptSecret('steam-secret');
  const replacement = await encryptSecret('steam-secret');
  assert.notEqual(first, replacement);
  assert.equal(first.includes('steam-secret'), false);
  assert.equal(await decryptSecret(first), 'steam-secret');
  assert.equal(await decryptSecret(replacement), 'steam-secret');
});

test('rejects an invalid protection key without exposing the secret', async () => {
  process.env.WISHLIST_ENCRYPTION_KEY = Buffer.alloc(12).toString('base64');
  await assert.rejects(
    encryptSecret('do-not-leak'),
    (error) => !String((error as Error).message).includes('do-not-leak'),
  );
});
