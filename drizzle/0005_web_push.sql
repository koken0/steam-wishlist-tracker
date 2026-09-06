CREATE TABLE IF NOT EXISTS push_subscriptions (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  endpoint_hash TEXT NOT NULL,
  encrypted_subscription TEXT NOT NULL,
  expires_at INTEGER,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE,
  UNIQUE (workspace_id, endpoint_hash)
);

CREATE INDEX IF NOT EXISTS idx_push_subscriptions_workspace
  ON push_subscriptions(workspace_id, created_at);

CREATE TABLE IF NOT EXISTS push_deliveries (
  observation_id TEXT NOT NULL,
  subscription_id TEXT NOT NULL,
  attempts INTEGER NOT NULL DEFAULT 0 CHECK (attempts >= 0),
  sent_at TEXT,
  last_attempt_at TEXT NOT NULL,
  last_error_code TEXT,
  PRIMARY KEY (observation_id, subscription_id),
  FOREIGN KEY (observation_id) REFERENCES wishlist_intraday_snapshots(id) ON DELETE CASCADE,
  FOREIGN KEY (subscription_id) REFERENCES push_subscriptions(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_push_deliveries_pending
  ON push_deliveries(subscription_id, sent_at, attempts);

PRAGMA optimize;
