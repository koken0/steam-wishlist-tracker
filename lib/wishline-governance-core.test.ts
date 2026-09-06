import assert from 'node:assert/strict';
import test from 'node:test';
import { Miniflare } from 'miniflare';
import { decryptSecret, encryptSecret, secretEnvelopeKeyId } from './secret-crypto.ts';
import {
  classifySchedulerRun,
  enforceRetentionInDatabase,
  readSchedulerHealthInDatabase,
  recordAuditEventInDatabase,
  recordSyncRunInDatabase,
  rewrapStoredConnectionsInDatabase,
} from './wishline-governance-core.ts';

const mutableEnv = process.env as unknown as Record<string, string | undefined>;

test('audit fields are allowlisted and retention removes only expired operational rows', async () => {
  const { db, dispose } = await testDatabase();
  try {
    await createProductTables(db);
    const workspaceId = 'ws_111111111111111111111111';
    await createWorkspace(db, workspaceId);
    await recordAuditEventInDatabase(db, {
      workspaceId,
      appId: 123,
      eventType: 'connection.created',
      outcome: 'success',
      reasonCode: 'VALIDATED',
      occurredAt: '2025-01-01T00:00:00.000Z',
    });
    await assert.rejects(() => recordAuditEventInDatabase(db, {
      workspaceId,
      appId: 123,
      eventType: 'sync.failure',
      outcome: 'failure',
      reasonCode: 'raw response: secret material',
    }));
    await recordSyncRunInDatabase(db, {
      startedAt: '2025-01-01T00:00:00.000Z',
      completedAt: '2025-01-01T00:01:00.000Z',
      attempted: 1,
      succeeded: 1,
      failed: 0,
    });
    await db.prepare(`INSERT INTO wishlist_intraday_snapshots
      (id, workspace_id, app_id, report_date, adds, deletes, purchases, gifts, fetched_at)
      VALUES ('old', ?, 123, '2025-01-01', 1, 0, 0, 0, '2025-01-01T00:00:00.000Z'),
             ('new', ?, 123, '2026-08-31', 0, 0, 0, 0, '2026-08-31T00:00:00.000Z')`).bind(workspaceId, workspaceId).run();

    const summary = await enforceRetentionInDatabase(db, new Date('2026-09-05T00:00:00.000Z'));
    assert.deepEqual(summary, { intradayDeleted: 1, alertsDeleted: 0, auditsDeleted: 1, syncRunsDeleted: 1, auditRecorded: true });
    assert.deepEqual((await db.prepare('SELECT id FROM wishlist_intraday_snapshots ORDER BY id').all()).results, [{ id: 'new' }]);
    const auditRows = await db.prepare('SELECT event_type, outcome, reason_code FROM audit_events').all();
    assert.deepEqual(auditRows.results, [{ event_type: 'retention.executed', outcome: 'success', reason_code: 'SCHEDULED_POLICY' }]);
  } finally {
    await dispose();
  }
});

test('scheduler health distinguishes successful fetches, detected changes, and staleness', async () => {
  const { db, dispose } = await testDatabase();
  try {
    await createProductTables(db);
    await recordSyncRunInDatabase(db, {
      startedAt: '2026-09-05T01:00:00.000Z',
      completedAt: '2026-09-05T01:00:01.000Z',
      attempted: 1,
      succeeded: 1,
      failed: 0,
      activity: { reportDatesRequested: 2, recordsReceived: 2, changesDetected: 0 },
    });
    await recordSyncRunInDatabase(db, {
      startedAt: '2026-09-05T02:00:00.000Z',
      completedAt: '2026-09-05T02:00:01.000Z',
      attempted: 1,
      succeeded: 1,
      failed: 0,
      activity: { reportDatesRequested: 2, recordsReceived: 2, changesDetected: 1 },
    });

    const healthy = await readSchedulerHealthInDatabase(db, new Date('2026-09-05T02:30:00.000Z'));
    assert.equal(healthy.status, 'healthy');
    assert.equal(healthy.recent.length, 2);
    assert.deepEqual(healthy.latest, {
      startedAt: '2026-09-05T02:00:00.000Z',
      completedAt: '2026-09-05T02:00:01.000Z',
      attempted: 1,
      succeeded: 1,
      failed: 0,
      reportDatesRequested: 2,
      recordsReceived: 2,
      changesDetected: 1,
      telemetryAvailable: true,
      result: 'changed',
    });

    const stale = await readSchedulerHealthInDatabase(db, new Date('2026-09-05T04:00:02.000Z'));
    assert.equal(stale.status, 'stale');
  } finally {
    await dispose();
  }
});

test('scheduler result labels keep unchanged runs distinct from failures', () => {
  const base = {
    startedAt: '2026-09-05T02:00:00.000Z',
    completedAt: '2026-09-05T02:00:01.000Z',
    attempted: 1,
    succeeded: 1,
    failed: 0,
    reportDatesRequested: 2,
    recordsReceived: 2,
    changesDetected: 0,
    telemetryAvailable: true,
  };
  assert.equal(classifySchedulerRun(base), 'unchanged');
  assert.equal(classifySchedulerRun({ ...base, changesDetected: 1 }), 'changed');
  assert.equal(classifySchedulerRun({ ...base, succeeded: 0, failed: 1, recordsReceived: 0 }), 'failed');
  assert.equal(classifySchedulerRun({ ...base, failed: 1 }), 'partial_failure');
  assert.equal(classifySchedulerRun({ ...base, telemetryAvailable: false }), 'unknown');
});

test('rotation re-wraps every old envelope before retiring the previous key', async () => {
  const { db, dispose } = await testDatabase();
  const originals = snapshotEncryptionEnv();
  try {
    await createProductTables(db);
    mutableEnv.WISHLIST_ENCRYPTION_KEY = Buffer.alloc(32, 3).toString('base64');
    mutableEnv.WISHLIST_ENCRYPTION_KEY_ID = 'key-old';
    delete mutableEnv.WISHLIST_PREVIOUS_ENCRYPTION_KEY;
    delete mutableEnv.WISHLIST_PREVIOUS_ENCRYPTION_KEY_ID;
    const firstOld = await encryptSecret('first-secret');
    const secondOld = await encryptSecret('second-secret');
    const pushOld = await encryptSecret('{"endpoint":"sealed"}');
    await createConnection(db, 'ws_111111111111111111111111', 101, firstOld);
    await createConnection(db, 'ws_222222222222222222222222', 202, secondOld);
    await db.prepare(`INSERT INTO push_subscriptions
      (id, workspace_id, endpoint_hash, encrypted_subscription, created_at, updated_at)
      VALUES ('push-test', 'ws_111111111111111111111111', 'hash', ?, '2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z')`).bind(pushOld).run();

    mutableEnv.WISHLIST_PREVIOUS_ENCRYPTION_KEY = mutableEnv.WISHLIST_ENCRYPTION_KEY;
    mutableEnv.WISHLIST_PREVIOUS_ENCRYPTION_KEY_ID = 'key-old';
    mutableEnv.WISHLIST_ENCRYPTION_KEY = Buffer.alloc(32, 4).toString('base64');
    mutableEnv.WISHLIST_ENCRYPTION_KEY_ID = 'key-new';
    const result = await rewrapStoredConnectionsInDatabase(db, new Date('2026-09-05T00:00:00.000Z'));
    assert.deepEqual(result, { scanned: 3, rewrapped: 3, alreadyCurrent: 0, keyId: 'key-new', auditRecorded: true });

    const rows = (await db.prepare('SELECT encrypted_api_key FROM steam_connections ORDER BY workspace_id').all<{ encrypted_api_key: string }>()).results;
    assert.equal(rows.every((row) => secretEnvelopeKeyId(row.encrypted_api_key) === 'key-new'), true);
    assert.equal(await decryptSecret(rows[0].encrypted_api_key), 'first-secret');
    assert.equal(await decryptSecret(rows[1].encrypted_api_key), 'second-secret');
    assert.equal(rows.some((row) => row.encrypted_api_key.includes('secret')), false);
    const pushRow = await db.prepare('SELECT encrypted_subscription FROM push_subscriptions WHERE id = ?')
      .bind('push-test').first<{ encrypted_subscription: string }>();
    assert.equal(secretEnvelopeKeyId(pushRow?.encrypted_subscription || ''), 'key-new');
    assert.equal(await decryptSecret(pushRow?.encrypted_subscription || ''), '{"endpoint":"sealed"}');

    delete mutableEnv.WISHLIST_PREVIOUS_ENCRYPTION_KEY;
    delete mutableEnv.WISHLIST_PREVIOUS_ENCRYPTION_KEY_ID;
    assert.equal(await decryptSecret(rows[0].encrypted_api_key), 'first-secret');
    assert.equal((await rewrapStoredConnectionsInDatabase(db)).rewrapped, 0);
  } finally {
    restoreEncryptionEnv(originals);
    await dispose();
  }
});

async function testDatabase(): Promise<{ db: D1Database; dispose: () => Promise<void> }> {
  const root = process.cwd();
  const workerName = `governance-${crypto.randomUUID()}`;
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
    CREATE TABLE steam_connections (workspace_id TEXT PRIMARY KEY, app_id INTEGER NOT NULL, project_name TEXT NOT NULL, encrypted_api_key TEXT NOT NULL, created_at TEXT NOT NULL, updated_at TEXT NOT NULL, FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE);
    CREATE TABLE wishlist_intraday_snapshots (id TEXT PRIMARY KEY, workspace_id TEXT NOT NULL, app_id INTEGER NOT NULL, report_date TEXT NOT NULL, adds INTEGER NOT NULL, deletes INTEGER NOT NULL, purchases INTEGER NOT NULL, gifts INTEGER NOT NULL, generated_at TEXT, fetched_at TEXT NOT NULL, FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE);
    CREATE TABLE wishlist_alerts (id TEXT PRIMARY KEY, workspace_id TEXT NOT NULL, app_id INTEGER NOT NULL, report_date TEXT NOT NULL, kind TEXT NOT NULL, title TEXT NOT NULL, message TEXT NOT NULL, created_at TEXT NOT NULL, read_at TEXT, FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE);
    CREATE TABLE push_subscriptions (id TEXT PRIMARY KEY, workspace_id TEXT NOT NULL, endpoint_hash TEXT NOT NULL, encrypted_subscription TEXT NOT NULL, expires_at INTEGER, created_at TEXT NOT NULL, updated_at TEXT NOT NULL, FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE, UNIQUE (workspace_id, endpoint_hash));
  `);
}

async function createWorkspace(db: D1Database, workspaceId: string) {
  await db.prepare(`INSERT INTO workspaces (id, owner_user_id, name, created_at, updated_at)
    VALUES (?, ?, 'Test', '2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z')`).bind(workspaceId, `owner-${workspaceId}`).run();
}

async function createConnection(db: D1Database, workspaceId: string, appId: number, envelope: string) {
  await createWorkspace(db, workspaceId);
  await db.prepare(`INSERT INTO steam_connections
    (workspace_id, app_id, project_name, encrypted_api_key, created_at, updated_at)
    VALUES (?, ?, 'Test', ?, '2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z')`).bind(workspaceId, appId, envelope).run();
}

function snapshotEncryptionEnv() {
  return {
    key: process.env.WISHLIST_ENCRYPTION_KEY,
    keyId: process.env.WISHLIST_ENCRYPTION_KEY_ID,
    previousKey: process.env.WISHLIST_PREVIOUS_ENCRYPTION_KEY,
    previousKeyId: process.env.WISHLIST_PREVIOUS_ENCRYPTION_KEY_ID,
  };
}

function restoreEncryptionEnv(values: ReturnType<typeof snapshotEncryptionEnv>) {
  restore('WISHLIST_ENCRYPTION_KEY', values.key);
  restore('WISHLIST_ENCRYPTION_KEY_ID', values.keyId);
  restore('WISHLIST_PREVIOUS_ENCRYPTION_KEY', values.previousKey);
  restore('WISHLIST_PREVIOUS_ENCRYPTION_KEY_ID', values.previousKeyId);
}

function restore(name: string, value: string | undefined) {
  if (value === undefined) delete mutableEnv[name];
  else mutableEnv[name] = value;
}
