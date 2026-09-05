CREATE TABLE IF NOT EXISTS audit_events (
  id TEXT PRIMARY KEY,
  workspace_id TEXT,
  app_id INTEGER,
  event_type TEXT NOT NULL,
  outcome TEXT NOT NULL CHECK (outcome IN ('success', 'failure')),
  reason_code TEXT,
  occurred_at TEXT NOT NULL,
  FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_audit_events_workspace_occurred
  ON audit_events(workspace_id, occurred_at);

CREATE INDEX IF NOT EXISTS idx_audit_events_type_occurred
  ON audit_events(event_type, occurred_at);

CREATE TABLE IF NOT EXISTS sync_runs (
  id TEXT PRIMARY KEY,
  started_at TEXT NOT NULL,
  completed_at TEXT NOT NULL,
  attempted INTEGER NOT NULL CHECK (attempted >= 0),
  succeeded INTEGER NOT NULL CHECK (succeeded >= 0),
  failed INTEGER NOT NULL CHECK (failed >= 0)
);

CREATE INDEX IF NOT EXISTS idx_sync_runs_completed
  ON sync_runs(completed_at);

PRAGMA optimize;
