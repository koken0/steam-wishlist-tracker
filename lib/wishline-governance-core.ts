import { currentSecretKeyId, decryptSecret, encryptSecret, secretEnvelopeKeyId } from './secret-crypto.ts';
import { WishlistConnectorError } from './wishlist-errors.ts';

export type AuditEventType =
  | 'account.deleted'
  | 'connection.created'
  | 'connection.replaced'
  | 'connection.validation_failed'
  | 'connection.disconnected'
  | 'encryption.rewrapped'
  | 'retention.executed'
  | 'sync.failure'
  | 'sync.success';

export type AuditEvent = {
  workspaceId: string | null;
  appId: number | null;
  eventType: AuditEventType;
  outcome: 'success' | 'failure';
  reasonCode?: string | null;
  occurredAt?: string;
};

export type SyncRunRecord = {
  startedAt: string;
  completedAt: string;
  attempted: number;
  succeeded: number;
  failed: number;
};

export type RetentionPolicy = {
  intradayDays: number;
  alertDays: number;
  auditDays: number;
  syncRunDays: number;
};

export const DEFAULT_RETENTION_POLICY: RetentionPolicy = {
  intradayDays: 90,
  alertDays: 365,
  auditDays: 365,
  syncRunDays: 365,
};

type EncryptedConnectionRow = { workspace_id: string; encrypted_api_key: string };
const MAX_ROTATION_CONNECTIONS = 100;
const schemaReady = new WeakMap<object, Promise<void>>();

export async function recordAuditEventInDatabase(db: D1Database, event: AuditEvent): Promise<void> {
  await ensureGovernanceSchema(db);
  await auditStatement(db, event).run();
}

export async function recordSyncRunInDatabase(db: D1Database, run: SyncRunRecord): Promise<void> {
  await ensureGovernanceSchema(db);
  validateCount(run.attempted);
  validateCount(run.succeeded);
  validateCount(run.failed);
  await db.prepare(
    `INSERT INTO sync_runs (id, started_at, completed_at, attempted, succeeded, failed)
     VALUES (?, ?, ?, ?, ?, ?)`,
  ).bind(crypto.randomUUID(), run.startedAt, run.completedAt, run.attempted, run.succeeded, run.failed).run();
}

export async function enforceRetentionInDatabase(
  db: D1Database,
  now = new Date(),
  policy = DEFAULT_RETENTION_POLICY,
): Promise<{ intradayDeleted: number; alertsDeleted: number; auditsDeleted: number; syncRunsDeleted: number; auditRecorded: boolean }> {
  await ensureGovernanceSchema(db);
  validatePolicy(policy);
  const cutoff = (days: number) => new Date(now.valueOf() - days * 86_400_000).toISOString();
  const [intraday, alerts, audits, syncRuns] = await db.batch([
    db.prepare('DELETE FROM wishlist_intraday_snapshots WHERE fetched_at < ?').bind(cutoff(policy.intradayDays)),
    db.prepare('DELETE FROM wishlist_alerts WHERE created_at < ?').bind(cutoff(policy.alertDays)),
    db.prepare('DELETE FROM audit_events WHERE occurred_at < ?').bind(cutoff(policy.auditDays)),
    db.prepare('DELETE FROM sync_runs WHERE completed_at < ?').bind(cutoff(policy.syncRunDays)),
  ]);
  let auditRecorded = true;
  try {
    await recordAuditEventInDatabase(db, {
      workspaceId: null,
      appId: null,
      eventType: 'retention.executed',
      outcome: 'success',
      reasonCode: 'SCHEDULED_POLICY',
      occurredAt: now.toISOString(),
    });
  } catch {
    auditRecorded = false;
  }
  return {
    intradayDeleted: changes(intraday),
    alertsDeleted: changes(alerts),
    auditsDeleted: changes(audits),
    syncRunsDeleted: changes(syncRuns),
    auditRecorded,
  };
}

export async function rewrapStoredConnectionsInDatabase(
  db: D1Database,
  now = new Date(),
): Promise<{ scanned: number; rewrapped: number; alreadyCurrent: number; keyId: string; auditRecorded: boolean }> {
  await ensureGovernanceSchema(db);
  const result = await db.prepare(
    `SELECT workspace_id, encrypted_api_key
       FROM steam_connections
      ORDER BY workspace_id
      LIMIT ?`,
  ).bind(MAX_ROTATION_CONNECTIONS + 1).all<EncryptedConnectionRow>();
  const rows = result.results || [];
  if (rows.length > MAX_ROTATION_CONNECTIONS) {
    throw new WishlistConnectorError('ROTATION_BATCH_TOO_LARGE', `Key rotation is limited to ${MAX_ROTATION_CONNECTIONS} connections per controlled run.`, 409);
  }

  const keyId = currentSecretKeyId();
  const pending = rows.filter((row) => secretEnvelopeKeyId(row.encrypted_api_key) !== keyId);
  const rewrapped = await Promise.all(pending.map(async (row) => ({
    workspaceId: row.workspace_id,
    envelope: await encryptSecret(await decryptSecret(row.encrypted_api_key)),
  })));
  if (rewrapped.length) {
    await db.batch(rewrapped.map((row) => db.prepare(
      'UPDATE steam_connections SET encrypted_api_key = ? WHERE workspace_id = ?',
    ).bind(row.envelope, row.workspaceId)));
  }
  let auditRecorded = true;
  try {
    await recordAuditEventInDatabase(db, {
      workspaceId: null,
      appId: null,
      eventType: 'encryption.rewrapped',
      outcome: 'success',
      reasonCode: rewrapped.length ? 'ROTATION_COMPLETED' : 'ALREADY_CURRENT',
      occurredAt: now.toISOString(),
    });
  } catch {
    auditRecorded = false;
  }
  return {
    scanned: rows.length,
    rewrapped: rewrapped.length,
    alreadyCurrent: rows.length - rewrapped.length,
    keyId,
    auditRecorded,
  };
}

export async function ensureGovernanceSchema(db: D1Database): Promise<void> {
  const existing = schemaReady.get(db as object);
  if (existing) return existing;
  const initialization = db.batch([
    db.prepare(`CREATE TABLE IF NOT EXISTS audit_events (
      id TEXT PRIMARY KEY,
      workspace_id TEXT,
      app_id INTEGER,
      event_type TEXT NOT NULL,
      outcome TEXT NOT NULL CHECK (outcome IN ('success', 'failure')),
      reason_code TEXT,
      occurred_at TEXT NOT NULL,
      FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE SET NULL
    )`),
    db.prepare('CREATE INDEX IF NOT EXISTS idx_audit_events_workspace_occurred ON audit_events(workspace_id, occurred_at)'),
    db.prepare('CREATE INDEX IF NOT EXISTS idx_audit_events_type_occurred ON audit_events(event_type, occurred_at)'),
    db.prepare(`CREATE TABLE IF NOT EXISTS sync_runs (
      id TEXT PRIMARY KEY,
      started_at TEXT NOT NULL,
      completed_at TEXT NOT NULL,
      attempted INTEGER NOT NULL CHECK (attempted >= 0),
      succeeded INTEGER NOT NULL CHECK (succeeded >= 0),
      failed INTEGER NOT NULL CHECK (failed >= 0)
    )`),
    db.prepare('CREATE INDEX IF NOT EXISTS idx_sync_runs_completed ON sync_runs(completed_at)'),
  ]).then(() => undefined).catch((error) => {
    schemaReady.delete(db as object);
    throw error;
  });
  schemaReady.set(db as object, initialization);
  return initialization;
}

function auditStatement(db: D1Database, event: AuditEvent): D1PreparedStatement {
  if (event.workspaceId != null && !/^ws_[0-9a-f]{24}$/.test(event.workspaceId)) {
    throw new WishlistConnectorError('INVALID_AUDIT_EVENT', 'Audit workspace scope is invalid.', 500);
  }
  if (event.appId != null && (!Number.isInteger(event.appId) || event.appId <= 0)) {
    throw new WishlistConnectorError('INVALID_AUDIT_EVENT', 'Audit App ID scope is invalid.', 500);
  }
  const reasonCode = event.reasonCode?.trim().toUpperCase() || null;
  if (reasonCode && !/^[A-Z0-9_]{1,64}$/.test(reasonCode)) {
    throw new WishlistConnectorError('INVALID_AUDIT_EVENT', 'Audit reason codes must be sanitized identifiers.', 500);
  }
  return db.prepare(
    `INSERT INTO audit_events (id, workspace_id, app_id, event_type, outcome, reason_code, occurred_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
  ).bind(
    crypto.randomUUID(), event.workspaceId, event.appId, event.eventType,
    event.outcome, reasonCode, event.occurredAt || new Date().toISOString(),
  );
}

function validatePolicy(policy: RetentionPolicy) {
  for (const value of Object.values(policy)) {
    if (!Number.isInteger(value) || value < 1 || value > 3_650) {
      throw new WishlistConnectorError('INVALID_RETENTION_POLICY', 'Retention durations must be whole days from 1 through 3650.', 500);
    }
  }
}

function validateCount(value: number) {
  if (!Number.isInteger(value) || value < 0) {
    throw new WishlistConnectorError('INVALID_SYNC_SUMMARY', 'Sync health counts must be non-negative integers.', 500);
  }
}

function changes(result: D1Result<unknown>): number {
  return Number(result.meta?.changes || 0);
}
