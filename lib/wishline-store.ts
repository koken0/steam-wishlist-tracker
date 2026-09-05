import { env } from 'cloudflare:workers';
import { decryptSecret, encryptSecret } from '@/lib/secret-crypto';
import type { WishlineUser } from '@/lib/wishline-auth';
import { WishlistConnectorError } from '@/lib/wishlist-server';
import { workspaceIdForUser } from '@/lib/wishline-workspace-id';

export type StoredSteamConnection = {
  workspaceId: string;
  appId: number;
  projectName: string;
  apiKey: string;
  updatedAt: string;
};

type StoredSteamConnectionRow = {
  workspace_id: string;
  app_id: number;
  project_name: string;
  encrypted_api_key: string;
  updated_at: string;
};

export type WishlineWorkspaceStatus = {
  workspaceId: string;
  workspaceName: string;
  appId: number | null;
  projectName: string | null;
  connected: boolean;
  updatedAt: string | null;
};

type WorkspaceRow = {
  id: string;
  name: string;
  app_id: number | null;
  project_name: string | null;
  encrypted_api_key: string | null;
  connection_updated_at: string | null;
};

let schemaReady: Promise<void> | null = null;

export async function getWorkspaceStatus(user: WishlineUser): Promise<WishlineWorkspaceStatus> {
  const row = await getOrCreateWorkspace(user);
  return {
    workspaceId: row.id,
    workspaceName: row.name,
    appId: row.app_id,
    projectName: row.project_name,
    connected: Boolean(row.encrypted_api_key && row.app_id),
    updatedAt: row.connection_updated_at,
  };
}

export async function getSteamConnection(user: WishlineUser): Promise<StoredSteamConnection | null> {
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

export async function listSteamConnectionsForSync(): Promise<StoredSteamConnection[]> {
  const db = await database();
  const result = await db.prepare(
    `SELECT workspace_id, app_id, project_name, encrypted_api_key, updated_at
       FROM steam_connections
      ORDER BY workspace_id`,
  ).all<StoredSteamConnectionRow>();

  return Promise.all((result.results || []).map(async (row) => ({
    workspaceId: row.workspace_id,
    appId: row.app_id,
    projectName: row.project_name,
    apiKey: await decryptSecret(row.encrypted_api_key),
    updatedAt: row.updated_at,
  })));
}

export async function saveSteamConnection(
  user: WishlineUser,
  input: { appId: number; projectName: string; apiKey: string },
): Promise<WishlineWorkspaceStatus> {
  const db = await database();
  const workspace = await getOrCreateWorkspace(user);
  const now = new Date().toISOString();
  const encryptedApiKey = await encryptSecret(input.apiKey);

  await db.prepare(
    `INSERT INTO steam_connections (workspace_id, app_id, project_name, encrypted_api_key, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?)
     ON CONFLICT(workspace_id) DO UPDATE SET
       app_id = excluded.app_id,
       project_name = excluded.project_name,
       encrypted_api_key = excluded.encrypted_api_key,
       updated_at = excluded.updated_at`,
  ).bind(workspace.id, input.appId, input.projectName, encryptedApiKey, now, now).run();

  return getWorkspaceStatus(user);
}

export async function disconnectSteamConnection(user: WishlineUser): Promise<WishlineWorkspaceStatus> {
  const db = await database();
  const workspace = await getOrCreateWorkspace(user);
  const now = new Date().toISOString();

  await db.batch([
    db.prepare('DELETE FROM wishlist_alerts WHERE workspace_id = ?').bind(workspace.id),
    db.prepare('DELETE FROM wishlist_intraday_snapshots WHERE workspace_id = ?').bind(workspace.id),
    db.prepare('DELETE FROM wishlist_daily_snapshots WHERE workspace_id = ?').bind(workspace.id),
    db.prepare('DELETE FROM steam_connections WHERE workspace_id = ?').bind(workspace.id),
    db.prepare('UPDATE workspaces SET updated_at = ? WHERE id = ?').bind(now, workspace.id),
  ]);

  return getWorkspaceStatus(user);
}

async function getOrCreateWorkspace(user: WishlineUser): Promise<WorkspaceRow> {
  const db = await database();
  const now = new Date().toISOString();
  const workspaceId = await workspaceIdForUser(user.id);
  const ownerLabel = user.name || user.email?.split('@')[0] || 'Owner';

  await db.prepare(
    `INSERT INTO workspaces (id, owner_user_id, owner_email, name, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?)
     ON CONFLICT(owner_user_id) DO UPDATE SET
       owner_email = excluded.owner_email,
       updated_at = excluded.updated_at`,
  ).bind(workspaceId, user.id, user.email, `${ownerLabel}'s workspace`, now, now).run();

  const row = await db.prepare(
    `SELECT w.id, w.name, c.app_id, c.project_name, c.encrypted_api_key,
            c.updated_at AS connection_updated_at
       FROM workspaces w
       LEFT JOIN steam_connections c ON c.workspace_id = w.id
      WHERE w.owner_user_id = ?
      LIMIT 1`,
  ).bind(user.id).first<WorkspaceRow>();

  if (!row) throw new WishlistConnectorError('WORKSPACE_ERROR', 'Wishline could not load the workspace.', 500);
  return row;
}

async function database(): Promise<D1Database> {
  const db = (env as unknown as { DB?: D1Database }).DB;
  if (!db) throw new WishlistConnectorError('DATABASE_NOT_CONFIGURED', 'The Wishline workspace database is not configured.', 503);

  schemaReady ??= initializeSchema(db).catch((error) => {
    schemaReady = null;
    throw error;
  });
  await schemaReady;
  return db;
}

async function initializeSchema(db: D1Database): Promise<void> {
  await db.batch([
    db.prepare(`CREATE TABLE IF NOT EXISTS workspaces (
      id TEXT PRIMARY KEY,
      owner_user_id TEXT NOT NULL UNIQUE,
      owner_email TEXT,
      name TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    )`),
    db.prepare(`CREATE TABLE IF NOT EXISTS steam_connections (
      workspace_id TEXT PRIMARY KEY,
      app_id INTEGER NOT NULL CHECK (app_id > 0),
      project_name TEXT NOT NULL,
      encrypted_api_key TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE
    )`),
    db.prepare('CREATE INDEX IF NOT EXISTS idx_steam_connections_app_id ON steam_connections(app_id)'),
  ]);
  await db.prepare('PRAGMA optimize').run();
}
