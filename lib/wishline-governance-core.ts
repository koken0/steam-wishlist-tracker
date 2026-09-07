import { currentSecretKeyId, decryptSecret, encryptSecret, secretEnvelopeKeyId } from './secret-crypto.ts';
import { WishlistConnectorError } from './wishlist-errors.ts';

export type AuditEventType =
  | 'account.deleted'
  | 'connection.created'
  | 'connection.replaced'
  | 'connection.validation_failed'
  | 'connection.disconnected'
  | 'encryption.rewrapped'
  | 'push.subscribed'
  | 'push.unsubscribed'
  | 'push.delivery'
  | 'push.test_sent'
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
  activity?: SyncRunActivity;
};

export type SyncRunActivity = {
  reportDatesRequested: number;
  recordsReceived: number;
  changesDetected: number;
  pollInitial: number;
  pollUnchanged: number;
  pollTimestampOnly: number;
  pollCounterChanges: number;
  pollEmpty: number;
  pollErrors: number;
  finalizedCounterChanges: number;
};

export type SchedulerHealthRun = SyncRunActivity & {
  startedAt: string;
  completedAt: string;
  attempted: number;
  succeeded: number;
  failed: number;
  telemetryAvailable: boolean;
  result: SchedulerRunResult;
};

export type SchedulerRunResult =
  | 'changed'
  | 'unchanged'
  | 'partial_failure'
  | 'failed'
  | 'no_connections'
  | 'no_remote_request'
  | 'no_usable_records'
  | 'unknown';

export type SchedulerHealth = {
  status: 'healthy' | 'degraded' | 'stale' | 'unknown';
  checkedAt: string;
  staleAfterMinutes: number;
  latest: SchedulerHealthRun | null;
  recent: SchedulerHealthRun[];
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

type EncryptedSecretRow = { kind: 'connection' | 'push'; id: string; envelope: string };
const MAX_ROTATION_SECRETS = 100;
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
  const activity = run.activity || emptySyncActivity();
  Object.values(activity).forEach(validateCount);
  const id = crypto.randomUUID();
  await db.batch([
    db.prepare(
      `INSERT INTO sync_runs (id, started_at, completed_at, attempted, succeeded, failed)
       VALUES (?, ?, ?, ?, ?, ?)`,
    ).bind(id, run.startedAt, run.completedAt, run.attempted, run.succeeded, run.failed),
    db.prepare(
      `INSERT INTO sync_run_activity (
         sync_run_id, report_dates_requested, records_received, changes_detected,
         poll_initial, poll_unchanged, poll_timestamp_only, poll_counter_changes,
         poll_empty, poll_errors, finalized_counter_changes
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).bind(id, activity.reportDatesRequested, activity.recordsReceived, activity.changesDetected,
      activity.pollInitial, activity.pollUnchanged, activity.pollTimestampOnly,
      activity.pollCounterChanges, activity.pollEmpty, activity.pollErrors,
      activity.finalizedCounterChanges),
  ]);
}

export async function readSchedulerHealthInDatabase(
  db: D1Database,
  now = new Date(),
  recentLimit = 24,
  staleAfterMinutes = 90,
): Promise<SchedulerHealth> {
  await ensureGovernanceSchema(db);
  const limit = Math.min(48, Math.max(1, Math.trunc(recentLimit)));
  const staleMinutes = Math.min(1_440, Math.max(1, Math.trunc(staleAfterMinutes)));
  const result = await db.prepare(
    `SELECT s.started_at, s.completed_at, s.attempted, s.succeeded, s.failed,
            a.sync_run_id,
            COALESCE(a.report_dates_requested, 0) AS report_dates_requested,
            COALESCE(a.records_received, 0) AS records_received,
            COALESCE(a.changes_detected, 0) AS changes_detected,
            COALESCE(a.poll_initial, 0) AS poll_initial,
            COALESCE(a.poll_unchanged, 0) AS poll_unchanged,
            COALESCE(a.poll_timestamp_only, 0) AS poll_timestamp_only,
            COALESCE(a.poll_counter_changes, 0) AS poll_counter_changes,
            COALESCE(a.poll_empty, 0) AS poll_empty,
            COALESCE(a.poll_errors, 0) AS poll_errors,
            COALESCE(a.finalized_counter_changes, 0) AS finalized_counter_changes
       FROM sync_runs s
       LEFT JOIN sync_run_activity a ON a.sync_run_id = s.id
      ORDER BY s.completed_at DESC
      LIMIT ?`,
  ).bind(limit).all<{
    started_at: string;
    completed_at: string;
    attempted: number;
    succeeded: number;
    failed: number;
    sync_run_id: string | null;
    report_dates_requested: number;
    records_received: number;
    changes_detected: number;
    poll_initial: number;
    poll_unchanged: number;
    poll_timestamp_only: number;
    poll_counter_changes: number;
    poll_empty: number;
    poll_errors: number;
    finalized_counter_changes: number;
  }>();
  const recent = (result.results || []).map((row): SchedulerHealthRun => {
    const run = {
      startedAt: row.started_at,
      completedAt: row.completed_at,
      attempted: row.attempted,
      succeeded: row.succeeded,
      failed: row.failed,
      reportDatesRequested: row.report_dates_requested,
      recordsReceived: row.records_received,
      changesDetected: row.changes_detected,
      pollInitial: row.poll_initial,
      pollUnchanged: row.poll_unchanged,
      pollTimestampOnly: row.poll_timestamp_only,
      pollCounterChanges: row.poll_counter_changes,
      pollEmpty: row.poll_empty,
      pollErrors: row.poll_errors,
      finalizedCounterChanges: row.finalized_counter_changes,
      telemetryAvailable: row.sync_run_id != null,
    };
    return { ...run, result: classifySchedulerRun(run) };
  });
  const latest = recent[0] || null;
  let status: SchedulerHealth['status'] = 'unknown';
  if (latest) {
    const completedAt = new Date(latest.completedAt).valueOf();
    const stale = !Number.isFinite(completedAt) || now.valueOf() - completedAt > staleMinutes * 60_000;
    status = stale ? 'stale' : latest.failed > 0 ? 'degraded' : 'healthy';
  }
  return {
    status,
    checkedAt: now.toISOString(),
    staleAfterMinutes: staleMinutes,
    latest,
    recent,
  };
}

export function classifySchedulerRun(run: Omit<SchedulerHealthRun, 'result'>): SchedulerRunResult {
  if (run.failed > 0 && run.succeeded > 0) return 'partial_failure';
  if (run.failed > 0) return 'failed';
  if (!run.telemetryAvailable) return 'unknown';
  if (run.attempted === 0) return 'no_connections';
  if (run.reportDatesRequested === 0) return 'no_remote_request';
  if (run.recordsReceived === 0) return 'no_usable_records';
  return run.changesDetected > 0 ? 'changed' : 'unchanged';
}

export async function enforceRetentionInDatabase(
  db: D1Database,
  now = new Date(),
  policy = DEFAULT_RETENTION_POLICY,
): Promise<{ intradayDeleted: number; pollSamplesDeleted: number; alertsDeleted: number; auditsDeleted: number; syncRunsDeleted: number; auditRecorded: boolean }> {
  await ensureGovernanceSchema(db);
  validatePolicy(policy);
  const cutoff = (days: number) => new Date(now.valueOf() - days * 86_400_000).toISOString();
  const syncRunCutoff = cutoff(policy.syncRunDays);
  const expiredSyncRuns = await db.prepare(
    'SELECT COUNT(*) AS count FROM sync_runs WHERE completed_at < ?',
  ).bind(syncRunCutoff).first<{ count: number }>();
  const [intraday, pollSamples, alerts, audits] = await db.batch([
    db.prepare('DELETE FROM wishlist_intraday_snapshots WHERE fetched_at < ?').bind(cutoff(policy.intradayDays)),
    db.prepare('DELETE FROM wishlist_poll_samples WHERE fetched_at < ?').bind(cutoff(policy.intradayDays)),
    db.prepare('DELETE FROM wishlist_alerts WHERE created_at < ?').bind(cutoff(policy.alertDays)),
    db.prepare('DELETE FROM audit_events WHERE occurred_at < ?').bind(cutoff(policy.auditDays)),
    db.prepare('DELETE FROM sync_runs WHERE completed_at < ?').bind(syncRunCutoff),
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
    pollSamplesDeleted: changes(pollSamples),
    alertsDeleted: changes(alerts),
    auditsDeleted: changes(audits),
    syncRunsDeleted: Number(expiredSyncRuns?.count || 0),
    auditRecorded,
  };
}

export async function rewrapStoredConnectionsInDatabase(
  db: D1Database,
  now = new Date(),
): Promise<{ scanned: number; rewrapped: number; alreadyCurrent: number; keyId: string; auditRecorded: boolean }> {
  await ensureGovernanceSchema(db);
  const [connections, subscriptions] = await Promise.all([
    db.prepare(
      `SELECT 'connection' AS kind, workspace_id AS id, encrypted_api_key AS envelope
         FROM steam_connections ORDER BY workspace_id LIMIT ?`,
    ).bind(MAX_ROTATION_SECRETS + 1).all<EncryptedSecretRow>(),
    db.prepare(
      `SELECT 'push' AS kind, id, encrypted_subscription AS envelope
         FROM push_subscriptions ORDER BY id LIMIT ?`,
    ).bind(MAX_ROTATION_SECRETS + 1).all<EncryptedSecretRow>(),
  ]);
  const rows = [...(connections.results || []), ...(subscriptions.results || [])];
  if (rows.length > MAX_ROTATION_SECRETS) {
    throw new WishlistConnectorError('ROTATION_BATCH_TOO_LARGE', `Key rotation is limited to ${MAX_ROTATION_SECRETS} encrypted records per controlled run.`, 409);
  }

  const keyId = currentSecretKeyId();
  const pending = rows.filter((row) => secretEnvelopeKeyId(row.envelope) !== keyId);
  const rewrapped = await Promise.all(pending.map(async (row) => ({
    kind: row.kind,
    id: row.id,
    envelope: await encryptSecret(await decryptSecret(row.envelope)),
  })));
  if (rewrapped.length) {
    await db.batch(rewrapped.map((row) => row.kind === 'connection'
      ? db.prepare('UPDATE steam_connections SET encrypted_api_key = ? WHERE workspace_id = ?').bind(row.envelope, row.id)
      : db.prepare('UPDATE push_subscriptions SET encrypted_subscription = ? WHERE id = ?').bind(row.envelope, row.id)));
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
    db.prepare(`CREATE TABLE IF NOT EXISTS sync_run_activity (
      sync_run_id TEXT PRIMARY KEY,
      report_dates_requested INTEGER NOT NULL CHECK (report_dates_requested >= 0),
      records_received INTEGER NOT NULL CHECK (records_received >= 0),
      changes_detected INTEGER NOT NULL CHECK (changes_detected >= 0),
      poll_initial INTEGER NOT NULL DEFAULT 0 CHECK (poll_initial >= 0),
      poll_unchanged INTEGER NOT NULL DEFAULT 0 CHECK (poll_unchanged >= 0),
      poll_timestamp_only INTEGER NOT NULL DEFAULT 0 CHECK (poll_timestamp_only >= 0),
      poll_counter_changes INTEGER NOT NULL DEFAULT 0 CHECK (poll_counter_changes >= 0),
      poll_empty INTEGER NOT NULL DEFAULT 0 CHECK (poll_empty >= 0),
      poll_errors INTEGER NOT NULL DEFAULT 0 CHECK (poll_errors >= 0),
      finalized_counter_changes INTEGER NOT NULL DEFAULT 0 CHECK (finalized_counter_changes >= 0),
      FOREIGN KEY (sync_run_id) REFERENCES sync_runs(id) ON DELETE CASCADE
    )`),
    db.prepare(`CREATE TABLE IF NOT EXISTS push_subscriptions (
      id TEXT PRIMARY KEY,
      workspace_id TEXT NOT NULL,
      endpoint_hash TEXT NOT NULL,
      encrypted_subscription TEXT NOT NULL,
      expires_at INTEGER,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE,
      UNIQUE (workspace_id, endpoint_hash)
    )`),
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

function emptySyncActivity(): SyncRunActivity {
  return {
    reportDatesRequested: 0,
    recordsReceived: 0,
    changesDetected: 0,
    pollInitial: 0,
    pollUnchanged: 0,
    pollTimestampOnly: 0,
    pollCounterChanges: 0,
    pollEmpty: 0,
    pollErrors: 0,
    finalizedCounterChanges: 0,
  };
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
