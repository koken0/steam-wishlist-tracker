CREATE TABLE IF NOT EXISTS sync_run_activity (
  sync_run_id TEXT PRIMARY KEY,
  report_dates_requested INTEGER NOT NULL CHECK (report_dates_requested >= 0),
  records_received INTEGER NOT NULL CHECK (records_received >= 0),
  changes_detected INTEGER NOT NULL CHECK (changes_detected >= 0),
  FOREIGN KEY (sync_run_id) REFERENCES sync_runs(id) ON DELETE CASCADE
);

PRAGMA optimize;
