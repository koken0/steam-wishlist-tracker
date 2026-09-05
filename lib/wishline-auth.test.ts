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

test('local Sites session is accepted only on a development loopback origin', async () => {
  const mutableEnv = process.env as unknown as Record<string, string | undefined>;
  const originalProject = process.env.FIREBASE_PROJECT_ID;
  const originalNodeEnv = process.env.NODE_ENV;
  mutableEnv.FIREBASE_PROJECT_ID = 'wishline-staging';
  mutableEnv.NODE_ENV = 'development';

  const local = new Request('http://127.0.0.1:3000/api/setup', {
    headers: {
      'oai-authenticated-user-id': 'local_seedy',
      'oai-authenticated-user-email': 'seedy@sites.test',
      'oai-authenticated-user-full-name': 'Seedy',
    },
  });
  assert.deepEqual(await getWishlineUser(local), {
    id: 'local_seedy',
    email: 'seedy@sites.test',
    name: 'Seedy',
  });

  const remote = new Request('https://wishline.example/api/setup', {
    headers: { 'oai-authenticated-user-id': 'local_seedy' },
  });
  assert.equal(await getWishlineUser(remote), null);

  mutableEnv.NODE_ENV = 'production';
  assert.equal(await getWishlineUser(local), null);

  if (originalProject === undefined) delete mutableEnv.FIREBASE_PROJECT_ID;
  else mutableEnv.FIREBASE_PROJECT_ID = originalProject;
  if (originalNodeEnv === undefined) delete mutableEnv.NODE_ENV;
  else mutableEnv.NODE_ENV = originalNodeEnv;
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
