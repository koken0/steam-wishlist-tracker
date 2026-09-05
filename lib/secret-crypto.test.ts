import assert from 'node:assert/strict';
import test from 'node:test';
import { currentSecretKeyId, decryptSecret, encryptSecret, secretEnvelopeKeyId } from './secret-crypto.ts';

const mutableEnv = process.env as unknown as Record<string, string | undefined>;
const original = {
  key: process.env.WISHLIST_ENCRYPTION_KEY,
  keyId: process.env.WISHLIST_ENCRYPTION_KEY_ID,
  previousKey: process.env.WISHLIST_PREVIOUS_ENCRYPTION_KEY,
  previousKeyId: process.env.WISHLIST_PREVIOUS_ENCRYPTION_KEY_ID,
};
const testKey = Buffer.alloc(32, 7).toString('base64');

test.after(() => {
  restore('WISHLIST_ENCRYPTION_KEY', original.key);
  restore('WISHLIST_ENCRYPTION_KEY_ID', original.keyId);
  restore('WISHLIST_PREVIOUS_ENCRYPTION_KEY', original.previousKey);
  restore('WISHLIST_PREVIOUS_ENCRYPTION_KEY_ID', original.previousKeyId);
});

test('encrypted connection values are randomized and recoverable', async () => {
  process.env.WISHLIST_ENCRYPTION_KEY = testKey;
  const first = await encryptSecret('steam-secret');
  const replacement = await encryptSecret('steam-secret');
  assert.notEqual(first, replacement);
  assert.equal(first.includes('steam-secret'), false);
  assert.equal(secretEnvelopeKeyId(first), 'primary');
  assert.equal(await decryptSecret(first), 'steam-secret');
  assert.equal(await decryptSecret(replacement), 'steam-secret');
});

test('reads legacy envelopes and supports a dual-key re-wrapping window', async () => {
  mutableEnv.WISHLIST_ENCRYPTION_KEY = testKey;
  mutableEnv.WISHLIST_ENCRYPTION_KEY_ID = 'key-2026-a';
  delete mutableEnv.WISHLIST_PREVIOUS_ENCRYPTION_KEY;
  delete mutableEnv.WISHLIST_PREVIOUS_ENCRYPTION_KEY_ID;
  const oldEnvelope = await encryptSecret('rotation-secret');
  const [, , iv, ciphertext] = oldEnvelope.split('.');
  assert.equal(await decryptSecret(`${iv}.${ciphertext}`), 'rotation-secret');

  mutableEnv.WISHLIST_ENCRYPTION_KEY = Buffer.alloc(32, 9).toString('base64');
  mutableEnv.WISHLIST_ENCRYPTION_KEY_ID = 'key-2026-b';
  mutableEnv.WISHLIST_PREVIOUS_ENCRYPTION_KEY = testKey;
  mutableEnv.WISHLIST_PREVIOUS_ENCRYPTION_KEY_ID = 'key-2026-a';
  assert.equal(await decryptSecret(oldEnvelope), 'rotation-secret');
  const rewrapped = await encryptSecret(await decryptSecret(oldEnvelope));
  assert.equal(secretEnvelopeKeyId(rewrapped), 'key-2026-b');
  assert.equal(currentSecretKeyId(), 'key-2026-b');

  delete mutableEnv.WISHLIST_PREVIOUS_ENCRYPTION_KEY;
  delete mutableEnv.WISHLIST_PREVIOUS_ENCRYPTION_KEY_ID;
  assert.equal(await decryptSecret(rewrapped), 'rotation-secret');
  await assert.rejects(() => decryptSecret(oldEnvelope));
});

test('rejects an invalid protection key without exposing the secret', async () => {
  process.env.WISHLIST_ENCRYPTION_KEY = Buffer.alloc(12).toString('base64');
  await assert.rejects(
    encryptSecret('do-not-leak'),
    (error) => !String((error as Error).message).includes('do-not-leak'),
  );
});

function restore(name: string, value: string | undefined) {
  if (value === undefined) delete mutableEnv[name];
  else mutableEnv[name] = value;
}
