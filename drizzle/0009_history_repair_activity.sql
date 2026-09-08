ALTER TABLE sync_run_activity ADD COLUMN repair_dates_requested INTEGER NOT NULL DEFAULT 0 CHECK (repair_dates_requested >= 0);
ALTER TABLE sync_run_activity ADD COLUMN repair_records_recovered INTEGER NOT NULL DEFAULT 0 CHECK (repair_records_recovered >= 0);
ALTER TABLE sync_run_activity ADD COLUMN repair_empty INTEGER NOT NULL DEFAULT 0 CHECK (repair_empty >= 0);
ALTER TABLE sync_run_activity ADD COLUMN repair_errors INTEGER NOT NULL DEFAULT 0 CHECK (repair_errors >= 0);
ALTER TABLE sync_run_activity ADD COLUMN repair_exhausted INTEGER NOT NULL DEFAULT 0 CHECK (repair_exhausted >= 0);

PRAGMA optimize;
