ALTER TABLE steam_connections ADD COLUMN sync_state TEXT NOT NULL DEFAULT 'active' CHECK (sync_state IN ('active', 'suspended'));
ALTER TABLE steam_connections ADD COLUMN suspended_at TEXT;
ALTER TABLE steam_connections ADD COLUMN suspension_reason TEXT;
CREATE INDEX IF NOT EXISTS idx_steam_connections_sync_state ON steam_connections(sync_state, workspace_id);
