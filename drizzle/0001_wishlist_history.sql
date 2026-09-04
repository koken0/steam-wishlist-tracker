CREATE TABLE IF NOT EXISTS wishlist_daily_snapshots (
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
);

CREATE INDEX IF NOT EXISTS idx_wishlist_snapshots_app_date
  ON wishlist_daily_snapshots(app_id, report_date);

PRAGMA optimize;
