import { decryptSecret, encryptSecret } from './secret-crypto.ts';
import type { WishlineUser } from './wishline-auth.ts';
import { recordAuditEventInDatabase, type AuditEvent } from './wishline-governance-core.ts';
import { WishlistConnectorError } from './wishlist-errors.ts';
import { workspaceIdForUser } from './wishline-workspace-id.ts';

export type StoredSteamConnection = {
  workspaceId: string;
  appId: number;
  projectName: string;
  apiKey: string;
  updatedAt: string;
};

export type WishlineWorkspaceStatus = {
  workspaceId: string;
  workspaceName: string;
  appId: number | null;
  projectName: string | null;
  connected: boolean;
  updatedAt: string | null;
};

type StoredSteamConnectionRow = {
  workspace_id: string;
  app_id: number;
  project_name: string;
  encrypted_api_key: string;
  updated_at: string;
};

type WorkspaceRow = {
  id: string;
  name: string;
  app_id: number | null;
  project_name: string | null;
  encrypted_api_key: string | null;
  connection_updated_at: string | null;
};

const schemaReady = new WeakMap<object, Promise<void>>();

export function createWishlineStore(db: D1Database) {
  async function getWorkspaceStatus(user: WishlineUser): Promise<WishlineWorkspaceStatus> {
    return publicWorkspace(await getOrCreateWorkspace(user));
  }

  async function getSteamConnection(user: WishlineUser): Promise<StoredSteamConnection | null> {
    const row = await getOrCreateWorkspace(user);
    if (!row.encrypted_api_key || !row.app_id || !row.project_name || !row.connection_updated_at) return null;
    return {
      workspaceId: row.id,
      appId: row.app_id,
      projectName: row.project_name,
      apiKey: await decryptSecret(row.encrypted_api_key),
      updatedAt: row.connection_updated_at,
    };
  }

  async function listSteamConnectionsForSync(): Promise<StoredSteamConnection[]> {
    await initializeSchema();
    const result = await db.prepare(
      `SELECT workspace_id, app_id, project_name, encrypted_api_key, updated_at
         FROM steam_connections ORDER BY workspace_id`,
    ).all<StoredSteamConnectionRow>();
    return Promise.all((result.results || []).map(async (row) => ({
      workspaceId: row.workspace_id,
      appId: row.app_id,
      projectName: row.project_name,
      apiKey: await decryptSecret(row.encrypted_api_key),
      updatedAt: row.updated_at,
    })));
  }

  async function saveSteamConnection(
    user: WishlineUser,
    input: { appId: number; projectName: string; apiKey: string },
  ): Promise<WishlineWorkspaceStatus> {
    const workspace = await getOrCreateWorkspace(user);
    const now = new Date().toISOString();
    const encryptedApiKey = await encryptSecret(input.apiKey);
    await db.prepare(
      `INSERT INTO steam_connections (workspace_id, app_id, project_name, encrypted_api_key, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?)
       ON CONFLICT(workspace_id) DO UPDATE SET app_id = excluded.app_id,
         project_name = excluded.project_name, encrypted_api_key = excluded.encrypted_api_key,
         updated_at = excluded.updated_at`,
    ).bind(workspace.id, input.appId, input.projectName, encryptedApiKey, now, now).run();
    await auditSafely({
      workspaceId: workspace.id,
      appId: input.appId,
      eventType: workspace.encrypted_api_key ? 'connection.replaced' : 'connection.created',
      outcome: 'success',
      occurredAt: now,
    });
    return publicWorkspace({
      ...workspace,
      app_id: input.appId,
      project_name: input.projectName,
      encrypted_api_key: encryptedApiKey,
      connection_updated_at: now,
    });
  }

  async function disconnectSteamConnection(user: WishlineUser): Promise<WishlineWorkspaceStatus> {
    const workspace = await getOrCreateWorkspace(user);
    const now = new Date().toISOString();
    await db.batch([
      db.prepare('DELETE FROM push_subscriptions WHERE workspace_id = ?').bind(workspace.id),
      db.prepare('DELETE FROM wishlist_alerts WHERE workspace_id = ?').bind(workspace.id),
      db.prepare('DELETE FROM wishlist_intraday_snapshots WHERE workspace_id = ?').bind(workspace.id),
      db.prepare('DELETE FROM wishlist_poll_samples WHERE workspace_id = ?').bind(workspace.id),
      db.prepare('DELETE FROM wishlist_daily_snapshots WHERE workspace_id = ?').bind(workspace.id),
      db.prepare('DELETE FROM steam_connections WHERE workspace_id = ?').bind(workspace.id),
      db.prepare('UPDATE workspaces SET updated_at = ? WHERE id = ?').bind(now, workspace.id),
    ]);
    await auditSafely({ workspaceId: workspace.id, appId: workspace.app_id, eventType: 'connection.disconnected', outcome: 'success', occurredAt: now });
    return publicWorkspace({ ...workspace, app_id: null, project_name: null, encrypted_api_key: null, connection_updated_at: null });
  }

  async function deleteWishlineAccount(user: WishlineUser): Promise<void> {
    const workspace = await getOrCreateWorkspace(user);
    await db.batch([
      db.prepare('DELETE FROM push_subscriptions WHERE workspace_id = ?').bind(workspace.id),
      db.prepare('DELETE FROM wishlist_alerts WHERE workspace_id = ?').bind(workspace.id),
      db.prepare('DELETE FROM wishlist_intraday_snapshots WHERE workspace_id = ?').bind(workspace.id),
      db.prepare('DELETE FROM wishlist_poll_samples WHERE workspace_id = ?').bind(workspace.id),
      db.prepare('DELETE FROM wishlist_daily_snapshots WHERE workspace_id = ?').bind(workspace.id),
      db.prepare('DELETE FROM steam_connections WHERE workspace_id = ?').bind(workspace.id),
      db.prepare('DELETE FROM workspaces WHERE id = ?').bind(workspace.id),
    ]);
    await auditSafely({ workspaceId: null, appId: workspace.app_id, eventType: 'account.deleted', outcome: 'success' });
  }

  async function getOrCreateWorkspace(user: WishlineUser): Promise<WorkspaceRow> {
    await initializeSchema();
    const now = new Date().toISOString();
    const workspaceId = await workspaceIdForUser(user.id);
    const ownerLabel = user.name || user.email?.split('@')[0] || 'Owner';
    await db.prepare(
      `INSERT INTO workspaces (id, owner_user_id, owner_email, name, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?)
       ON CONFLICT(owner_user_id) DO UPDATE SET owner_email = excluded.owner_email, updated_at = excluded.updated_at`,
    ).bind(workspaceId, user.id, user.email, `${ownerLabel}'s workspace`, now, now).run();
    const row = await db.prepare(
      `SELECT w.id, w.name, c.app_id, c.project_name, c.encrypted_api_key,
              c.updated_at AS connection_updated_at
         FROM workspaces w LEFT JOIN steam_connections c ON c.workspace_id = w.id
        WHERE w.owner_user_id = ? LIMIT 1`,
    ).bind(user.id).first<WorkspaceRow>();
    if (!row) throw new WishlistConnectorError('WORKSPACE_ERROR', 'Wishline could not load the workspace.', 500);
    return row;
  }

  async function initializeSchema(): Promise<void> {
    const existing = schemaReady.get(db as object);
    if (existing) return existing;
    const initialization = db.batch([
      db.prepare(`CREATE TABLE IF NOT EXISTS workspaces (
        id TEXT PRIMARY KEY, owner_user_id TEXT NOT NULL UNIQUE, owner_email TEXT,
        name TEXT NOT NULL, created_at TEXT NOT NULL, updated_at TEXT NOT NULL)`),
      db.prepare(`CREATE TABLE IF NOT EXISTS steam_connections (
        workspace_id TEXT PRIMARY KEY, app_id INTEGER NOT NULL CHECK (app_id > 0), project_name TEXT NOT NULL,
        encrypted_api_key TEXT NOT NULL, created_at TEXT NOT NULL, updated_at TEXT NOT NULL,
        FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE)`),
      db.prepare('CREATE INDEX IF NOT EXISTS idx_steam_connections_app_id ON steam_connections(app_id)'),
      db.prepare(`CREATE TABLE IF NOT EXISTS wishlist_daily_snapshots (
        workspace_id TEXT NOT NULL, app_id INTEGER NOT NULL CHECK (app_id > 0), report_date TEXT NOT NULL,
        adds INTEGER NOT NULL CHECK (adds >= 0), deletes INTEGER NOT NULL CHECK (deletes >= 0),
        purchases INTEGER NOT NULL CHECK (purchases >= 0), gifts INTEGER NOT NULL CHECK (gifts >= 0),
        adds_windows INTEGER NOT NULL CHECK (adds_windows >= 0), adds_mac INTEGER NOT NULL CHECK (adds_mac >= 0),
        adds_linux INTEGER NOT NULL CHECK (adds_linux >= 0), generated_at TEXT, fetched_at TEXT NOT NULL,
        PRIMARY KEY (workspace_id, app_id, report_date), FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE)`),
      db.prepare('CREATE INDEX IF NOT EXISTS idx_wishlist_snapshots_app_date ON wishlist_daily_snapshots(app_id, report_date)'),
      db.prepare(`CREATE TABLE IF NOT EXISTS wishlist_intraday_snapshots (
        id TEXT PRIMARY KEY, workspace_id TEXT NOT NULL, app_id INTEGER NOT NULL CHECK (app_id > 0), report_date TEXT NOT NULL,
        adds INTEGER NOT NULL CHECK (adds >= 0), deletes INTEGER NOT NULL CHECK (deletes >= 0),
        purchases INTEGER NOT NULL CHECK (purchases >= 0), gifts INTEGER NOT NULL CHECK (gifts >= 0),
        generated_at TEXT, fetched_at TEXT NOT NULL, FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE)`),
      db.prepare('CREATE INDEX IF NOT EXISTS idx_wishlist_intraday_workspace_app_date ON wishlist_intraday_snapshots(workspace_id, app_id, report_date, fetched_at)'),
      db.prepare(`CREATE TABLE IF NOT EXISTS wishlist_alerts (
        id TEXT PRIMARY KEY, workspace_id TEXT NOT NULL, app_id INTEGER NOT NULL CHECK (app_id > 0), report_date TEXT NOT NULL,
        kind TEXT NOT NULL, title TEXT NOT NULL, message TEXT NOT NULL, created_at TEXT NOT NULL, read_at TEXT,
        FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE,
        UNIQUE (workspace_id, app_id, report_date, kind))`),
      db.prepare('CREATE INDEX IF NOT EXISTS idx_wishlist_alerts_workspace_created ON wishlist_alerts(workspace_id, created_at)'),
      db.prepare(`CREATE TABLE IF NOT EXISTS push_subscriptions (
        id TEXT PRIMARY KEY, workspace_id TEXT NOT NULL, endpoint_hash TEXT NOT NULL,
        encrypted_subscription TEXT NOT NULL, expires_at INTEGER,
        created_at TEXT NOT NULL, updated_at TEXT NOT NULL,
        FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE,
        UNIQUE (workspace_id, endpoint_hash))`),
      db.prepare('CREATE INDEX IF NOT EXISTS idx_push_subscriptions_workspace ON push_subscriptions(workspace_id, created_at)'),
      db.prepare(`CREATE TABLE IF NOT EXISTS push_deliveries (
        observation_id TEXT NOT NULL, subscription_id TEXT NOT NULL,
        attempts INTEGER NOT NULL DEFAULT 0 CHECK (attempts >= 0), sent_at TEXT,
        last_attempt_at TEXT NOT NULL, last_error_code TEXT,
        PRIMARY KEY (observation_id, subscription_id),
        FOREIGN KEY (observation_id) REFERENCES wishlist_intraday_snapshots(id) ON DELETE CASCADE,
        FOREIGN KEY (subscription_id) REFERENCES push_subscriptions(id) ON DELETE CASCADE)`),
      db.prepare('CREATE INDEX IF NOT EXISTS idx_push_deliveries_pending ON push_deliveries(subscription_id, sent_at, attempts)'),
      db.prepare(`CREATE TABLE IF NOT EXISTS push_test_receipts (
        id TEXT PRIMARY KEY, workspace_id TEXT NOT NULL, subscription_id TEXT NOT NULL,
        ack_token_hash TEXT NOT NULL UNIQUE,
        provider_status TEXT NOT NULL CHECK (provider_status IN ('pending', 'accepted', 'failed')),
        received_at TEXT, clicked_at TEXT, expires_at TEXT NOT NULL, created_at TEXT NOT NULL,
        FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE,
        FOREIGN KEY (subscription_id) REFERENCES push_subscriptions(id) ON DELETE CASCADE)`),
      db.prepare('CREATE INDEX IF NOT EXISTS idx_push_test_receipts_workspace_created ON push_test_receipts(workspace_id, created_at)'),
    ]).then(() => undefined).catch((error) => {
      schemaReady.delete(db as object);
      throw error;
    });
    schemaReady.set(db as object, initialization);
    return initialization;
  }

  async function auditSafely(event: AuditEvent) {
    try {
      await recordAuditEventInDatabase(db, event);
    } catch {
      // Audit failure must not expose or replace a successful owner action.
    }
  }

  return { getWorkspaceStatus, getSteamConnection, listSteamConnectionsForSync, saveSteamConnection, disconnectSteamConnection, deleteWishlineAccount };
}

function publicWorkspace(row: WorkspaceRow): WishlineWorkspaceStatus {
  return {
    workspaceId: row.id,
    workspaceName: row.name,
    appId: row.app_id,
    projectName: row.project_name,
    connected: Boolean(row.encrypted_api_key && row.app_id),
    updatedAt: row.connection_updated_at,
  };
}
