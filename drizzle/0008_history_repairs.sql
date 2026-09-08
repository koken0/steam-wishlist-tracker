CREATE TABLE IF NOT EXISTS wishlist_history_repairs (
  workspace_id TEXT NOT NULL,
  app_id INTEGER NOT NULL CHECK (app_id > 0),
  report_date TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('pending', 'processing', 'empty', 'error', 'recovered', 'exhausted')),
  attempts INTEGER NOT NULL DEFAULT 0 CHECK (attempts >= 0),
  next_attempt_at TEXT,
  locked_until TEXT,
  last_reason_code TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (workspace_id, app_id, report_date),
  FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_wishlist_repairs_due
  ON wishlist_history_repairs(workspace_id, app_id, status, next_attempt_at);

PRAGMA optimize;
