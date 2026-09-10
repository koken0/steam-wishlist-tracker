import assert from 'node:assert/strict';
import test from 'node:test';
import { Miniflare } from 'miniflare';
import {
  acknowledgePushTestReceiptInDatabase,
  createPushTestReceiptInDatabase,
  deletePushSubscriptionInDatabase,
  deliverPendingCredentialAlertsInDatabase,
  deliverPendingPushNotificationsInDatabase,
  enqueueCredentialAlertInDatabase,
  hasPushSubscriptionsInDatabase,
  listWorkspacesWithPendingCredentialAlertsInDatabase,
  readPushTestReceiptInDatabase,
  recordPushTestProviderResultInDatabase,
  savePushSubscriptionInDatabase,
  validatePushSubscription,
} from './push-notifications-core.ts';

const codec = {
  encrypt: async (value: string) => `sealed:${Buffer.from(value).toString('base64')}`,
  decrypt: async (value: string) => Buffer.from(value.slice('sealed:'.length), 'base64').toString(),
};

test('push subscriptions accept supported services and reject unsafe endpoints or keys', () => {
  const valid = subscription('https://web.push.apple.com/QP_test');
  assert.deepEqual(validatePushSubscription(valid), valid);
  assert.throws(
    () => validatePushSubscription(subscription('https://example.com/push')),
    /subscription was not accepted/,
  );
  assert.throws(
    () => validatePushSubscription({ ...valid, keys: { ...valid.keys, auth: 'bad' } }),
    /subscription was not accepted/,
  );
});

test('subscriptions are encrypted, workspace-scoped, and removable without exposing endpoints', async () => {
  const { db, dispose } = await testDatabase();
  try {
    await createProductTables(db);
    const workspaceId = 'ws_111111111111111111111111';
    await createWorkspace(db, workspaceId);
    const value = subscription('https://fcm.googleapis.com/fcm/send/device-one');
    await savePushSubscriptionInDatabase(db, workspaceId, value, codec, new Date('2026-09-06T10:00:00.000Z'));

    const row = await db.prepare(
      'SELECT endpoint_hash, encrypted_subscription FROM push_subscriptions WHERE workspace_id = ?',
    ).bind(workspaceId).first<{ endpoint_hash: string; encrypted_subscription: string }>();
    assert.equal(row?.endpoint_hash.length, 64);
    assert.equal(row?.encrypted_subscription.includes(value.endpoint), false);
    assert.equal(await hasPushSubscriptionsInDatabase(db, workspaceId), true);
    assert.equal(await deletePushSubscriptionInDatabase(db, workspaceId, value.endpoint), true);
    assert.equal(await hasPushSubscriptionsInDatabase(db, workspaceId), false);
  } finally {
    await dispose();
  }
});

test('new observations are delivered once and failed deliveries remain retryable', async () => {
  const { db, dispose } = await testDatabase();
  try {
    await createProductTables(db);
    const workspaceId = 'ws_222222222222222222222222';
    await createWorkspace(db, workspaceId);
    await savePushSubscriptionInDatabase(
      db,
      workspaceId,
      subscription('https://updates.push.services.mozilla.com/wpush/v2/device-two'),
      codec,
      new Date('2026-09-06T10:00:00.000Z'),
    );
    await createObservation(db, workspaceId, 'observation-one', '2026-09-06T10:01:00.000Z');

    let calls = 0;
    const first = await deliverPendingPushNotificationsInDatabase(
      db,
      workspaceId,
      codec,
      async () => {
        calls += 1;
        return { status: 'failed', errorCode: 'PUSH_HTTP_503' };
      },
      new Date('2026-09-06T10:02:00.000Z'),
    );
    assert.deepEqual(first, { attempted: 1, sent: 0, expired: 0, failed: 1 });

    const second = await deliverPendingPushNotificationsInDatabase(
      db,
      workspaceId,
      codec,
      async () => {
        calls += 1;
        return { status: 'sent' };
      },
      new Date('2026-09-06T11:02:00.000Z'),
    );
    assert.deepEqual(second, { attempted: 1, sent: 1, expired: 0, failed: 0 });
    assert.equal(calls, 2);

    await createObservation(
      db,
      workspaceId,
      'observation-timestamp-only',
      '2026-09-06T11:30:00.000Z',
      1,
      '2026-09-06T11:29:00.000Z',
    );

    const third = await deliverPendingPushNotificationsInDatabase(
      db,
      workspaceId,
      codec,
      async () => {
        calls += 1;
        return { status: 'sent' };
      },
      new Date('2026-09-06T12:02:00.000Z'),
    );
    assert.deepEqual(third, { attempted: 0, sent: 0, expired: 0, failed: 0 });
    assert.equal(calls, 2);

    await createObservation(db, workspaceId, 'observation-count-change', '2026-09-06T12:30:00.000Z', 2);
    const fourth = await deliverPendingPushNotificationsInDatabase(
      db,
      workspaceId,
      codec,
      async () => {
        calls += 1;
        return { status: 'sent' };
      },
      new Date('2026-09-06T13:02:00.000Z'),
    );
    assert.deepEqual(fourth, { attempted: 1, sent: 1, expired: 0, failed: 0 });
    assert.equal(calls, 3);
  } finally {
    await dispose();
  }
});

test('credential alerts reach each subscribed device once and remain retryable', async () => {
  const { db, dispose } = await testDatabase();
  try {
    await createProductTables(db);
    const workspaceId = 'ws_555555555555555555555555';
    await createWorkspace(db, workspaceId);
    await savePushSubscriptionInDatabase(
      db,
      workspaceId,
      subscription('https://fcm.googleapis.com/fcm/send/credential-device'),
      codec,
      new Date('2026-09-06T15:00:00.000Z'),
    );
    const alertId = await enqueueCredentialAlertInDatabase(
      db,
      workspaceId,
      123,
      'STEAM_ACCESS_DENIED',
      new Date('2026-09-06T15:01:00.000Z'),
    );
    assert.match(alertId, /^credential_alert_[0-9a-f]{32}$/);
    assert.deepEqual(await listWorkspacesWithPendingCredentialAlertsInDatabase(db), [workspaceId]);

    const first = await deliverPendingCredentialAlertsInDatabase(
      db,
      workspaceId,
      codec,
      async (_subscription, deliveredAlertId) => {
        assert.equal(deliveredAlertId, alertId);
        return { status: 'failed', errorCode: 'PUSH_HTTP_503' };
      },
      new Date('2026-09-06T15:02:00.000Z'),
    );
    assert.deepEqual(first, { attempted: 1, sent: 0, expired: 0, failed: 1 });

    const second = await deliverPendingCredentialAlertsInDatabase(
      db,
      workspaceId,
      codec,
      async () => ({ status: 'sent' }),
      new Date('2026-09-06T16:02:00.000Z'),
    );
    assert.deepEqual(second, { attempted: 1, sent: 1, expired: 0, failed: 0 });
    assert.deepEqual(await listWorkspacesWithPendingCredentialAlertsInDatabase(db), []);

    const third = await deliverPendingCredentialAlertsInDatabase(
      db,
      workspaceId,
      codec,
      async () => ({ status: 'sent' }),
      new Date('2026-09-06T17:02:00.000Z'),
    );
    assert.deepEqual(third, { attempted: 0, sent: 0, expired: 0, failed: 0 });
  } finally {
    await dispose();
  }
});

test('test receipts distinguish provider acceptance, device receipt, and notification click', async () => {
  const { db, dispose } = await testDatabase();
  try {
    await createProductTables(db);
    const workspaceId = 'ws_333333333333333333333333';
    await createWorkspace(db, workspaceId);
    const subscriptionId = await savePushSubscriptionInDatabase(
      db,
      workspaceId,
      subscription('https://fcm.googleapis.com/fcm/send/device-three'),
      codec,
      new Date('2026-09-06T14:00:00.000Z'),
    );
    const capability = await createPushTestReceiptInDatabase(
      db,
      workspaceId,
      subscriptionId,
      new Date('2026-09-06T14:01:00.000Z'),
    );
    assert.match(capability.id, /^receipt_[0-9a-f]{32}$/);
    assert.equal(capability.token.length, 43);
    assert.equal((await readPushTestReceiptInDatabase(db, workspaceId, capability.id))?.providerStatus, 'pending');
    await assert.rejects(
      createPushTestReceiptInDatabase(
        db,
        workspaceId,
        subscriptionId,
        new Date('2026-09-06T14:01:01.000Z'),
      ),
      /Wait a few seconds/,
    );

    await recordPushTestProviderResultInDatabase(db, capability.id, true);
    assert.equal(await acknowledgePushTestReceiptInDatabase(
      db,
      capability.id,
      'A'.repeat(43),
      'received',
      new Date('2026-09-06T14:01:05.000Z'),
    ), false);
    assert.equal(await acknowledgePushTestReceiptInDatabase(
      db,
      capability.id,
      capability.token,
      'received',
      new Date('2026-09-06T14:01:06.000Z'),
    ), true);
    assert.equal(await acknowledgePushTestReceiptInDatabase(
      db,
      capability.id,
      capability.token,
      'clicked',
      new Date('2026-09-06T14:01:07.000Z'),
    ), true);

    const receipt = await readPushTestReceiptInDatabase(db, workspaceId, capability.id);
    assert.equal(receipt?.providerStatus, 'accepted');
    assert.equal(receipt?.receivedAt, '2026-09-06T14:01:06.000Z');
    assert.equal(receipt?.clickedAt, '2026-09-06T14:01:07.000Z');
    assert.equal(await readPushTestReceiptInDatabase(db, 'ws_444444444444444444444444', capability.id), null);
  } finally {
    await dispose();
  }
});

function subscription(endpoint: string) {
  return {
    endpoint,
    expirationTime: null,
    keys: {
      auth: base64Url(new Uint8Array(16).fill(7)),
      p256dh: base64Url(Uint8Array.from([4, ...new Uint8Array(64).fill(9)])),
    },
  };
}

function base64Url(value: Uint8Array): string {
  return Buffer.from(value).toString('base64url');
}

async function testDatabase(): Promise<{ db: D1Database; dispose: () => Promise<void> }> {
  const root = process.cwd();
  const workerName = `push-${crypto.randomUUID()}`;
  const mf = new Miniflare({
    workers: [{
      config: {
        type: 'worker',
        name: workerName,
        compatibilityDate: '2026-09-02',
        manifest: {
          mainModule: 'index.js',
          modulesRoot: root,
          modules: { 'index.js': { type: 'esm', contents: 'export default { fetch() { return new Response("ok"); } };' } },
        },
        env: { DB: { type: 'd1', id: workerName } },
      },
    }],
  });
  const db = await mf.getD1Database('DB', workerName) as unknown as D1Database;
  return { db, dispose: () => mf.dispose() };
}

async function createProductTables(db: D1Database) {
  await db.exec(`
    PRAGMA foreign_keys = ON;
    CREATE TABLE workspaces (id TEXT PRIMARY KEY, owner_user_id TEXT NOT NULL UNIQUE, owner_email TEXT, name TEXT NOT NULL, created_at TEXT NOT NULL, updated_at TEXT NOT NULL);
    CREATE TABLE wishlist_intraday_snapshots (id TEXT PRIMARY KEY, workspace_id TEXT NOT NULL, app_id INTEGER NOT NULL, report_date TEXT NOT NULL, adds INTEGER NOT NULL, deletes INTEGER NOT NULL, purchases INTEGER NOT NULL, gifts INTEGER NOT NULL, generated_at TEXT, fetched_at TEXT NOT NULL, FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE);
  `);
}

async function createWorkspace(db: D1Database, workspaceId: string) {
  await db.prepare(`INSERT INTO workspaces (id, owner_user_id, name, created_at, updated_at)
    VALUES (?, ?, 'Test', '2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z')`).bind(workspaceId, `owner-${workspaceId}`).run();
}

async function createObservation(
  db: D1Database,
  workspaceId: string,
  id: string,
  fetchedAt: string,
  adds = 1,
  generatedAt: string | null = null,
) {
  await db.prepare(`INSERT INTO wishlist_intraday_snapshots
    (id, workspace_id, app_id, report_date, adds, deletes, purchases, gifts, generated_at, fetched_at)
    VALUES (?, ?, 123, '2026-09-06', ?, 0, 0, 0, ?, ?)`).bind(id, workspaceId, adds, generatedAt, fetchedAt).run();
}
