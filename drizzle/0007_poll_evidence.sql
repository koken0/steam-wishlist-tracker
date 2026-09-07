CREATE TABLE IF NOT EXISTS wishlist_poll_samples (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  app_id INTEGER NOT NULL CHECK (app_id > 0),
  requested_date TEXT NOT NULL,
  date_phase TEXT NOT NULL CHECK (date_phase IN ('current', 'previous')),
  outcome TEXT NOT NULL CHECK (outcome IN ('record', 'empty', 'error')),
  classification TEXT NOT NULL CHECK (classification IN ('initial', 'unchanged', 'timestamp_only', 'counters_changed', 'empty', 'error')),
  reason_code TEXT,
  adds INTEGER,
  deletes INTEGER,
  purchases INTEGER,
  gifts INTEGER,
  delta_adds INTEGER,
  delta_deletes INTEGER,
  delta_purchases INTEGER,
  delta_gifts INTEGER,
  generated_at TEXT,
  fetched_at TEXT NOT NULL,
  FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_wishlist_poll_workspace_app_date
  ON wishlist_poll_samples(workspace_id, app_id, requested_date, fetched_at);

CREATE INDEX IF NOT EXISTS idx_wishlist_poll_fetched
  ON wishlist_poll_samples(fetched_at);

ALTER TABLE sync_run_activity ADD COLUMN poll_initial INTEGER NOT NULL DEFAULT 0 CHECK (poll_initial >= 0);
ALTER TABLE sync_run_activity ADD COLUMN poll_unchanged INTEGER NOT NULL DEFAULT 0 CHECK (poll_unchanged >= 0);
ALTER TABLE sync_run_activity ADD COLUMN poll_timestamp_only INTEGER NOT NULL DEFAULT 0 CHECK (poll_timestamp_only >= 0);
ALTER TABLE sync_run_activity ADD COLUMN poll_counter_changes INTEGER NOT NULL DEFAULT 0 CHECK (poll_counter_changes >= 0);
ALTER TABLE sync_run_activity ADD COLUMN poll_empty INTEGER NOT NULL DEFAULT 0 CHECK (poll_empty >= 0);
ALTER TABLE sync_run_activity ADD COLUMN poll_errors INTEGER NOT NULL DEFAULT 0 CHECK (poll_errors >= 0);
ALTER TABLE sync_run_activity ADD COLUMN finalized_counter_changes INTEGER NOT NULL DEFAULT 0 CHECK (finalized_counter_changes >= 0);

PRAGMA optimize;
