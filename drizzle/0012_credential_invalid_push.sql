CREATE TABLE IF NOT EXISTS push_credential_alerts (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  app_id INTEGER NOT NULL,
  reason_code TEXT NOT NULL,
  created_at TEXT NOT NULL,
  FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_push_credential_alerts_workspace
  ON push_credential_alerts(workspace_id, created_at);

CREATE TABLE IF NOT EXISTS push_credential_alert_deliveries (
  alert_id TEXT NOT NULL,
  subscription_id TEXT NOT NULL,
  attempts INTEGER NOT NULL DEFAULT 0 CHECK (attempts >= 0),
  sent_at TEXT,
  last_attempt_at TEXT NOT NULL,
  last_error_code TEXT,
  PRIMARY KEY (alert_id, subscription_id),
  FOREIGN KEY (alert_id) REFERENCES push_credential_alerts(id) ON DELETE CASCADE,
  FOREIGN KEY (subscription_id) REFERENCES push_subscriptions(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_push_credential_alert_deliveries_pending
  ON push_credential_alert_deliveries(subscription_id, sent_at, attempts);
