import { env } from 'cloudflare:workers';
import { WishlistConnectorError } from './wishlist-errors.ts';

export type AdminAccount = {
  workspaceId: string;
  ownerEmail: string | null;
  workspaceName: string;
  createdAt: string;
  updatedAt: string;
  appId: number | null;
  projectName: string | null;
  connected: boolean;
  connectionUpdatedAt: string | null;
  lastActivityAt: string | null;
  notificationsEnabled: boolean;
};

export type AdminOverview = {
  generatedAt: string;
  totals: { accounts: number; connected: number; notificationsEnabled: number; newLast7Days: number };
  accounts: AdminAccount[];
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
};

export async function readAdminOverview(now = new Date()): Promise<AdminOverview> {
  const db = (env as unknown as { DB?: D1Database }).DB;
  if (!db) throw new WishlistConnectorError('DATABASE_NOT_CONFIGURED', 'The Wishline workspace database is not configured.', 503);
  return readAdminOverviewInDatabase(db, now);
}

export async function readAdminOverviewInDatabase(db: D1Database, now = new Date()): Promise<AdminOverview> {
  const result = await db.prepare(
    `SELECT w.id AS workspace_id, w.owner_email, w.name AS workspace_name,
            w.created_at, w.updated_at, c.app_id, c.project_name,
            c.updated_at AS connection_updated_at,
            (SELECT MAX(p.fetched_at) FROM wishlist_poll_samples p WHERE p.workspace_id = w.id) AS last_activity_at,
            (SELECT COUNT(*) FROM push_subscriptions s WHERE s.workspace_id = w.id) AS push_count
       FROM workspaces w
       LEFT JOIN steam_connections c ON c.workspace_id = w.id
      ORDER BY w.created_at DESC
      LIMIT 250`,
  ).all<AdminAccountRow>();
  const accounts = (result.results || []).map((row): AdminAccount => ({
    workspaceId: row.workspace_id,
    ownerEmail: row.owner_email,
    workspaceName: row.workspace_name,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    appId: row.app_id,
    projectName: row.project_name,
    connected: row.app_id != null,
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
  };
}
