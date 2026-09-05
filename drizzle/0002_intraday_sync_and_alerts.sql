CREATE TABLE IF NOT EXISTS wishlist_intraday_snapshots (
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
);

CREATE INDEX IF NOT EXISTS idx_wishlist_intraday_workspace_app_date
  ON wishlist_intraday_snapshots(workspace_id, app_id, report_date, fetched_at);

CREATE TABLE IF NOT EXISTS wishlist_alerts (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  app_id INTEGER NOT NULL CHECK (app_id > 0),
  report_date TEXT NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('spike')),
  title TEXT NOT NULL,
  message TEXT NOT NULL,
  created_at TEXT NOT NULL,
  read_at TEXT,
  FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE,
  UNIQUE (workspace_id, app_id, report_date, kind)
);

CREATE INDEX IF NOT EXISTS idx_wishlist_alerts_workspace_created
  ON wishlist_alerts(workspace_id, created_at);

PRAGMA optimize;
