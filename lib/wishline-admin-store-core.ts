import { ensureGovernanceSchema, readSchedulerHealthInDatabase, type SchedulerHealth } from './wishline-governance-core.ts';

export type AdminAccount = {
  workspaceId: string;
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
    workspaceId: row.workspace_id,
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
