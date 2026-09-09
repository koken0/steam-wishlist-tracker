CREATE TABLE wishlist_annotations (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  app_id INTEGER NOT NULL CHECK (app_id > 0),
  report_date TEXT NOT NULL,
  note TEXT NOT NULL CHECK (length(note) BETWEEN 1 AND 200),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE,
  UNIQUE (workspace_id, app_id, report_date)
);

CREATE INDEX idx_wishlist_annotations_workspace_app_date
  ON wishlist_annotations(workspace_id, app_id, report_date);
