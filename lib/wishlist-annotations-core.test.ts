import assert from 'node:assert/strict';
import test from 'node:test';
import { Miniflare } from 'miniflare';
import { createWishlistAnnotationStore } from './wishlist-annotations-core.ts';

test('timeline notes are isolated by workspace and App ID and support CRUD', async () => {
  const { db, dispose } = await testDatabase();
  try {
    await db.prepare(`CREATE TABLE workspaces (
      id TEXT PRIMARY KEY, owner_user_id TEXT NOT NULL UNIQUE, owner_email TEXT,
      name TEXT NOT NULL, created_at TEXT NOT NULL, updated_at TEXT NOT NULL
    )`).run();
    await db.prepare(`CREATE TABLE wishlist_annotations (
      id TEXT PRIMARY KEY, workspace_id TEXT NOT NULL, app_id INTEGER NOT NULL,
      report_date TEXT NOT NULL, note TEXT NOT NULL CHECK (length(note) BETWEEN 1 AND 200),
      created_at TEXT NOT NULL, updated_at TEXT NOT NULL,
      UNIQUE (workspace_id, app_id, report_date)
    )`).run();
    const store = createWishlistAnnotationStore(db);
    const created = await store.create('workspace-a', 10, { date: '2026-09-04', note: '  Demo launch  ' });
    assert.equal(created.note, 'Demo launch');
    assert.deepEqual(await store.list('workspace-b', 10), []);
    assert.deepEqual(await store.list('workspace-a', 11), []);
    assert.equal((await store.list('workspace-a', 10))[0]?.id, created.id);

    const updated = await store.update('workspace-a', 10, {
      id: created.id, date: '2026-09-05', note: 'Demo launch + Reddit AMA',
    });
    assert.equal(updated.date, '2026-09-05');
    assert.equal(updated.note, 'Demo launch + Reddit AMA');
    await assert.rejects(() => store.update('workspace-b', 10, {
      id: created.id, date: '2026-09-06', note: 'Cross-workspace edit',
    }), /not found/i);
    assert.equal(await store.remove('workspace-b', 10, { id: created.id }), false);
    assert.equal(await store.remove('workspace-a', 10, { id: created.id }), true);
    assert.deepEqual(await store.list('workspace-a', 10), []);
  } finally {
    await dispose();
  }
});

test('timeline notes validate dates, length, and one-note-per-day constraint', async () => {
  const { db, dispose } = await testDatabase();
  try {
    await db.prepare(`CREATE TABLE wishlist_annotations (
      id TEXT PRIMARY KEY, workspace_id TEXT NOT NULL, app_id INTEGER NOT NULL,
      report_date TEXT NOT NULL, note TEXT NOT NULL CHECK (length(note) BETWEEN 1 AND 200),
      created_at TEXT NOT NULL, updated_at TEXT NOT NULL,
      UNIQUE (workspace_id, app_id, report_date)
    )`).run();
    const store = createWishlistAnnotationStore(db);
    await assert.rejects(() => store.create('workspace-a', 10, { date: '2026-02-30', note: 'Invalid date' }), /valid date/i);
    await assert.rejects(() => store.create('workspace-a', 10, { date: '2026-09-04', note: ' '.repeat(3) }), /1 to 200/i);
    await assert.rejects(() => store.create('workspace-a', 10, { date: '2026-09-04', note: 'x'.repeat(201) }), /1 to 200/i);
    await store.create('workspace-a', 10, { date: '2026-09-04', note: 'First' });
    await assert.rejects(() => store.create('workspace-a', 10, { date: '2026-09-04', note: 'Second' }), /already has a note/i);
  } finally {
    await dispose();
  }
});

async function testDatabase(): Promise<{ db: D1Database; dispose: () => Promise<void> }> {
  const root = process.cwd();
  const workerName = `annotations-${crypto.randomUUID()}`;
  const mf = new Miniflare({ workers: [{ config: {
    type: 'worker', name: workerName, compatibilityDate: '2026-09-02',
    manifest: { mainModule: 'index.js', modulesRoot: root, modules: {
      'index.js': { type: 'esm', contents: 'export default { fetch() { return new Response("ok"); } };' },
    } }, env: { DB: { type: 'd1', id: workerName } },
  } }] });
  return { db: await mf.getD1Database('DB', workerName) as unknown as D1Database, dispose: () => mf.dispose() };
}
