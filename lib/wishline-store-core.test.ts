import assert from 'node:assert/strict';
import test from 'node:test';
import { Miniflare } from 'miniflare';
import { WishlistConnectorError } from './wishlist-errors.ts';
import { createWishlineStore } from './wishline-store-core.ts';
import { validateAndSaveConnection } from './wishlist-connection-workflow.ts';

const mutableEnv = process.env as unknown as Record<string, string | undefined>;

test('two owners cannot read, replace, refresh through, or delete each other workspace', async () => {
  const { db, dispose } = await testDatabase();
  await db.prepare(`CREATE TABLE wishlist_poll_samples (
    id TEXT PRIMARY KEY, workspace_id TEXT NOT NULL, app_id INTEGER NOT NULL,
    requested_date TEXT NOT NULL, date_phase TEXT NOT NULL, outcome TEXT NOT NULL,
    classification TEXT NOT NULL, reason_code TEXT, adds INTEGER, deletes INTEGER,
    purchases INTEGER, gifts INTEGER, delta_adds INTEGER, delta_deletes INTEGER,
    delta_purchases INTEGER, delta_gifts INTEGER, generated_at TEXT, fetched_at TEXT NOT NULL
  )`).run();
  const originalKey = process.env.WISHLIST_ENCRYPTION_KEY;
  const originalKeyId = process.env.WISHLIST_ENCRYPTION_KEY_ID;
  mutableEnv.WISHLIST_ENCRYPTION_KEY = Buffer.alloc(32, 8).toString('base64');
  mutableEnv.WISHLIST_ENCRYPTION_KEY_ID = 'isolation-test';
  const store = createWishlineStore(db);
  const ownerA = { id: 'owner-a', email: 'a@example.test', name: 'Owner A' };
  const ownerB = { id: 'owner-b', email: 'b@example.test', name: 'Owner B' };

  try {
    await store.saveSteamConnection(ownerA, { appId: 101, projectName: 'Owner A Game', apiKey: 'owner-a-key' });
    const connectionA = await store.getSteamConnection(ownerA);
    assert.equal(connectionA?.apiKey, 'owner-a-key');
    assert.equal(await store.getSteamConnection(ownerB), null);

    await db.prepare(`INSERT INTO wishlist_daily_snapshots
      (workspace_id, app_id, report_date, adds, deletes, purchases, gifts, adds_windows, adds_mac, adds_linux, fetched_at)
      VALUES (?, 101, '2026-09-01', 5, 1, 0, 0, 5, 0, 0, '2026-09-01T01:00:00.000Z')`).bind(connectionA?.workspaceId).run();
    await store.disconnectSteamConnection(ownerB);
    assert.equal((await store.getSteamConnection(ownerA))?.apiKey, 'owner-a-key');
    assert.equal((await db.prepare('SELECT COUNT(*) AS count FROM wishlist_daily_snapshots WHERE workspace_id = ?').bind(connectionA?.workspaceId).first<{ count: number }>())?.count, 1);

    await assert.rejects(() => validateAndSaveConnection(ownerA, {
      appId: 202,
      projectName: 'Rejected',
      apiKey: 'rejected-key',
    }, {
      validate: async () => { throw new WishlistConnectorError('STEAM_ACCESS_DENIED', 'Safe failure.', 502); },
      save: store.saveSteamConnection,
    }));
    assert.equal((await store.getSteamConnection(ownerA))?.apiKey, 'owner-a-key');

    assert.equal(await store.suspendSteamConnection(connectionA!.workspaceId, 101, 'STEAM_ACCESS_DENIED'), true);
    assert.equal((await store.getSteamConnection(ownerA))?.syncState, 'suspended');
    assert.equal((await store.getSteamConnection(ownerA))?.suspensionReason, 'STEAM_ACCESS_DENIED');
    assert.deepEqual(await store.listSteamConnectionsForSync(), []);

    const replacement = await validateAndSaveConnection(ownerA, {
      appId: 202,
      projectName: 'Requested Name',
      apiKey: 'owner-a-new-key',
    }, {
      validate: async () => ({ projectName: 'Validated Game', records: 1 }),
      save: store.saveSteamConnection,
    });
    assert.equal((await store.getSteamConnection(ownerA))?.apiKey, 'owner-a-new-key');
    assert.equal((await store.getSteamConnection(ownerA))?.syncState, 'active');
    assert.equal((await store.getSteamConnection(ownerA))?.suspendedAt, null);
    assert.equal((await store.listSteamConnectionsForSync()).length, 1);
    assert.equal(JSON.stringify(replacement).includes('owner-a-key'), false);
    assert.equal(JSON.stringify(replacement).includes('owner-a-new-key'), false);

    await store.saveSteamConnection(ownerB, { appId: 303, projectName: 'Owner B Game', apiKey: 'owner-b-key' });
    assert.equal((await store.getSteamConnection(ownerA))?.appId, 202);
    assert.equal((await store.getSteamConnection(ownerB))?.appId, 303);
    await store.deleteWishlineAccount(ownerB);
    assert.equal((await store.getSteamConnection(ownerA))?.apiKey, 'owner-a-new-key');

    const encryptedRows = (await db.prepare('SELECT encrypted_api_key FROM steam_connections').all<{ encrypted_api_key: string }>()).results;
    assert.equal(encryptedRows.length, 1);
    assert.equal(encryptedRows[0].encrypted_api_key.includes('owner-a'), false);
  } finally {
    restore('WISHLIST_ENCRYPTION_KEY', originalKey);
    restore('WISHLIST_ENCRYPTION_KEY_ID', originalKeyId);
    await dispose();
  }
});

async function testDatabase(): Promise<{ db: D1Database; dispose: () => Promise<void> }> {
  const root = process.cwd();
  const workerName = `store-${crypto.randomUUID()}`;
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
  return {
    db: await mf.getD1Database('DB', workerName) as unknown as D1Database,
    dispose: () => mf.dispose(),
  };
}

function restore(name: string, value: string | undefined) {
  if (value === undefined) delete mutableEnv[name];
  else mutableEnv[name] = value;
}
