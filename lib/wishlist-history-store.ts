import { env } from 'cloudflare:workers';
import type { WishlistDay } from '@/lib/wishlist-contract';
import { saveWishlistPollSampleInDatabase, type WishlistPollClassification, type WishlistPollSampleInput } from '@/lib/wishlist-poll-evidence';
import {
  HISTORY_REPAIR_LIMIT,
  initialHistoryRepairAt,
  nextHistoryRepairOutcome,
  type WishlistHistoryRepair,
} from '@/lib/wishlist-history-repair';

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

type WishlistCountsRow = {
  adds: number;
  deletes: number;
  purchases: number;
  gifts: number;
  generated_at: string | null;
};

export type WishlistAlert = {
  id: string;
  kind: 'spike';
  reportDate: string;
  title: string;
  message: string;
  createdAt: string;
  readAt: string | null;
};

type WishlistAlertRow = {
  id: string;
  kind: 'spike';
  report_date: string;
  title: string;
  message: string;
  created_at: string;
  read_at: string | null;
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

export async function enqueueWishlistHistoryRepairs(
  workspaceId: string,
  appId: number,
  dates: readonly string[],
  now = new Date(),
): Promise<void> {
  if (!dates.length) return;
  const db = await historyDatabase();
  const createdAt = now.toISOString();
  const nextAttemptAt = initialHistoryRepairAt(now);
  await db.batch(dates.map((date) => db.prepare(
    `INSERT INTO wishlist_history_repairs (
       workspace_id, app_id, report_date, status, attempts, next_attempt_at,
       locked_until, last_reason_code, created_at, updated_at
     ) VALUES (?, ?, ?, 'pending', 0, ?, NULL, NULL, ?, ?)
     ON CONFLICT(workspace_id, app_id, report_date) DO NOTHING`,
  ).bind(workspaceId, appId, date, nextAttemptAt, createdAt, createdAt)));
}

export async function claimWishlistHistoryRepairs(
  workspaceId: string,
  appId: number,
  now = new Date(),
  limit = HISTORY_REPAIR_LIMIT,
): Promise<WishlistHistoryRepair[]> {
  const db = await historyDatabase();
  const nowIso = now.toISOString();
  const lockedUntil = new Date(now.getTime() + 10 * 60 * 1_000).toISOString();
  const result = await db.prepare(
    `UPDATE wishlist_history_repairs
        SET status = 'processing', locked_until = ?, updated_at = ?
      WHERE rowid IN (
        SELECT rowid FROM wishlist_history_repairs
         WHERE workspace_id = ? AND app_id = ?
           AND ((status IN ('pending', 'empty', 'error') AND next_attempt_at <= ?)
             OR (status = 'processing' AND locked_until <= ?))
         ORDER BY next_attempt_at ASC, report_date ASC
         LIMIT ?
      )
      RETURNING report_date, attempts`,
  ).bind(lockedUntil, nowIso, workspaceId, appId, nowIso, nowIso, limit).all<{
    report_date: string;
    attempts: number;
  }>();
  return (result.results || []).map((row) => ({ reportDate: row.report_date, attempts: row.attempts }));
}

export async function completeWishlistHistoryRepair(
  workspaceId: string,
  appId: number,
  repair: WishlistHistoryRepair,
  recovered: boolean,
  reasonCode: string | null,
  now = new Date(),
): Promise<void> {
  const db = await historyDatabase();
  const outcome = nextHistoryRepairOutcome(repair.attempts, recovered, now);
  await db.prepare(
    `UPDATE wishlist_history_repairs
        SET status = ?, attempts = ?, next_attempt_at = ?, locked_until = NULL,
            last_reason_code = ?, updated_at = ?
      WHERE workspace_id = ? AND app_id = ? AND report_date = ? AND status = 'processing'`,
  ).bind(
    outcome.status, outcome.attempts, outcome.nextAttemptAt, reasonCode, now.toISOString(),
    workspaceId, appId, repair.reportDate,
  ).run();
}

export async function saveWishlistObservation(
  workspaceId: string,
  appId: number,
  day: WishlistDay,
  fetchedAt: string,
): Promise<boolean> {
  const db = await historyDatabase();
  const previous = await db.prepare(
    `SELECT adds, deletes, purchases, gifts, generated_at
       FROM wishlist_intraday_snapshots
      WHERE workspace_id = ? AND app_id = ? AND report_date = ?
      ORDER BY fetched_at DESC
      LIMIT 1`,
  ).bind(workspaceId, appId, day.date).first<WishlistCountsRow>();

  if (previous
    && previous.adds === day.adds
    && previous.deletes === day.deletes
    && previous.purchases === day.purchases
    && previous.gifts === day.gifts) return false;

  await db.prepare(
    `INSERT INTO wishlist_intraday_snapshots (
       id, workspace_id, app_id, report_date, adds, deletes, purchases, gifts,
       generated_at, fetched_at
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).bind(
    crypto.randomUUID(), workspaceId, appId, day.date, day.adds, day.deletes,
    day.purchases, day.gifts, day.generatedAt, fetchedAt,
  ).run();
  return true;
}

export async function saveWishlistPollSample(input: WishlistPollSampleInput): Promise<WishlistPollClassification> {
  const db = await historyDatabase();
  return saveWishlistPollSampleInDatabase(db, input);
}

export async function createSpikeAlertIfNeeded(
  workspaceId: string,
  appId: number,
  day: WishlistDay,
  baselineAdds: number,
  createdAt: string,
): Promise<boolean> {
  if (baselineAdds <= 0 || day.adds < baselineAdds * 2 || day.adds - baselineAdds < 25) return false;
  const db = await historyDatabase();
  const result = await db.prepare(
    `INSERT OR IGNORE INTO wishlist_alerts (
       id, workspace_id, app_id, report_date, kind, title, message, created_at
     ) VALUES (?, ?, ?, ?, 'spike', ?, ?, ?)`,
  ).bind(
    crypto.randomUUID(), workspaceId, appId, day.date,
    'Wishlist spike detected',
    `${day.adds} additions today, ${formatRatio(day.adds / baselineAdds)}x the recent daily average.`,
    createdAt,
  ).run();
  return Boolean(result.meta.changes);
}

export async function readWishlistAlerts(
  workspaceId: string,
  appId: number,
  limit = 20,
): Promise<WishlistAlert[]> {
  const db = await historyDatabase();
  const result = await db.prepare(
    `SELECT id, kind, report_date, title, message, created_at, read_at
       FROM wishlist_alerts
      WHERE workspace_id = ? AND app_id = ?
      ORDER BY created_at DESC
      LIMIT ?`,
  ).bind(workspaceId, appId, Math.min(100, Math.max(1, limit))).all<WishlistAlertRow>();
  return (result.results || []).map((row) => ({
    id: row.id,
    kind: row.kind,
    reportDate: row.report_date,
    title: row.title,
    message: row.message,
    createdAt: row.created_at,
    readAt: row.read_at,
  }));
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
    db.prepare(`CREATE TABLE IF NOT EXISTS wishlist_history_repairs (
      workspace_id TEXT NOT NULL,
      app_id INTEGER NOT NULL CHECK (app_id > 0),
      report_date TEXT NOT NULL,
      status TEXT NOT NULL CHECK (status IN ('pending', 'processing', 'empty', 'error', 'recovered', 'exhausted')),
      attempts INTEGER NOT NULL DEFAULT 0 CHECK (attempts >= 0),
      next_attempt_at TEXT,
      locked_until TEXT,
      last_reason_code TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      PRIMARY KEY (workspace_id, app_id, report_date),
      FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE
    )`),
    db.prepare(`CREATE INDEX IF NOT EXISTS idx_wishlist_repairs_due
      ON wishlist_history_repairs(workspace_id, app_id, status, next_attempt_at)`),
    db.prepare(`CREATE TABLE IF NOT EXISTS wishlist_intraday_snapshots (
      id TEXT PRIMARY KEY,
      workspace_id TEXT NOT NULL,
      app_id INTEGER NOT NULL CHECK (app_id > 0),
      report_date TEXT NOT NULL,
      adds INTEGER NOT NULL CHECK (adds >= 0),
      deletes INTEGER NOT NULL CHECK (deletes >= 0),
      purchases INTEGER NOT NULL CHECK (purchases >= 0),
      gifts INTEGER NOT NULL CHECK (gifts >= 0),
      generated_at TEXT,
      fetched_at TEXT NOT NULL,
      FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE
    )`),
    db.prepare(`CREATE INDEX IF NOT EXISTS idx_wishlist_intraday_workspace_app_date
      ON wishlist_intraday_snapshots(workspace_id, app_id, report_date, fetched_at)`),
    db.prepare(`CREATE TABLE IF NOT EXISTS wishlist_alerts (
      id TEXT PRIMARY KEY,
      workspace_id TEXT NOT NULL,
      app_id INTEGER NOT NULL CHECK (app_id > 0),
      report_date TEXT NOT NULL,
      kind TEXT NOT NULL,
      title TEXT NOT NULL,
      message TEXT NOT NULL,
      created_at TEXT NOT NULL,
      read_at TEXT,
      UNIQUE(workspace_id, app_id, report_date, kind),
      FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE
    )`),
    db.prepare(`CREATE INDEX IF NOT EXISTS idx_wishlist_alerts_workspace_created
      ON wishlist_alerts(workspace_id, created_at)`),
  ]);
  await db.prepare('PRAGMA optimize').run();
}

function formatRatio(value: number): string {
  return value.toFixed(value >= 10 ? 0 : 1);
}
