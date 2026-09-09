import { ensureGovernanceSchema, readSchedulerHealthInDatabase, type SchedulerHealth } from './wishline-governance-core.ts';

export type AdminAccount = {
  ownerEmail: string | null;
  workspaceName: string;
  createdAt: string;
  updatedAt: string;
  appId: number | null;
  projectName: string | null;
  connected: boolean;
  syncState: 'active' | 'suspended' | null;
  suspendedAt: string | null;
  suspensionReason: string | null;
  connectionUpdatedAt: string | null;
  lastActivityAt: string | null;
  historyStart: string | null;
  historyEnd: string | null;
  historyDays: number;
  lastPollClassification: string | null;
  lastPollReason: string | null;
  pendingRepairs: number;
  exhaustedRepairs: number;
  pushSubscriptions: number;
  lastFailureAt: string | null;
  lastFailureReason: string | null;
  notificationsEnabled: boolean;
};

export type AdminOverview = {
  generatedAt: string;
  totals: { accounts: number; connected: number; notificationsEnabled: number; newLast7Days: number };
  accounts: AdminAccount[];
  scheduler: SchedulerHealth;
  recentSyncFailures: AdminSyncFailure[];
};

export type AdminSyncFailure = {
  projectName: string | null;
  appId: number | null;
  ownerEmail: string | null;
  reasonCode: string | null;
  occurredAt: string;
};

type AdminAccountRow = {
  workspace_id: string;
  owner_email: string | null;
  workspace_name: string;
  created_at: string;
  updated_at: string;
  app_id: number | null;
  project_name: string | null;
  connection_updated_at: string | null;
  last_activity_at: string | null;
  push_count: number;
  sync_state: 'active' | 'suspended' | null;
  suspended_at: string | null;
  suspension_reason: string | null;
  history_start: string | null;
  history_end: string | null;
  history_days: number;
  last_poll_classification: string | null;
  last_poll_reason: string | null;
  pending_repairs: number;
  exhausted_repairs: number;
  last_failure_at: string | null;
  last_failure_reason: string | null;
};

export async function readAdminOverviewInDatabase(db: D1Database, now = new Date()): Promise<AdminOverview> {
  // The overview reads audit_events directly. Prepare the governance tables before
  // starting the parallel reads so a fresh database cannot race schema creation.
  await ensureGovernanceSchema(db);
  const [result, scheduler, failureResult] = await Promise.all([db.prepare(
    `SELECT w.id AS workspace_id, w.owner_email, w.name AS workspace_name,
            w.created_at, w.updated_at, c.app_id, c.project_name,
            c.updated_at AS connection_updated_at, c.sync_state, c.suspended_at, c.suspension_reason,
            (SELECT MAX(p.fetched_at) FROM wishlist_poll_samples p WHERE p.workspace_id = w.id) AS last_activity_at,
            (SELECT MIN(d.report_date) FROM wishlist_daily_snapshots d WHERE d.workspace_id = w.id) AS history_start,
            (SELECT MAX(d.report_date) FROM wishlist_daily_snapshots d WHERE d.workspace_id = w.id) AS history_end,
            (SELECT COUNT(*) FROM wishlist_daily_snapshots d WHERE d.workspace_id = w.id) AS history_days,
            (SELECT p.classification FROM wishlist_poll_samples p WHERE p.workspace_id = w.id ORDER BY p.fetched_at DESC LIMIT 1) AS last_poll_classification,
            (SELECT p.reason_code FROM wishlist_poll_samples p WHERE p.workspace_id = w.id ORDER BY p.fetched_at DESC LIMIT 1) AS last_poll_reason,
            (SELECT COUNT(*) FROM wishlist_history_repairs r WHERE r.workspace_id = w.id AND r.status IN ('pending', 'processing', 'empty', 'error')) AS pending_repairs,
            (SELECT COUNT(*) FROM wishlist_history_repairs r WHERE r.workspace_id = w.id AND r.status = 'exhausted') AS exhausted_repairs,
            (SELECT a.occurred_at FROM audit_events a WHERE a.workspace_id = w.id AND a.event_type = 'sync.failure' ORDER BY a.occurred_at DESC LIMIT 1) AS last_failure_at,
            (SELECT a.reason_code FROM audit_events a WHERE a.workspace_id = w.id AND a.event_type = 'sync.failure' ORDER BY a.occurred_at DESC LIMIT 1) AS last_failure_reason,
            (SELECT COUNT(*) FROM push_subscriptions s WHERE s.workspace_id = w.id) AS push_count
       FROM workspaces w
       LEFT JOIN steam_connections c ON c.workspace_id = w.id
      ORDER BY w.created_at DESC
      LIMIT 250`,
  ).all<AdminAccountRow>(), readSchedulerHealthInDatabase(db, now, 48), db.prepare(
    `SELECT c.project_name, a.app_id, w.owner_email, a.reason_code, a.occurred_at
       FROM audit_events a
       LEFT JOIN workspaces w ON w.id = a.workspace_id
       LEFT JOIN steam_connections c ON c.workspace_id = a.workspace_id
      WHERE a.event_type = 'sync.failure'
      ORDER BY a.occurred_at DESC
      LIMIT 50`,
  ).all<{ project_name: string | null; app_id: number | null; owner_email: string | null; reason_code: string | null; occurred_at: string }>()]);
  const accounts = (result.results || []).map((row): AdminAccount => ({
    ownerEmail: row.owner_email,
    workspaceName: row.workspace_name,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    appId: row.app_id,
    projectName: row.project_name,
    connected: row.app_id != null,
    syncState: row.app_id == null ? null : row.sync_state || 'active',
    suspendedAt: row.suspended_at,
    suspensionReason: row.suspension_reason,
    connectionUpdatedAt: row.connection_updated_at,
    lastActivityAt: row.last_activity_at,
    historyStart: row.history_start,
    historyEnd: row.history_end,
    historyDays: Number(row.history_days),
    lastPollClassification: row.last_poll_classification,
    lastPollReason: row.last_poll_reason,
    pendingRepairs: Number(row.pending_repairs),
    exhaustedRepairs: Number(row.exhausted_repairs),
    pushSubscriptions: Number(row.push_count),
    lastFailureAt: row.last_failure_at,
    lastFailureReason: row.last_failure_reason,
    notificationsEnabled: Number(row.push_count) > 0,
  }));
  const sevenDaysAgo = now.valueOf() - 7 * 86_400_000;
  return {
    generatedAt: now.toISOString(),
    totals: {
      accounts: accounts.length,
      connected: accounts.filter((account) => account.connected).length,
      notificationsEnabled: accounts.filter((account) => account.notificationsEnabled).length,
      newLast7Days: accounts.filter((account) => new Date(account.createdAt).valueOf() >= sevenDaysAgo).length,
    },
    accounts,
    scheduler,
    recentSyncFailures: (failureResult.results || []).map((row) => ({
      projectName: row.project_name,
      appId: row.app_id,
      ownerEmail: row.owner_email,
      reasonCode: row.reason_code,
      occurredAt: row.occurred_at,
    })),
  };
}
