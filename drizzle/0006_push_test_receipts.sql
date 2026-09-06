CREATE TABLE IF NOT EXISTS push_test_receipts (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  subscription_id TEXT NOT NULL,
  ack_token_hash TEXT NOT NULL UNIQUE,
  provider_status TEXT NOT NULL CHECK (provider_status IN ('pending', 'accepted', 'failed')),
  received_at TEXT,
  clicked_at TEXT,
  expires_at TEXT NOT NULL,
  created_at TEXT NOT NULL,
  FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE,
  FOREIGN KEY (subscription_id) REFERENCES push_subscriptions(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_push_test_receipts_workspace_created
  ON push_test_receipts(workspace_id, created_at);

PRAGMA optimize;
