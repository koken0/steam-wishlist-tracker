import { env } from 'cloudflare:workers';
import type { WishlistDay } from '@/lib/wishlist-contract';

type WishlistHistoryRow = {
  report_date: string;
  adds: number;
  deletes: number;
  purchases: number;
  gifts: number;
  adds_windows: number;
  adds_mac: number;
  adds_linux: number;
  generated_at: string | null;
  fetched_at: string;
};

export async function saveWishlistHistory(
  workspaceId: string,
  appId: number,
  days: WishlistDay[],
  fetchedAt: string,
): Promise<void> {
  if (!days.length) return;
  const db = await historyDatabase();
  await db.batch(days.map((day) => db.prepare(
    `INSERT INTO wishlist_daily_snapshots (
       workspace_id, app_id, report_date, adds, deletes, purchases, gifts,
       adds_windows, adds_mac, adds_linux, generated_at, fetched_at
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(workspace_id, app_id, report_date) DO UPDATE SET
       adds = excluded.adds,
       deletes = excluded.deletes,
       purchases = excluded.purchases,
       gifts = excluded.gifts,
       adds_windows = excluded.adds_windows,
       adds_mac = excluded.adds_mac,
       adds_linux = excluded.adds_linux,
       generated_at = excluded.generated_at,
       fetched_at = excluded.fetched_at`,
  ).bind(
    workspaceId, appId, day.date, day.adds, day.deletes, day.purchases,
    day.gifts, day.addsWindows, day.addsMac, day.addsLinux,
    day.generatedAt, fetchedAt,
  )));
}

export async function readWishlistHistory(
  workspaceId: string,
  appId: number,
): Promise<{ daily: WishlistDay[]; fetchedAt: string | null }> {
  const db = await historyDatabase();
  const result = await db.prepare(
    `SELECT report_date, adds, deletes, purchases, gifts, adds_windows,
            adds_mac, adds_linux, generated_at, fetched_at
       FROM wishlist_daily_snapshots
      WHERE workspace_id = ? AND app_id = ?
      ORDER BY report_date ASC`,
  ).bind(workspaceId, appId).all<WishlistHistoryRow>();
  const rows = result.results || [];
  return {
    daily: rows.map((row) => ({
      date: row.report_date,
      adds: row.adds,
      deletes: row.deletes,
      purchases: row.purchases,
      gifts: row.gifts,
      addsWindows: row.adds_windows,
      addsMac: row.adds_mac,
      addsLinux: row.adds_linux,
      net: row.adds - row.deletes,
      generatedAt: row.generated_at,
    })),
    fetchedAt: rows.map((row) => row.fetched_at).sort().at(-1) || null,
  };
}

let schemaReady: Promise<void> | null = null;

async function historyDatabase(): Promise<D1Database> {
  const db = (env as unknown as { DB?: D1Database }).DB;
  if (!db) throw new Error('Wishline history database is not configured.');
  schemaReady ??= initializeHistorySchema(db).catch((error) => {
    schemaReady = null;
    throw error;
  });
  await schemaReady;
  return db;
}

async function initializeHistorySchema(db: D1Database): Promise<void> {
  await db.batch([
    db.prepare(`CREATE TABLE IF NOT EXISTS wishlist_daily_snapshots (
      workspace_id TEXT NOT NULL,
      app_id INTEGER NOT NULL CHECK (app_id > 0),
      report_date TEXT NOT NULL,
      adds INTEGER NOT NULL CHECK (adds >= 0),
      deletes INTEGER NOT NULL CHECK (deletes >= 0),
      purchases INTEGER NOT NULL CHECK (purchases >= 0),
      gifts INTEGER NOT NULL CHECK (gifts >= 0),
      adds_windows INTEGER NOT NULL CHECK (adds_windows >= 0),
      adds_mac INTEGER NOT NULL CHECK (adds_mac >= 0),
      adds_linux INTEGER NOT NULL CHECK (adds_linux >= 0),
      generated_at TEXT,
      fetched_at TEXT NOT NULL,
      PRIMARY KEY (workspace_id, app_id, report_date),
      FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE
    )`),
    db.prepare('CREATE INDEX IF NOT EXISTS idx_wishlist_snapshots_app_date ON wishlist_daily_snapshots(app_id, report_date)'),
  ]);
}
