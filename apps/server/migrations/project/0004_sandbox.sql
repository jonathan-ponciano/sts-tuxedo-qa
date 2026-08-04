-- One project has at most one *active* sandbox at a time in v1 (provisioning
-- is manual, via a dashboard button — see api/sandbox.ts), but history is
-- kept (status moves to 'stopped'/'error' rather than being deleted) so past
-- runs are traceable.
CREATE TABLE sandbox_environments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  status TEXT NOT NULL DEFAULT 'provisioning' CHECK (status IN ('provisioning', 'running', 'error', 'stopped')),
  branch TEXT NOT NULL,
  container_name TEXT,
  network_name TEXT,
  internal_base_url TEXT,
  error_message TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  expires_at TEXT NOT NULL,
  stopped_at TEXT
);
