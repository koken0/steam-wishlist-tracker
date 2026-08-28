CREATE TABLE IF NOT EXISTS workspaces (
  id TEXT PRIMARY KEY,
  owner_user_id TEXT NOT NULL UNIQUE,
  owner_email TEXT,
  name TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS steam_connections (
  workspace_id TEXT PRIMARY KEY,
  app_id INTEGER NOT NULL CHECK (app_id > 0),
  project_name TEXT NOT NULL,
  encrypted_api_key TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_steam_connections_app_id ON steam_connections(app_id);
PRAGMA optimize;
