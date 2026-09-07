import assert from 'node:assert/strict';
import test from 'node:test';
import { generateKeyPair, SignJWT } from 'jose';
import { getWishlineUser, verifyFirebaseIdToken } from './wishline-auth.ts';
import { workspaceIdForUser } from './wishline-workspace-id.ts';

test('local identity comes only from trusted platform headers', async () => {
  const originalProject = process.env.FIREBASE_PROJECT_ID;
  delete process.env.FIREBASE_PROJECT_ID;
  const withoutHeader = new Request('https://wishline.test/?userId=attacker', {
    method: 'POST',
    body: JSON.stringify({ userId: 'attacker' }),
  });
  assert.equal(await getWishlineUser(withoutHeader), null);

  const authenticated = new Request('https://wishline.test/?userId=attacker', {
    headers: {
      'oai-authenticated-user-id': 'owner-a',
      'oai-authenticated-user-email': 'owner@example.test',
    },
  });
  assert.deepEqual(await getWishlineUser(authenticated), {
    id: 'owner-a',
    email: 'owner@example.test',
    name: null,
  });
  if (originalProject === undefined) delete process.env.FIREBASE_PROJECT_ID;
  else process.env.FIREBASE_PROJECT_ID = originalProject;
});

test('Firebase ID tokens require the expected signature and project claims', async () => {
  const projectId = 'wishline-staging';
  const now = Math.floor(Date.now() / 1000);
  const { privateKey, publicKey } = await generateKeyPair('RS256');
  const token = await new SignJWT({ auth_time: now - 30, email: 'owner@example.test', name: 'Owner' })
    .setProtectedHeader({ alg: 'RS256', kid: 'test-key' })
    .setSubject('firebase-owner')
    .setAudience(projectId)
    .setIssuer(`https://securetoken.google.com/${projectId}`)
    .setIssuedAt(now - 30)
    .setExpirationTime(now + 300)
    .sign(privateKey);

  const claims = await verifyFirebaseIdToken(token, projectId, async () => publicKey);
  assert.equal(claims.sub, 'firebase-owner');
  await assert.rejects(() => verifyFirebaseIdToken(token, 'another-project', async () => publicKey));
});

test('hosted Firebase mode rejects spoofed platform identity headers', async () => {
  const originalProject = process.env.FIREBASE_PROJECT_ID;
  process.env.FIREBASE_PROJECT_ID = 'wishline-staging';
  const request = new Request('https://wishline.celkoken.workers.dev/api/setup', {
    headers: { 'oai-authenticated-user-id': 'forged-owner' },
  });
  assert.equal(await getWishlineUser(request), null);
  if (originalProject === undefined) delete process.env.FIREBASE_PROJECT_ID;
  else process.env.FIREBASE_PROJECT_ID = originalProject;
});

test('different authenticated users resolve to isolated workspace IDs', async () => {
  const ownerA = await workspaceIdForUser('owner-a');
  const ownerB = await workspaceIdForUser('owner-b');
  assert.notEqual(ownerA, ownerB);
  assert.equal(ownerA, await workspaceIdForUser('owner-a'));
  assert.match(ownerA, /^ws_[0-9a-f]{24}$/);
});
